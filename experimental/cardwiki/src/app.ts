/// <reference path="microReact.ts" />
/// <reference path="../vendor/marked.d.ts" />
import * as microReact from "./microReact";
import * as runtime from "./runtime";
import {UIRenderer} from "./uiRenderer";

declare var uuid;

export var syncedTables = ["manual entity", "view", "action", "action source", "action mapping", "action mapping constant", "action mapping sorted", "action mapping limit", "add collection action", "add eav action", "add bit action"];
export var eveLocalStorageKey = "eve";

//---------------------------------------------------------
// Renderer
//---------------------------------------------------------

var perfStats;
var updateStat = 0;
export var renderer;
export var uiRenderer;
function initRenderer() {
  renderer = new microReact.Renderer();
  uiRenderer = new UIRenderer(eve);
  document.body.appendChild(renderer.content);
  window.addEventListener("resize", render);
  perfStats = document.createElement("div");
  perfStats.id = "perfStats";
  document.body.appendChild(perfStats);
}

var performance = window["performance"] || { now: () => (new Date()).getTime() }

export var renderRoots = {};
export function render() {
  if(!renderer) return;
  renderer.queued = true;
  // @FIXME: why does using request animation frame cause events to stack up and the renderer to get behind?
  setTimeout(function() {
    // requestAnimationFrame(function() {
    let stats:any = {};
    let start = performance.now();

    let trees = [];
    for (var root in renderRoots) {
      trees.push(renderRoots[root]());
    }

    stats.root = (performance.now() - start).toFixed(2);
    if (+stats.root > 10) console.log("Slow root: " + stats.root);

    start = performance.now();
    let dynamicUI = eve.find("system ui").map((ui) => ui["template"]);
    if(window["DEBUG"] && window["DEBUG"].UI_COMPILE) {
      console.log("compiling", dynamicUI);
      console.log("*", uiRenderer.compile(dynamicUI));
    }
    trees.push.apply(trees, uiRenderer.compile(dynamicUI));
    stats.uiCompile = (performance.now() - start).toFixed(2);
    if (+stats.uiCompile > 10) console.log("Slow ui compile: " + stats.uiCompile);

    start = performance.now();
    renderer.render(trees);
    stats.render = (performance.now() - start).toFixed(2);
    stats.update = updateStat.toFixed(2);

    perfStats.textContent = "";
    perfStats.textContent += `root: ${stats.root}`;
    perfStats.textContent += ` | ui compile: ${stats.uiCompile}`;
    perfStats.textContent += ` | render: ${stats.render}`;
    perfStats.textContent += ` | update: ${stats.update}`;

    renderer.queued = false;

    let changeset = eve.diff();
    changeset.remove("builtin entity", {entity: "render performance statistics"});
    changeset.add("builtin entity", {entity: "render performance statistics", content: `
    # Render performance statistics
    root: {root: ${stats.root}}
    ui compile: {ui compile: ${stats.uiCompile}}
    render: {render: ${stats.render}}
    update: {update: ${stats.update}}
    Horrible hack, disregard this: {perf stats: render performance statistics}
    `});
    eve.applyDiff(changeset);

  }, 16);
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

export function dispatch(event: string, info?: { [key: string]: any }, dispatchInfo?) {
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
    eve.applyDiff(result);
    if (result.meta.render) {
      render();
    }
    if (result.meta.store) {
      let serialized = eve.serialize(true);
      if (eveLocalStorageKey === "eve") {
        for (let synced of syncedTables) {
          delete serialized[synced];
        }
        sendChangeSet(result);
      }
      localStorage[eveLocalStorageKey] = JSON.stringify(serialized);
    }
    updateStat = performance.now() - start;
  }
  let func = dispatches[event];
  if (!func) {
    console.error(`No dispatches for '${event}' with ${JSON.stringify(info) }`);
  } else {
    func(result, info);
  }
  return result
}

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

var me = localStorage["me"] || uuid();
localStorage["me"] = me;

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
      eve.load(parsed.data);
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

document.addEventListener("DOMContentLoaded", function(event) {
  initRenderer();
  connectToServer();
  render();
});
