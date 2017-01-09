//-------------------------------------------------------------------
// Web worker initialization
//-------------------------------------------------------------------

// We need to import uuid and commonmark before systemJS since the config tries
// to read their global objects
importScripts("/build/src/uuid.js", "/build/src/commonmark.js", "/build/src/system.js", "/build/src/systemJSConfig.js");

// while we're loading stuff in using systemJS we need to queue any messages
// we may get from the browser
let queue = [];

// We set an initial onmessage here that just adds messages to the queue,
// we'll override this with a real on message once the webworker code is loaded
onmessage = function(event) {
  queue.push(event);
}

SystemJS.import("runtime/webworker").then(function(worker) {
  onmessage = worker.onmessage;
  for(let queued of queue) {
    onmessage(queued);
  }
});

