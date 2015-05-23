var client = (function eveClient(window, api, dispatcher) {
  var ixer = api.ixer;

  function now() {
    if(window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
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
    if(delta > 0) {
      padding = new Array(delta + 1).join(pad);
    }
    return left + padding + right;
  }

  function writeDataToConsole(data, verbosity) {
    verbosity = +verbosity;
    data.changes.forEach(function(change) {
      if(change[2].length || change[3].length) {
        if(verbosity == 1) {
          console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length);
        }
        if(verbosity == 2) {
          console.log(" ", change[0], "+" + change[2].length + "/-" + change[3].length,
                      {fields: change[1], inserts: change[2], removes: change[3]});
        }
        if(verbosity == 3) {
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

  function getDataStats(data) {
    var totalAdds = 0;
    var totalRemoves = 0;
    var malformedDiffs = [];
    data.changes.forEach(function(change) {
      totalAdds += change[2].length;
      totalRemoves += change[3].length;
      var hasMalformedDiffs = change[2].some(function(diff) {
        return (diff.length !== change[1].length);
      });
      hasMalformedDiffs = hasMalformedDiffs || change[3].some(function(diff) {
        return (diff.length !== change[1].length);
      });
      if(hasMalformedDiffs) {
        malformedDiffs.push(change[0]);
      }
    });

    return {adds: totalAdds, removes: totalRemoves, malformedDiffs: malformedDiffs};
  }

  function initialize(noFacts) {
    api.initIndexer(noFacts);
    sendToServer(ixer.dumpMapDiffs(), true);
  }

  var server = {connected: false, queue: [], initialized: false, lastSent: []};
  function connectToServer() {
    var queue = server.queue;
    var ws = new WebSocket('ws://localhost:2794', []);
    server.ws = ws;

    ws.onerror = function (error) {
      console.log('WebSocket Error ' + error);
      server.dead = true;
      if(!server.initialized) {
        console.warn("Starting in local only mode, the server is dead.");
        initialize();
        dispatcher.render();
      }
    };

    ws.onmessage = function (e) {
      var start = now();
      var data = JSON.parse(e.data);
      var time = now() - start;
      if(time > 5) {
        console.log("slow parse (> 5ms):", time);
      }

      if(!server.initialized) {
        var initialized = data.changes.some(function(diff) {
          return diff[0] === "initialized";
        });
        if(initialized) {

          initialize(true);
        } else {
          initialize();
        }
        server.initialized = true;
      }
      if(window.DEBUG.RECEIVE) {
        var stats = getDataStats(data);
        if(stats.adds || stats.removes) {
          var header = "[client:received][+" + stats.adds + "/-" + stats.removes + "]";
          console.group(pad(header, formatTime()));
          if(stats.malformedDiffs.length) {
            console.warn("The following views have malformed diffs:", stats.malformedDiffs);
          }
          writeDataToConsole(data, window.DEBUG.RECEIVE);
          console.groupEnd();
        }
      }
      var start = now();
      ixer.handleMapDiffs(data.changes);
      var time = now() - start;
      if(time > 5) {
        console.log("slow handleDiffs (> 5ms):", time);
      }

      if(server.initialized && data.changes.length) {
        var uiDiffs = {};
        var mapDiffs = {};
        for(var ix = 0, len = data.changes.length; ix < len; ix++) {
          var diff = data.changes[ix];
          if(diff[0] === "uiRenderedElement") {
            uiDiffs.element = diff;
          } else if(diff[0] === "uiRenderedAttr") {
            uiDiffs.attr = diff;
          } else if(diff[0] === "uiMap") {
            mapDiffs.element = diff;
          } else if(diff[0] === "uiMapAttr") {
            mapDiffs.attr = diff;
          } else if(diff[0] === "uiMapMarker") {
            mapDiffs.marker = diff;
          } else if(diff[0] === "uiComponentElement") {
            // @FIXME: Hacky. This needs to be called after each size change in dev and production for map controls.
            diff[1].forEach(function(cur) {
              if(cur[4] === "map") {
                var map = ixer.index("uiElementToMap")[cur[1]];
                var mapEl = uiMapEl[map[1]];
                if(mapEl) {
                  google.maps.event.trigger(mapEl, "resize");
                }
              }
            });
          } else if(diff[0] === "view") {
            ixer.handleDiffs(api.diff.computePrimitives());
          }
        }

        if(uiDiffs.element || uiDiffs.attr) {
          uiRenderer.renderDiffs(uiDiffs.element, uiDiffs.attr);
        }
        if(mapDiffs.element || mapDiffs.attr || mapDiffs.marker) {
          uiRenderer.renderMapDiffs(mapDiffs.element, mapDiffs.attr, mapDiffs.marker);
        }

        dispatcher.render();
      }

      // Get the user ID from a cookie
      var name = "userid" + "=";
      var cookie = document.cookie.split(';');
      var userid = "";
      if (cookie[0].indexOf(name) == 0)
        userid=cookie[0].substring(name.length,cookie[0].length);

      // Check if the user ID is found. If not, redirect the user to log in.
      if(userid == "") {
        // TODO Handle a user who isn't logged in.
        console.log("Session has not been authenticated.");
      } else {
        var eveusers = api.ixer.index("eveuser id to username");
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
      for(var i = 0, len = queue.length; i < len; i++) {
        sendToServer(queue[i]);
      }
    }
  }

  function sendToServer(message, formatted) {
    if(!server.connected) {
      console.log("not connected");
      server.queue.push(message);
    } else {
      // console.log("sending", message);
      if(!formatted) {
        message = toMapDiffs(message);
      }
      var payload = {changes: []};
      var specialPayload = {changes: []};

      for(var ix = 0; ix < message.changes.length; ix++) {
        var table = message.changes[ix][0];
        if(api.builtins.compiler[table]) {
          specialPayload.changes.push(message.changes[ix]);
        } else {
          payload.changes.push(message.changes[ix]);
        }
      }

      if(window.DEBUG.SEND) {
        var stats = getDataStats(payload);
        var specialStats = getDataStats(specialPayload);
        if(stats.adds || stats.removes || specialStats.adds || specialStats.removes) {
          var header = "[client:sent][+" + (stats.adds + specialStats.adds) + "/-" + (stats.removes + specialStats.removes) + "]";
          console.group(pad(header, formatTime()));

          if(specialStats.adds || specialStats.removes) {
            var header = "[special][+" + specialStats.adds + "/-" + specialStats.removes + "]";
            console.group(header);
            if(specialStats.malformedDiffs.length) {
              console.warn("The following views have malformed diffs:", specialStats.malformedDiffs);
            }
            writeDataToConsole(specialPayload, window.DEBUG.SEND);
            console.groupEnd();
          }
          if(stats.adds || stats.removes) {
            var header = "[normal][+" + stats.adds + "/-" + stats.removes + "]";
            console.group(header);
            if(stats.malformedDiffs.length) {
              console.warn("The following views have malformed diffs:", stats.malformedDiffs);
            }
            writeDataToConsole(payload, window.DEBUG.SEND);
            console.groupEnd();
          }
          console.groupEnd();
        }
      }

      if(specialPayload.changes.length) {
        server.ws.send(JSON.stringify(specialPayload));
      }
      if(payload.changes.length) {
        server.ws.send(JSON.stringify(payload));
      }
    }
  }

  function toMapDiffs(diffs) {
    var final = {};
    for(var i = 0, len = diffs.length; i < len; i++) {
      var cur = diffs[i];
      var table = cur[0];
      var action = cur[1];
      var fact = cur[2];
      if(!final[table]) {
        final[table] = {inserted: [], removed: []};
      }
      final[table][action].push(fact);
    }

    var neueFields = {};

    for(var fieldIx = 0; final.field && fieldIx < final.field.inserted.length; fieldIx++) {
      // @FIXME: These must be inserted in order to work.
      // @FIXME: Does not account for removed fields, only appended fields.
      var field = final.field.inserted[fieldIx];
      var fieldViewId = field[0];
      var fieldId = field[1];
      if(!neueFields[fieldViewId]) { neueFields[fieldViewId] = (ixer.index("view to fields")[fieldViewId] || []).slice(); }
      neueFields[fieldViewId].push(fieldId);
    }

    var changes = [];
    for (var table in final) {
      var fields = ixer.index("view to fields")[table] || [];
      var fieldIds = fields.map(function(field) {
        return field[1];
      });
      fieldIds = fieldIds.concat(neueFields[table] || []);

      changes.push([table, fieldIds, final[table].inserted, final[table].removed]);
    }
    return {changes: changes};
  }

  connectToServer();

  return {sendToServer: sendToServer};

})(window, api, queryEditor);
