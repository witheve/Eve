"use strict"

import * as app from "./app";
import * as bootstrap from "./bootstrap";
import * as ui from "./ui";
import {queryToExecutable} from "./queryParser";


app.renderRoots["wiki"] = ui.root;

function initSearches(eve) {
  for(let search of eve.find("builtin search")) {
    let value = eve.findOne("builtin search query", {id: search.id})["search"];
    app.activeSearches[search.id] = queryToExecutable(value);
  }
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