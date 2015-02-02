import macros from "../macros.sjs";

importScripts("../src/eve.js", "../src/helpers.js", "../src/tokenizer.js");

var eveApp = global.eveApp = app();
eveApp.remotes = {};
eveApp.client = "";

function consoleLog() {
  var final = [];
  for(var i in arguments) {
    final[i] = arguments[i];
  }
  final.unshift("worker:");
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


eveApp.timerWatcher = function(application, storage, system) {
  var timers = system.getStore("timer");
  if(!timers) return;

  var diff = diffTables(timers, storage["timer"]);
  var adds = diff.adds;
  var removes = diff.removes;
  storage["timer"] = timers;
  timeouts = storage["timeouts"] || {};

  foreach(remove of removes) {
    var id = remove[1];
    clearTimeout(timeouts[id]);
    timeouts[id] = null;
  }

  foreach(add of adds) {
    var id = add[1];
    var event = add[0];
    var rate = add[2];

    if(!id) continue;
    if(!rate || typeof(rate) === "string" || rate < 16) rate = 16;

    var timeout = setInterval(function() {
      application.run([["rawEvent", application.client, application.eventId++, event, "", (new Date()).getTime()]]);
    }, rate);
    timeouts[id] = timeout;
  }

  storage["timeouts"] = timeouts;
}

eveApp.compileWatcher = function(application, storage, system) {
  var needsCompile = false;

  foreach(table of compilerTables) {
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
        system.updateStore("error", errorsToFacts(application, errors), []);
      }

    } catch(e) {
      system.updateStore("error", errorsToFacts(application, [e]), []);
      return false;
    }
  }
  return true;
}

function factsToCells(facts, view) {
  var cells = [];
  foreach(fact of facts) {
    var row = JSON.stringify(fact);
    foreach(colIx, col of fact) {
      cells.push([view, row, colIx, col]);
    }
  }
  return cells;
}

eveApp.remoteWatcher = function(application, storage, system) {
  if(!application.pull) return;

  var subscriptions = system.getStore("subscription").getFacts();
  var final = {};
  foreach(subs of subscriptions) {
    var view = subs[0];
    var diff = diffTables(system.getStore(view), storage[view]);
    if(diff.adds.length || diff.removes.length) {
      final[view] = diff;
    }
    storage[view] = system.getStore(view);
  }

  application.pull = false;
  postMessage({type: "diffs", diffs: final, runNumber: application.runNumber});
}

eveApp.uiWatcher = function(application, storage, system) {
  var uiTables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diffs = {};
  var hasUI = false;

  foreach(table of uiTables) {
    var diff = diffTables(system.getStore(table), storage[table]);
    if(diff.adds.length || diff.removes.length) {
      hasUI = true;
    }
    diffs[table] = diff;
    storage[table] = system.getStore(table);
  }

  if(hasUI) {
    postMessage({to: "uiThread", type: "renderUI", diff: diffs, time: now(), run: eveApp.runNumber, from: eveApp.name, client: application.client});
  }
}


onmessage = function(event) {
  switch(event.data.type) {
    case "diffs":
      var diffs = event.data.diffs;
      if(diffs["view"] || diffs["field"]) {
        applyDiff(eveApp, "view", diffs["view"]);
        applyDiff(eveApp, "field", diffs["field"]);
        eveApp.system.recompile();
        diffs["view"] = {adds: [], removes: []};
        diffs["field"] = {adds: [], removes: []};
      }
      applySystemDiff(eveApp, diffs);
      eveApp.run([]);
      //TODO: ?
      break;
    case "pull":
      eveApp.pull = true;
      if(event.data.runNumber !== eveApp.runNumber) {
        //do pull
        eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
      }
      break;
    case "event":
      var eid = eveApp.eventId++;
      var events = event.data.items.map(function(cur) {
        //set the eventId
        cur[2] = eid;
        return cur;
      });
      eveApp.run(events);
      break;
  }
}
