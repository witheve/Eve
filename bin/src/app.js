/// <reference path="microReact.ts" />
/// <reference path="../vendor/marked.d.ts" />
var microReact = require("./microReact");
var runtime = require("./runtime");
var uiRenderer_1 = require("./uiRenderer");
var utils_1 = require("./utils");
exports.syncedTables = ["sourced eav", "view", "action", "action source", "action mapping", "action mapping constant", "action mapping sorted", "action mapping limit"];
exports.eveLocalStorageKey = "eve";
//---------------------------------------------------------
// Renderer
//---------------------------------------------------------
var perfStats;
var perfStatsUi;
var updateStat = 0;
function initRenderer() {
    exports.renderer = new microReact.Renderer();
    exports.uiRenderer = new uiRenderer_1.UIRenderer(exports.eve);
    document.body.appendChild(exports.renderer.content);
    window.addEventListener("resize", render);
    perfStatsUi = document.createElement("div");
    perfStatsUi.id = "perfStats";
    document.body.appendChild(perfStatsUi);
}
if (utils_1.ENV === "browser")
    var performance = window["performance"] || { now: function () { return (new Date()).getTime(); } };
exports.renderRoots = {};
function render() {
    if (!exports.renderer || exports.renderer.queued)
        return;
    exports.renderer.queued = true;
    requestAnimationFrame(function () {
        var stats = {};
        var start = performance.now();
        var trees = [];
        for (var root in exports.renderRoots) {
            trees.push(exports.renderRoots[root]());
        }
        stats.root = (performance.now() - start).toFixed(2);
        if (+stats.root > 10)
            console.info("Slow root: " + stats.root);
        start = performance.now();
        var dynamicUI = exports.eve.find("system ui").map(function (ui) { return ui["template"]; });
        if (utils_1.DEBUG && utils_1.DEBUG.UI_COMPILE) {
            console.info("compiling", dynamicUI);
            console.info("*", exports.uiRenderer.compile(dynamicUI));
        }
        trees.push.apply(trees, exports.uiRenderer.compile(dynamicUI));
        stats.uiCompile = (performance.now() - start).toFixed(2);
        if (+stats.uiCompile > 10)
            console.info("Slow ui compile: " + stats.uiCompile);
        start = performance.now();
        exports.renderer.render(trees);
        stats.render = (performance.now() - start).toFixed(2);
        stats.update = updateStat.toFixed(2);
        perfStatsUi.textContent = "";
        perfStatsUi.textContent += "root: " + stats.root;
        perfStatsUi.textContent += " | ui compile: " + stats.uiCompile;
        perfStatsUi.textContent += " | render: " + stats.render;
        perfStatsUi.textContent += " | update: " + stats.update;
        perfStats = stats;
        exports.renderer.queued = false;
    });
}
exports.render = render;
var storeQueued = false;
function storeLocally() {
    if (storeQueued)
        return;
    storeQueued = true;
    setTimeout(function () {
        var serialized = exports.eve.serialize(true);
        if (exports.eveLocalStorageKey === "eve") {
            for (var _i = 0; _i < exports.syncedTables.length; _i++) {
                var synced = exports.syncedTables[_i];
                delete serialized[synced];
            }
        }
        delete serialized["provenance"];
        localStorage[exports.eveLocalStorageKey] = JSON.stringify(serialized);
        storeQueued = false;
    }, 1000);
}
//---------------------------------------------------------
// Dispatch
//---------------------------------------------------------
var dispatches = {};
function handle(event, func) {
    if (dispatches[event]) {
        console.error("Overwriting handler for '" + event + "'");
    }
    dispatches[event] = func;
}
exports.handle = handle;
function dispatch(event, info, dispatchInfo) {
    var result = dispatchInfo;
    if (!result) {
        result = exports.eve.diff();
        result.meta.render = true;
        result.meta.store = true;
    }
    result.dispatch = function (event, info) {
        return dispatch(event, info, result);
    };
    result.commit = function () {
        var start = performance.now();
        // result.remove("builtin entity", {entity: "render performance statistics"});
        // result.add("builtin entity", {entity: "render performance statistics", content: `
        // # Render performance statistics ({is a: system})
        // root: {root: ${perfStats.root}}
        // ui compile: {ui compile: ${perfStats.uiCompile}}
        // render: {render: ${perfStats.render}}
        // update: {update: ${perfStats.update}}
        // Horrible hack, disregard this: {perf stats: render performance statistics}
        // `});
        if (!runtime.INCREMENTAL) {
            exports.eve.applyDiff(result);
        }
        else {
            exports.eve.applyDiffIncremental(result);
        }
        if (result.meta.render) {
            render();
        }
        if (result.meta.store) {
            storeLocally();
            if (exports.eveLocalStorageKey === "eve") {
                sendChangeSet(result);
            }
        }
        updateStat = performance.now() - start;
    };
    if (!event)
        return result;
    var func = dispatches[event];
    if (!func) {
        console.error("No dispatches for '" + event + "' with " + JSON.stringify(info));
    }
    else {
        func(result, info);
    }
    return result;
}
exports.dispatch = dispatch;
//---------------------------------------------------------
// State
//---------------------------------------------------------
exports.eve = runtime.indexer();
exports.initializers = {};
exports.activeSearches = {};
function init(name, func) {
    exports.initializers[name] = func;
}
exports.init = init;
function executeInitializers() {
    for (var initName in exports.initializers) {
        exports.initializers[initName]();
    }
}
//---------------------------------------------------------
// Websocket
//---------------------------------------------------------
var me = utils_1.uuid();
if (this.localStorage) {
    if (localStorage["me"])
        me = localStorage["me"];
    else
        localStorage["me"] = me;
}
function connectToServer() {
    exports.socket = new WebSocket("ws://" + (window.location.hostname || "localhost") + ":8080");
    exports.socket.onerror = function () {
        console.error("Failed to connect to server, falling back to local storage");
        exports.eveLocalStorageKey = "local-eve";
        executeInitializers();
        render();
    };
    exports.socket.onopen = function () {
        sendServer("connect", me);
    };
    exports.socket.onmessage = function (data) {
        var parsed = JSON.parse(data.data);
        console.log("WS MESSAGE:", parsed);
        if (parsed.kind === "load") {
            // eve.load(parsed.data);
            executeInitializers();
            render();
        }
        else if (parsed.kind === "changeset") {
            var diff = exports.eve.diff();
            diff.tables = parsed.data;
            exports.eve.applyDiff(diff);
            render();
        }
    };
}
function sendServer(messageKind, data) {
    if (!exports.socket)
        return;
    exports.socket.send(JSON.stringify({ kind: messageKind, me: me, time: (new Date).getTime(), data: data }));
}
function sendChangeSet(changeset) {
    if (!exports.socket)
        return;
    var changes = {};
    var send = false;
    for (var _i = 0; _i < exports.syncedTables.length; _i++) {
        var table = exports.syncedTables[_i];
        if (changeset.tables[table]) {
            send = true;
            changes[table] = changeset.tables[table];
        }
    }
    if (send)
        sendServer("changeset", changes);
}
//---------------------------------------------------------
// Go
//---------------------------------------------------------
if (utils_1.ENV === "browser") {
    document.addEventListener("DOMContentLoaded", function (event) {
        initRenderer();
        // connectToServer();
        exports.eveLocalStorageKey = "local-eve";
        executeInitializers();
        render();
    });
}
init("load data", function () {
    var stored = localStorage[exports.eveLocalStorageKey];
    if (stored) {
        exports.eve.load(stored);
    }
});
if (utils_1.ENV === "browser")
    window["app"] = exports;
//# sourceMappingURL=app.js.map