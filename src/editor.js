//---------------------------------------------------------
// State
//---------------------------------------------------------

function getLocal(k, otherwise) {
  if(localStorage[k]) {
    return JSON.parse(localStorage[k])
  }
  return otherwise;
}

function setLocal(k, v) {
  localStorage[k] = JSON.stringify(v);
}

var prevVersion = getLocal("prevVersion");
var stacks = getLocal("stacks");
var exampleStacks = Object.keys(examples);
var testStacks = Object.keys(tests);


//stacks = ["Tutorial", "Incrementer", "Net worth", "Department heads", "Graph paths", "TodoMVC", "Turing machine", "Clock", "Chat", "Game", "My Stack", "Editor", "Runtime", "Editor injection"];
stacks = (stacks || []).concat(exampleStacks);
stacks.sort();
var uniqueStacks = [];
var prev;
for(var stackIx = 0; stackIx < stacks.length; stackIx++) {
  var stack = stacks[stackIx];
  if(stack !== prev) {
    prev = stack;
    uniqueStacks.push(stack);
  }
}
stacks = uniqueStacks;
setLocal("stacks", stacks);
// setLocal("Editor-code", examples["Editor"]);
console.log(tests, stacks);

var client = getLocal("client", uuid());
setLocal("client", client);

//---------------------------------------------------------
// renderer
//---------------------------------------------------------

var renderer = {"programQueue": [], "queued": false}

function drainRenderQueue() {
  var start = now();
  storage["rootParent"] = $(".uiCard").get(0);
  if(storage["rootParent"] && renderer["programQueue"].length > 0) {
    for(var i = 0, len = renderer["programQueue"].length; i < len; i++) {
      var queued = renderer["programQueue"][i];
      var program = queued[0];
      var diff = queued[1];
      uiDiffRenderer(diff, storage, program);
    }
    var eveRoot = $(storage["builtEls"]["eve-root"]);
    if(!eveRoot.closest(document.documentElement).size()) {
      storage["rootParent"].appendChild(eveRoot.get(0));
    }
    renderer["programQueue"] = [];
  }
  var end = now();
  if(end - start > 10) {
    console.error("Long render: " + (end - start));
  }
//   console.log("Render loop:", end - start);
  renderer["queued"] = false;
}

function queueRender() {
  if(!renderer["queued"]) {
    renderer["queued"] = true;
    requestAnimationFrame(drainRenderQueue);
  }
}


//---------------------------------------------------------
// worker
//---------------------------------------------------------

var storage = {};
var workers = {};

function onWorkerMessage(event) {
  switch(event.data.type) {
    case "log":
      console.log.apply(console, event.data.args);
      break;
    case "renderUI":
      renderer["programQueue"].push([event.data.from, event.data.diff]);
      queueRender();
      break;
  }
}

function createWorker() {
  var worker = new Worker("../src/worker.js");
  worker.onmessage = onWorkerMessage;
  return worker;
}

//---------------------------------------------------------
// UI diff element
// setAttribute
// removeAttribute
// appendChild
// removeChild
// insertBefore
// removeEventListener
// addEventListener
// .parentNode
// .style
//---------------------------------------------------------

//---------------------------------------------------------
// UI Diff
//---------------------------------------------------------

var eventId = 1;
var mouseEvents = {"drop": true,
                   "drag": true,
                   "mouseover": true,
                   "dragover": true,
                   "dragstart": true,
                   "dragend": true,
                   "mousedown": true,
                   "mouseup": true,
                   "click": true,
                   "dblclick": true,
                   "contextmenu": true};

var keyEvents = {"keydown": true, "keyup": true, "keypress": true};

