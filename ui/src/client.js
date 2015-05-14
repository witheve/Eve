var client = (function eveClient(ixer, dispatcher) {
  function now() {
    if(window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
  }

  function initialize() {
    console.log("initing");
    dispatcher.initIndexer();
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

      if(!server.initialized && data.changes.length === 54) { // @FIXME: Why is this the check?
        initialize();
      } else if(!server.initialized) {
        server.initialized = true;
      }
      console.log("received", data);
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
          }
        }

        if(uiDiffs.element || uiDiffs.attr) {
          uiRenderer.renderDiffs(uiDiffs.element, uiDiffs.attr);
        }
        if(mapDiffs.element || mapDiffs.attr || mapDiffs.marker) {
          uiRenderer.renderMapDiffs(mapDiffs.element, mapDiffs.attr, mapDiffs.marker);
        }

        console.log('rendering');
        dispatcher.render();
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
      console.log("sending", message);
      if(!formatted) {
        console.log("unformatted");
        message = toMapDiffs(message);
      }
      var payload = {changes: []};
      var specialPayload = {changes: []};

      for(var ix = 0; ix < message.changes.length; ix++) {
        var table = message.changes[ix][0];
        if(table === "view" || table === "field") {
          specialPayload.changes.push(message.changes[ix]);
        } else {
          payload.changes.push(message.changes[ix]);
        }
      }

      console.log("special --- ", "\n", JSON.stringify(specialPayload, null, 2));
      //console.log("payload --- ", "\n", JSON.stringify(payload, null, 2));

      if(specialPayload.changes.length) {
        server.ws.send(JSON.stringify(specialPayload));
      }
      if(payload.changes.length) {
        setTimeout(function() {
          server.ws.send(JSON.stringify(payload));
        }, 500);
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
    for(var fieldIx = 0; fieldIx < final.field.inserted.length; fieldIx++) {
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
      fieldIds = fields.concat(neueFields[table] || []);

      changes.push([table, fieldIds, final[table].inserted, final[table].removed]);
    }
    return {changes: changes};
  }

  connectToServer();

  return {sendToServer: sendToServer};

})(queryEditor.ixer, queryEditor);
