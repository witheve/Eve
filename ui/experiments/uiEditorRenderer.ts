/*-------------------------------------------------------
- UI Editor Renderer
- this renderer is a bit of a hack until we can easily
- translate ui editor facts into views that generate
- uiRenderedFactors
-------------------------------------------------------*/
/// <reference path="../src/indexer.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
module uiEditorRenderer {
  declare var google;
  declare var dispatcher;

  var ixer = api.ixer;
  var code = api.code;

  var ids = {
    "active page": "6b54229a-f5bc-476d-935e-4bb37d2b3ad0",
    session: "2603d682-1db4-45d7-b597-9a501d2769ed",
    page: "63241b6f-d779-4973-b8f2-7f30512a300b"
  };
  // @FIXME: This should be a builtin.
  ixer.addIndex("active page", ids["active page"], Indexing.create.lookup([ids.session, ids.page]));

  export var session = "me";

  export function setSessionId(id) {
    session = id;
  }

  var mapCache = {
    map: {},
    container: {},
    marker: {}
  };

  export function refreshMaps() {
    for(var mapId in mapCache.map) {
      var map = mapCache.map[mapId];
      google.maps.event.trigger(map, "resize");
      var lat = (ixer.selectOne("uiMapAttr", {map: mapId, property: "lat"}) || {"uiMapAttr: value": 0})["uiMapAttr: value"];
      var lng = (ixer.selectOne("uiMapAttr", {map: mapId, property: "lng"}) || {"uiMapAttr: value": 0})["uiMapAttr: value"];
      map.setCenter({lat: lat, lng: lng});
    }
  }


  /*-------------------------------------------------------
  - Renderer
  -------------------------------------------------------*/

  var renderer = new microReact.Renderer();
  renderer.content.classList.add("rendered-program");

