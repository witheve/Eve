importScripts("eve.js", "bootStrapped2.js", "tokenizer.js");

function consoleLog() {
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

var console = {
  log: consoleLog,
  error: consoleLog
};

var uiStorage = {};
var inputTables = ["event", "keyboard", "mousePosition"];

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

var compilerProg;
var editorProg;
var editorApp;
var run;

function onCompile(code) {
  var stats = {};
  stats.parse = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  stats.parse = now() - stats.parse;
  try {
    var prev = editorApp;
    stats.compile = now();
    var system = System.empty({name: "editor program"});

    var errors = [];

    compilerProg = parsedIntoEveProgram(parsedCompilerChecks, system);
    errors = errors.concat(compilerProg.errors);
    compilerProg.program.refresh(errors);
    if (errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: run});
      return;
    }
    compilerProg.program.recompile();

    editorProg = parsedIntoEveProgram(parsed, system);
    errors = errors.concat(editorProg.errors);
    editorProg.program.refresh(errors);
    if (errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: run});
      return;
    }
    editorProg.program.recompile();

    editorApp = app(editorProg.program, {parent: null});
    stats.compile = now() - stats.compile;
    stats.reloadFacts = now();
    var facts = [["time", 0]].concat(editorProg.values)
    if(prev) {
      for(var i in inputTables) {
        var table = inputTables[i];
        if(prev.system.getStore(table)) {
          editorApp.system.updateStore(table, prev.system.getStore(table).getFacts(), []);
        }
      }
    }
    stats.reloadFacts = now() - stats.reloadFacts;
    stats.runtime = now();
    var runtimeErrors = editorApp.run(facts);
    stats.numFacts = editorApp.totalFacts();
    stats.runtime = now() - stats.runtime;
    var errors = runtimeErrors.concat(compilerProg.errors, editorProg.errors);
    if(errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: run});
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
