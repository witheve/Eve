/// <reference path="microReact.ts" />

module app {
	
  //---------------------------------------------------------
  // Renderer
  //---------------------------------------------------------
  
  var perfStats;
  export var renderer;
  function initRenderer() {
    renderer = new microReact.Renderer();
    document.body.appendChild(renderer.content);
    window.addEventListener("resize", render);
    perfStats = document.createElement("div");
    perfStats.id = "perfStats";
    document.body.appendChild(perfStats);
  }

  var performance = window["performance"] || { now: () => (new Date()).getTime() }

  export var renderRoots = {};
  export function render() {
    renderer.queued = true;
    // @FIXME: why does using request animation frame cause events to stack up and the renderer to get behind?
    setTimeout(function() {
      // requestAnimationFrame(function() {
      var start = performance.now();
      let trees = [];
      for(var root in renderRoots) {
        trees.push(renderRoots[root]());
      }
      var total = performance.now() - start;
      if (total > 10) {
        console.log("Slow root: " + total);
      }
      perfStats.textContent = "";
      perfStats.textContent += `root: ${total.toFixed(2) }`;
      var start = performance.now();
      renderer.render(trees);
      var total = performance.now() - start;
      perfStats.textContent += ` | render: ${total.toFixed(2) }`;
      renderer.queued = false;
    }, 16);
  }
  
  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------
  
  let dispatches = {};
  
  export function handle(event, func) {
    if(dispatches[event]) {
      console.error(`Overwriting handler for '${event}'`);
    }
    dispatches[event] = func;
  }

  export function dispatch(event: string, info?: { [key: string]: any }, dispatchInfo?) {
    let result = dispatchInfo || { diffs: [], render: true, store: true };
    result.dispatch = (event, info) => {
        return dispatch(event, info, result);
    };
    result.commit = () => {
      console.log("TODO: do diffs");
      if (result.render) {
        render();
      }
      if (result.store) {
        console.log("TODO: Store diffs");
      }
    }
    let func = dispatches[event];
    if (!func) {
      console.error(`No dispatches for '${event}' with ${JSON.stringify(info)}`);
    } else {
      func(result, info);
    }
    return result
  }
  
  //---------------------------------------------------------
  // State
  //---------------------------------------------------------
  
  export var state = {};
  
  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------
  
  document.addEventListener("DOMContentLoaded", function(event) { 
    initRenderer();
    render();
  });
  
}