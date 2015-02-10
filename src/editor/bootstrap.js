var ide = require('./ide.js');
var diffSystems = global.diffSystems;
var codeToSystem = global.codeToSystem;
var uiDiffRenderer = global.uiDiffRenderer;
var examples = global.examples;
var tests = global.tests || {};

//---------------------------------------------------------
// State
//---------------------------------------------------------

function getLocal(k, otherwise) {
  if(localStorage[k]) {
    return JSON.parse(localStorage[k])
  }
  return otherwise;
}

function setLocal(k, v) {
  localStorage[k] = JSON.stringify(v);
}

var prevVersion = getLocal("prevVersion");
var stacks = getLocal("stacks");
var exampleStacks = Object.keys(examples);
var testStacks = []; //Object.keys(tests);


//stacks = ["Tutorial", "Incrementer", "Net worth", "Department heads", "Graph paths", "TodoMVC", "Turing machine", "Clock", "Chat", "Game", "My Stack", "Editor", "Runtime", "Editor injection"];
stacks = (stacks || []).concat(exampleStacks);
stacks.sort();
var uniqueStacks = [];
var prev;
for(var stackIx = 0; stackIx < stacks.length; stackIx++) {
  var stack = stacks[stackIx];
  if(stack !== prev) {
    prev = stack;
    uniqueStacks.push(stack);
  }
}
stacks = uniqueStacks;
setLocal("stacks", stacks);
// setLocal("Editor-code", examples["Editor"]);

var client = getLocal("client", uuid());
global.client = client;
setLocal("client", client);

//---------------------------------------------------------
// renderer
//---------------------------------------------------------

var renderer = {"programQueue": [], "queued": false}

function drainRenderQueue() {
  var start = now();
  storage["rootParent"] = $(".uiCard").get(0);
  if(storage["rootParent"] && renderer["programQueue"].length > 0) {
    for(var i = 0, len = renderer["programQueue"].length; i < len; i++) {
      var queued = renderer["programQueue"][i];
      var program = queued[0];
      var diff = queued[1];
      uiDiffRenderer(diff, storage, program);
    }
    var eveRoot = $(storage["builtEls"]["eve-root"]);
    if(!eveRoot.closest(document.documentElement).size()) {
      storage["rootParent"].appendChild(eveRoot.get(0));
    }
    renderer["programQueue"] = [];
  }
  var end = now();
  if(end - start > 10) {
    console.error("Long render: " + (end - start));
  }
//   console.log("Render loop:", end - start);
  renderer["queued"] = false;
}

function queueRender() {
  if(!renderer["queued"]) {
    renderer["queued"] = true;
    requestAnimationFrame(drainRenderQueue);
  }
}


//---------------------------------------------------------
// worker
//---------------------------------------------------------

var system;
var storage = {};
var workers = {};

function onWorkerMessage(event) {
  switch(event.data.type) {
    case "log":
      console.log.apply(console, event.data.args);
      break;
    case "renderUI":
      renderer["programQueue"].push([event.data.from, event.data.diff]);
      queueRender();
      break;
    case "diffs":
      var diffs = event.data.diffs;
      ide.handleProgramDiffs(diffs);
      programWorker.postMessage({type: "pull", runNumber: event.data.runNumber});
      break;
  }
}

function createWorker() {
  var worker = new Worker("../build/worker.js");
  worker.onmessage = onWorkerMessage;
  return worker;
}

var programWorker = global.programWorker = createWorker();

var system = codeToSystem( examples["Runtime"] + "\n\n" + examples["Incrementer"]);
programWorker.postMessage({type: "diffs", diffs: diffSystems(system, null, null)});

//---------------------------------------------------------
// socket.io
//---------------------------------------------------------

if(window["io"]) {
  var socket = io.connect('/');
  socket.on("message", function (data) {
    onWorkerMessage({data: data});
  });

  var server = {
    postMessage: function(data) {
      socket.emit("message", data);
    },
    terminate: function() {}
  };

  workers["server"] = server;
}

//---------------------------------------------------------
// Go!
//---------------------------------------------------------

ide.init(system);
programWorker.postMessage({type: "pull"});
