importScripts("eve.js", "bootStrapped2.js", "tokenizer.js", "../resources/qwest.js");

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

function diffArray(neue, old) {
  var adds = [];
  var removes = [];
  for(var i = 0, len = neue.length; i < len; i++) {
    if(old.indexOf(neue[i]) === -1) {
      adds.push(neue[i]);
    }
  }
  for(var i = 0, len = old.length; i < len; i++) {
    if(neue.indexOf(old[i]) === -1) {
      removes.push(old[i]);
    }
  }
  return {adds: adds, removes: removes};
}

function diffTables(neue, old) {
  var adds = [];
  var removes = [];
  if(old) {
    try {
      neue.diff(old, adds, removes);
    } catch(e) {
      adds = neue.getFacts();
      removes = old.getFacts();
    }
  } else {
    adds = neue.getFacts();
  }
  return {adds: adds, removes: removes};
}

var console = {
  log: consoleLog,
  error: consoleLog
};

var inputTables = ["event", "keyboard", "mousePosition", "tableCard", "tableCardField", "tableCardCell"];

function webRequestWatcher(application, storage, system) {
  var requests = system.getStore("webRequest");
  if(!requests) return;

  var adds = [];
  var removes = [];
  sent = storage["sent"] || {};
  if(storage["sent"]) {
    try {
      requests.diff(storage["requests"], adds, removes);
    } catch(e) {
      adds = requests.getFacts();
      removes = storage["requests"].getFacts();
    }
  } else {
    adds = requests.getFacts();
  }
  storage["requests"] = requests;

  for(var removeIx = 0; removeIx < removes.length; removeIx++) {
    var id = removes[removeIx][0];
    if(sent[id]) {
      sent[id].xhr.abort();
      sent[id] = null;
    }
  }

  for(var addIx = 0; addIx < adds.length; addIx++) {
    var id = adds[addIx][1];
    var url = adds[addIx][2];
    var event = adds[addIx][0];

    if(id === undefined || url === undefined || event === undefined) continue;

    var req = qwest.get(url)
                   .then(function(response) {
                     console.log("response!");
                     if(!sent[id]) return;
                     var start = now();
                     var resp = typeof response === "string" ? response : JSON.stringify(response);
                     application.run([["event", application.eventId++, event, id, resp]]);
                     postMessage({type: "runStats", runtime: (now() - start), numFacts: application.totalFacts(), start: start, run: null});
                   });
    sent[id] = req;
  }

  storage["sent"] = sent;
}

function timerWatcher(application, storage, system) {
  var timers = system.getStore("timer");
  if(!timers) return;

  var diff = diffTables(timers, storage["timer"]);
  var adds = diff.adds;
  var removes = diff.removes;
  storage["timer"] = timers;
  timeouts = storage["timeouts"] || {};

  for(var removeIx = 0; removeIx < removes.length; removeIx++) {
    var id = removes[removeIx][0];
    clearTimeout(timeouts[id]);
    timeouts[id] = null;
  }

  for(var addIx = 0; addIx < adds.length; addIx++) {
    var id = adds[addIx][0];
    var event = adds[addIx][1];
    var rate = adds[addIx][2];

    if(!id) continue;
    if(!rate || typeof(rate) === "string" || rate < 16) rate = 16;

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
  //We don't want to end up an infinite loop sending tableCards to our self
  //if we're the editor
  if(editorApp.isEditor || (storage["previousTablesCreated"] && !editorApp.sendTableCards)) return;

  var adds = [];
  var updates = [];
  var removes = [];
  var prev = storage["previousTablesCreated"];
  for(var tableName in application.programResults.tablesCreated) {
    var info = application.programResults.tablesCreated[tableName];
    var table = system.getStore(tableName);
    var diff = diffTables(table, storage[tableName]);
    if(!storage[tableName]) {
      adds.push([tableName, info.fields, [], diff.adds, diff.removes]);
    } else if(diff.adds.length || diff.removes.length) {
      var prevInfo = prev ? prev[tableName] : null;
      var fieldsDiff = diffArray(info.fields, prevInfo.fields)
      updates.push([tableName, fieldsDiff.adds, fieldsDiff.removes, diff.adds, diff.removes]);
    }
    storage[tableName] = table;
  }

  for(var prevTable in prev) {
    if(!application.programResults.tablesCreated[prevTable]) {
      removes.push([prevTable, [], prev[prevTable].fields, [], storage[prevTable].getFacts()]);
      storage[prevTable] = null;
    }
  }

  storage["previousTablesCreated"] = application.programResults.tablesCreated;
//   postMessage({type: "tableCards", cards: returns, time: now(), run: editorApp.runNumber});
  if(adds.length || removes.length || updates.length) {
    editorApp.sendTableCards = false;
    postMessage({type: "tableCardsBootstrapped", changes: JSON.stringify({adds: adds, updates: updates, removes: removes}), time: now(), run: editorApp.runNumber});
  }
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
    var type = editorApp.isEditor ? "renderEditorUI" : "renderUI";
    postMessage({type: type, diff: diff, time: now(), run: editorApp.runNumber});
  }
}

