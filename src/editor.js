//*********************************************************
// State
//*********************************************************

// current version
// list of stacks
// the code for each stack
// current open stack / open tables?

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

// if(!stacks || stacks.indexOf("Clock") === -1) {
  stacks = ["Tutorial", "Incrementer", "Net worth", "Department heads", "Graph paths", "TodoMVC", "Turing machine", "Clock", "Editor"];
  setLocal("stacks", stacks);
// }

//*********************************************************
// renderer
//*********************************************************

var renderer = {"editorQueue": [], "programQueue": [], "queued": false}

function drainRenderQueue() {
  var start = now();
  editorStorage["rootParent"] = $("#cards").get(0);
  for(var i = 0, len = renderer["editorQueue"].length; i < len; i++) {
    var diff = renderer["editorQueue"][i];
    uiDiffRenderer(diff, editorStorage);
  }
  renderer["editorQueue"] = [];

  storage["rootParent"] = $(".uiCard").get(0);
  if(storage["rootParent"] && renderer["programQueue"].length > 0) {
    for(var i = 0, len = renderer["programQueue"].length; i < len; i++) {
      var diff = renderer["programQueue"][i];
      uiDiffRenderer(diff, storage);
    }
    var eveRoot = $(storage["builtEls"]["eve-root"]);
    if(!eveRoot.closest(document.documentElement).size()) {
      storage["rootParent"].appendChild(eveRoot.get(0));
    }
    renderer["programQueue"] = [];
  }
  var end = now();
//   console.log("Render loop:", end - start);
  renderer["queued"] = false;
}

function queueRender() {
  if(!renderer["queued"]) {
    renderer["queued"] = true;
    requestAnimationFrame(drainRenderQueue);
  }
}


//*********************************************************
// worker
//*********************************************************

var storage = {};
var workers = {};
var editorStorage = {"queue": [], "working": false};

function onWorkerMessage(event) {
  if(event.data.to === "uiThread") {
    switch(event.data.type) {
      case "log":
        console.log.apply(console, event.data.args);
        break;
      case "renderUI":
        if(event.data.uiContainer === "program") {
          renderer["programQueue"].push(event.data.diff);
        } else {
          renderer["editorQueue"].push(event.data.diff);
        }
        queueRender();
        break;
    }
  } else {
    var worker = workers[event.data.to];
    if(worker) worker.postMessage(event.data);
  }
}

//*********************************************************
// stacks view
//*********************************************************

for(var i in stacks) {
  var cur = $("<div class='stack'>" + stacks[i] + "</div>");
  cur.data("stack", stacks[i]);
  $("#stacksView").append(cur);
}

$("#stacksView").on("click", ".stack", function() {
  openStack($(this).data("stack"));
});

function openStacksView() {
  closeStack();
  $("#stacksView").show();
}

function closeStacksView() {
  $("#stacksView").hide();
}

//*********************************************************
// editor worker
//*********************************************************

workers["editor"] = new Worker("../src/worker.js");
workers["editor"].onmessage = onWorkerMessage;
workers["editor"].postMessage({type: "init", editor: true, name: "EveEditor"});
workers["editor"].postMessage({type: "compile", code: getLocal("Editor-code", examples["Editor"])});

//*********************************************************
// open stack
//*********************************************************

function openStack(stack) {
  closeStacksView();
  $("#stack").show();
  setLocal("activeStack", stack);
  storage = {};
  workers["program"] = new Worker("../src/worker.js");
  workers["program"].onmessage = onWorkerMessage;
  workers["program"].postMessage({type: "init", editor: false, name: stack});
  workers["editor"].postMessage({type: "newProgram", programName: stack});
  editor.setValue(getLocal(stack + "-code", examples[stack]));
  editor.refresh();
  onChange(editor, null);
}

$("#return").on("click", function() {
  openStacksView();
})

function closeStack() {
  setLocal("activeStack", null);
  workers["editor"].postMessage({type: "reset"});
  if(workers["program"]) {
    workers["program"].terminate();
  }
  $("#stack").hide();
}

//*********************************************************
// CodeMirror editor
//*********************************************************


CodeMirror.defineMode("eve", CodeMirrorModeParser);
CodeMirror.defineMIME("text/x-eve", "eve");

var editor = CodeMirror(document.querySelector("#editorContainer"), {
  value: "",
  tabSize: 2,
  matchBrackets: true,
  autoCloseBrackets: true,
  styleActiveLine: true,
  extraKeys: {
    Tab: function(cm) {
      var loc = cm.getCursor();
      var char = cm.getRange({line: loc.line, ch: loc.ch - 1}, loc);
      if(char.match(/[\w]/)) {
        CodeMirror.commands.autocomplete(cm);
      } else {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      }
    }
  },
//   keyMap: "vim",
  mode:  "eve"
});

function onChange(cm, change) {
  var edValue = cm.getValue();
  var stack = getLocal("activeStack");
  setLocal(stack + "-code", edValue);
  //Special case modifying the editor to go ahead and compile/run that into
  //the current editor process
  if(stack === "Editor") {
    workers["editor"].postMessage({type: "compile", code: edValue});
  }
  workers["program"].postMessage({type: "compile", code: edValue});
}

editor.on("change", Cowboy.debounce(200, onChange));

//*********************************************************
// Cards UI
//*********************************************************

//bind open events
$("#cards").on("click", ".table-card", function() {
  $(this).toggleClass("open");
});

//*********************************************************
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
//*********************************************************

//*********************************************************
// UI Diff
//*********************************************************

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

var createUICallback = function(id, event, label, key) {
  return function(e) {
    var items = [];
    var eid = eventId++;
    if(event === "dragover") {
      e.preventDefault();
    } else {
      if(mouseEvents[event]) {
        items.push(["mousePosition", eid, e.clientX, e.clientY]);
      }

      if(keyEvents[event]) {
        items.push(["keyboard", eid, e.keyCode, event]);
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
      items.push(["event", eid, label, key, value]);
      workers["program"].postMessage({type: "event", items: items});
    }
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true,
  "circle": true,
  "line": true,
  "path": true
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

function uiDiffRenderer(diff, storage) {
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
    if(cur[attrs_value] === false || cur[attrs_value] === "false") {
      builtEls[cur[elem_id]].removeAttribute(cur[attrs_attr]);
    } else {
      builtEls[cur[elem_id]].setAttribute(cur[attrs_attr], cur[attrs_value]);
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
    var handler = handlers[cur[elem_id]][cur[events_event]] = createUICallback(cur[elem_id], cur[events_event], cur[events_label], cur[events_key]);
    builtEls[cur[elem_id]].addEventListener(cur[events_event], handler);
  }

  var children = diff["uiChild"].adds;
  var childrenLen = children.length;
  children.sort(function(a,b) {
    if(a[0] !== b[0]) {
      return a[0].localeCompare(b[0]);
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

//*********************************************************
// Go!
//*********************************************************

if(!getLocal("activeStack")) {
  openStacksView();
} else {
  openStack(getLocal("activeStack"));
}
