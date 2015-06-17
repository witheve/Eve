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
    //["session url", "inserted", [renderer.session, renderer.nextEventId(), loc.href, loc.origin, loc.pathname, loc.hash]]
    var diffs = [];
    diffs.push(api.insert("session url", {
      session: renderer.session,
      eventId: renderer.nextEventId(),
      href: loc.href,
      origin: loc.origin,
      path: loc.pathname,
      hash: loc.hash
    }));
    diffs.push(api.remove("session url", {session: renderer.session}));
    client.sendToServer(api.toDiffs(diffs), false);
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
