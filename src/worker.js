importScripts("eve.js", "helpers.js", "tokenizer.js");
try {
   importScripts("/qwest.js");
} catch(e) {
  importScripts("../resources/qwest.js");
}

var eveApp = app();
eveApp.remotes = {};

function consoleLog() {
  var final = [];
  for(var i in arguments) {
    final[i] = arguments[i];
  }
  final.unshift(eveApp.name + ":");
  try {
    postMessage({to: "uiThread", type: "log", args: final, run: eveApp.runNumber, client: eveApp.client});
  } catch(e) {
    postMessage({to: "uiThread", type: "log", args: [eveApp.name + ": Could not log a message"], run: eveApp.runNumber, client: eveApp.client});
  }
}

var console = {
  log: consoleLog,
  error: consoleLog
};

var compilerTables = ["programView", "programQuery", "subscription", "generatedView", "displayName", "view", "field", "query", "constantConstraint", "functionConstraint", "functionConstraintInput", "constantConstraint",
                      "viewConstraint", "viewConstraintBinding", "aggregateConstraint", "aggregateConstraintBinding", "aggregateConstraintSolverInput",
                      "aggregateConstraintAggregateInput", "isInput", "isCheck"];

eveApp.webRequestWatcher = function(application, storage, system) {
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
      sent[id].abort();
      sent[id] = null;
    }
  }

  adds.forEach(function(add, addIx) {
    var id = add[1];
    var url = add[2];
    var event = add[0];

    if(id === undefined || url === undefined || event === undefined) return;

    var start = application.eventId++;
    application.run([
      ["rawEvent", interval(start, Infinity), event, id],
      ["eventTime", start, Date.now()]
    ]);

    function completed(response) {
      if(!sent[id]) return;
      var resp = typeof response === "string" ? response : JSON.stringify(response);
      var end = application.eventId++;
      var interval = interval(start, end);
      application.run([
        ["rawEvent", interval, event, id],
        ["eventTime", end, Date.now()],
        ["webResponse", interval, resp]
      ]);
    }

    var req = qwest.get(url).then(completed);
    req.abort = function() {
      req.xhr.abort();
      completed();
    };
    sent[id] = req;
  });

  storage["sent"] = sent;
}

eveApp.timerWatcher = function(application, storage, system) {
  var timers = system.getStore("timer");
  if(!timers) return;

  var diff = diffTables(timers, storage["timer"]);
  var adds = diff.adds;
  var removes = diff.removes;
  storage["timer"] = timers;
  timeouts = storage["timeouts"] || {};

  for(var removeIx = 0; removeIx < removes.length; removeIx++) {
    var id = removes[removeIx][1];
    clearTimeout(timeouts[id]);
    timeouts[id] = null;
  }

  adds.forEach(function(add, addIx) {
    var id = add[1];
    var event = add[0];
    var rate = add[2];

    if(!id) return;
    if(!rate || typeof(rate) === "string" || rate < 16) rate = 16;

    var timeout = setInterval(function() {
      var start = application.eventId++;
      application.run([
        ["rawEvent", interval(start, start), event, ""],
        ["eventTime", start, Date.now()]
      ]);
    }, rate);
    timeouts[id] = timeout;
  })

  storage["timeouts"] = timeouts;
}

eveApp.compileWatcher = function(application, storage, system) {
  var needsCompile = false;
  for(var i = 0, len = compilerTables.length; i < len; i++) {
    var table = compilerTables[i];
    var current = system.getStore(table);
    if(!needsCompile) {
      var diff = diffTables(current, storage[table])
      if(diff.adds.length || diff.removes.length) {
        needsCompile = true;
      }
    }
    storage[table] = current;
  }

  if(needsCompile) {
    var run = application.runNumber + 1;
    try {
      start = now();
      system.recompile();
      system.updateStore("profile", [[run, "compile", now() - start]], []);

      var errors = [];
      system.refresh(errors);
      if(errors.length) {
        system.updateStore("error", errorsToFacts(errors), []);
      }

    } catch(e) {
      system.updateStore("error", errorsToFacts([e]), []);
      return false;
    }
  }
  return true;
}

