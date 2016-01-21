"use strict"

import * as app from "./app";
import * as bootstrap from "./bootstrap";
import * as ui from "./ui";
import {queryToExecutable} from "./queryParser";


app.renderRoots["wiki"] = ui.root;

// @HACK: we have to use bootstrap in some way to get it to actually be included and
// executed
var ixer = bootstrap.ixer;

function initSearches(eve) {
  for(let pane of eve.find("ui pane")) {
    if(eve.findOne("entity", {entity: pane.contains})) continue;
    app.activeSearches[pane.contains] = queryToExecutable(pane.contains);
  }
}

app.init("wiki", function() {
  document.body.classList.add(localStorage["theme"] || "light");
  app.activeSearches = {};
  initSearches(app.eve);
});
