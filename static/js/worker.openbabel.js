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

// The following is to allow debugging the script directly included into a test HTML page
IN_WORKER = (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
if (IN_WORKER) {
  importScripts('openbabel.js', 'histogram.js', 'molecules.js');
}
else {
  postMessage = function(object) {
    if (object.type != "status") {
      console.log("postMessage with:");
      console.log(object);
    }
  }
}

function GetType(mol, atom)
{
  var num = atom.GetAtomicNum();
  var impH = atom.GetImplicitHCount();
  var deg = atom.GetExplicitDegree()
  var ring = atom.IsInRing() ? 1 : 0;
  var chg = atom.GetFormalCharge();
  var val = atom.GetTotalValence();
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
  var smarts = new OpenBabel.OBSmartsPattern();
  var ok = smarts.Init(pattern);
  if (!ok) {
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
    conv.readString(mol, smi);
    matched = smarts.Match(mol, true);
    if (matched) {
      maplist = smarts.GetMapList().get(0);
      var atomtypes = [];
      for(var i=0; i<maplist.size(); i++) {
        var atomidx = maplist.get(i);
        var match_atom = mol.GetAtom(atomidx);
        var atomtype = GetType(mol, match_atom);
        atomtypes.push(atomtype);
      }
      if (atomtypes[0] > atomtypes[atomtypes.length-1]) {
        atomtypes.reverse();
       }
      var mhash = JSON.stringify(atomtypes);
      if (!(mhash in seen)) {
        console.log("Unseen match: " + smi);
        for(var i=0; i<maplist.size(); i++) {
          var atomidx = maplist.get(i);
          var match_atom = mol.GetAtom(atomidx);
          match_atom.SetIsotope(i==0 ? 1 : 2);
        }
        seen[mhash] = {smi: smi, score: CalculateScore(atomtypes)};
        postMessage({type: "hit",
                     smi: conv.writeString(mol, false),
                     score: CalculateScore(atomtypes)});
        if (isNaN(seen[mhash].score)) { // there shouldn't be any atomtypes not in the histogram
          console.log("ERROR: shouldn't happen! " + atomtypes);
        }
      }
    }
  }
  postMessage({type: "status",
               finished: true,
               percent: 100});
}

OpenBabel = OpenBabelModule();
OpenBabel.onRuntimeInitialized = function() {
  ReadyToRock = true;
  console.log("Open Babel is ready");
  conv = new OpenBabel.ObConversionWrapper();
  conv.setInFormat('', 'smi');
  conv.setOutFormat('', 'smi');
  mol = new OpenBabel.OBMol();
};
