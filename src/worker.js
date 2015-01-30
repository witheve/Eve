importScripts("eve.js", "helpers.js", "tokenizer.js");

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

  for(var addIx = 0; addIx < adds.length; addIx++) {
    var id = adds[addIx][1];
    var event = adds[addIx][0];
    var rate = adds[addIx][2];

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
    postMessage({to: "uiThread", type: "renderUI", diff: diff, time: now(), run: eveApp.runNumber, from: eveApp.name, client: application.client});
  }
}


onmessage = function(event) {
  switch(event.data.type) {
    case "init":
      eveApp.name = event.data.name;
      eveApp.client = event.data.client;
      eveApp.run([["client", event.data.client]]);
      break;
    case "diffs":
      applySystemDiff(eveApp, event.data.diffs);
      eveApp.run([]);
      //TODO: ?
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
