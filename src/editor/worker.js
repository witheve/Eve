import macros from "../macros.sjs";

importScripts("../src/eve.js", "../src/helpers.js", "../src/tokenizer.js");

var eveApp = global.eveApp = app();
eveApp.remotes = {};

function consoleLog() {
  var final = [];
  for(var i in arguments) {
    final[i] = arguments[i];
  }
  final.unshift("worker:");
  try {
    postMessage({to: "uiThread", type: "log", args: final, run: eveApp.runNumber});
  } catch(e) {
    postMessage({to: "uiThread", type: "log", args: [eveApp.name + ": Could not log a message"], run: eveApp.runNumber});
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
      application.run([["rawEvent", application.eventId++, event, "", (new Date()).getTime()]]);
    }, rate);
    timeouts[id] = timeout;
  }

  storage["timeouts"] = timeouts;
}

eveApp.compilerWatcher = function(application, storage, system) {
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

  console.log("needs compile?", needsCompile)
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
      return true;
    } catch(e) {
      system.updateStore("error", errorsToFacts(application, [e]), []);
      return false;
    }
  }
  return false;
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
    postMessage({to: "uiThread", type: "renderUI", diff: diffs, time: now(), run: eveApp.runNumber, from: eveApp.name});
  }
}

function handleDiffs(application, diffs) {
  var storage = application.storage["remoteWatcher"];
  var updateStorage = function(table, diff) {
    if(storage[table]) {
      storage[table] = storage[table].update(diff.adds, diff.removes);
    } else {
      storage[table] = application.system.getStore(table);
    }
  }

  //if we've changed the views or fields we have to recompile first to ensure
  //that the stores will be in place when we then try to apply diffs to them.
  var recompile = false;
  var recompileViews = ["view", "field"];
  foreach(view of compilerTables) {
    if(diffs[view]) {
      applyDiff(eveApp, view, diffs[view]);
      updateStorage(view, diffs[view]);
      diffs[view] = {adds: [], removes: []};
      recompile = true;
    }
  }
  if(recompile) {
    application.compilerWatcher(application, application.storage["compilerWatcher"], application.system);
  }

  for(var table in diffs) {
    applyDiff(application, table, diffs[table]);
    //Since we got these diffs from a remote, we have to update storage so that we don't
    //then send these back to the remote.
    updateStorage(table, diffs[table]);
  }
  return application;
}

onmessage = function(event) {
  switch(event.data.type) {
    case "diffs":
      var diffs = event.data.diffs;
      handleDiffs(eveApp, diffs);
      eveApp.run([]);
      break;
    case "pull":
      eveApp.pull = true;
      if(event.data.runNumber !== eveApp.runNumber) {
        //do pull
        eveApp.remoteWatcher(eveApp, eveApp.storage["remoteWatcher"], eveApp.system);
      }
      break;
    case "clearStorage":
      //the remote cleared the following views (probably due to recompile)
      var views = event.data.views;
      var storage = eveApp.storage["remoteWatcher"];
      foreach(view of views) {
        storage[view] = null;
      }
      break;
    case "event":
      var eid = eveApp.eventId++;
      var events = event.data.items.map(function(cur) {
        //set the eventId
        cur[1] = eid;
        return cur;
      });
      eveApp.run(events);
      break;
  }
}
