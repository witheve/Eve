/// <reference path="uiEditorRenderer.ts" />
/// <reference path="api.ts" />
module client {
  declare var dispatcher;
  declare var DEBUG;
  declare var CBOR;
  declare var uuid;

  var ixer = api.ixer;

  function now() {
    if (window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
  }

  export function nukeTable(viewId) { // from orbit
    var fieldIds = api.code.sortedViewFields(viewId);
    var toRemove = api.ixer.facts(viewId);
    var displayOrderIndex = api.ixer.index("display order");
    var displayOrders = toRemove.map(function(fact) {
      var key = viewId + JSON.stringify(fact);
      var order = displayOrderIndex[key];
      if(order) {
        return [key, order];
      }
    }).filter((r) => r);
    sendToServer({ changes: [[viewId, fieldIds, [], toRemove],
                             ["display order", api.ixer.sortedViewFields("display order"), [], displayOrders]]}, true);
  }

  function formatTime(time) {
    time = time || new Date();
    return pad("", time.getHours(), "0", 2) + ":" + pad("", time.getMinutes(), "0", 2) + ":" + pad("", time.getSeconds(), "0", 2);
  }

  function pad(left, right, pad, length) {
    left = "" + left;
    right = "" + right;
    pad = (pad !== undefined) ? pad : " ";
    length = (length !== undefined) ? length : 120;

    var padding = "";
    var delta = length - left.length - right.length;
    if (delta > 0) {
      padding = new Array(delta + 1).join(pad);
    }
    return left + padding + right;
  }

  function writeDataToConsole(data, verbosity) {
    var console: any = window.console;
    verbosity = +verbosity;
    data.changes.forEach(function(change) {
      if (change[2].length || change[3].length) {
        if (verbosity == 1) {
          console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length);
        }
        if (verbosity == 2) {
          console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length,
            { fields: change[1], inserts: change[2], removes: change[3] });
        }
        if (verbosity == 3) {
          console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length);
          console.groupCollapsed("   inserts", change[1]);
          console.table(change[2]);
          console.groupEnd();
          console.groupCollapsed("   removes", change[1]);
          console.table(change[3]);
          console.groupEnd();
        }
      }
    });
  }

  function isUndefined(val) {
    return val === undefined;
  }

  function getDataStats(data) {
    var totalAdds = 0;
    var totalRemoves = 0;
    var malformedDiffs = [];
    var badValues = [];
    data.changes.forEach(function(change) {
      totalAdds += change[2].length;
      totalRemoves += change[3].length;
      var hasMalformedDiffs = false;
      var hasBadValues = false;
      change[2].forEach(function(diff) {
        hasMalformedDiffs = hasMalformedDiffs || (diff.length !== change[1].length);
        hasBadValues = hasBadValues || diff.some(isUndefined);
      });

      change[3].forEach(function(diff) {
        hasMalformedDiffs = hasMalformedDiffs || (diff.length !== change[1].length);
        hasBadValues = hasBadValues || diff.some(isUndefined);
      });
      if (hasMalformedDiffs) {
        malformedDiffs.push(change[0]);
      }
      if (hasBadValues) {
        badValues.push(change[0]);
      }
    });

    return { adds: totalAdds, removes: totalRemoves, malformedDiffs: malformedDiffs, badValues: badValues };
  }

  function createBlockFieldView() {
    var queryId = uuid();
    var blockField = api.insert("view", {
      view: "block field",
      kind: "join",
      dependents: {
        "display name": {name: "A"},
        tag: [{tag: "remote"}],
        block: {query: queryId},
        "editor item": {item: queryId, type: "query", dependents: {"display name": {name: "block field"}}},
        "query export": {query: queryId},
        source: [
          {"source view": "field"},
          {"source view": "source"},
          {"source view": "concat"},
          {"source view": "concat"}
        ]
      }
    });
    var blockFieldSources = blockField.content.dependents.source;
    var inserts = [
      blockField,
      api.insert("constraint",
        {"left field": "source: source view", "right source": blockFieldSources[0].source, "right field": "field: view", operation: "="},
        {view: blockField.content.view, source: blockFieldSources[1].source}),
      api.insert("constraint", [
        {"right field": "source: view", "right source": blockFieldSources[1].source, "left field": "concat: a", operation: "="},
        {"right field": "source: source", "right source": blockFieldSources[1].source, "left field": "concat: b", operation: "="}         
      ], {view: blockField.content.view, source: blockFieldSources[2].source}),
      api.insert("constraint", [
        {"right field": "concat: out", "right source": blockFieldSources[2].source, "left field": "concat: a", operation: "="},
        {"right field": "field: field", "right source": blockFieldSources[0].source, "left field": "concat: b", operation: "="}         
      ], {view: blockField.content.view, source: blockFieldSources[3].source}),

      api.insert("field", [
        {field: "block field: block field", kind: "output", dependents: {
          "display name": {name: "block field"},
          "display order": {priority: 0},
          select: {source: blockFieldSources[3].source, "source field": "concat: out"}
        }},
        {field: "block field: view", kind: "output", dependents: {
          "display name": {name: "view"},
          "display order": {priority: -1},
          select: {source: blockFieldSources[1].source, "source field": "source: view"}
        }},
        {field: "block field: source", kind: "output", dependents: {
          "display name": {name: "source"},
          "display order": {priority: -2},
          select: {source: blockFieldSources[1].source, "source field": "source: source"}
        }},
        {field: "block field: source view", kind: "output", dependents: {
          "display name": {name: "source view"},
          "display order": {priority: -3},
          select: {source: blockFieldSources[1].source, "source field": "source: source view"}
        }},
        {field: "block field: field", kind: "output", dependents: {
          "display name": {name: "field"},
          "display order": {priority: -4},
          select: {source: blockFieldSources[0].source, "source field": "field: field"}
        }},
      ], {view: blockField.content.view})
    ];
    var diffs = api.toDiffs(inserts);
    var calculatedFieldId = uuid();
    var calculatedField2Id = uuid();
    diffs.push(["calculated field", "inserted", [calculatedFieldId, "block field", blockFieldSources[2].source, "concat", "concat: out"]],
               ["display name", "inserted", [calculatedFieldId, "a"]],
               ["calculated field", "inserted", [calculatedField2Id, "block field", blockFieldSources[3].source, "concat", "concat: out"]],
               ["display name", "inserted", [calculatedField2Id, "b"]]);
               
    return diffs;
  }

  function initialize(noFacts) {
    api.initIndexer(noFacts);
    if(!noFacts) {
      var diffs = createBlockFieldView();
      console.log(JSON.stringify(diffs, null, 2));
      ixer.handleDiffs(diffs);
    } 
    sendToServer(ixer.dumpMapDiffs(), true);
  }

  var server = { connected: false, queue: [], initialized: false, lastSent: [], ws: null, dead: false };
  function connectToServer() {
    var queue = server.queue;
    var wsAddress = "ws://localhost:2794";
    if(window.location.protocol !== "file:") {
      wsAddress = `ws://${window.location.hostname}:2794`;
    }
    var ws = new WebSocket(wsAddress, []);
    server.ws = ws;

    ws.onerror = function(error) {
      console.log('WebSocket Error ' + error);
      server.dead = true;
      if (!server.initialized) {
        console.warn("Starting in local only mode, the server is dead.");
        initialize(false);
        dispatcher.render();
      }
    };

    ws.onmessage = function(e) {
      var start = now();
      var data = JSON.parse(e.data);
      var time = now() - start;
      if (time > 5) {
        console.log("slow parse (> 5ms):", time);
      }

      var initializing = false;

      if (!server.initialized) {
        var initialized = data.changes.some(function(diff) {
          return diff[0] === "initialized";
        });
        if (initialized) {
          initialize(true);
        } else {
          initialize(false);
        }
        server.initialized = true;
        initializing = true;
      }

      var changes = [];
      var compilerChanges = [];
      for (var changeIx = 0; changeIx < data.changes.length; changeIx++) {
        var id = data.changes[changeIx][0];
        if (initializing || api.code.hasTag(id, "remote")) {
          if (api.builtins.compiler[id]) {
            compilerChanges.push(data.changes[changeIx]);
          } else {
            changes.push(data.changes[changeIx]);
          }
        }
      }

      if (DEBUG.RECEIVE) {
        var stats = getDataStats(data);
        if (stats.adds || stats.removes) {
          var header = "[client:received][+" + stats.adds + "/-" + stats.removes + "]";
          console.groupCollapsed(pad(header, formatTime(null), undefined, undefined));
          if (stats.malformedDiffs.length) {
            console.warn("The following views have malformed diffs:", stats.malformedDiffs);
          }
          if (stats.badValues.length) {
            console.warn("The following views have bad values:", stats.badValues);
          }
          writeDataToConsole(data, DEBUG.RECEIVE);
          console.groupEnd();
        }
      }
      var start = now();
      // @FIXME: We need to isolate and process compiler views first, to ensure that the necessary data for ordering
      // other views is available and not stale.
      if (compilerChanges.length) {
        ixer.handleMapDiffs(compilerChanges);
      }
      ixer.handleMapDiffs(changes);
      if (initializing) {
        var eventId = (ixer.facts("client event") || []).length;
        console.log(eventId);
        uiEditorRenderer.setEventId(eventId);
        uiEditorRenderer.setSessionId(data.session);
        var neueDiffs = api.diff.computePrimitives();

        ixer.handleDiffs(neueDiffs);
        for(var initFunc of afterInitFuncs) {
          initFunc();
        }
      }

      var time = now() - start;
      if (time > 5) {
        console.log("slow handleDiffs (> 5ms):", time);
      }
      
      if(server.initialized && data.changes.length) {
        dispatcher.render();
      }
      
      // Get the user ID from a cookie
      var name = "userid" + "=";
      var cookie = document.cookie.split(';');
      var userid = "";
      if (cookie[0].indexOf(name) == 0)
        userid = cookie[0].substring(name.length, cookie[0].length);

      // Check if the user ID is found. If not, redirect the user to log in.
      if (userid == "") {
        // TODO Handle a user who isn't logged in.
        console.log("Session has not been authenticated.");
      } else {
        var eveusers = api.ixer.index("eveusers id to username");
        var username = eveusers[userid];
        if (typeof username == 'undefined') {
          // TODO Handle a user who is not in the eveuser table
          console.log("Session cookie does not identify an eveuser.");
        } else {
          // TODO Handle a user who is logged in
          console.log("You are logged in as " + username);
        }
      }
    };

    ws.onopen = function() {
      server.connected = true;
      for (var i = 0, len = queue.length; i < len; i++) {
        sendToServer(queue[i], false);
      }
    }
  }

  export function sendToServer(message, formatted) {
    if (!server.connected) {
      console.log("not connected");
      server.queue.push(message);
    } else {
      // console.log("sending", message);
      if (!formatted) {
        message = toMapDiffs(message);
      }
      var payload = { changes: [] };
      var specialPayload = { changes: [] };

      for (var ix = 0; ix < message.changes.length; ix++) {
        var table = message.changes[ix][0];
        if (api.builtins.compiler[table]) {
          specialPayload.changes.push(message.changes[ix]);
        } else {
          payload.changes.push(message.changes[ix]);
        }
      }

      if (DEBUG.SEND) {
        var stats = getDataStats(payload);
        var specialStats = getDataStats(specialPayload);
        if (stats.adds || stats.removes || specialStats.adds || specialStats.removes) {
          var header = "[client:sent][+" + (stats.adds + specialStats.adds) + "/-" + (stats.removes + specialStats.removes) + "]";
          console.groupCollapsed(pad(header, formatTime(undefined), undefined, undefined));

          if (specialStats.adds || specialStats.removes) {
            var header = "[special][+" + specialStats.adds + "/-" + specialStats.removes + "]";
            console.group(header);
            if (specialStats.malformedDiffs.length) {
              console.warn("The following views have malformed diffs:", specialStats.malformedDiffs);
            }
            if (stats.badValues.length) {
              console.warn("The following views have bad values:", stats.badValues);
            }
            writeDataToConsole(specialPayload, DEBUG.SEND);
            console.groupEnd();
          }
          if (stats.adds || stats.removes) {
            var header = "[normal][+" + stats.adds + "/-" + stats.removes + "]";
            console.group(header);
            if (stats.malformedDiffs.length) {
              console.warn("The following views have malformed diffs:", stats.malformedDiffs);
            }
            if (stats.badValues.length) {
              console.warn("The following views have bad values:", stats.badValues);
            }
            writeDataToConsole(payload, DEBUG.SEND);
            console.groupEnd();
          }
          console.groupEnd();
        }
      }

      if (specialPayload.changes.length) {
        server.ws.send(CBOR.encode(specialPayload));
      }
      if (payload.changes.length) {
        server.ws.send(CBOR.encode(payload));
      }
    }
  }

  function toMapDiffs(diffs) {
    // Deduplicate diffs prior to sending with last write wins.
    var deduped = [];
    outer: for(var ix = diffs.length - 1; ix >= 0; ix--) {
      var diff = diffs[ix];
      for(var needleIx = deduped.length - 1; needleIx >= 0; needleIx--) {
        if(api.arraysIdentical(diff[2], deduped[needleIx][2]) && diff[0] === deduped[needleIx][0]) {
          continue outer;
        }
      }
      deduped.push(diff);
    }
    diffs = deduped;
    
    var final = { field: null };
    for (var i = 0, len = diffs.length; i < len; i++) {
      var cur = diffs[i];
      var table = cur[0];
      var action = cur[1];
      var fact = cur[2];
      if (!final[table]) {
        final[table] = { inserted: [], removed: [] };
      }
      final[table][action].push(fact);
    }

    var neueFields = {};

    for (var fieldIx = 0; final.field && fieldIx < final.field.inserted.length; fieldIx++) {
      // @FIXME: These must be inserted in order to work.
      // @FIXME: Does not account for removed fields, only appended fields.
      var field = final.field.inserted[fieldIx];
      var fieldViewId = field[0];
      var fieldId = field[1];
      if (!neueFields[fieldViewId]) { neueFields[fieldViewId] = (ixer.index("view to fields")[fieldViewId] || []).slice(); }
      neueFields[fieldViewId].push(fieldId);
    }

    var changes = [];
    for (var table in final) {
      if(!final[table]) continue;
      var fieldIds = api.code.sortedViewFields(table) || [];
      fieldIds = fieldIds.concat(neueFields[table] || []);

      changes.push([table, fieldIds, final[table].inserted, final[table].removed]);
    }
    return { changes: changes };
  }
  
  var afterInitFuncs: Function[] = [];
  export function afterInit(func) {
    afterInitFuncs.push(func);
  }

  connectToServer();
}
