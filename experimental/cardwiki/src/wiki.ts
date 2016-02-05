"use strict"

import * as app from "./app";
import * as bootstrap from "./bootstrap";
import * as ui from "./ui";


app.renderRoots["wiki"] = ui.root;

// @HACK: we have to use bootstrap in some way to get it to actually be included and
// executed
var ixer = bootstrap.ixer;

function initSearches(eve) {
  for(let pane of eve.find("ui pane")) {
    if(eve.findOne("entity", {entity: pane.contains})) continue;
  }
}

app.init("wiki", function() {
  document.body.classList.add(localStorage["theme"] || "light");
  app.activeSearches = {};
  initSearches(app.eve);

  let mainPane = app.eve.findOne("ui pane", {pane: "p1"});
  let path = window.location.pathname;
  if(path !== "/") {
    let [_, kind, content] = path.split("/");
    content = content.replace(/_/g, " ");
    app.dispatch("ui set search", {paneId: mainPane.pane, value: content, popState: true}).commit();
    ui.setURL("p1", content, true);
  } else {
    ui.setURL("p1", mainPane.contains, true);
  }
});
