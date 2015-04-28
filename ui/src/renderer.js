var uiRenderer = (function uiRenderer(document) {
  var root = document.createElement("div");
  root.id = "eve-root";
  var renderedEls = {root: root};

  function eveSortComparator(a, b) {
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
  }

  function insertChildSortedAsc(parent, child) {
    var value = child.eveSortValue;
    var children = parent.childNodes;
    var startIndex = 0;
    var stopIndex = children.length - 1;

    if(children[stopIndex].eveSortValue < value) { return parent.appendChild(child); }
    if(children[startIndex].eveSortValue > value) { return parent.insertBefore(child, children[startIndex]); }

    var middle = Math.floor((stopIndex + startIndex) / 2);
    var cur = children[middle];
    while(cur.eveSortValue !== value && startIndex < stopIndex) {
      if(value < cur.eveSortValue) {
        stopIndex = middle - 1;
      } else if(value > cur.eveSortValue) {
        startIndex = middle + 1;
      }

      middle = Math.floor((stopIndex + startIndex) / 2);
      if(cur === children[middle]) { break; }
      cur = children[middle];
    }

    if(cur === child) { return; }
    if(value > cur.eveSortValue) { return parent.insertBefore(child, children[middle + 1]); }
    return parent.insertBefore(child, cur);
  }

  function insertChildSortedDesc(parent, child){
    var value = child.eveSortValue;
    var children = parent.childNodes;
    var startIndex = 0;
    var stopIndex = children.length - 1;

    if(children[stopIndex].eveSortValue > value) { return parent.appendChild(child); }
    if(children[startIndex].eveSortValue < value) { return parent.insertBefore(child, children[startIndex]); }

    var middle = Math.floor((stopIndex + startIndex) / 2);
    var cur = children[middle];

    while(cur.eveSortValue !== value && startIndex < stopIndex && middle > 0){
      if (value > cur.eveSortValue){
        stopIndex = middle - 1;
      } else if (value < cur.eveSortValue){
        startIndex = middle + 1;
      }

      middle = Math.floor((stopIndex + startIndex)/2);
      if(cur === children[middle]) { break; }
      cur = children[middle];
    }

    if(cur === child) { return; }
    if(value < cur.eveSortValue) return parent.insertBefore(child, children[middle + 1]);
    return parent.insertBefore(child, cur);
  }


  // @TODO: Svg, canvas, etc. support.
  function createElement(type) {
    switch(type) {
      case "button":
        return document.createElement("button");
      case "input":
        return document.createElement("input");
      default:
        return document.createElement("div");
    }
  }

  function renderDiffs(elements, attrs) {
    elements = elements || ['', [], []];
    attrs = attrs || ['', [], []];
    var removed = {};

    // Optimistically delete removed elements, caching them transiently in case of update.
    var removedEls = elements[2];
    for(var ix = 0, len = removedEls.length; ix < len; ix++) {
      var id = removedEls[ix][1];
      removed[id] = renderedEls[id];
      renderedEls[id] = null;
      if(removed[id].parentNode) {
        removed[id].parentNode.removeChild(removed[id]);
      }
    }

    // Add inserted elements
    var insertedEls = elements[1];
    for(var ix = 0, len = insertedEls.length; ix < len; ix++) {
      var cur = insertedEls[ix];
      var id = cur[0];
      var type = cur[2];
      var parentId = cur[3] || "root";
      var sortValue = cur[4];
      var el = renderedEls[id] = createElement(type);
      el.eveSortValue = sortValue;
      el.eveId = id;
      el.setAttribute("data-eve-id", id);

      // Test to see if the add is an update of an existing element. If so, copy its contents into place.
      var old = removed[id];
      if(old) {
        delete removed[id];
        if(old.parentNode) {
          old.parentNode.removeChild(old);
        }

        while(old.childNodes.length) {
          el.appendChild(old.childNodes[0]);
        }
      }

      // Apply handlers for newly created elements based on type.
      switch(type) {
        case "button":
          el.addEventListener("click", handleMouseEvent);
          el.addEventListener("dblClick", handleMouseEvent);
          el.addEventListener("hover", handleMouseEvent);
          break;
        case "input":
          el.addEventListener("input", handleKeyboardEvent);
          el.addEventListener("keyDown", handleKeyboardEvent);
      }

      // Insert element into the DOM.

      var parentEl = renderedEls[parentId];
      if(!parentEl) {
        renderedEls[parentId] = parentEl = createElement("box");
      }
      if(parentEl.childNodes.length === 0) {
        parentEl.appendChild(el);
      } else {
        insertChildSortedAsc(parentEl, el, sortValue);
      }
    }

    // Apply new styling and attributes.
    var insertedAttrs = attrs[1];
    for(var ix = 0, len = insertedAttrs.length; ix < len; ix++) {
      var cur = insertedAttrs[ix];
      var attr = cur[2];
      var value = cur[3];
      var el = renderedEls[cur[0]];
      if(!cur) { console.error("Styled element does not exist:", el); continue; }

      switch(attr) {
        case "class":
        case "draggable":
        case "contentEditable":
        case "colspan":
        case "placeholder":
        case "selected":
        case "value":
          if(value === false || value === "false") {
            el.removeAttribute(attr);
          } else {
            el.setAttribute(attr, value);
          }
          break;
        case "left":
        case "top":
        case "height":
        case "width":
        case "zIndex":
        case "backgroundColor":
        case "backgroundImage":
        case "border":
        case "borderRadius":
        case "opacity":
        case "fontSize":
        case "textAlign":
        case "verticalAlign":
        case "color":
        case "fontFamily":
          el.style[attr] = value;
          break;
        case "text":
          console.error("@FIXME: handle text for element:", el, "and text", value);
          break;
        default:
          console.error("Unknown attr:", attr, "with value:", value, "for element:", el);
      }
    }
  }

  function handleMouseEvent(type, evt) {
    var dispatch = global.dispatch;
    var el = evt.target;
    var id = el.eveId;
    dispatch("addUiMouseEvent", {element: id, type: type, x: evt.clientX, y: evt.clientY});
  }

  function handleKeyboardEvent(type, evt) {
    var dispatch = global.dispatch;
    var el = evt.target;
    var id = el.eveId;
    dispatch("addUiKeyboardEvent", {element: id, type: type, value: el.value});
  }

  return {
    __renderedEls: renderedEls,
    eveSortComparator: eveSortComparator,
    insertChildSortedAsc: insertChildSortedAsc,
    insertChildSortedDesc: insertChildSortedDesc,
    renderDiffs: renderDiffs
  };
})(window.document);