function factsToCells(facts, view) {
  var cells = [];
  for(var factIx = 0, factLen = facts.length; factIx < factLen; factIx++) {
    var fact = facts[factIx];
    var row = JSON.stringify(fact);
    for(var colIx = 0, colLen = fact.length; colIx < colLen; colIx++) {
      cells.push([view, row, colIx, fact[colIx]]);
    }
  }
  return cells;
}

eveApp.remoteWatcher = function(application, storage, system) {
  var diffs = {};
  var removed = {};
  var remoteStatuses = application.remotes;
  var remoteNames = [];

  //Handle remote thread creation and destruction
  var remoteTable = system.getStore("remote");
  var remoteDiff = diffTables(remoteTable, storage["remotes"]);

  for(var i = 0, len = remoteDiff.removes.length; i < len; i++) {
    var name = remoteDiff.removes[i][0];
    removed[name] = true;
    remoteStatuses[name] = {killed: true};
    if(name !== application.name) {
      postMessage({to: "uiThread", type: "kill", name: name, client: application.client});
    }
  }

  for(var i = 0, len = remoteDiff.adds.length; i < len; i++) {
    var name = remoteDiff.adds[i][0];
    if(name !== application.name) {
      postMessage({to: "uiThread", type: "createThread", name: name, client: application.client});
      postMessage({to: name, type: "remoteReady", from: application.name, client: application.client});
    }
    remoteStatuses[name] = {ready:true, lastSeenRunNumber: -1};
  }

  var remotes = remoteTable ? remoteTable.getFacts() : [];
  for(var i = 0, len = remotes.length; i < len; i++) {
    var name = remotes[i][0];
    remoteNames.push(name);
    diffs[name] = {};
  }

  storage["remotes"] = remoteTable;

  // Collect diffs for remote compiler views
  for(var i = 0, len = compilerTables.length; i < len; i++) {
    var table = "remote|" + compilerTables[i];
    var current = system.getStore(table);
    var diff = diffTables(current, storage[table])
    storage[table] = current;
    if(diff.adds.length || diff.removes.length) {
      for(var x = 0, xlen = diff.adds.length; x < xlen; x++) {
        var cur = diff.adds[x];
        var remoteName = cur[0];
        if(!diffs[remoteName]) continue;
        var result = diffs[remoteName][compilerTables[i]] || (diffs[remoteName][compilerTables[i]] = {adds: [], removes: []});
        if(!removed[remoteName]) {
          result.adds.push(cur.slice(1));
        }
      }
      for(var x = 0, xlen = diff.removes.length; x < xlen; x++) {
        var cur = diff.removes[x];
        var remoteName = cur[0];
        if(!diffs[remoteName]) continue;
        var result = diffs[remoteName][compilerTables[i]] || (diffs[remoteName][compilerTables[i]] = {adds: [], removes: []});
        if(!removed[remoteName]) {
          result.removes.push(cur.slice(1));
        }
      }
    }
  }

  // reconstitute insertedFacts
  var inserts = {};
  var insertedTable = system.getStore("remote|insertedFact");
  var insertedDiff = diffTables(insertedTable, storage["remote|insertedFact"]);
  storage["remote|insertedFact"] = insertedTable;
  if(insertedDiff.adds.length || insertedDiff.removes.length) {
    var insertedFacts = insertedTable.getFacts();
    for(var i = 0, len = insertedFacts.length; i < len; i++) {
      var fact = insertedFacts[i];
      var remote = fact[0];
      var view = fact[1];
      var row = fact[2];
      var col = fact[3];
      var value = fact[4];
      if(!inserts[remote]) inserts[remote] = {};
      if(!inserts[remote][view]) inserts[remote][view] = [];
      if(!inserts[remote][view][row]) inserts[remote][view][row] = [];
      inserts[remote][view][row][col] = value;
    }
  }

  // collect subscriptions/shares
  var shares = system.getStore("shared").getFacts().map(function(cur) {
    return ["server", cur[0], cur[1], false];
  });

  var subscriptions = {};
  var subsTable = system.getStore("subscription");
  var subsFacts = subsTable.getFacts().concat(shares);
  for(var subIx = 0, subLen = subsFacts.length; subIx < subLen; subIx++) {
    var cur = subsFacts[subIx];
    var remote = cur[0];
    var view = cur[1];
    var alias = cur[2];
    var asCell = cur[3];
    var localTable = system.getStore(view);
    if(!remoteStatuses[remote] || !remoteStatuses[remote].ready) continue;
    if(!subscriptions[remote]) {
      subscriptions[remote] = {};
      if(remoteNames.indexOf(remote) === -1) {
        remoteNames.push(remote);
      }
    }
    var results = subscriptions[remote];
    if(localTable) {
      var diff = diffTables(localTable, storage[remote + "|" + alias]);
      storage[remote + "|" + alias] = localTable;
      if(!diff.adds.length && !diff.removes.length) continue;

      if(asCell) {
        if(!results["resultCell"]) {
          results["resultCell"] = {adds: [], removes: []};
        }
        results["resultCell"].adds = results["resultCell"].adds.concat(factsToCells(diff.adds, alias));
        results["resultCell"].removes = results["resultCell"].removes.concat(factsToCells(diff.removes, alias));
      } else {
        results[alias] = {};
        results[alias].adds = diff.adds;
        results[alias].removes = diff.removes;
      }
    }
  }

  for(var remoteIx = 0, remoteLen = remoteNames.length; remoteIx < remoteLen; remoteIx++) {
    var remoteThread = remoteNames[remoteIx];
    if((diffs[remoteThread] && Object.keys(diffs[remoteThread]).length) ||
       (inserts[remoteThread] && Object.keys(inserts[remoteThread]).length) ||
       (subscriptions[remoteThread] && Object.keys(subscriptions[remoteThread]).length)) {
      remoteStatuses[remoteThread].ready = false;
      remoteStatuses[remoteThread].lastSeenRunNumber = application.runNumber;
      postMessage({to: remoteThread,
                   from: application.name,
                   client: application.client,
                   eventId: application.eventId,
                   type: "diffs",
                   diffs: JSON.stringify(diffs[remoteThread] || {}),
                   subscriptions:JSON.stringify(subscriptions[remoteThread] || {}),
                   inserts: JSON.stringify(inserts[remoteThread] || {})});
    }
  }

}

