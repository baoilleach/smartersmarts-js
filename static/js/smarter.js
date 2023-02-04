function myencode(text) {return encodeURIComponent(text);}
function mydecode(text) {return text;}

var STATE = Backbone.Model.extend({
  defaults: {
    "smarts": undefined,
    "toolkit": "openbabel",
    "help": false,
    "terminate": false,
    "first_result": undefined,
  }
});
window.state = new STATE;
state.on("change:smarts", StartSearch);
state.on("change:toolkit", StartSearch);
state.on("change:help", HandleHelp);
state.on("change:terminate", HandleTerminate);

function HandleTerminate() {
  if (state.get("terminate")) {
    $('#progress-bar').addClass("bg-warning");
  } else {
    $('#progress-bar').removeClass("bg-warning");
  }
}

// Start the Web workers
workers = {};
toolkits = ["openbabel", "indigo"];
for (var i=0; i<toolkits.length; i++) {
  workers[toolkits[i]] = new Worker('static/js/worker.' + toolkits[i] + '.js');
  workers[toolkits[i]].onmessage = (e) => {
    console.log(e.data);
    if (!(e.data.toolkit == state.get("toolkit") &&
          e.data.smarts == state.get("smarts"))) {
      return;
    }
    if (e.data.type == "hit") {
      HandleResult(e.data.smi, e.data.score);
    }
    else if (e.data.type == "status") {
      UpdateProgressBar(e.data.finished, e.data.percent);
      if (!e.data.finished && !state.get("terminate")) {
        workers[state.get("toolkit")].postMessage({smarts: state.get("smarts"), startidx:e.data.idx});
      }
    }
    else if (e.data.type == "smartsok") {
      if (!e.data.message) {
        HandleInvalid();
      } else {
        HandleValid();
      }
    }
  }
}

function HandleHelp()
{
  help = state.get("help");
  if (help) {
    $('#help').removeClass("hide");
    $('#dv_png').hide();
    $('#about').html("Close");
  } else {
    $('#dv_png').show();
    $('#help').addClass("hide");
    $('#about').html("About");
  }
}

var SNSRouter = Backbone.Router.extend({

  routes: {
    "search/:smarts/": "search",
  },

  search: function(smarts) {
    var decoded = mydecode(smarts);
    if ($('#entrybox').val() != decoded) {
      $('#entrybox').val(decoded);
    }
    state.set("smarts", smarts);
  }

});

function UpdateProgressBar(finished, percent)
{
  let pb = $('#progress');
  pb.css("width", percent + "%");
  if (finished) {
    pb.addClass("progress-hide");
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
  $('#entrybox').on('keydown', function() {
    clearTimeout(typingTimer);
  });
  $('#toolkit').change(function() {
    state.set("toolkit", $(this).val());
  });
  $('#about').on('click', function() {
    help = state.get("help");
    state.set("help", !help);
  });
}

$(function() {
  app = new SNSRouter();
  Backbone.history.start();

  Initialize();
});

function HandleValid()
{
  $('#dv_png').removeClass("limbo");
  $('#dv_pk').removeClass("limbo");
  $('#entrybox').addClass("is-valid").removeClass("is-invalid");
}
function HandleInvalid()
{
  $('#dv_png').addClass("limbo");
  $('#dv_pk').addClass("limbo");
  $('#entrybox').removeClass("is-valid").addClass("is-invalid");
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
  let atommap_smi = IsotopeToAtomMap(smi);
  var elem = $('<img src="https://www.simolecule.com/cdkdepict/depict/cow/png?abbr=off&hdisp=provided&disp=bridgehead&annotate=colmap&showtitle=true&smi=' + myencode(atommap_smi) + '" score="' + score + '" />\n')[0];

  var png_section = document.getElementById("dv_png");
  if (state.get("first_result")) {
    png_section.innerHTML = "";
    $(png_section).removeClass("limbo");
    $('#dv_progress').removeClass("limbo");
    state.set("first_result", false);
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
  if (children.length > 200) {
    // Let's just stop if there are quite a few hits
    //  - CDK Depict might not be too happy otherwise
    state.set("terminate", true);
  }
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

function StartSearch()
{
  smarts = state.get("smarts");
  if (IsInvalidQuick(smarts)) {
    HandleInvalid();
    return;
  }
  $('#entryboxicon').removeClass("is-valid").removeClass("is-invalid");
  $('#dv_png').addClass("limbo");
  $('#dv_pk').addClass("limbo");
  UpdateProgressBar(false, 0);
  $('#progress').removeClass("progress-hide");
  state.set("first_result", true);
  state.set("terminate", false);
  workers[state.get("toolkit")].postMessage({smarts: smarts, startidx: 0});
}
