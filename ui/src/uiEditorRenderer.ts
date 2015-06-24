/*-------------------------------------------------------
- UI Editor Renderer
- this renderer is a bit of a hack until we can easily
- translate ui editor facts into views that generate
- uiRenderedFactors
-------------------------------------------------------*/
/// <reference path="indexer.ts" />
/// <reference path="client.ts" />
/// <reference path="microReact.ts" />
/// <reference path="api.ts" />
module uiEditorRenderer {
  declare var google;
  declare var dispatcher;

  var ixer = api.ixer;
  var code = api.code;

  var ids = {"active page": "6b54229a-f5bc-476d-935e-4bb37d2b3ad0"};
  
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
      var lat = (ixer.selectOne("uiMapAttr", {map: map.map, property: "lat"}) || {value: 0}).value;
      var lng = (ixer.selectOne("uiMapAttr", {map: map.map, property: "lng"}) || {value: 0}).value;
      map.setCenter({lat: lat, lng: lng});
    }
  }

  // @FIXME: This should be a builtin.
  ixer.addIndex("active page", ids["active page"], Indexing.create.lookup([1, 2]));

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
        renderer.render(rendererRoot());
      });
    }
  }

  var parentLayerIndex = ixer.index("parentLayerToLayers");

  function rendererRoot() {
    if(dispatcher.isApp) {
      //in an app we check the active page
      var componentId = ixer.index("active page")[session];
    } else {
      //we're in the editor, so we render based on what the active item is
      var componentId = <any>code.activeItemId();
    }
    var layers = parentLayerIndex[componentId];
    if(!layers) return {};

    var layerItems = layers.map(function(layer) {
      return renderLayer(layer);
    });
    return {id: "root", children: layerItems};
  }

  var bindingIndex = ixer.index("groupToBinding");

  function rowToKeyFunction(viewId): (any) {
    var fields = code.sortedViewFields(viewId) || [];
    var keys = [];
    fields.forEach(function(fieldId, ix) {
      if(code.hasTag(fieldId, "key")) {
        keys.push(code.name(fieldId));
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
  
  function getBoundRows(binding) {
    var sessionIx;
    code.sortedViewFields(binding).forEach((field, ix) => {
      if(code.name(field) === "session") {
        sessionIx = ix; 
      } 
    });
    if(sessionIx !== undefined) {
      return ixer.select(binding, {session: session});
    } else {
      return ixer.select(binding, {});  
    }
  }

  function renderLayer(layer) {
    var layerId = layer[1];
    var layerIx = layer[3];
    var elements = ixer.index("uiLayerToElements")[layerId];
    var subLayers = parentLayerIndex[layerId];
    var binding = bindingIndex[layerId];
    var offset = elements && binding ? elementsToBoundingBox(elements) : {top: 0, left: 0, width: "100%", height: "100%"};
    var boundRows;
    var layerChildren = [];
    var rowToKey = function(x: any) { return ""; };
    if(binding) {
      boundRows = getBoundRows(binding);
      rowToKey = rowToKeyFunction(binding);
    } else {
      boundRows = [[]];
    }
    boundRows.forEach(function(row) {
      var items = [];
      if(subLayers) {
        subLayers.forEach(function(subLayer) {
          items.push(renderLayer(subLayer));
        })
      }
      if(elements) {
        elements.forEach(function(element) {
          items.push(renderElement(element, offset, row, rowToKey(row)));
        });
      }
      if(binding) {
        layerChildren.push({c: "repeat-container", width: offset.width, height: offset.height, children: items});
      } else {
        layerChildren = items;
      }
    })
    return {c: "layer", id: layerId, top: offset.top, left: offset.left, zIndex:layerIx, children: layerChildren};
  }

  function elementsToBoundingBox(elements) {
    var finalTop = Infinity;
    var finalLeft = Infinity;
    var finalBottom = -Infinity;
    var finalRight = -Infinity;
    elements.forEach(function(element) {
      var left = element[5];
      var top = element[6];
      var right = element[7];
      var bottom = element[8];
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

  var attrsIndex = ixer.index("uiStyleToAttrs");
  var stylesIndex = ixer.index("uiElementToStyles");
  var attrBindingsIndex = ixer.index("elementAttrBindings");

  function renderElement(element, offset, row, key) {
    var elementId = element[1];
    var type = element[4];
    var left = element[5];
    var top = element[6];
    var right = element[7];
    var bottom = element[8];
    var zIndex = element[9];
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
        var mapAttrs = ixer.select("uiMapAttr", {map: map.map}) || [];
        var mapContainer = mapCache.container[map.map];
        var mapInstance = mapCache.map[map.map];
        if(!mapContainer) {
          mapContainer = document.createElement("div");
          document.body.appendChild(mapContainer);
          mapContainer.className = "full-size-wrapper";
          mapCache.container[map.map] = mapContainer;
        }
        mapContainer.style.width = node.style.width || document.body.offsetWidth;
        mapContainer.style.height = node.style.height || document.body.offsetHeight;
        if(!mapInstance) {
          mapInstance = new google.maps.Map(mapContainer);
          mapCache.map[map.map] = mapInstance;          
        }
        var lat = (ixer.selectOne("uiMapAttr", {map: map.map, property: "lat"}) || {value: 0}).value;
        var lng = (ixer.selectOne("uiMapAttr", {map: map.map, property: "lng"}) || {value: 0}).value;
        var zoom = (ixer.selectOne("uiMapAttr", {map: map.map, property: "zoom"}) || {value: 8}).value;
        var oldPos = mapInstance.getCenter();
        if(!oldPos || oldPos.lat !== lat || oldPos.lng !== lng) {
          mapInstance.panTo({lat: lat, lng: lng});
        }
        if(mapInstance.getZoom() !== zoom) {
          mapInstance.setZoom(zoom);
        }
        
        var mapAttrs = ixer.select("uiMapAttr", {map: map.map}) || [];
        var opts = {};
        for(var mapAttr of mapAttrs) {
          if(mapAttr.property === "lat" || mapAttr.property === "lng" || mapAttr.property === "zoom") { continue; }
          opts[mapAttr.property] = mapAttr.value;
        }
        mapInstance.setOptions(opts);
        
        if(!node.rendered) {
          node.appendChild(mapContainer);
        }
        node.rendered = true;  
      }
    }

    var attrs = [];
    var styles = stylesIndex[elementId] || [];
    for(var ix = 0, len = styles.length; ix < len; ix++) {
      var style = styles[ix];
      attrs.push.apply(attrs, attrsIndex[style[1]]);
    }

    if(attrs.length) {
      for(var i = 0, attrslen = attrs.length; i < attrslen; i++) {
        var curAttr = attrs[i];
        var name = curAttr[2];
        elem[name] = curAttr[3];
      }
    }

    var bindings = attrBindingsIndex[elementId];
    if(bindings) {
      bindings.forEach(function(binding) {
        var attr = binding[1];
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

  var fieldToViewIndex = ixer.index("field to view");

  function bindingToValue(binding, row) {
    var fieldId = binding[2];
    return row[code.name(fieldId)];
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
