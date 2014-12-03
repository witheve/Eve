importScripts("eve.js", "bootStrapped2.js", "tokenizer.js", "../resources/qwest.js");

var eveApp = app();
eveApp.runNumber = 0;

function consoleLog() {
  var final = [];
  for(var i in arguments) {
    final[i] = arguments[i];
  }
  final.unshift(eveApp.name + ":");
  try {
    postMessage({to: "uiThread", type: "log", args: final, run: eveApp.runNumber});
  } catch(e) {
    postMessage({to: "uiThread", type: "log", args: [eveApp.name + ": Could not log a message"], run: eveApp.runNumber});
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

function runWithFacts(application, facts) {
  var stats = {start: now()};
  try {
    stats.run = application.runNumber++;
    stats.errors = application.run(facts);
    stats.numFacts = application.totalFacts();
    stats.end = now();
    stats.runtime = stats.end - stats.start;
  } catch(e) {
    postMessage({to: "uiThread", type: "log", args: [e.stack], run: application.runNumber});
  }
  return stats;
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
                     if(!sent[id]) return;
                     var resp = typeof response === "string" ? response : JSON.stringify(response);
                     var stats = runWithFacts([["event", application.eventId++, event, id, resp]]);
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
      var stats = runWithFacts(application, [["event", application.eventId++, event, "", (new Date()).getTime()]]);
    }, rate);
    timeouts[id] = timeout;
  }

  storage["timeouts"] = timeouts;
}

function tableCardWatcher(application, storage, system) {
  //We don't want to end up an infinite loop sending tableCards to our self
  //if we're the editor
  if(application.isEditor || (storage["previousTablesCreated"] && !application.sendTableCards)) return;

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
//   postMessage({type: "tableCards", cards: returns, time: now(), run: eveApp.runNumber});
  if(adds.length || removes.length || updates.length) {
    application.sendTableCards = false;
    postMessage({to: "editor", type: "tableCards", changes: JSON.stringify({adds: adds, updates: updates, removes: removes}), time: now(), run: application.runNumber});
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
    var container = eveApp.isEditor ? "editor" : "program";
    postMessage({to: "uiThread", uiContainer: container, type: "renderUI", diff: diff, time: now(), run: eveApp.runNumber});
  }
}

function onCompile(code, addInputs) {
  var stats = {};
  stats.parse = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  eveApp.code = code;
  eveApp.lastParse = parsed;
  stats.parse = now() - stats.parse;
  try {
    var prev = eveApp.system;
    stats.compile = now();
    var system = System.empty({name: "editor program"});

    var errors = [];

    compileResults = injectParsed(parsedCompilerChecks, system);
    eveApp.compileResults = compileResults;
    errors = errors.concat(compileResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      postMessage({to: "editor", type: "errors", errors: errors, run: eveApp.runNumber});
      return;
    }
    system.recompile();

    programResults = injectParsed(parsed, system);
    eveApp.programResults = programResults;
    errors = errors.concat(programResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      postMessage({to: "editor", type: "errors", errors: errors, run: eveApp.runNumber});
      return;
    }
    postMessage({to: "editor", type: "tablesCreated", tables: programResults.tablesCreated});
    system.recompile();

    eveApp.updateSystem(system);
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

    var runStats = runWithFacts(eveApp, facts);

    var errors = runtimeErrors.concat(compileResults.errors, programResults.errors);
    if(errors.length > 0) {
      postMessage({to: "editor", type: "errors", errors: errors, run: eveApp.runNumber});
    }
//     postMessage({to: "editor", type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, numFacts: eveApp.totalFacts(), run: eveApp.runNumber});
  } catch(e) {
//     postMessage({type: "runStats", parse: stats.parse, reloadFacts:stats.reloadFacts, compile: stats.compile, runtime: stats.runtime, run: eveApp.runNumber});
    postMessage({to: "editor", type: "error", error: e.stack, run: eveApp.runNumber})
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

function injectEveTables(changes) {
  var run = 1;
  var adds = {"tableCard": [], "tableCardField": [], "tableCardCell": []};
  var removes = {"tableCard": [], "tableCardField": [], "tableCardCell": []};
  var tables = ["tableCard", "tableCardField", "tableCardCell"];

  injectedTablesToFacts(changes.adds, run, adds, removes, true);
  injectedTablesToFacts(changes.updates, run, adds, removes, false);
  injectedTablesToFacts(changes.removes, run, removes, removes, true);

//   console.log(adds, removes);

  var start = now();
  var eid = eveApp.eventId++;
  var totalFactsChanged = 0;
  for(var i = 0, len = tables.length; i < len; i++) {
    var table = tables[i];
    totalFactsChanged += adds[table].length + removes[table].length;
    eveApp.system.updateStore(table, adds[table], removes[table]);
  }
  var stats = runWithFacts(eveApp, []);
  console.log("run time", now() - start, totalFactsChanged, eveApp.totalFacts());
  postMessage({to: "program", type: "requestTableCards", lastSeenRunNumber: eveApp.lastSeenRunNumber});
}


onmessage = function(event) {
  switch(event.data.type) {
    case "init":
      eveApp.name = event.data.name;
      eveApp.isEditor = event.data.editor;
      if(eveApp.isEditor) {
        postMessage({to: "program", type: "requestTableCards", lastSeenRunNumber: eveApp.lastSeenRunNumber});
      }
      break;

    case "newProgram":
      console.log("new program: ", event.data.programName);
      var stats = runWithFacts(eveApp, [["tableCardProgram", 1, event.data.programName]]);
      break;
    case "compile":
      onCompile(event.data.code, true);
      break;
    case "tableCards":
      eveApp.eventId++;
      eveApp.lastSeenRunNumber = event.data.run;
      injectEveTables(JSON.parse(event.data.changes));
      break;
    case "requestTableCards":
      eveApp.sendTableCards = true;
      if(eveApp.runNumber !== event.data.lastSeenRunNumber) {
        tableCardWatcher(eveApp, eveApp.storage["tableCardWatcher"], eveApp.system);
      }
      break;
    case "reset":
      onCompile(eveApp.code, false);
      break;
    case "inject":
      eveApp.eventId++;
      var stats = runWithFacts(eveApp, event.data.items);
      break;
    case "event":
      var eid = eveApp.eventId++;
      var events = event.data.items.map(function(cur) {
        //set the eventId
        cur[1] = eid;
        return cur;
      });
      var stats = runWithFacts(eveApp, events);
      break;
  }
}
