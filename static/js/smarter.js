function myencode(text) {return encodeURIComponent(text);}
function mydecode(text) {return text;}

var SNSRouter = Backbone.Router.extend({

  routes: {
    "search/:smarts/": "search",
  },

  search: function(smarts) {
    var decoded = mydecode(smarts);
    MakePrediction(smarts);
    if ($('#entrybox').val() != decoded) {
      $('#entrybox').val(decoded);
    }
  }

});

function CreateWebWorker()
{
  if (typeof(myWorker) !== "undefined") {
    myWorker.terminate();
  }
  myWorker = new Worker('static/js/worker.js');
  myWorker.onmessage = (e) => {
    if (e.data.type == "hit") {
      HandleResult(e.data.smi, e.data.score);
    }
    else if (e.data.type == "status") {
      UpdateProgressBar(e.data.finished, e.data.percent);
    }
    else if (e.data.type == "error") {
      HandleInvalid();
    }
  }
}

function UpdateProgressBar(finished, percent)
{
  let pb = $('#progress');
  pb.css("width", percent + "%");
  if (finished) {
    pb.addClass("hide");
  }
}

function Initialize()
{
  var typingTimer;

  // Add behaviour to text area
  $('#entrybox').on("change keyup paste", function() {
    clearTimeout(typingTimer);
    var doneTypingInterval = 1000;
    typingTimer = setTimeout(function(){app.navigate("search/"+myencode($('#entrybox').val())+"/", {trigger: true});},
                             doneTypingInterval);
  });
  $('#entrybox').on('keydown', function () {
    clearTimeout(typingTimer);
  });

}

$(function() {
  app = new SNSRouter();
  Backbone.history.start();

  Initialize();
});

function HandleInvalid()
{
  $('#dv_png').addClass("limbo");
  $('#dv_pk').addClass("limbo");
  $('#entryform').removeClass("has-success").addClass("has-warning");
  $('#entryboxicon').removeClass("glyphicon-ok").addClass("glyphicon-remove");
}

function InsertAfter(referenceNode, newNode)
{
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function IsDigit(c)
{
  return !isNaN(parseInt(c, 10));
}

function IsotopeToAtomMap(smi)
{
  let ans = [];
  for (let i=0; i<smi.length; i++) {
    let c = smi[i];
    if (c=='[' && IsDigit(smi[i+1]) && !IsDigit(smi[i+2])) {
      ans.push(c);
      let isotope = smi[i+1];
      i++;
      while (true) {
        i++;
        c = smi[i];
        if (c==']') {
          break;
        }
        ans.push(c)
      }
      // Invariant: c==']', smi[i] = ']'
      ans.push(':');
      ans.push(isotope);
      ans.push(c);
    }
    else {
      ans.push(c);
    }
  }
  return ans.join('');
}

function HandleResult(smi, score)
{
  $('#entryform').removeClass("has-warning").addClass("has-success");
  $('#entryboxicon').removeClass("glyphicon-remove").addClass("glyphicon-ok");

  let atommap_smi = IsotopeToAtomMap(smi);
  var elem = $('<img src="https://compchem.soseiheptares.com/depict/depict/cow/png?abbr=off&hdisp=provided&disp=bridgehead&annotate=colmap&showtitle=true&smi=' + myencode(atommap_smi) + '" score="' + score + '" />\n')[0];

  var png_section = document.getElementById("dv_png");
  if ($(png_section).hasClass("limbo")) { // will only be the case for the first entry
    $(png_section).removeClass("limbo");
    png_section.innerHTML = "";
  }
  var children = png_section.children;
  if (children.length == 0) {
    png_section.appendChild(elem);
  }
  else {
    let inserted = false;
    for(var i=0; i<children.length; i++) {
      if (score < children[i].getAttribute("score") || typeof(score)=="undefined") {
        png_section.insertBefore(elem, children[i]);
        inserted = true;
        break;
      }
      if (!inserted) {
        InsertAfter(children[children.length-1], elem);
      }
    }
  }
  $('#dv_png').removeClass("limbo");
  if (children.length > 200) {
    // Let's just stop if there are quite a few hits
    //  - CDK Depict might not be too happy otherwise
    myWorker.terminate();
  }
}

function HandleSearch() {
  $('#entryboxicon').removeClass("glyphicon-remove").removeClass("glyphicon-ok");
  $('#dv_png').addClass("limbo");
  $('#dv_pk').addClass("limbo");
  UpdateProgressBar(false, 0);
  $('#progress').removeClass("hide");
}


function IsInvalidQuick(smarts)
{
  var paren = 0;
  var bracket = 0;
  for (var i=0; i<smarts.length; ++i) {
    switch(smarts[i]) {
      case '[': bracket++; break
      case ']': bracket--; break
      case '(': paren++; break;
      case ')': paren--; break;
    }
  }
  return (bracket!=0 || paren!=0);
}

function MakePrediction(smarts)
{
  if (IsInvalidQuick(smarts)) {
    HandleInvalid();
    return;
  }
  HandleSearch();
  CreateWebWorker();
  myWorker.postMessage(smarts);
}
