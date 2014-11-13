importScripts("eve.js", "bootStrapped2.js", "tokenizer.js");

var editorApp = app();

function consoleLog() {
    var final = [];
    for(var i in arguments) {
      final[i] = arguments[i];
    }
    try {
      postMessage({type: "log", args: final, run: editorApp.runNumber});
    } catch(e) {
      postMessage({type: "error", error: "Worker: Could not log a message", run: editorApp.runNumber});
    }
  }

var console = {
  log: consoleLog,
  error: consoleLog
};

var inputTables = ["event", "keyboard", "mousePosition"];

function timerWatcher(application, storage, system) {
  var timers = system.getStore("timer");
  if(!timers) return;

  var adds = [];
  var removes = [];
  timeouts = storage["timeouts"] || {};
  if(storage["timer"]) {
    try {
      timers.diff(storage["timer"], adds, removes);
    } catch(e) {
      adds = timers.getFacts();
      removes = storage["timer"].getFacts();
    }
  } else {
    adds = timers.getFacts();
  }
  storage["timer"] = timers;

  for(var removeIx = 0; removeIx < removes.length; removeIx++) {
    var id = removes[removeIx][0];
    clearTimeout(timeouts[id]);
    timeouts[event] = null;
  }

  for(var addIx = 0; addIx < adds.length; addIx++) {
    var id = adds[addIx][0];
    var event = adds[addIx][1];
    var rate = adds[addIx][2];

    if(!id) continue;
    if(!rate || typeof(rate) === "string" || rate < 100) rate = 100;

    var timeout = setInterval(function() {
     var start = now();
     application.run([["event", application.eventId++, event, "", (new Date()).getTime()]]);
     postMessage({type: "runStats", runtime: (now() - start), numFacts: application.totalFacts(), start: start, run: null});
    }, rate);
    timeouts[id] = timeout;
  }

  storage["timeouts"] = timeouts;
}

function tableCardWatcher(application, storage, system) {
  var returns = [];
  for(var table in application.programResults.tablesCreated) {
    var info = application.programResults.tablesCreated[table];
    var rows = system.getStore(table).getFacts();
    returns.push([table, info.fields, rows, info.constants]);
  }
  postMessage({type: "tableCards", cards: returns, time: now(), run: editorApp.runNumber});
}

function uiWatcher(application, storage, system) {
  var uiTables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diff = {};
  var hasUI = false;
  for(var i = 0; i < uiTables.length; i++) {
    var table = uiTables[i];
    if(storage[table]) {
      var adds = [];
      var removes = [];
      system.getStore(table).diff(storage[table], adds, removes);
      storage[table] = system.getStore(table);
      if(adds.length || removes.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      storage[table] = system.getStore(table);
      var adds = system.getStore(table).getFacts();
      if(adds.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: []
      };
    }
  }

  if(hasUI) {
    postMessage({type: "renderUI", diff: diff, time: now(), run: editorApp.runNumber});
  }
}

function onCompile(code) {
  var stats = {};
  stats.parse = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  editorApp.lastParse = parsed;
  stats.parse = now() - stats.parse;
  try {
    var prev = editorApp;
    stats.compile = now();
    var system = System.empty({name: "editor program"});

    var errors = [];

    compileResults = injectParsed(parsedCompilerChecks, system);
    editorApp.compileResults = compileResults;
    errors = errors.concat(compileResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: editorApp.runNumber});
      return;
    }
    system.recompile();

    programResults = injectParsed(parsed, system);
    editorApp.programResults = programResults;
    errors = errors.concat(programResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: editorApp.runNumber});
      return;
    }
    system.recompile();

    editorApp.updateSystem(system);
    stats.compile = now() - stats.compile;
    stats.reloadFacts = now();
    var facts = [["time", (new Date()).getTime()]].concat(programResults.values)
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
    var errors = runtimeErrors.concat(compileResults.errors, programResults.errors);
    if(errors.length > 0) {
      postMessage({type: "errors", errors: errors, run: editorApp.runNumber});
    }
    postMessage({type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, numFacts: editorApp.totalFacts(), run: editorApp.runNumber});
  } catch(e) {
    postMessage({type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, run: editorApp.runNumber});
    postMessage({type: "error", error: e.stack, run: editorApp.runNumber})
  }
}


onmessage = function(event) {
  editorApp.runNumber = event.data.run;
  switch(event.data.type) {
    case "compile":
      onCompile(event.data.code);
      break;
    case "event":
      var start = now();
      var eid = editorApp.eventId++;
      var events = event.data.items.map(function(cur) {
        //set the eventId
        cur[1] = eid;
        return cur;
      });
      editorApp.run(events);
      postMessage({type: "runStats", runtime: (now() - start), numFacts: editorApp.totalFacts(), run: editorApp.runNumber});
      break;
  }
}
