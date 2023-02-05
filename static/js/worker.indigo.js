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
// the library is initialised before actually doing
// anything.
onmessage = (e) => {
  WaitThenHandle(e.data);
}

SMARTS = undefined;
SMARTSOBJ = undefined;
SEEN = undefined;
TOOLKIT="indigo";

// The following is to allow debugging the script directly included into a test HTML page
IN_WORKER = (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
if (IN_WORKER) {
  importScripts('indigo.js', 'indigoAdapter.js', 'histogram.js', 'molecules.js');
}
else {
  postMessage = function(object) {
    if (object.type != "status") {
      console.log("postMessage with:");
      console.log(object);
    }
  }
}

function GetRingAndValence(atom, resultarray)
{
  let is_in_ring = 0;
  var it = Indigo.iterateNeighbors(atom);
  resultarray[0] = 0;
  resultarray[1] = 0;
  while(Indigo.hasNext(it)) {
    var nbr = Indigo.next(it);
    var nbrbond = Indigo.bond(nbr);
    var topol = Indigo.topology(nbrbond);
    resultarray[1] += Indigo.bondOrder(nbrbond);
    Indigo.free(nbr);
    Indigo.free(nbrbond);
    if (topol == Indigo.INDIGO_RING) {
      resultarray[0] = 1
    }
  }
  Indigo.free(it);
}

ringval = [0, 0];
chgbuf = undefined;

function GetType(mol, atom)
{
  var num = Indigo.atomicNumber(atom);
  var impH = Indigo.countImplicitHydrogens(atom);
  var deg = Indigo.degree(atom);
  GetRingAndValence(atom, ringval);
  Indigo.getCharge(atom, chgbuf);
  var chg = Indigo._module.getValue(chgbuf, 'i32');
  // Valence is sum of BOs plus impH
  return [num, ringval[1]+impH, impH, deg, ringval[0], chg];
}

function CalculateScore(atomtypes)
{ // TODO: Move the log calculation to the preparation script
  var p = Math.log(probabilities[JSON.stringify(atomtypes[0])], 10);
  for (var i=1; i<atomtypes.length; i++) {
    p += Math.log(probabilities[JSON.stringify(atomtypes[i])], 10);
  }
  return p;
}

function HandleSmarts(data)
{
  if (data.startidx == 0) {
    SMARTS = data.smarts;
    SMARTSOBJ = Indigo.loadSmartsFromString(SMARTS);
    SEEN = {};
    var ok = (SMARTSOBJ!=-1);
    postMessage({type: "smartsok", message: ok, smarts: SMARTS, toolkit: TOOLKIT});
    if (!ok) {
      Indigo.free(SMARTSOBJ);
      return;
    }
  }
  for (var idx=data.startidx; idx<molecules.length && idx<data.startidx+1000; idx++) {
    var smi = molecules[idx];
    var mol = Indigo.loadMoleculeFromString(smi);
    var matcher = Indigo.substructureMatcher(mol);
    var mapping = Indigo.match(matcher, SMARTSOBJ);
    if (mapping > 0) {
      var atomtypes = [];
      for(var i=0; i<Indigo.countAtoms(SMARTSOBJ); i++) {
        var smarts_atom = Indigo.getAtom(SMARTSOBJ, i);
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
      if (!(mhash in SEEN)) {
        for(var i=0; i<Indigo.countAtoms(SMARTSOBJ); i++) {
          var smarts_atom = Indigo.getAtom(SMARTSOBJ, i);
          var match_atom = Indigo.mapAtom(mapping, smarts_atom);
          Indigo.setIsotope(match_atom, i==0 ? 7 : 8);
          Indigo.free(match_atom);
          Indigo.free(smarts_atom);
        }
        SEEN[mhash] = {smi: smi, score: CalculateScore(atomtypes)};
        postMessage({type: "hit",
                     smi: Indigo.smiles(mol),
                     score: CalculateScore(atomtypes),
                     smarts: SMARTS,
                     toolkit: TOOLKIT});
        if (isNaN(SEEN[mhash].score)) { // there shouldn't be any atomtypes not in the histogram
          console.log("ERROR: shouldn't happen! " + atomtypes);
        }
      }
      Indigo.free(mapping);
    }
    Indigo.free(matcher);
    Indigo.free(mol);
  }
  if (idx == molecules.length) {
    Indigo.free(SMARTSOBJ);
    postMessage({type: "status",
                 finished: true,
                 percent: 100,
                 smarts: SMARTS,
                 toolkit: TOOLKIT});
  } else {
    postMessage({type: "status",
                 finished: false,
                 percent: idx * 100.0 / molecules.length,
                 idx: idx,
                 smarts: SMARTS,
                 toolkit: TOOLKIT});
  }
}

Indigo = CreateIndigo();
Indigo._module.onRuntimeInitialized = function() {
  ReadyToRock = true;
  chgbuf = Indigo._module._malloc(4); // Never freed, but only a single allocation
  console.log("Indigo is ready");
};
