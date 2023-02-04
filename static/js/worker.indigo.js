ReadyToRock = false;

function WaitThenHandle(data){
  if (ReadyToRock) {
    HandleSmarts(data);
  }
  else {
    setTimeout(WaitThenHandle, 250, data);
  }
}

// We create the message handler straightaway
// so that it is ready for any requests coming
// from the main thread. It will wait until
// Indigo is initialised before actually doing
// anything.
onmessage = (e) => {
  WaitThenHandle(e.data);
}

importScripts('indigo.js', 'indigoAdapter.js', 'histogram.js', 'molecules.js');

// Return 1 if the atom is in a ring else 0
function IsInRing(atom)
{
  var it = Indigo.iterateNeighbors(atom);
  while(Indigo.hasNext(it)) {
    var nbr = Indigo.next(it);
    var nbrbond = Indigo.bond(nbr);
    var topol = Indigo.topology(nbrbond);
    Indigo.free(nbr);
    Indigo.free(nbrbond);
    if (topol == Indigo.INDIGO_RING) {
      break;
    }
  }
  Indigo.free(it);
  return topol == Indigo.INDIGO_RING ? 1 : 0;
}

function GetType(mol, atom)
{
  var num = Indigo.atomicNumber(atom);
  var impH = Indigo.countImplicitHydrogens(atom);
  var deg = Indigo.degree(atom);
  var ring = IsInRing(atom);
  var buf = Indigo._module._malloc(4);
  Indigo.getCharge(atom, buf);
  var chg = Indigo._module.getValue(buf, 'i32');
  Indigo._module._free(buf);
  // Val is intended to be sum of BOs plus implH; Indigo has 2 for [O-]C so we need to correct to 1; it has 3 for [O+](C)(C)C
  var val = Indigo.valence(atom) + ((chg < 0) ? chg : 0);
  return [num, val, impH, deg, ring, chg];
}

function CalculateScore(atomtypes)
{ // TODO: Move the log calculation to the preparation script
  var p = Math.log(probabilities[JSON.stringify(atomtypes[0])], 10);
  for (var i=1; i<atomtypes.length; i++) {
    p += Math.log(probabilities[JSON.stringify(atomtypes[i])], 10);
  }
  return p;
}

function HandleSmarts(pattern)
{
  var smarts = Indigo.loadSmartsFromString(pattern);
  if (smarts == -1) {
    Indigo.free(smarts);
    postMessage({type: "error",
                 message: "Invalid SMARTS"});
    return;
  }
  var seen = {};
  for (var idx=0; idx<molecules.length; idx++) {
    if (idx > 1000000) {
      break;
    }
    if ((idx % 1000) == 0) {
      postMessage({type: "status",
                   finished: false,
                   percent: idx * 100.0 / molecules.length});
    }
    var smi = molecules[idx];
    var mol = Indigo.loadMoleculeFromString(smi);
    var matcher = Indigo.substructureMatcher(mol);
    var mapping = Indigo.match(matcher, smarts);
    if (mapping > 0) {
      var atomtypes = [];
      for(var i=0; i<Indigo.countAtoms(smarts); i++) {
        var smarts_atom = Indigo.getAtom(smarts, i);
        var match_atom = Indigo.mapAtom(mapping, smarts_atom);
        var atomtype = GetType(mol, match_atom);
        atomtypes.push(atomtype);
        Indigo.free(match_atom);
        Indigo.free(smarts_atom);
      }
      if (atomtypes[0] > atomtypes[atomtypes.length-1]) {
        atomtypes.reverse();
       }
      var mhash = JSON.stringify(atomtypes);
      if (!(mhash in seen)) {
        console.log("Unseen match: " + smi);
        for(var i=0; i<Indigo.countAtoms(smarts); i++) {
          var smarts_atom = Indigo.getAtom(smarts, i);
          var match_atom = Indigo.mapAtom(mapping, smarts_atom);
          Indigo.setIsotope(match_atom, i==0 ? 1 : 2);
          Indigo.free(match_atom);
          Indigo.free(smarts_atom);
        }
        seen[mhash] = {smi: smi, score: CalculateScore(atomtypes)};
        postMessage({type: "hit",
                     smi: Indigo.smiles(mol),
                     score: CalculateScore(atomtypes)});
        if (isNaN(seen[mhash].score)) { // there shouldn't be any atomtypes not in the histogram
          console.log("ERROR: shouldn't happen! " + atomtypes);
        }
      }
      Indigo.free(mapping);
    }
    Indigo.free(matcher);
    Indigo.free(mol);
  }
  Indigo.free(smarts);
  postMessage({type: "status",
               finished: true,
               percent: 100});
}

Indigo = CreateIndigo();
Indigo._module.onRuntimeInitialized = function() {
  ReadyToRock = true;
  console.log("Indigo is ready");
};