eveApp.uiWatcher = function(application, storage, system) {
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
    postMessage({to: "uiThread", uiContainer: container, type: "renderUI", diff: diff, time: now(), run: eveApp.runNumber, from: eveApp.name, client: application.client});
  }
}

function onCompile(code, replace, subProgram, subProgramName) {
  if(!eveApp.storage["textCompile"]) {
    eveApp.storage["textCompile"] = {};
  }
  var stats = {profile: []};
  var start = now();
  var parsedCompilerChecks = parse(compilerChecks);
  var parsed = parse(code);
  var prefix = subProgram ? "editor|" : "";
  var run = eveApp.runNumber + 1;
  if(!subProgram) {
    eveApp.code = code;
  }
  var compileErrorTable = eveApp.system.getStore("compileError");
  if(compileErrorTable) {
    eveApp.system.updateStore("compileError", [], compileErrorTable.getFacts());
  }
  eveApp.lastParse = parsed;
  stats.profile.push([run, "parse", now() - start]);
  try {
    var prev = eveApp.system;
    var prevCompile = eveApp.storage["textCompile"][subProgramName] || System.empty({});
    start = now();
    var system = System.empty({name: "editor program"});
    system.update(commonViews(), []);
    system.recompile();
    system.refresh();

    var errors = [];

    compileResults = injectParsed(parsedCompilerChecks, system);

    if(eveApp.isEditor) {
      system.update(editorViews(), []);
    }

    eveApp.compileResults = compileResults;
    errors = errors.concat(compileResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      eveApp.system.updateStore("compileError", errorsToFacts(errors), []);
      if(!subProgram) return eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
      else return eveApp.run([]);
    }
    system.recompile();

    programResults = injectParsed(parsed, system, prefix, subProgram && subProgramName);
    eveApp.programResults = programResults;
    errors = errors.concat(programResults.errors);
    system.refresh(errors);
    if (errors.length > 0) {
      eveApp.system.updateStore("compileError", errorsToFacts(errors), []);
      if(!subProgram) return eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
      else return eveApp.run([]);
    }

    stats.profile.push([run, "compile", now() - start]);

    if(!replace) {
      start = now();
      for(var i = 0, len = compilerTables.length; i < len; i++) {
        var table = prefix + compilerTables[i];
        var diff = diffTables(system.getStore(table), prevCompile.getStore(table));
        applyDiff(eveApp, table, diff);
      }
      stats.profile.push([run, "loadCompiled", now() - start]);
    } else {
      eveApp.updateSystem(system);
    }

    if(subProgramName) {
      eveApp.storage["textCompile"][subProgramName] = system;
    }

    programResults.values["time"] = [[(new Date()).getTime()]];

    if(!subProgram) {
      eveApp.compileWatcher(eveApp, eveApp.storage["compilerWatcher"], eveApp.system);
      for(var table in programResults.values) {
        var facts = programResults.values[table];
        var prev = eveApp.system.getStore(table);
        var removes = [];
        if(prev) {
          removes = prev.getFacts();
        }
        eveApp.system.updateStore(table, facts, removes);
      }
    } else {
      var insertedFacts = [];
      for(var table in programResults.values) {
        var facts = programResults.values[table];
        for(var factIx = 0, factLen = facts.length; factIx < factLen; factIx++) {
          var fact = facts[factIx];
          for(var colIx = 0, colLen = fact.length; colIx < colLen; colIx++) {
            insertedFacts.push([eveApp.activeEditorProgram, table, factIx, colIx, fact[colIx]]);
          }
        }
      }
      var prev = eveApp.system.getStore("editor|insertedFact");
      var removes = [];
      if(prev) {
        removes = prev.getFacts();
      }
      eveApp.system.updateStore("editor|insertedFact", insertedFacts, removes);
    }

    eveApp.system.updateStore("profile", stats.profile, []);
    eveApp.run([]);

  } catch(e) {
    eveApp.system.updateStore("error", errorsToFacts([e]), []);
    eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
  }
}