function onCompile(code, addInputs) {
  var stats = {};
  stats.parse = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  editorApp.code = code;
  editorApp.lastParse = parsed;
  stats.parse = now() - stats.parse;
  try {
    var prev = editorApp.system;
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
    postMessage({type: "tablesCreated", tables: programResults.tablesCreated});
    system.recompile();

    editorApp.updateSystem(system);
    stats.compile = now() - stats.compile;
    stats.reloadFacts = now();
    var facts = [["time", (new Date()).getTime()]].concat(programResults.values)
    if(addInputs && prev) {
      for(var i in inputTables) {
        var table = inputTables[i];
        if(prev.getStore(table)) {
          system.updateStore(table, prev.getStore(table).getFacts(), []);
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

function injectedTablesToFacts(tables, run, adds, removes, shouldAddTable) {
  var tableCards = adds["tableCard"];
  var tableCardFields = adds["tableCardField"];
  var tableCardCells = adds["tableCardCell"];
  var remTableCards = removes["tableCard"];
  var remTableCardFields = removes["tableCardField"];
  var remTableCardCells = removes["tableCardCell"];
  for(var tableIx = 0, len = tables.length; tableIx < len; tableIx++) {
    var table = tables[tableIx][0];
    var fieldsAdded = tables[tableIx][1];
    var fieldsRemoved = tables[tableIx][2];
    var addedRows = tables[tableIx][3];
    var removedRows = tables[tableIx][4];

//     console.log("sizes", addedRows.length, removedRows.length, facts.length, removes.length);

    if(shouldAddTable) {
      tableCards.push([run, table]);
    }

    for(var fieldIx = 0, flen = fieldsAdded.length; fieldIx < flen; fieldIx++) {
      var field = fieldsAdded[fieldIx];
      tableCardFields.push([run, table, field, fieldIx]);
    }

    for(var fieldIx = 0, flen = fieldsRemoved.length; fieldIx < flen; fieldIx++) {
      var field = fieldsRemoved[fieldIx];
      remTableCardFields.push([run, table, field, fieldIx]);
    }

    for(var rowIx = 0, rlen = addedRows.length; rowIx < rlen; rowIx++) {
      var row = addedRows[rowIx];
      var rowId = JSON.stringify(row);
      for(var colIx = 0, clen = row.length; colIx < clen; colIx++) {
        tableCardCells.push([run, table, rowId, colIx, row[colIx]]);
      }
    }

    for(var rowIx = 0, rlen = removedRows.length; rowIx < rlen; rowIx++) {
      var row = removedRows[rowIx];
      var rowId = JSON.stringify(row);
      for(var colIx = 0, clen = row.length; colIx < clen; colIx++) {
        remTableCardCells.push([run, table, rowId, colIx, row[colIx]]);
      }
    }


//     console.log("sizes", addedRows.length, removedRows.length, facts.length, removes.length);
  }
}

function injectEveTables(queuedChanges) {
  var run = 1;
  var adds = {"tableCard": [], "tableCardField": [], "tableCardCell": []};
  var removes = {"tableCard": [], "tableCardField": [], "tableCardCell": []};
  var tables = ["tableCard", "tableCardField", "tableCardCell"];

  for(var changeIx = 0, len = queuedChanges.length; changeIx < len; changeIx++) {
    var changes = queuedChanges[changeIx];
    injectedTablesToFacts(changes.adds, run, adds, removes, true);
    injectedTablesToFacts(changes.updates, run, adds, removes, false);
    injectedTablesToFacts(changes.removes, run, removes, removes, true);
  }

//   console.log(adds, removes);

  var start = now();
  var eid = editorApp.eventId++;
  var totalFactsChanged = 0;
  for(var i = 0, len = tables.length; i < len; i++) {
    var table = tables[i];
    totalFactsChanged += adds[table].length + removes[table].length;
    editorApp.system.updateStore(table, adds[table], removes[table]);
  }
  editorApp.run([]);
  console.log("run time", now() - start, totalFactsChanged, editorApp.totalFacts());
  postMessage({type: "editorRunStats", runtime: (now() - start), numFacts: editorApp.totalFacts(), run: editorApp.runNumber});
  postMessage({type: "requestTableCards", lastSeenRunNumber: editorApp.runNumber});
}


onmessage = function(event) {
  editorApp.runNumber = event.data.run;
  switch(event.data.type) {
    case "init":
      editorApp.isEditor = event.data.editor;
      if(editorApp.isEditor) {
        postMessage({type: "requestTableCards", lastSeenRunNumber: editorApp.runNumber});
      }
      break;
    case "compile":
      onCompile(event.data.code, true);
      break;
    case "tableCardsBootstrapped":
      editorApp.eventId++;
      injectEveTables(event.data.changes.map(JSON.parse));
      break;
    case "requestTableCards":
      if(editorApp.runNumber !== event.data.lastSeenRunNumber) {
        tableCardWatcher(editorApp, editorApp.storage["tableCardWatcher"], editorApp.system);
      } else {
        editorApp.sendTableCards = true;
      }
      break;
    case "reset":
      onCompile(editorApp.code, false);
      break;
    case "inject":
      var start = now();
      var eid = editorApp.eventId++;
      editorApp.run(event.data.items);
      postMessage({type: "runStats", runtime: (now() - start), numFacts: editorApp.totalFacts(), run: editorApp.runNumber});
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
