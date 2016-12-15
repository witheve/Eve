importScripts("/build/src/uuid.js", "/build/src/commonmark.js", "/build/src/system.js", "/build/src/systemJSConfig.js");

let queue = [];

onmessage = function(event) {
  queue.push(event);
}

SystemJS.import("runtime/webworker").then(function(worker) {
  onmessage = worker.onmessage;
  for(let queued of queue) {
    onmessage(queued);
  }
});