function injectRemoteDiffs(client, diffs, inserts, subs) {
  var start = now();
  var changed = false;
  for(var table in diffs) {
    var curDiff = diffs[table];
    if(curDiff.adds.length || curDiff.removes.length) {
      changed = true;
      eveApp.system.updateStore(table, curDiff.adds, curDiff.removes);
    }
  }

  if(changed) {
    var didCompile = eveApp.compileWatcher(eveApp, eveApp.storage["compilerWatcher"], eveApp.system);
    if(!didCompile) return eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
  }

  var inserted = false;
  for(var table in inserts) {
    var facts = inserts[table];
    var current = eveApp.system.getStore(table);
    if(current) {
      inserted = true;
      eveApp.system.updateStore(table, facts, current.getFacts());
    }
  }
  for(var table in subs) {
    var diff = subs[table];
    var current = eveApp.system.getStore(table);
    if(current) {
      inserted = true;
      eveApp.system.updateStore(table, diff.adds, diff.removes);
      eveApp.storage["remoteWatcher"][client + "|" + table] = eveApp.system.getStore(table);
    }
  }
  if(inserted) eveApp.run([]);
}

//************************************
// Event Handling
//************************************

var UIEventState = {
  "keydown": {}
};

function setEventStart(event, value) {
  // If the event is an end event, isEnd has the name of it's pair.
  var state = event.isEnd || event.event;
  if(event.subState) {
    return UIEventState[state][event.subState] = value;
  }
  return UIEventState[state] = value;

}

function getEventStart(event) {
  // If the event is an end event, isEnd has the name of it's pair.
  var state = event.isEnd || event.event;
  if(event.subState) {
    return UIEventState[state][event.subState];
  }
  return UIEventState[state];
}

