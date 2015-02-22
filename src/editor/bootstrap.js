var ide = require("./ide.js");
var diffSystems = global.diffSystems;
var codeToSystem = global.codeToSystem;
var incrementalUI = require("./incrementalUI");
var examples = global.examples;
var tests = global.tests || {};

//---------------------------------------------------------
// State
//---------------------------------------------------------

function getLocal(k, otherwise) {
//   if(localStorage[k]) {
//     return JSON.parse(localStorage[k])
//   }
  return otherwise;
}

function setLocal(k, v) {
//   localStorage[k] = JSON.stringify(v);
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
// worker
//---------------------------------------------------------

function Program(name, code) {
  this.name = name;
  this.system = codeToSystem(code);
  this.worker = new Worker("../build/worker.js");
  this.worker.onmessage = this.onWorkerMessage.bind(this);

  this.worker.postMessage({type: "diffs", diffs: diffSystems(this.system, null, null)});
}
Program.prototype = {
  onWorkerMessage: function onWorkerMessage(event) {
    switch(event.data.type) {
      case "log":
        console.log.apply(console, event.data.args);
        break;
      case "renderUI":
        incrementalUI.queueRender("programQueue", [this, event.data.diff]);
        break;
      case "diffs":
        ide.handleProgramDiffs(event.data.diffs);
        this.worker.postMessage({type: "pull", runNumber: event.data.runNumber});
        break;
    }
  }
};

function TaskManager() {
  this._program = {};
  this._running = null;
}
TaskManager.prototype = {
  add: function(name, code) {
    this._program[name] = code; // Add single program.
  },
  list: function() {
    return this._program;
  },
  run: function(name) {
    var code = this._program["Runtime"] + "\n\n" + this._program[name];
    if(this._running) { this.stop(); }
    incrementalUI.renderQueueInit();
    this._running = new Program(name, code);
    ide.init(this._running);
    this._running.worker.postMessage({type: "pull"});
    return this._running;
  },
  stop: function() {
    this._running.worker.terminate();
  },
  current: function() {
    return this._running;
  }
};
var taskManager = new TaskManager();

for(var i = 0, keys = Object.keys(examples); i < keys.length; i++) {
  taskManager.add(keys[i], examples[keys[i]]);
}

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
}

//---------------------------------------------------------
// Go!
//---------------------------------------------------------

module.exports.taskManager = taskManager;
taskManager.run("My Stack");
