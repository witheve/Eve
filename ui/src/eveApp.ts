/*---------------------------------------------------------
- Infrastructure for running an eve app standalone
---------------------------------------------------------*/
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="api.ts" />
/// <reference path="client.ts" />
module dispatcher {
  var renderer = uiEditorRenderer;
  var ixer = api.ixer;
  document.body.appendChild(renderer.root);
  
  //---------------------------------------------------------
  // Session url
  //---------------------------------------------------------
  
  function reportCurrentUrl() {
    var loc = window.location;
    var diffs = [["session url", "inserted", [renderer.session, renderer.nextEventId(), loc.href, loc.origin, loc.pathname, loc.hash]]];
    var prevUrls = ixer.select("session url", {session: renderer.session});
    for(var prev of prevUrls) {
      diffs.push(["session url", "removed", [prev.session, prev.eventId, prev.href, prev.origin, prev.path, prev.hash]]);
    }
    client.sendToServer(diffs, false);
  }
  
  //---------------------------------------------------------
  // Geo Location
  //---------------------------------------------------------
    
  function handlePosition(pos) {
    console.log("handle position: ", pos);
    var coords = pos.coords;
    var diffs = [["location", "inserted", [renderer.session, coords.latitude, coords.longitude, coords.accuracy, pos.timestamp]]];
    var prevLocations = ixer.select("location", {session: renderer.session});
    for(var prev of prevLocations) {
      diffs.push(["location", "removed", [prev.session, prev.latitude, prev.longitude, prev.accuracy, prev.timestamp]]);
    }
    client.sendToServer(diffs, false);
  }
  
  //---------------------------------------------------------
  // Set up init
  //---------------------------------------------------------
  
  client.afterInit(() => {
    reportCurrentUrl();  
    navigator.geolocation.watchPosition(handlePosition);
  });

  export var render = renderer.render;
  export var isApp = true;
}
