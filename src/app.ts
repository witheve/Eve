/// <reference path="microReact.ts" />
/// <reference path="../vendor/marked.d.ts" />
import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {UIRenderer} from "./uiRenderer";
import {ENV, DEBUG, uuid} from "./utils";


export var syncedTables = ["sourced eav", "view", "action", "action source", "action mapping", "action mapping constant", "action mapping sorted", "action mapping limit"];
export var eveLocalStorageKey = "eve";

//---------------------------------------------------------
// Renderer
//---------------------------------------------------------

var perfStats;
var perfStatsUi;
var updateStat = 0;
export var renderer;
export var uiRenderer;
function initRenderer() {
  renderer = new microReact.Renderer();
  uiRenderer = new UIRenderer(eve);
  document.body.appendChild(renderer.content);
  window.addEventListener("resize", render);
  perfStatsUi = document.createElement("div");
  perfStatsUi.id = "perfStats";
  document.body.appendChild(perfStatsUi);
}

if(ENV === "browser") var performance = window["performance"] || { now: () => (new Date()).getTime() }

export var renderRoots = {};
export function render() {
  if(!renderer || renderer.queued) return;
  renderer.queued = true;
  requestAnimationFrame(function() {
    let stats:any = {};
    let start = performance.now();

    let trees = [];
    for (var root in renderRoots) {
      trees.push(renderRoots[root]());
    }

    stats.root = (performance.now() - start).toFixed(2);
    if (+stats.root > 10) console.info("Slow root: " + stats.root);

    start = performance.now();
    let dynamicUI = eve.find("system ui").map((ui) => ui["template"]);
    if(DEBUG && DEBUG.UI_COMPILE) {
      console.info("compiling", dynamicUI);
      console.info("*", uiRenderer.compile(dynamicUI));
    }
    trees.push.apply(trees, uiRenderer.compile(dynamicUI));
    stats.uiCompile = (performance.now() - start).toFixed(2);
    if (+stats.uiCompile > 10) console.info("Slow ui compile: " + stats.uiCompile);

    start = performance.now();
    renderer.render(trees);
    stats.render = (performance.now() - start).toFixed(2);
    stats.update = updateStat.toFixed(2);

    perfStatsUi.textContent = "";
    perfStatsUi.textContent += `root: ${stats.root}`;
    perfStatsUi.textContent += ` | ui compile: ${stats.uiCompile}`;
    perfStatsUi.textContent += ` | render: ${stats.render}`;
    perfStatsUi.textContent += ` | update: ${stats.update}`;
    perfStats = stats;

    renderer.queued = false;
  });
}

var storeQueued = false;
function storeLocally() {
  if(storeQueued) return;
  storeQueued = true;
  setTimeout(() => {
    let serialized = eve.serialize(true);
    if (eveLocalStorageKey === "eve") {
      for (let synced of syncedTables) {
        delete serialized[synced];
      }
    }
    delete serialized["provenance"];
    localStorage[eveLocalStorageKey] = JSON.stringify(serialized);
    storeQueued = false;
  }, 1000);
}

//---------------------------------------------------------
// Dispatch
//---------------------------------------------------------

let dispatches = {};

export function handle(event, func) {
  if (dispatches[event]) {
    console.error(`Overwriting handler for '${event}'`);
  }
  dispatches[event] = func;
}

export function dispatch(event?: string, info?: { [key: string]: any }, dispatchInfo?) {
  let result = dispatchInfo;
  if (!result) {
    result = eve.diff();
    result.meta.render = true;
    result.meta.store = true;
  }
  result.dispatch = (event, info) => {
    return dispatch(event, info, result);
  };
  result.commit = () => {
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
    if(!runtime.INCREMENTAL) {
      eve.applyDiff(result);
    } else {
      eve.applyDiffIncremental(result);
    }
    if (result.meta.render) {
      render();
    }
    if (result.meta.store) {
      storeLocally();
      if (eveLocalStorageKey === "eve") {
        sendChangeSet(result);
      }
    }
    updateStat = performance.now() - start;
  }
  if(!event) return result;
  let func = dispatches[event];
  if (!func) {
    console.error(`No dispatches for '${event}' with ${JSON.stringify(info) }`);
  } else {
    func(result, info);
  }
  return result;
}

// No-op dispatch to trigger a rerender or start a chain.
handle("rerender", (changes:runtime.Diff) => {
});


//---------------------------------------------------------
// State
//---------------------------------------------------------

export var eve = runtime.indexer();
export var initializers = {};
export var activeSearches = {};

export function init(name, func) {
  initializers[name] = func;
}

function executeInitializers() {
  for (let initName in initializers) {
    initializers[initName]();
  }
}

//---------------------------------------------------------
// Websocket
//---------------------------------------------------------

var me = uuid();
if(this.localStorage) {
  if(localStorage["me"]) me = localStorage["me"];
  else localStorage["me"] = me;
}

export var socket;
function connectToServer() {
  socket = new WebSocket(`ws://${window.location.hostname || "localhost"}:8080`);
  socket.onerror = () => {
    console.error("Failed to connect to server, falling back to local storage");
    eveLocalStorageKey = "local-eve";
    executeInitializers();
    render();
  }
  socket.onopen = () => {
    sendServer("connect", me);
  }
  socket.onmessage = (data) => {
    let parsed = JSON.parse(data.data);
    console.log("WS MESSAGE:", parsed);

    if (parsed.kind === "load") {
      // eve.load(parsed.data);
      executeInitializers();
      render();
    } else if (parsed.kind === "changeset") {
      let diff = eve.diff();
      diff.tables = parsed.data;
      eve.applyDiff(diff);
      render();
    }
  };
}

function sendServer(messageKind, data) {
  if (!socket) return;
  socket.send(JSON.stringify({ kind: messageKind, me, time: (new Date).getTime(), data }));
}

function sendChangeSet(changeset) {
  if (!socket) return;
  let changes = {};
  let send = false;
  for (let table of syncedTables) {
    if (changeset.tables[table]) {
      send = true;
      changes[table] = changeset.tables[table];
    }
  }
  if (send) sendServer("changeset", changes);
}

//---------------------------------------------------------
// Go
//---------------------------------------------------------
if(ENV === "browser") {
  document.addEventListener("DOMContentLoaded", function(event) {
    initRenderer();
    // connectToServer();
    eveLocalStorageKey = "local-eve";
    executeInitializers();
    render();
  });
}

init("load data",function() {
  let stored = localStorage[eveLocalStorageKey];
  if(stored) {
    eve.load(stored);
  }
});

declare var exports;
if(ENV === "browser") window["app"] = exports;