var createUICallback = function(id, event, label, key, program) {
  return function(e) {
    var items = [];
    var eid = eventId++;
    if(event === "dragover") {
      e.preventDefault();
    } else {
      if(mouseEvents[event]) {
        items.push(["mousePosition", client, eid, e.clientX, e.clientY]);
      }

      if(keyEvents[event]) {
        items.push(["keyboard", client, eid, e.keyCode, event]);
      }

      var value = e.target.value;
      if(event === "dragstart") {
        console.log("start: ", JSON.stringify(eid));
        e.dataTransfer.setData("eid", JSON.stringify(eid));
        value = eid;
      }
      if(event === "drop" || event === "drag" || event === "dragover" || event === "dragend") {
        console.log("drop", e.dataTransfer.getData("eid"));
        try {
          value = JSON.parse(e.dataTransfer.getData("eid"));
        } catch(e) {
          value = "";
        }
      }
      e.stopPropagation();
      value = (value === undefined) ? "" : value;
      items.push(["rawEvent", client, eid, label, key, value]);
      items.push(["eventTime", client, eid, Date.now()]);
      workers[program].postMessage({type: "event", items: items});
    }
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true,
  "circle": true,
  "line": true,
  "polygon": true
};

function appendSortElement(parent, child){

  var value = child.eveSortValue;
  var children = parent.childNodes;
  var startIndex = 0;
  var stopIndex = children.length - 1;

  //shortcut the common case of just appending to the end
  if(children[stopIndex].eveSortValue < value) return parent.appendChild(child);
  //shortcut the common case of just prepending to the beginning
  if(children[startIndex].eveSortValue > value) return parent.insertBefore(child, children[startIndex]);

  var middle = Math.floor((stopIndex + startIndex) / 2);
  var cur = children[middle];

  while(cur.eveSortValue !== value && startIndex < stopIndex){

    if (value < cur.eveSortValue){
      stopIndex = middle - 1;
    } else if (value > cur.eveSortValue){
      startIndex = middle + 1;
    }

    middle = Math.floor((stopIndex + startIndex)/2);
    if(cur === children[middle]) break;
    cur = children[middle];
  }

  if(cur === child) return;
  if(value > cur.eveSortValue) return parent.insertBefore(child, children[middle + 1]);
  if(value < cur.eveSortValue) return parent.insertBefore(child, cur);
  return parent.insertBefore(child, cur);
}

function uiDiffRenderer(diff, storage, program) {
  var elem_id = 0;
  var elem_type = 1;

  var text_text = 1;

  var attrs_attr = 1;
  var attrs_value = 2;

  var styles_attr = 1;
  var styles_value = 2;

  var events_event = 1;
  var events_label = 2;
  var events_key = 3;

  var child_pos = 1;
  var child_childid = 2;

  var builtEls = storage["builtEls"] || {"eve-root": document.createElement("div")};
  var handlers = storage["handlers"] || {};
  var roots = {};
  var removed = {};

  //add subProgram elements
  //capture the elements we will remove
  var remElem = diff["uiElem"].removes;
  var remElemsLen = remElem.length;
  for(var i = 0; i < remElemsLen; i++) {
    var cur = remElem[i];
    var me = builtEls[cur[elem_id]];
    removed[cur[elem_id]] = me;
  }

  //add elements
  var elem = diff["uiElem"].adds;
  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    if(!svgs[cur[elem_type]]) {
      var tag = cur[elem_type] || "span";
      var me = builtEls[cur[elem_id]] = document.createElement(tag);
    } else {
      var me = builtEls[cur[elem_id]] = document.createElementNS("http://www.w3.org/2000/svg", cur[elem_type]);
    }

    var old = removed[cur[elem_id]];
    if(old)  {
      if(old && old.parentNode && old.parentNode.parentNode) {
        old.parentNode.insertBefore(me, old);
        old.parentNode.removeChild(old);
      }
      while(old.childNodes.length) {
        me.appendChild(old.childNodes[0]);
      }

      //TODO: transfer attrs
      //TODO: transfer handlers
//       handlers[cur[elem_id]] = null;
      removed[cur[elem_id]] = null;
    }
  }

  //remove all elements that weren't just added
  for(var toRemove in removed) {
    var cur = removed[toRemove];
    if(!cur) continue;

    if(cur && cur.parentNode && cur.parentNode.parentNode) {
      cur.parentNode.removeChild(cur);
    }
    handlers[toRemove] = null;
    builtEls[toRemove] = null;
    removed[toRemove] = null;
  }

  //add text
  var text = diff["uiText"].adds;
  var textLen = text.length;
  var addedText = {};
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    if(!builtEls[cur[elem_id]]) {
      builtEls[cur[elem_id]] = document.createTextNode(cur[text_text]);
    } else {
      builtEls[cur[elem_id]].nodeValue = cur[text_text];
    }
    addedText[cur[elem_id]] = true;
  }

  //remove text
  var text = diff["uiText"].removes;
  var textLen = text.length;
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    var me = builtEls[cur[elem_id]];
    if(me && !addedText[cur[elem_id]]) {
      me.nodeValue = "";
      builtEls[cur[elem_id]] = null;
    }
  }

  var attrs = diff["uiAttr"].adds;
  var attrsLen = attrs.length;
  for(var i = 0; i < attrsLen; i++) {
    var cur = attrs[i];
    var el = builtEls[cur[elem_id]];
    if(!el) continue;

    if(cur[attrs_value] === false || cur[attrs_value] === "false") {
      el.removeAttribute(cur[attrs_attr]);
    } else {
      try {
        if(cur[attrs_attr] === "value") {
          if(cur[attrs_value] !== el.value) el.value = cur[attrs_value];
        } else if (cur[attrs_attr] === "autofocus") {
            el.focus();
        } else {
          el.setAttribute(cur[attrs_attr], cur[attrs_value]);
        }
      } catch(e) {
        console.error("invalid attribute: ", cur[attrs_attr], cur[attrs_value]);
      }
    }
  }

  var styles = diff["uiStyle"].adds;
  var stylesLen = styles.length;
  for(var i = 0; i < stylesLen; i++) {
    var cur = styles[i];
    builtEls[cur[elem_id]].style[cur[styles_attr]] = cur[styles_value];
  }

  //Remove events
  var events = diff["uiEvent"].removes;
  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    if(builtEls[cur[elem_id]] && handlers[cur[elem_id]] && handlers[cur[elem_id]][cur[events_event]]) {
      var handler = handlers[cur[elem_id]][cur[events_event]];
      builtEls[cur[elem_id]].removeEventListener(cur[events_event], handler);
      handlers[cur[elem_id]][cur[events_event]] = null;
    }
  }

  var events = diff["uiEvent"].adds;
  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    if(!handlers[cur[elem_id]]) {
      handlers[cur[elem_id]] = {};
    }
    var handler = handlers[cur[elem_id]][cur[events_event]] = createUICallback(cur[elem_id], cur[events_event], cur[events_label], cur[events_key], program);
    builtEls[cur[elem_id]].addEventListener(cur[events_event], handler);
  }

  var children = diff["uiChild"].adds;
  var childrenLen = children.length;
  children.sort(function(a,b) {
    if(a[0] !== b[0]) {
      var ta = typeof(a[0]);
      var tb = typeof(b[0])
      if(ta === tb && ta === "string") {
        return a[0].localeCompare(b[0]);
      } if(ta === "string" || tb === "string") {
        return (a[0] + "").localeCompare((b[0] + ""));
      } else {
        return a[0] - b[0];
      }
    } else {
      if(typeof a[1] === "string" || typeof b[1] === "string") {
        return (a[1] + "").localeCompare((b[1] + ""));
      } else {
        return a[1] - b[1];
      }
    }
  });
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    var parent = builtEls[cur[elem_id]];
    if(parent && child) {
      child.eveSortValue = cur[child_pos];
      if(parent.childNodes.length === 0) {
        parent.appendChild(child);
      } else {
        appendSortElement(parent, child, child.eveSortValue);
      }
    }
  }

  if(!storage["builtEls"]) {
    storage["builtEls"] = builtEls;
    storage["handlers"] = handlers;
    if(storage["rootParent"]) {
      storage["rootParent"].appendChild(builtEls["eve-root"]);
    }
  }

};

//---------------------------------------------------------
// socket.io
//---------------------------------------------------------

if(window["io"]) {
  var socket = io.connect('/');
  socket.on("message", function (data) {
    onWorkerMessage({data: data});
  });

  var server = {
    postMessage: function(data) {
      socket.emit("message", data);
    },
    terminate: function() {}
  };

  workers["server"] = server;
}

//---------------------------------------------------------
// Go!
//---------------------------------------------------------
