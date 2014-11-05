importScripts("eve.js", "bootStrapped2.js", "tokenizer.js");

var console = {
  log: function() {
    var final = [];
    for(var i in arguments) {
      final[i] = arguments[i];
    }
    try {
      postMessage({type: "log", args: final, run: run});
    } catch(e) {
      postMessage({type: "error", error: "Worker: Could not log a message", run: run});
    }
  }
};

var uiStorage = {};

function compilerWatcher2(application, storage, system) {
  var returns = [];
  for(var table in editorProg.tablesCreated) {
    var info = editorProg.tablesCreated[table];
    var rows = system.getStore(table).getFacts();
    returns.push([table, info.fields, rows, info.constants]);
  }
  postMessage({type: "tableCards", cards: returns, time: now(), run: run});

  var uiTables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diff = {};
  var hasUI = false;
  for(var i = 0; i < uiTables.length; i++) {
    var table = uiTables[i];
    if(uiStorage[table]) {
      var adds = [];
      var removes = [];
      system.getStore(table).diff(uiStorage[table], adds, removes);
      uiStorage[table] = system.getStore(table);
      if(adds.length || removes.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      uiStorage[table] = system.getStore(table);
      var adds = system.getStore(table).getFacts();
      if(adds.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: []
      };
    }
  }

  if(hasUI) {
    postMessage({type: "renderUI", diff: diff, time: now(), run: run});
  }
}

var editorProg;
var editorApp;
var run;

function onCompile(code) {
  var stats = {};
  stats.parse = now();
  var parsed = parse(code);
  stats.parse = now() - stats.parse;
  try {
    var prev = editorApp;
    stats.compile = now();
    editorProg = parsedToEveProgram(parsed);
    editorApp = app(editorProg.program, {parent: null});
    stats.compile = now() - stats.compile;
    stats.reloadFacts = now();
    var facts = [["time", 0]].concat(editorProg.values)
    if(prev) {
      editorApp.system.updateStore("externalEvent", prev.system.getStore("externalEvent").getFacts(), []);
    }
    stats.reloadFacts = now() - stats.reloadFacts;
    stats.runtime = now();
    editorApp.run(facts);
    stats.numFacts = editorApp.totalFacts();
    stats.runtime = now() - stats.runtime;
    if(editorProg.errors.length) {
      postMessage({type: "errors", errors: editorProg.errors, run: run});
    }
    postMessage({type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, numFacts: editorApp.totalFacts(), run: run});
  } catch(e) {
    postMessage({type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, run: run});
    postMessage({type: "error", error: e.stack, run: run})
  }
}


onmessage = function(event) {
  run = event.data.run;
  switch(event.data.type) {
    case "compile":
      onCompile(event.data.code);
      break;
    case "event":
      var start = now();
      editorApp.run(event.data.items);
      postMessage({type: "runStats", runtime: (now() - start), numFacts: editorApp.totalFacts(), run: run});
      break;
  }
}
