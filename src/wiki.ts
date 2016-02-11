"use strict"

import * as app from "./app";
import * as bootstrap from "./bootstrap";
import * as ui from "./ui";
import {deslugify, location as getLocation} from "./utils";


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

  window.history.replaceState({root: true}, null, window.location.hash);
  let mainPane = app.eve.findOne("ui pane", {pane: "p1"});
  let path = getLocation();
  if(path !== "/") {
    let [_, kind, raw] = path.split("/");
    let content = deslugify(raw);
    let cur = app.dispatch("ui set search", {paneId: mainPane.pane, value: content, popState: true});
    if(!app.eve.findOne("query to id", {query: content})) {
      cur.dispatch("insert query", {query: content});
    }
    cur.commit();
  } else {
    ui.setURL("p1", mainPane.contains);
  }
});