onmessage = function(event) {
  switch(event.data.type) {
    case "init":
      eveApp.name = event.data.name;
      eveApp.isEditor = event.data.editor;
      eveApp.client = event.data.client;
      eveApp.run([["client", event.data.client]]);
      break;
    case "remoteInit":
      eveApp.name = event.data.name;
      eveApp.client = event.data.client;
      eveApp.run([["client", event.data.client]]);
      eveApp.remotes["server"] = {ready: true};
      break;
    case "newProgram":
      if(!eveApp.isEditor) { return; }
      console.log("new program: ", event.data.programName);
      eveApp.activeEditorProgram = event.data.programName;
      eveApp.system.updateStore("tableCardProgram", [[1, event.data.programName]], eveApp.system.getStore("tableCardProgram").getFacts());
      eveApp.system.updateStore("resultCell", [], eveApp.system.getStore("resultCell").getFacts());
      eveApp.system.updateStore("editorProfile", [], eveApp.system.getStore("editorProfile").getFacts());
      eveApp.system.updateStore("editorError", [], eveApp.system.getStore("editorError").getFacts());
      eveApp.system.updateStore("editor|hasUI", [], eveApp.system.getStore("editor|hasUI").getFacts());
      eveApp.run([]);
      break;
    case "compile":
      onCompile(event.data.code, false, event.data.subProgram, event.data.subProgramName);
      break;
    case "remoteReady":
      var remote = eveApp.remotes[event.data.from];
      if(!remote) {
        remote = eveApp.remotes[event.data.from] = {};
      }
      remote.ready = true;
      if(eveApp.running && eveApp.runNumber !== remote.lastSeenRunNumber) {
        eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
      }
      break;
    case "reset":
//       eveApp.storage["compilerWatcher"] = {};
//       onCompile(eveApp.code, true);
      eveApp.system.updateStore("tableCardProgram", [], eveApp.system.getStore("tableCardProgram").getFacts());
      eveApp.run([]);
      break;
    case "diffs":
      if(event.data.eventId > eveApp.eventId) {
       // eveApp.eventId = event.data.eventId;
      }
      //eveApp.eventId++;
      var remote = eveApp.remotes[event.data.from];
      if(!remote) {
        remote = eveApp.remotes[event.data.from] = {};
      }
      //if this remote was killed ignore any further diffs
      if(remote.killed) return;
      // otherwise whoever sent us this is ready for us to respond to them
      remote.ready = true;
      var diffs = JSON.parse(event.data.diffs);
      var inserts = JSON.parse(event.data.inserts);
      var subscriptions = JSON.parse(event.data.subscriptions);
      injectRemoteDiffs(event.data.from, diffs, inserts, subscriptions);
      postMessage({to: event.data.from, type: "remoteReady", from: eveApp.name, client: eveApp.client});
      break;
    case "event":
      if(!event.data.items.length) break;

      var facts = [];
      var events = event.data.items.forEach(function(cur) {
        var event = cur.event;

        //set the eventId
        var eid = eveApp.eventId++;
        var intvl;
        var prev = getEventStart(cur);

        // Build interval based on event stage.
        if(cur.isInstant) {
          intvl = interval(eid, eid);

        } else if(cur.isStart) {
          if(prev === undefined) setEventStart(cur, eid);
          else {
            // Roll back the eventId since the event is ignored.
            eveApp.eventId--;
            return;
          }
          intvl = interval(eid, Infinity);

        } else if(cur.isEnd) {
          setEventStart(cur, undefined);
          intvl = interval(prev, eid);
        }

        // Push extended event facts.
        if(event.type === "mouse") {
          facts.push(["mousePosition", intvl, cur.x, cur.y]);

        } else if(event.type === "keyboard") {
          facts.push("keyboard", intvl, cur.charCode, event);
        }

        facts.push(["rawEvent", intvl, cur.label, cur.key]);
        facts.push(["eventTime", eid, cur.time]);
      });

      if(facts.length) eveApp.run(facts);
      break;
  }
}
