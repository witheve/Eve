/*---------------------------------------------------------
- Infrastructure for running an eve app standalone
---------------------------------------------------------*/
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="api.ts" />
/// <reference path="client.ts" />
module eveApp {
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

    var coords = pos.coords;
    var diffs = [];

    // Get the reverse geolocation
    var xmlhttp = new XMLHttpRequest();
    var url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + coords.latitude +"," + coords.longitude + "&key=AIzaSyAvM1xyws3JDenRLdZkPjGjCrF1mlf2tGA"; // registered w/ Corey

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var response = xhr.responseText;
            var address = JSON.parse(response);
            var city = address.results[0].address_components[3].long_name;

            diffs.push(api.insert("location", {
              session: renderer.session,
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
              timestamp: pos.timestamp,
              city: city
            }));
            diffs.push(api.remove("location", {session: renderer.session}));
            client.sendToServer(api.toDiffs(diffs), false);
        }
    }
    xhr.open('GET',url, true);
    xhr.send(null);
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
  window["dispatcher"] = eveApp;
}
