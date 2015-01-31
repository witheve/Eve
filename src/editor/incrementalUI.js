import macros from "../macros.sjs";

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
      programWorker.postMessage({type: "event", items: items});
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

  var builtEls = storage["builtEls"] || {"eve-root": document.createElement("div")};
  var handlers = storage["handlers"] || {};
  var roots = {};
  var removed = {};

  //add subProgram elements
  //capture the elements we will remove
  var uiElemRemoves = diff["uiElem"].removes;
  foreach(remElem of uiElemRemoves) {
    unpack [id] = remElem;
    removed[id] = builtEls[id];
  }

  //add elements
  var uiElemAdds = diff["uiElem"].adds;
  for(addElem of uiElemAdds) {
    unpack [id, type] = addElem;
    if(!svgs[type]) {
      var tag = type || "span";
      var me = builtEls[id] = document.createElement(tag);
    } else {
      var me = builtEls[id] = document.createElementNS("http://www.w3.org/2000/svg", type);
    }

    var old = removed[id];
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
      removed[id] = null;
    }
  }

  //remove all elements that weren't just added
  foreach(toRemove, toRemoveElem of removed) {
    if(!toRemove) continue;

    if(toRemoveElem && toRemoveElem.parentNode && toRemoveElem.parentNode.parentNode) {
      cur.parentNode.removeChild(cur);
    }
    handlers[toRemove] = null;
    builtEls[toRemove] = null;
    removed[toRemove] = null;
  }

  //add text
  var uiTextAdds = diff["uiText"].adds;
  var addedText = {};
  foreach(addText of uiTextAdds) {
    unpack [id, text] = addText;
    if(!builtEls[id]) {
      builtEls[id] = document.createTextNode(text);
    } else {
      builtEls[id].nodeValue = text;
    }
    addedText[id] = true;
  }

  //remove text
  var uiTextRemoves = diff["uiText"].removes;
  foreach(remText of uiTextRemoves) {
    unpack [id] = remText;
    var me = builtEls[id];
    if(me && !addedText[id]) {
      me.nodeValue = "";
      builtEls[id] = null;
    }
  }

  var uiAttrAdds = diff["uiAttr"].adds;
  foreach(addAttr of uiAttrAdds) {
    unpack [id, attr, value] = addAttr;
    var el = builtEls[id];
    if(!el) continue;

    if(attr === false || value === "false") {
      el.removeAttribute(attr);
    } else {
      try {
        if(attr === "value") {
          if(value !== el.value) el.value = value;
        } else if (attr === "autofocus") {
            el.focus();
        } else {
          el.setAttribute(attr, value);
        }
      } catch(e) {
        console.error("invalid attribute: ", addAttr[attrs_attr], addAttr[attrs_value]);
      }
    }
  }

  var uiStyleAdds = diff["uiStyle"].adds;
  foreach(addStyle of uiStyleAdds) {
    builtEls[addStyle[elem_id]].style[addStyle[styles_attr]] = addStyle[styles_value];
  }

  //Remove events
  var uiEventRemoves = diff["uiEvent"].removes;
  foreach(remEvent of uiEventRemoves) {
    unpack [id, event, label, key] = remEvent;
    var element = builtEls[id];
    if(element && handlers[id] && handlers[id][event]) {
      var handler = handlers[id][event];
      element.removeEventListener(event, handler);
      handlers[id][event] = null;
    }
  }

  var uiEventAdds = diff["uiEvent"].adds;
  foreach(addEvent of uiEventAdds) {
    unpack [id, event, label, key] = addEvent;
    if(!handlers[id]) {
      handlers[id] = {};
    }
    var handler = handlers[id][event] = createUICallback(id, event, label, key, program);
    builtEls[id].addEventListener(event, handler);
  }

  var uiChildAdds = diff["uiChild"].adds;
  uiChildAdds.sort(function(a,b) {
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
  foreach(addChild of uiChildAdds) {
    unpack [parentId, pos, childId] = addChild;
    var child = builtEls[childId];
    var parent = builtEls[parentId];
    if(parent && child) {
      child.eveSortValue = pos;
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

global.uiDiffRenderer = uiDiffRenderer;
