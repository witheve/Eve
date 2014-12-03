importScripts("eve.js", "bootStrapped2.js", "tokenizer.js", "../resources/qwest.js");

var eveApp = app();
eveApp.runNumber = 0;
eveApp.running = true;

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
  } else if(neue) {
    adds = neue.getFacts();
  }
  return {adds: adds, removes: removes};
}

function errorsToFacts(errors) {
  if(!errors) return [];

  return errors.map(function(cur) {
    var text = typeof cur === "string" ? cur : "Line " + cur.line + ": " + cur.message;
    return [eveApp.runNumber, text];
  });
}

function runWithFacts(application, facts, stats) {
  if(!application.running) return;

  var stats = stats || {profile: []};
  stats.start = now();
  try {
    stats.run = application.runNumber;
    stats.errors = application.run(facts);
    stats.numFacts = application.totalFacts();
    stats.end = now();
    stats.profile.push([stats.run, "runtime", stats.end - stats.start]);
    application.lastStats = stats;
    collectProgramInfo(application, stats);
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
                     application.runNumber++;
                     var stats = runWithFacts(application, [["event", application.eventId++, event, id, resp]]);
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
      application.runNumber++;
      var stats = runWithFacts(application, [["event", application.eventId++, event, "", (new Date()).getTime()]]);
    }, rate);
    timeouts[id] = timeout;
  }

  storage["timeouts"] = timeouts;
}

function collectProgramInfo(application, runInfo) {
  //We don't want to end up an infinite loop sending programInfo to our self
  //if we're the editor
  var storage = application.storage["programInfo"];
  var system = application.system;
  if(application.isEditor || (storage["previousTablesCreated"] && !application.sendProgramInfo)) return;

  //table differences
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

  //hasUI
  var hasUI = false;
  var uiElem = system.getStore("uiElem");
  if(uiElem) {
    hasUI = uiElem.getFacts().length > 0;
  }

  //errors
  var errors = errorsToFacts(runInfo.errors);

  //profile
  var profile = runInfo.profile;

  if(adds.length || removes.length || updates.length || errors.length || profile.length) {
    application.sendProgramInfo = false;
    postMessage({to: "editor", type: "programInfo", changes: JSON.stringify({adds: adds, updates: updates, removes: removes}), errors: errors, profile: profile, hasUI: hasUI, time: now(), run: application.runNumber});
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
  var stats = {profile: []};
  var start = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  eveApp.code = code;
  eveApp.lastParse = parsed;
  stats.profile.push([eveApp.runNumber, "parse", now() - start]);
  try {
    var prev = eveApp.system;
    start = now();
    var system = System.empty({name: "editor program"});

    var errors = [];

    compileResults = injectParsed(parsedCompilerChecks, system);
    eveApp.compileResults = compileResults;
    errors = errors.concat(compileResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      eveApp.running = false;
      postMessage({to: "editor", type: "error", errors: errorsToFacts(errors), run: eveApp.runNumber});
      return;
    }
    system.recompile();

    programResults = injectParsed(parsed, system);
    eveApp.programResults = programResults;
    errors = errors.concat(programResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      eveApp.running = false;
      postMessage({to: "editor", type: "error", errors: errorsToFacts(errors), run: eveApp.runNumber});
      return;
    }
    system.recompile();
    eveApp.updateSystem(system);

    stats.profile.push([eveApp.runNumber, "compile", now() - start]);

    start = now();
    var facts = [["time", (new Date()).getTime()]].concat(programResults.values)
    if(addInputs && prev) {
      for(var i in inputTables) {
        var table = inputTables[i];
        if(prev.getStore(table)) {
          system.updateStore(table, prev.getStore(table).getFacts(), []);
        }
      }
    }

    stats.profile.push([eveApp.runNumber, "reloadFacts", now() - start]);

    var runStats = runWithFacts(eveApp, facts, stats);

  } catch(e) {
    postMessage({to: "editor", type: "error", errors: [e.stack], run: eveApp.runNumber})
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

function injectProgramInfo(programInfo) {
  var run = 1;
  var changes = JSON.parse(programInfo.changes);
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

  // clean up errors
  eveApp.system.updateStore("tableCardProgramErrors", programInfo.errors, eveApp.system.getStore("tableCardProgramErrors").getFacts());

  // insert profile information
  eveApp.system.updateStore("tableCardProfiles", programInfo.profile, []);

  // hasUI changes
  var UIInfo = eveApp.system.getStore("tableCardUIInfo").getFacts()[0];
  if(!UIInfo) {
    eveApp.system.updateStore("tableCardUIInfo", [[run, programInfo.hasUI]], []);
  } else if(UIInfo[1] !== programInfo.hasUI) {
    eveApp.system.updateStore("tableCardUIInfo", [[run, programInfo.hasUI]], [UIInfo]);
  }

  // Run with all the updates
  var stats = runWithFacts(eveApp, []);
  console.log("run time", now() - start, totalFactsChanged, eveApp.totalFacts());
  postMessage({to: "program", type: "requestProgramInfo", lastSeenRunNumber: eveApp.lastSeenRunNumber});
}

function injectProgramError(errors) {
  var start = now();
  // clean up errors
  eveApp.system.updateStore("tableCardProgramErrors", errors, eveApp.system.getStore("tableCardProgramErrors").getFacts());

  // Run with all the updates
  var stats = runWithFacts(eveApp, []);
  console.log("run time", now() - start, errors.length, eveApp.totalFacts());
}

onmessage = function(event) {
  switch(event.data.type) {
    case "init":
      eveApp.name = event.data.name;
      eveApp.isEditor = event.data.editor;
      if(eveApp.isEditor) {
        postMessage({to: "program", type: "requestProgramInfo", lastSeenRunNumber: eveApp.lastSeenRunNumber});
      }
      break;

    case "newProgram":
      console.log("new program: ", event.data.programName);
      var stats = runWithFacts(eveApp, [["tableCardProgram", 1, event.data.programName]]);
      break;
    case "compile":
      eveApp.running = true;
      eveApp.runNumber++;
      onCompile(event.data.code, true);
      break;
    case "programInfo":
      eveApp.runNumber++;
      eveApp.eventId++;
      eveApp.lastSeenRunNumber = event.data.run;
      injectProgramInfo(event.data);
      break;
    case "error":
      eveApp.runNumber++;
      eveApp.eventId++;
      injectProgramError(event.data.errors);
      break;
    case "requestProgramInfo":
      eveApp.sendProgramInfo = true;
      if(eveApp.running & eveApp.runNumber !== event.data.lastSeenRunNumber) {
        collectProgramInfo(eveApp, eveApp.lastStats || {profile: []});
      }
      break;
    case "reset":
      eveApp.runNumber++;
      onCompile(eveApp.code, false);
      break;
    case "inject":
      eveApp.runNumber++;
      eveApp.eventId++;
      var stats = runWithFacts(eveApp, event.data.items);
      break;
    case "event":
      eveApp.runNumber++;
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
