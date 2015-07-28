/// <reference path="uiEditorRenderer.ts" />
/// <reference path="api.ts" />
module client {
  declare var dispatcher;
  declare var DEBUG;
  declare var CBOR;
  declare var uuid;

  var ixer = api.ixer;
  var zip = api.zip;

  function now() {
    if (window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
  }
  
  function isUndefined(val) {
    return val === undefined;
  }

  /* Integrated Debugging Tooling */
  export function nukeTable(viewId) { // from orbit
    var fieldIds = api.code.sortedViewFields(viewId);
    var toRemove = api.ixer.facts(viewId);
    sendToServer({ changes: [[viewId, fieldIds, [], toRemove]]}, true);
  }

  function formatTime(time?) {
    time = time || new Date();
    return pad("", time.getHours(), "0", 2) + ":" + pad("", time.getMinutes(), "0", 2) + ":" + pad("", time.getSeconds(), "0", 2);
  }

  function pad(left, right = "", pad = " ", length = 120) {
    left = "" + left;
    right = "" + right;

    var padding = "";
    var delta = length - left.length - right.length;
    if (delta > 0) {
      padding = new Array(delta + 1).join(pad);
    }
    return left + padding + right;
  }

  function writeDataToConsole(data, verbosity) {
    verbosity = +verbosity;
    var consoleTable = console["table"] || console.log.bind(console);
    data.changes.forEach(function(change) {
      if (change[2].length || change[3].length) {
        if (verbosity == 1) {
          console.log(" ", change[0], `+${change[2].length}/-${change[3].length}`);
        }
        if (verbosity == 2) {
          console.log(" ", change[0], `+${change[2].length}/-${change[3].length}`,
            { fields: change[1], inserts: change[2], removes: change[3] });
        }
        if (verbosity == 3) {
          console.log(" ", change[0], `+${change[2].length}/-${change[3].length}`);
          console.groupCollapsed(`   inserts ${change[1]}`);
          consoleTable(change[2]);
          console.groupEnd();
          console.groupCollapsed(`   removes ${change[1]}`);
          consoleTable(change[3]);
          console.groupEnd();
        }
      }
    });
  }

  // Generate debugging information on incoming or outgoing payloads.
  function getDataStats(data:Indexing.Payload) {
    var totalAdds = 0;
    var totalRemoves = 0;
    var malformedDiffs:string[] = [];
    var badValues:string[] = [];
    data.changes.forEach(function(change) {
      totalAdds += change[2].length;
      totalRemoves += change[3].length;
      // Simple check to notify programmers of definitely unhealthy payloads they may be sending.
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

  var server = { connected: false, queue: [], initialized: false, lastSent: [], ws: null, dead: false };
  function connectToServer() {
    var queue = server.queue;
    var wsAddress = "ws://localhost:2794";
    if(window.location.protocol !== "file:") {
      wsAddress = `ws://${window.location.hostname}:2794`;
    }
    var ws = new WebSocket(wsAddress, []);
    server.ws = ws;

    ws.onerror = ws.onclose = function(error) {
      server.dead = true;
      var error_banner = document.createElement("div");
      error_banner.innerHTML = `Error: Eve Server is Dead! ${error ? `Reason: ${error}` : ""}`;
      error_banner.setAttribute("class","dead-server-banner");
      document.body.appendChild(error_banner);
    }
    
    ws.onopen = function() {
      server.connected = true;
      for (var i = 0, len = queue.length; i < len; i++) {
        sendToServer(queue[i], false);
      }
    }

    ws.onmessage = function(e) {
      var start = now();
      var time:number;
      var data = JSON.parse(e.data);
      var time = now() - start;
      if (time > 5) {
        console.log("slow parse (> 5ms):", time);
      }

      var changes = [];
      for(var change of data.changes) {
        var [view, fields, inserts, removes] = change;
        if (!api.code.hasTag(view, "editor")) {
          changes.push(change);
        }
      }

      if (DEBUG.RECEIVE) {
        var stats = getDataStats({changes: changes});
        if (stats.adds || stats.removes) {
          var header = `[client:received][+${stats.adds}/-${stats.removes}]`;
          console.groupCollapsed(pad(header, formatTime()));
          if (stats.malformedDiffs.length) {
            console.warn("The following views have malformed diffs:", stats.malformedDiffs);
          }
          if (stats.badValues.length) {
            console.warn("The following views have bad values:", stats.badValues);
          }
          writeDataToConsole({ changes: changes }, DEBUG.RECEIVE);
          console.groupEnd();
        }
        
        start = now();      
      }

      ixer.handleMapDiffs(changes);

      // If we haven't initialized the client yet, do so after we've handled the initial payload, so it can be accessed via the indexer.
      var initializing = !server.initialized;
      server.initialized = true;
      if (initializing) {
        var eventId = (ixer.facts("client event") || []).length; // Ensure eids are monotonic across sessions.
        uiEditorRenderer.setEventId(eventId);
        uiEditorRenderer.setSessionId(data.session); // Store server-assigned session id for use in client-controlled tables.
        var neueDiffs = api.diff.computePrimitives(); // @FIXME: This will be obsolete once bootstrapped.
        ixer.handleDiffs(neueDiffs);
        for(var initFunc of afterInitFuncs) {
          initFunc();
        }
      }

      time = now() - start;
      if(DEBUG.RECEIVE) {
        if (time > 5) {
          console.log("slow handleDiffs (> 5ms):", time);
        }
      }

      dispatcher.render();

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
  }

  export function sendToServer(message, formatted?) {
    if (!server.connected) {
      console.warn("Not connected to server, adding message to queue.");
      server.queue.push(message);
    } else {
      if (!formatted) {
        message = toMapDiffs(message);
      }
      var payload = message;

      if (DEBUG.SEND) {
        var stats = getDataStats(payload);
        if (stats.adds || stats.removes) {
          var header = `[client:sent][+${stats.adds}/-${stats.removes}]`;
          console.groupCollapsed(pad(header, formatTime()));
          if (stats.malformedDiffs.length) {
            console.warn("The following views have malformed diffs:", stats.malformedDiffs);
          }
          if (stats.badValues.length) {
            console.warn("The following views have bad values:", stats.badValues);
          }
          writeDataToConsole(payload, DEBUG.SEND);
          console.groupEnd();
        }
      }

      if (payload.changes.length) {
        server.ws.send(CBOR.encode(payload));
      }
    }
  }

  export function toMapDiffs(diffs) {
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

    // If fields are added to a view at the same time as new data is, our local fields list will be out of sync.
    // neueFields will contain any additional fields we need to include in the mapping we send to the server.
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
      var fieldIds = api.ixer.getFields(table) || [];
      fieldIds = fieldIds.concat(neueFields[table] || []);

      changes.push([table, fieldIds, final[table].inserted, final[table].removed]);
    }
    return { changes: changes };
  }

  var afterInitFuncs: Function[] = [];
  export function afterInit(func) {
    afterInitFuncs.push(func);
  }

  document.addEventListener("DOMContentLoaded", function() {
    connectToServer();
  });
}
