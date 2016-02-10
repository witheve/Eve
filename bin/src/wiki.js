"use strict";
var app = require("./app");
var bootstrap = require("./bootstrap");
var ui = require("./ui");
app.renderRoots["wiki"] = ui.root;
// @HACK: we have to use bootstrap in some way to get it to actually be included and
// executed
var ixer = bootstrap.ixer;
function initSearches(eve) {
    for (var _i = 0, _a = eve.find("ui pane"); _i < _a.length; _i++) {
        var pane = _a[_i];
        if (eve.findOne("entity", { entity: pane.contains }))
            continue;
    }
}
app.init("wiki", function () {
    document.body.classList.add(localStorage["theme"] || "light");
    app.activeSearches = {};
    initSearches(app.eve);
    window.history.replaceState({ root: true }, null, window.location.pathname);
    var mainPane = app.eve.findOne("ui pane", { pane: "p1" });
    var path = window.location.pathname;
    if (path !== "/") {
        var _a = path.split("/"), _ = _a[0], kind = _a[1], content = _a[2];
        content = content.replace(/_/g, " ");
        app.dispatch("ui set search", { paneId: mainPane.pane, value: content, popState: true }).commit();
        ui.setURL("p1", content);
    }
    else {
        ui.setURL("p1", mainPane.contains);
    }
});
//# sourceMappingURL=wiki.js.map