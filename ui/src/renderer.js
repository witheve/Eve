var uiRenderer = (function uiRenderer(document, google) {
  var root = document.createElement("div");
  root.id = "eve-root";
  var storage = {};
  storage.renderCache = {root: root};

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
  function createElement(type, id) {
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
      removed[id] = storage.renderCache[id];
      storage.renderCache[id] = null;
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
      var el = storage.renderCache[id] = createElement(type, id);
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

      var parentEl = storage.renderCache[parentId];
      if(!parentEl) {
        storage.renderCache[parentId] = parentEl = createElement("box");
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
      var el = storage.renderCache[cur[0]];
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

  // Map specific stuff
  storage.mapCache = {
    map: {},
    container: {},
    marker: {}
  };
  function renderMapDiffs(elements, attrs, markers) {
    // @TODO: create elements.
    if(elements) {
      var removes = elements[2];
      for(var ix = 0, len = removes.length; ix < len; ix++) {
        var cur = removes[ix];
        var map = storage.mapCache.map[cur[1]];
        if(!map) { continue; }
        storage.mapCache.map[cur[1]] = null;
      }

      var adds = elements[1];
      for(var ix = 0, len = adds.length; ix < len; ix++) {
        var cur = adds[ix];
        var map = storage.mapCache.map[cur[1]];
        var container = storage.mapCache.container[cur[1]];
        if(!map) {
          storage.mapCache.container[cur[1]] = container = document.createElement("div");
          container.className = "full-size-wrapper";
          storage.mapCache.map[cur[1]] = map = new google.maps.Map(container);
        }

        var parent = storage.renderCache[cur[2]];
        if(!parent) {
          throw new Error("Cannot insert map " + cur[1] + " into non-existent parent " + cur[2]);
        }
        parent.appendChild(container);
      }
    }

    if(attrs) {
      var adds = attrs[1];
      for(var ix = 0, len = adds.length; ix < len; ix++) {
        var id = adds[ix][1];
        var prop = adds[ix][2];
        var value = adds[ix][3]; // @FIXME: Handle bindings
        var mapEl = storage.mapCache.map[id];
        if(mapEl) {
          // @FIXME: We can't rely on the indexer in production. How do we access facts?
          var attr = ixer.index("uiMapAttr")[id] || {};
          if(prop === "lat") {
            mapEl.panTo({lat: +value || 0, lng: +attr.lng || 0});
          } else if(prop === "lng") {
            mapEl.panTo({lat: +attr.lat || 0, lng: +value || 0});
          } else if(prop === "zoom") {
            mapEl.setZoom(+value);
          } else {
            console.error("Unknown map attr:", prop, "=", value);
          }
        }
      }
    }

    if(markers) {
      var removes = markers[2];
      for(var ix = 0, len = removes.length; ix < len; ix++) {
        var cur = removes[ix];
        var marker = storage.mapCache.marker[cur[0]];
        if(!marker) { continue; }
        marker.setMap(null);
        storage.mapCache.marker[cur[0]] = null;
      }

      var adds = markers[1];
      for(var ix = 0, len = adds.length; ix < len; ix++) {
        var cur = adds[ix];
        var mapEl = storage.mapCache.map[cur[1]];
        if(!mapEl) { console.error("Cannot add marker before map is initialized."); continue; }
        var marker = storage.mapCache.marker[cur[0]];
        if(!marker) {
          storage.mapCache.marker[cur[0]] = marker = new google.maps.Marker();
        }
        marker.setOptions({
          position: {lat: +cur[2], lng: +cur[3]},
          map: mapEl,
          title: code.name(cur[0]) || ""
        });
      }
    }
  }

  return {
    __storage: storage,
    eveSortComparator: eveSortComparator,
    insertChildSortedAsc: insertChildSortedAsc,
    insertChildSortedDesc: insertChildSortedDesc,
    renderDiffs: renderDiffs,
    renderMapDiffs: renderMapDiffs
  };
})(window.document, google);