  renderer.queued = false;
  export function render() {
    if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        renderer.queued = false;
        renderer.render([rendererRoot()]);
      });
    }
  }

  function rendererRoot():microReact.Element {
    let componentId:string;
    if(dispatcher.isApp) {
      //in an app we check the active page
      componentId = <string>ixer.index("active page")[session];
    } else {
      //we're in the editor, so we render based on what the active item is
      componentId = <string>code.activeItemId();
    }
    var parentLayerIndex = ixer.index("parentLayerToLayers");
    var layers = parentLayerIndex[componentId];
    if(!layers) return {};

    var layerItems = layers.map(function(layer) {
      return renderLayer(layer);
    });
    return {id: "root", children: layerItems};
  }

  function rowToKeyFunction(viewId): (any) {
    var fields = api.ixer.getFields(viewId) || [];
    var keys = [];
    fields.forEach(function(fieldId, ix) {
      if(code.hasTag(fieldId, "key")) {
        keys.push(fieldId);
      }
    });
    if(keys.length) {
      return function(row: any) {
        if(keys.length > 1) {
          return keys.map(function(ix) {
            return row[ix];
          }).join(",");
        } else {
          return row[keys[0]];
        }
      };
    } else {
      return JSON.stringify;
    }
  }

  function getBoundRows(binding, key?) {
    var sessionIx;
    var keys = [];
    api.ixer.getFields(binding).forEach((fieldId, ix) => {
      if(code.hasTag(fieldId, "key")) {
          keys.push(fieldId);
      }
      if(code.name(fieldId) === "session") {
        sessionIx = ix;
      }
    });
    var query = {};
    if(sessionIx !== undefined) {
      query["session"] = session;
    }

    // If key is singular we can short circuit this filter for speed improvements at selection time.
    var filterByKey = false;
    if(key !== undefined && keys.length === 1) {
      query[code.name(keys[0])] = key;
    } else if(key !== undefined && keys.length > 1) {
      filterByKey = true;
    }
    var rows = ixer.select(binding, query);
    if(filterByKey) {
      var rowToKey = rowToKeyFunction(binding);
      rows = rows.filter(function(row) {
        return rowToKey(row) === key;
      });
    }
    return rows;
   }

  function renderLayer(layer, key?, rootOffset?) {
    var layerId = layer[1];
    var layerIx = layer[3];
    var elements = ixer.select("uiComponentElement", {layer: layerId});
    var parentLayerIndex = ixer.index("parentLayerToLayers");
    var subLayers = parentLayerIndex[layerId];
    var bindingIndex = ixer.index("groupToBinding");
    var binding = bindingIndex[layerId];
    var offset = elements.length && binding ? elementsToBoundingBox(elements) : {top: 0, left: 0, width: "100%", height: "100%"};
    var boundRows;
    var layerChildren = [];
    var rowToKey = function(x: any) { return; };
    if(binding) {
      boundRows = getBoundRows(binding, key);
      rowToKey = rowToKeyFunction(binding);
    } else {
      boundRows = [[]];
    }
    var offsetForChildren = reverseOffsetBoundingBox(offset, rootOffset);
    boundRows.forEach(function(row) {
      var items = [];
      if(subLayers) {
        subLayers.forEach(function(subLayer) {
          items.push(renderLayer(subLayer, rowToKey(row), offsetForChildren));
        })
      }
      if(elements) {
        elements.forEach(function(element) {
          items.push(renderElement(element, offsetForChildren, row, rowToKey(row)));
        });
      }
      if(binding) {
        layerChildren.push({c: "repeat-container", width: offset.width, height: offset.height, children: items});
      } else {
        layerChildren = items;
      }
    })
    var layerHRepeat = (ixer.selectOne("uiComponentAttribute", {id: layerId, property: "h-repeat"}) || {})["uiComponentAttribute: value"];
    var layerScroll = (ixer.selectOne("uiComponentAttribute", {id: layerId, property: "scroll"}) || {})["uiComponentAttribute: value"];
    var layerMask = (ixer.selectOne("uiComponentAttribute", {id: layerId, property: "mask"}) || {})["uiComponentAttribute: value"];
    var klass = "layer" +
      (layerHRepeat ? " repeat-h" : "") +
      (layerScroll ? " overflow-scroll" : "") +
      (layerMask ? " overflow-hidden" : "");

    return {c: klass, id: layerId + (key ? "::" + key : ""), top: offset.top, left: offset.left, zIndex:layerIx, children: layerChildren};
  }

  function reverseOffsetBoundingBox(box, offset) {
    if(!box || !offset) { return box; }
    let result = {top: box.top + offset.top, left: box.left + offset.left, width: box.width, height: box.height, bottom: box.bottom, right: box.right};
    return result;
  }

  function elementsToBoundingBox(elements) {
    var finalTop = Infinity;
    var finalLeft = Infinity;
    var finalBottom = -Infinity;
    var finalRight = -Infinity;
    elements.forEach(function(element) {
      var left = element["uiComponentElement: left"];
      var top = element["uiComponentElement: top"];
      var right = element["uiComponentElement: right"];
      var bottom = element["uiComponentElement: bottom"];
      if(left < finalLeft) {
        finalLeft = left;
      }
      if(top < finalTop) {
        finalTop = top;
      }
      if(right > finalRight) {
        finalRight = right;
      }
      if(bottom > finalBottom) {
        finalBottom = bottom;
      }
    });
    return {top: finalTop, left: finalLeft, right: finalRight, bottom: finalBottom,
            width: finalRight - finalLeft, height: finalBottom - finalTop};
  }

  function renderElement(element, offset, row, key:string|void = "") {
    var elementId = element["uiComponentElement: id"];
    var type = element["uiComponentElement: control"];
    var left = element["uiComponentElement: left"];
    var top = element["uiComponentElement: top"];
    var right = element["uiComponentElement: right"];
    var bottom = element["uiComponentElement: bottom"];
    var zIndex = element["uiComponentElement: zindex"];
    var elem: any = {c: "absolute", left: left - offset.left, top: top - offset.top,
                     width: right - left, height: bottom - top, elementId: elementId,
                     zIndex: zIndex, key: key};

    if(type === "input") {
      elem.t = "input";
      elem.type = "text";
    } else if(type === "link") {
      elem.t = "a";
    } else if(type === "map") {
      elem.postRender = function(node, elem) {
        var map = ixer.selectOne("uiMap", {element: elementId});
        var mapId = map["uiMap: map"];
        var mapAttrs = ixer.select("uiMapAttr", {map: mapId}) || [];
        var mapContainer = mapCache.container[mapId];
        var mapInstance = mapCache.map[mapId];
        if(!mapContainer) {
          mapContainer = document.createElement("div");
          document.body.appendChild(mapContainer);
          mapContainer.className = "full-size-wrapper";
          mapCache.container[mapId] = mapContainer;
        }
        mapContainer.style.width = node.style.width || document.body.offsetWidth;
        mapContainer.style.height = node.style.height || document.body.offsetHeight;
        if(!mapInstance) {
          mapInstance = new google.maps.Map(mapContainer);
          mapCache.map[mapId] = mapInstance;
        }
        var lat = (ixer.selectOne("uiMapAttr", {map: mapId, property: "lat"}) || {"uiMapAttr: value": 0})["uiMapAttr: value"];
        var lng = (ixer.selectOne("uiMapAttr", {map: mapId, property: "lng"}) || {"uiMapAttr: value": 0})["uiMapAttr: value"];
        var zoom = (ixer.selectOne("uiMapAttr", {map: mapId, property: "zoom"}) || {"uiMapAttr: value": 8})["uiMapAttr: value"];
        var oldPos = mapInstance.getCenter();
        if(!oldPos || oldPos.lat !== lat || oldPos.lng !== lng) {
          mapInstance.panTo({lat: lat, lng: lng});
        }
        if(mapInstance.getZoom() !== zoom) {
          mapInstance.setZoom(zoom);
        }

        var mapAttrs = ixer.select("uiMapAttr", {map: mapId}) || [];
        var opts = {};
        for(var mapAttr of mapAttrs) {
          if(mapAttr["uiMapAttr: property"] === "lat" || mapAttr["uiMapAttr: property"] === "lng" || mapAttr["uiMapAttr: property"] === "zoom") {
            continue;
          }
          opts[mapAttr["uiMapAttr: property"]] = mapAttr["uiMapAttr: value"];
        }
        mapInstance.setOptions(opts);

        if(!node.rendered) {
          node.appendChild(mapContainer);
        }
        node.rendered = true;
      }
    }

    var attrsIndex = ixer.index("uiStyleToAttrs", true);
    var stylesIndex = ixer.index("uiElementToStyles", true);
    var attrBindingsIndex = ixer.index("elementAttrBindings", true);


    var attrs = [];
    var styles = stylesIndex[elementId] || [];
    for(var ix = 0, len = styles.length; ix < len; ix++) {
      var style = styles[ix];
      attrs.push.apply(attrs, attrsIndex[style["uiStyle: id"]]);
    }

    if(attrs.length) {
      for(var i = 0, attrslen = attrs.length; i < attrslen; i++) {
        var curAttr = attrs[i];
        var name = curAttr["uiComponentAttribute: property"];
        elem[name] = curAttr["uiComponentAttribute: value"];
      }
    }

    var bindings = attrBindingsIndex[elementId];
    if(bindings) {
      bindings.forEach(function(binding) {
        var attr = binding["uiAttrBinding: attr"];
        var value = bindingToValue(binding, row);
        elem[attr] = value;
      })
    }

    if(type === "button") {
      elem.click = handleMouseEvent;
      elem.dblclick = handleMouseEvent;
    } else if(type === "input") {
      elem.input = handleInputEvent;
      elem.keydown = handleKeyDownEvent;
      elem.keyup = handleKeyUpEvent;
      if(elem.text !== undefined) {
        elem.value = elem.text;
        elem.text = undefined;
      }
    } else if(type === "link") {
    } else if(type === "map") {
    } else {
      elem.c += " non-interactive";
    }

    return elem;
  }

  function bindingToValue(binding, row) {
    var fieldId = binding["uiAttrBinding: field"];
    return row[fieldId];
  }

  var eventId = 0;

  export function setEventId(value) {
    eventId = value;
  }

  export function nextEventId() {
    return ++eventId;
  }


  function handleMouseEvent(e, elem) {
    var boundId = elem.key;
    var eventId = nextEventId();
    var diffs = [
      api.insert("client event", {session: session, eventId: eventId, element: elem.elementId, row: boundId, type: e.type}),
      api.insert("mouse position", {session: session, eventId: eventId, x: e.clientX, y: e.clientY}),
      api.remove("mouse position", {session: session})
    ];
    if(e.type === "click") {
      diffs.push(api.insert("click", {"event number": eventId, button: elem.elementId, binding: boundId}));
    }
    client.sendToServer(api.toDiffs(diffs), false); // @GLOBAL to avoid circular dep
  }

  function handleInputEvent(e, elem) {
    var boundId = elem.key;
    var value = e.currentTarget.value;
    var eventId = nextEventId();
    var diffs = [
      api.insert("client event", {session: session, eventId: eventId, element: elem.elementId, row: boundId, type: e.type}),
      api.insert("text input", {session: session, eventId: eventId, element: elem.elementId, binding: boundId, value: value}),
      api.remove("text input", {session: session, element: elem.elementId})
    ];
    client.sendToServer(api.toDiffs(diffs), false);
  }

  var keyLookup = {
    13: "enter",
    38: "up",
    40: "down"
  }
  var currentlyCaptured = {};
  function handleKeyDownEvent(e, elem) {
    var boundId = elem.key;
    var key = keyLookup[e.keyCode];
    var captured = ixer.selectOne("uiKeyCapture", {elementId: elem.elementId, key: key});
    if(captured && !currentlyCaptured[key]) {
      e.preventDefault();
      var eventId = nextEventId();
      var diffs = [
        api.insert("client event", {session: session, eventId: eventId, element: elem.elementId, row: boundId, type: e.type}),
        api.insert("captured key", {session: session, element: elem.elementId, eventId: nextEventId(), key: key, binding: boundId})
      ];
      currentlyCaptured[key] = true;
      client.sendToServer(api.toDiffs(diffs), false);
    }
  }
  function handleKeyUpEvent(e, elem) {
    var boundId = elem.key;
    var key = keyLookup[e.keyCode];
    var captured = ixer.selectOne("uiKeyCapture", {elementId: elem.elementId, key: key});
    if(captured) {
      e.preventDefault();
      var eventId = nextEventId();
      var diffs = [
        api.insert("client event", {session: session, eventId: eventId, element: elem.elementId, row: boundId, type: e.type}),
        api.remove("captured key", {session: session, element: elem.elementId, key: key, binding: boundId})
      ];
      currentlyCaptured[key] = false;
      client.sendToServer(api.toDiffs(diffs), false);
    }
  }

  export var root = renderer.content;
}
