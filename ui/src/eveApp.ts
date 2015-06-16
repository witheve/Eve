/*---------------------------------------------------------
- Infrastructure for running an eve app standalone
---------------------------------------------------------*/
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="api.ts" />
module dispatcher {
  var renderer = uiEditorRenderer;
  var ixer = api.ixer;
  document.body.appendChild(renderer.root);
  
  
  
  //---------------------------------------------------------
  // Geo Location
  //---------------------------------------------------------  
  function handlePosition(pos) {
    console.log("handle position: ", pos);
    var coords = pos.coords;
    var diffs = [["location", "inserted", [renderer.session, coords.latitude, coords.longitude, coords.accuracy, pos.timestamp]]];
    var prevInputs = ixer.select("location", {session: renderer.session});
    for(var prev of prevInputs) {
      diffs.push(["location", "removed", [prev.session, prev.latitude, prev.longitude, prev.accuracy, prev.timestamp]]);
    }
    client.sendToServer(diffs, false);
  }
  navigator.geolocation.watchPosition(handlePosition);

  export var render = renderer.render;
  export var isApp = true;
}
