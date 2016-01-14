"use strict"

import * as app from "./app";
import * as bootstrap from "./bootstrap";
import * as ui from "./ui";

app.init("wiki", function() {
  document.body.classList.add(localStorage["theme"] || "light");
  app.activeSearches = {};
  app.renderRoots["wiki"] = ui.root;
});