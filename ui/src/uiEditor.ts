/// <reference path="tableEditor.ts" />
/// <reference path="query-editor.ts" />
module uiEditor {
  declare var api;
  declare var jQuery;
  declare var uuid;
  declare var uiEditorRenderer;
  var ixer = api.ixer;
  var code = api.code;
  var localState = api.localState;
  var KEYS = api.KEYS;
  var dispatch = queryEditor.dispatch;
  var renderer = queryEditor.renderer;
  
  function focusOnce(node, elem) {
    if(!elem.__focused) {
      setTimeout(function() { node.focus(); }, 5);
      elem.__focused = true;
    }
  }

  
  //---------------------------------------------------------
  // UI workspace
  //---------------------------------------------------------
  
  export function uiWorkspace(componentId) {
    var elements = ixer.index("uiComponentToElements")[componentId] || [];
    var layers = ixer.index("uiComponentToLayers")[componentId] || [];
    var layerLookup = ixer.index("uiComponentLayer");
    var activeLayerId = localState.uiActiveLayer;
    var activeLayer;
    if (activeLayerId && layerLookup[activeLayerId]) {
      activeLayer = layerLookup[activeLayerId];
    }

    var selectionInfo = getSelectionInfo(componentId, true);
    var canvasLayers = (ixer.index("parentLayerToLayers")[componentId] || []).map(function(layer) {
      return canvasLayer(layer, selectionInfo);
    });

    if (selectionInfo) {
      canvasLayers.push(selection(selectionInfo));
    }
    if (localState.boxSelectStart) {
      var rect = boxSelectRect();
      canvasLayers.push({ c: "box-selection", top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
    var canvas: any = {
      c: "row", children: [
        {
          c: "ui-canvas-scroller", children: [
            { c: "ui-canvas", height: 2000, componentId: componentId, children: canvasLayers, mousedown: startBoxSelection, mouseup: stopBoxSelection, mousemove: adjustBoxSelection },
          ]
        },
        { c: "attributes", children: uiInspectors(componentId, selectionInfo, layers, activeLayer) },
      ]
    };
    if (localState.uiPreview) {
      canvas = canvasPreview();
    }
    return queryEditor.genericWorkspace("query",
      componentId,
      {
        c: "ui-editor",
        children: [
          layersBox(componentId, layers, activeLayer),
          {
            c: "ui-canvas-container", children: [
              uiControls(componentId, activeLayer),
              canvas,
            ]
          },
        ]
      });
  }

  function canvasPreview() {
    return { id: "canvasPreview", c: "ui-canvas preview", postRender: injectCanvasPreview };
  }

  function injectCanvasPreview(div, elem) {
    var previewRoot = uiEditorRenderer.root;
    if (previewRoot.parentNode !== div) {
      div.appendChild(previewRoot);
    }
  }

  function canvasLayer(layer, selectionInfo) {
    var layerId = layer[1];
    var subLayers = (ixer.index("parentLayerToLayers")[layerId] || []).map(function(sub) {
      return canvasLayer(sub, selectionInfo);
    });
    if (selectionInfo && layerId === localState.uiActiveLayer) {
      subLayers.unshift(uiGrid());
    }
    var elements = ixer.index("uiLayerToElements")[layerId] || [];
    var attrsIndex = ixer.index("uiStyleToAttrs");
    var stylesIndex = ixer.index("uiElementToStyles");
    var els = elements.map(function(cur) {
      var id = cur[1];
      var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;

      var attrs = [];
      var styles = stylesIndex[id] || [];
      for (var ix = 0, len = styles.length; ix < len; ix++) {
        var style = styles[ix];
        attrs.push.apply(attrs, attrsIndex[style[1]]);
      }

      return control(cur, attrs, selected, layer);
    });
    return { c: "ui-canvas-layer", id: layer[1], zIndex: layer[3] + 1, children: subLayers.concat(els) };
  }

  function layersBox(componentId, layers, activeLayer) {
    var parentIndex = ixer.index("parentLayerToLayers");
    var rootLayers = parentIndex[componentId] || [];
    rootLayers.sort(function(a, b) {
      return a[3] - b[3];
    });
    var items = rootLayers.map(function(cur) {
      return layerListItem(cur, 0)
    });
    return {
      c: "layers-box", children: [
        {
          c: "controls", children: [
            { c: "add-layer ion-plus", click: addLayer, componentId: componentId },
            { c: "add-layer ion-ios-trash", click: deleteLayer, componentId: componentId },
          ]
        },
        { c: "layers-list", children: items }
      ]
    };
  }


  function addLayer(e, elem) {
    localState.openLayers[localState.uiActiveLayer] = true;
    dispatch("addUiLayer", { componentId: elem.componentId, parentLayer: localState.uiActiveLayer })
  }

  function deleteLayer(e, elem) {
    var layerId = localState.uiActiveLayer;
    var layer = ixer.index("uiComponentLayer")[layerId];
    localState.uiActiveLayer = layer[6];
    localState.uiSelection = false;
    dispatch("deleteLayer", { layer: layer });
  }

  function layerListItem(layer, depth) {
    var layerId = layer[1];
    var isOpen = localState.openLayers[layerId];
    var subItems = [];
    var indent = 15;
    if (isOpen) {
      var binding = ixer.index("groupToBinding")[layerId];
      if (binding) {
        var fieldItems = (code.sortedViewFields(binding) || []).map(function(field) {
          return {
            c: "layer-element group-binding", children: [
              {
                c: "layer-row", draggable: true, dragstart: layerDrag, type: "binding", itemId: field, children: [
                  { c: "icon ion-ios-arrow-thin-right" },
                  { text: code.name(field) }
                ]
              },
            ]
          }
        });
        subItems.push({
          c: "layer-element group-binding", children: [
            {
              c: "layer-row", children: [
                { c: "icon ion-ios-photos" },
                { text: code.name(binding) }
              ]
            },
            { c: "layer-items", children: fieldItems }
          ]
        });
      }

      var subLayers = ixer.index("parentLayerToLayers")[layerId];
      if (subLayers) {
        subLayers.sort(function(a, b) {
          return a[3] - b[3];
        });
        subLayers.forEach(function(cur) {
          subItems.push(layerListItem(cur, depth + 1));
        });
      }
      var elements = ixer.index("uiLayerToElements")[layerId] || [];
      elements.sort(function(a, b) {
        return a[9] - b[9];
      });
      elements.forEach(function(cur) {
        var elemId = cur[1];
        var selectedClass = "";
        if (localState.uiSelection && localState.uiSelection.indexOf(elemId) > -1) {
          selectedClass = " selected";
        }
        subItems.push({
          c: "layer-element depth-" + (depth + 1) + selectedClass, itemId: elemId, dragover: preventDefault, drop: dropOnElementItem, control: cur, click: addToSelection, children: [
            {
              c: "layer-row", itemId: elemId, draggable: true, dragstart: layerDrag, type: "element", children: [
                { c: "icon ion-ios-crop" + (selectedClass ? "-strong" : "") },
                { text: cur[4] }
              ]
            }
          ]
        });
      });
    }
    var icon = isOpen ? "ion-ios-arrow-down" : "ion-ios-arrow-right";
    var activeClass = localState.uiActiveLayer === layerId ? " active" : "";
    var lockedClass = layer[4] ? "ion-locked" : "ion-unlocked";
    var hiddenClass = layer[5] ? "ion-eye-disabled" : "ion-eye";
    return {
      c: "layer-item depth-" + depth + activeClass, layerId: layerId, dragover: preventDefault, drop: layerDrop, click: activateLayer, dblclick: selectAllFromLayer, children: [
        {
          c: "layer-row", draggable: true, itemId: layerId, dragstart: layerDrag, type: "layer", children: [
            { c: "icon " + icon, click: toggleOpenLayer, layerId: layerId },
            tableEditor.input(code.name(layerId), layerId, tableEditor.rename, tableEditor.rename),
            {
              c: "controls", children: [
                { c: hiddenClass, click: toggleHidden, dblclick: stopPropagation, layer: layer },
                { c: lockedClass, click: toggleLocked, dblclick: stopPropagation, layer: layer },
              ]
            }
          ]
        },
        { c: "layer-items", children: subItems }
      ]
    };
  }

  function dropOnElementItem(e, elem) {
    var type = e.dataTransfer.getData("type");
    if (type === "element") {
      e.stopPropagation();
      var elementId = e.dataTransfer.getData("itemId");
      dispatch("changeElementPosition", { elementId: elementId, targetId: elem.itemId });
    } else if (type === "layer") {
      e.stopPropagation();
      var layerId = e.dataTransfer.getData("itemId");
      dispatch("changeLayerPosition", { elementId: elementId, targetId: elem.itemId });
    }
  }

  function toggleOpenLayer(e, elem) {
    localState.openLayers[elem.layerId] = !localState.openLayers[elem.layerId];
    queryEditor.render();
  }

  function layerDrag(e, elem) {
    e.dataTransfer.setData("type", elem.type);
    e.dataTransfer.setData("itemId", elem.itemId);
    e.stopPropagation();
  }

  function layerDrop(e, elem) {
    e.stopPropagation();
    var type = e.dataTransfer.getData("type");
    if (type === "view" || type === "table" || type === "query") {
      //if it's a data item, then we need to setup a binding
      dispatch("bindGroup", { groupId: elem.layerId, itemId: e.dataTransfer.getData("value") });
    } else if (type === "layer") {
      //if it's a layer, we need to reparent it
      var layerId = e.dataTransfer.getData("itemId");
      if (layerId === elem.layerId) return;
      dispatch("changeParentLayer", { parentLayerId: elem.layerId, layerId: layerId });
    } else if (type === "element") {
      //if it's an element, set the layer
      var elementId = e.dataTransfer.getData("itemId");
      dispatch("changeElementLayer", { parentLayerId: elem.layerId, elementId: elementId });
    }
  }

  function activateLayer(e, elem) {
    e.stopPropagation();
    if (localState.uiActiveLayer !== elem.layerId) {
      localState.uiActiveLayer = elem.layerId;
      clearSelection(e, elem);
    }
  }

  function selectAllFromLayer(e, elem) {
    e.stopPropagation();
    var layer = ixer.index("uiComponentLayer")[elem.layerId];
    if (layer[4] || layer[5]) return;
    var elements = ixer.index("uiLayerToElements")[elem.layerId] || [];
    var sel = e.shiftKey ? localState.uiSelection : [];
    elements.forEach(function(cur) {
      sel.push(cur[1]);
    });
    if (sel.length) {
      localState.uiSelection = sel;
    } else {
      localState.uiSelection = false;
    }
    queryEditor.render();
  }

  function toggleHidden(e, elem) {
    e.stopPropagation();
    //@TODO: this needs to recursively hide or unhide sub groups
    var neue = elem.layer.slice();
    neue[5] = !neue[5];
    dispatch("updateUiLayer", { neue: neue, old: elem.layer });
  }

  function toggleLocked(e, elem) {
    e.stopPropagation();
    //@TODO: this needs to recursively lock or unlock sub groups
    var neue = elem.layer.slice();
    neue[4] = !neue[4];
    dispatch("updateUiLayer", { neue: neue, old: elem.layer });
  }


  function boxSelectRect() {
    var start = localState.boxSelectStart;
    var stop = localState.boxSelectStop;
    var topBottom = start[1] < stop[1] ? [start[1], stop[1]] : [stop[1], start[1]];
    var leftRight = start[0] < stop[0] ? [start[0], stop[0]] : [stop[0], start[0]];
    var width = leftRight[1] - leftRight[0];
    var height = topBottom[1] - topBottom[0];
    return { top: topBottom[0], bottom: topBottom[1], left: leftRight[0], right: leftRight[1], width: width, height: height };
  }

  function startBoxSelection(e, elem) {
    var x = e.clientX;
    var y = e.clientY;
    var canvasRect = e.currentTarget.getBoundingClientRect();
    //@HACK: we have to allow blurs and other events to finish before we
    //clear and start adjusting the selection, otherwise they'll try to set
    //attributes for a selection that no longer exists. E.g. when setting the
    //text of an element and then clicking on the canvas to blur.
    setTimeout(function() {
      if (!e.shiftKey) { clearSelection(e, elem); }
      x -= Math.floor(canvasRect.left);
      y -= Math.floor(canvasRect.top);
      localState.boxSelectStart = [x, y];
      localState.boxSelectStop = [x, y];
      queryEditor.render();
    }, 0);
  }

  function adjustBoxSelection(e, elem) {
    if (!localState.boxSelectStart) return;
    var x = e.clientX;
    var y = e.clientY;
    var canvasRect = e.currentTarget.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    localState.boxSelectStop[0] = x;
    localState.boxSelectStop[1] = y;
    queryEditor.render();
  }

  function elementIntersects(elem, rect) {
    var left = elem[5];
    var top = elem[6];
    var right = elem[7];
    var bottom = elem[8];
    return !(rect.left > right
      || rect.right < left
      || rect.top > bottom
      || rect.bottom < top);
  }

  function stopBoxSelection(e, elem) {
    if (!localState.boxSelectStart) return;
    var sel = e.shiftKey ? localState.uiSelection : [];
    var rect = boxSelectRect();
    var componentId = elem.componentId;
    var elems = ixer.index("uiComponentToElements")[componentId];
    var layerLookup = ixer.index("uiComponentLayer");
    if (elems) {
      elems.forEach(function(cur) {
        // @TODO: this allows you to select from layers that are either hidden or locked
        var elemId = cur[1];
        var layer = layerLookup[cur[3]];
        if (layer[4] || layer[5]) return;
        if (elementIntersects(cur, rect)) {
          sel.push(elemId);
        }
      });
    }
    localState.boxSelectStart = null;
    localState.boxSelectStop = null;
    if (sel.length) {
      localState.uiSelection = sel;
    } else {
      localState.uiSelection = false;
    }
    queryEditor.render();
  }

  function canvasRatio(context) {
    var devicePixelRatio = window.devicePixelRatio || 1;
    var backingStoreRatio = context.webkitBackingStorePixelRatio ||
      context.mozBackingStorePixelRatio ||
      context.msBackingStorePixelRatio ||
      context.oBackingStorePixelRatio ||
      context.backingStorePixelRatio || 1;

    return devicePixelRatio / backingStoreRatio;
  }

  function uiGrid() {
    return {
      c: "grid", id: "ui-editor-grid", t: "canvas", top: 0, left: 0,
      postRender: function(canvas) {
        var uiGridCount = 3000;
        if (canvas._rendered) return;

        var bounds = document.querySelector(".ui-canvas").getBoundingClientRect();
        var ctx = canvas.getContext("2d");
        var ratio = canvasRatio(ctx);
        canvas.width = bounds.width * ratio;
        canvas.height = bounds.height * ratio;
        canvas.style.width = bounds.width;
        canvas.style.height = bounds.height;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#999999";
        for (var i = 0; i < uiGridCount; i++) {
          if (i % localState.uiGridSize === 0) {
            ctx.globalAlpha = 0.3;
          } else {
            ctx.globalAlpha = 0.1;
          }
          ctx.beginPath();
          ctx.moveTo(i * localState.uiGridSize, 0);
          ctx.lineTo(i * localState.uiGridSize, bounds.height * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * localState.uiGridSize);
          ctx.lineTo(bounds.width * 2, i * localState.uiGridSize);
          ctx.stroke();
        }
        canvas._rendered = true;
      }
    };
  }

  var resizeHandleSize = 7;
  function resizeHandle(componentId, bounds, y, x) {
    var top, left;
    var halfSize = Math.floor(resizeHandleSize / 2);
    var height = bounds.bottom - bounds.top;
    var width = bounds.right - bounds.left;
    if (x === "left") {
      left = 0 - halfSize - 1;
    } else if (x === "right") {
      left = width - halfSize - 2;
    } else {
      left = (width / 2) - halfSize;
    }

    if (y === "top") {
      top = 0 - halfSize - 1;
    } else if (y === "bottom") {
      top = height - halfSize - 2;
    } else {
      top = (height / 2) - halfSize;
    }
    return {
      c: "resize-handle", y: y, x: x, top: top, left: left, width: resizeHandleSize, height: resizeHandleSize, componentId: componentId,
      draggable: true, drag: resizeSelection, dragend: stopResizeSelection, bounds: bounds, dragstart: startResizeSelection, mousedown: stopPropagation
    };
  }

  function stopPropagation(e) {
    e.stopPropagation();
  }
  function preventDefault(e) {
    e.preventDefault();
  }

  function clearDragImage(e, elem) {
    if (e.dataTransfer) {
      e.dataTransfer.setData("text", "foo");
      e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0, 0);
    }
  }

  function startResizeSelection(e, elem) {
    localState.oldElements = selectionToElements();
    clearDragImage(e, elem);
  }

  function stopResizeSelection(e, elem) {
    var elems = localState.oldElements;
    localState.oldElements = null;
    dispatch("stopChangingSelection", { oldElements: elems })
  }

  function resizeSelection(e, elem) {
    var x = Math.floor(e.clientX || __clientX);
    var y = Math.floor(e.clientY || __clientY);
    if (x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.parentNode.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    var old = elem.bounds;
    var neueBounds = { left: old.left, right: old.right, top: old.top, bottom: old.bottom };
    if (elem.x === "left") {
      neueBounds.left = toGrid(localState.uiGridSize, x);
    } else if (elem.x === "right") {
      neueBounds.right = toGrid(localState.uiGridSize, x);
    }
    if (elem.y === "top") {
      neueBounds.top = toGrid(localState.uiGridSize, y);
    } else if (elem.y === "bottom") {
      neueBounds.bottom = toGrid(localState.uiGridSize, y);
    }
    var neueWidth = neueBounds.right - neueBounds.left;
    var neueHeight = neueBounds.bottom - neueBounds.top;
    if (neueWidth < 10) {
      neueWidth = 10;
      if (elem.x === "left") { neueBounds.left = neueBounds.right - 10; }
      else { neueBounds.right = neueBounds.left + 10; }
    }
    if (neueHeight < 10) {
      neueHeight = 10;
      if (elem.y === "top") { neueBounds.top = neueBounds.bottom - 10; }
      else { neueBounds.bottom = neueBounds.top + 10; }
    }
    var widthRatio = neueWidth / (old.right - old.left);
    var heightRatio = neueHeight / (old.bottom - old.top);

    if (widthRatio !== 1 || heightRatio !== 1) {
      dispatch("resizeSelection", { widthRatio: widthRatio, heightRatio: heightRatio, oldBounds: old, neueBounds: neueBounds, componentId: elem.componentId });
      elem.bounds = neueBounds;
    }
  }

  function selection(selectionInfo) {
    var componentId = selectionInfo.componentId;
    var bounds = selectionInfo.bounds;
    return {
      c: "selection", top: bounds.top, left: bounds.left,
      width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
      children: [
        resizeHandle(componentId, bounds, "top", "left"),
        resizeHandle(componentId, bounds, "top", "center"),
        resizeHandle(componentId, bounds, "top", "right"),
        resizeHandle(componentId, bounds, "middle", "right"),
        resizeHandle(componentId, bounds, "bottom", "right"),
        resizeHandle(componentId, bounds, "bottom", "center"),
        resizeHandle(componentId, bounds, "bottom", "left"),
        resizeHandle(componentId, bounds, "middle", "left"),
        { c: "trash ion-ios-trash", componentId: componentId, mousedown: stopPropagation, click: deleteSelection },
      ]
    };
  }

  function deleteSelection(e, elem) {
    dispatch("deleteSelection", { componentId: elem.componentId });
  }

  function clearSelection(e, elem) {
    localState.uiSelection = null;
    queryEditor.render();
  }

  function control(cur, attrs, selected, layer) {
    var id = cur[1];
    var type = cur[4];
    var selClass = selected ? " selected" : "";
    var hidden = layer[5] ? " hidden" : "";
    var locked = layer[4] ? " locked" : "";
    var klass = type + " ui-element" + selClass + hidden + locked;
    var elem: any = {
      c: klass, id: "elem" + id, left: cur[5], top: cur[6], width: cur[7] - cur[5], height: cur[8] - cur[6],
      control: cur, mousedown: addToSelection, selected: selected, zIndex: layer[3] + (cur[9] || 0),
      draggable: true, dragover: preventDefault, drop: dropOnControl, drag: moveSelection, dragend: stopMoveSelection, dragstart: startMoveSelection, dblclick: setModifyingText
    };
    if (attrs) {
      for (var i = 0, len = attrs.length; i < len; i++) {
        var curAttr = attrs[i];
        var name = attrMappings[curAttr[2]] || curAttr[2];
        if (curAttr[3].constructor !== Array) {
          elem[name] = curAttr[3];
        }
      }
    }


    if (type === "image") {
      elem.attr = "backgroundImage";
    } else {
      elem.attr = "text";
    }

    var binding = (ixer.index("elementAttrToBinding")[id] || {})[elem.attr];
    if (binding) {
      elem.children = [
        {
          c: "attr-binding", children: [
            { c: "icon ion-ios-arrow-thin-right" },
            { text: code.name(binding) }
          ]
        }
      ];
      elem.text = undefined;
    }

    if (localState.modifyingUiText === id) {
      var curInput: any;
      if (type === "image") {
        curInput = tableEditor.input(elem.backgroundImage, { id: id }, updateImage, submitContent);
        curInput.postRender = focusOnce;
        elem.children = [curInput];
        curInput.attr = "backgroundImage";
        elem.text = undefined;
      } else {
        curInput = tableEditor.input(elem.text, { id: id }, updateContent, submitContent);
        curInput.postRender = focusOnce;
        elem.children = [curInput];
        curInput.attr = "text";
        elem.text = undefined;
      }
    }

    //   if(uiCustomControlRender[type]) {
    //     elem = uiCustomControlRender[type](elem);
    //   }
    return elem;
  }

  function dropOnControl(e, elem) {
    var type = e.dataTransfer.getData("type");
    if (type === "binding") {
      dispatch("bindAttr", { attr: elem.attr, elementId: elem.control[1], field: e.dataTransfer.getData("itemId") })
      e.stopPropagation();
    }
  }

  function setModifyingText(e, elem) {
    localState.modifyingUiText = elem.control[1];
    startAdjustAttr(e, elem);
    queryEditor.render();
  }

  function updateContent(e, elem) {
    dispatch("setAttributeForSelection", { componentId: elem.key.id, property: "text", value: e.currentTarget.textContent });
  }

  function updateImage(e, elem) {
    dispatch("setAttributeForSelection", { componentId: elem.key.id, property: "backgroundImage", value: e.currentTarget.textContent });
  }

  function submitContent(e, elem) {
    localState.modifyingUiText = false;
    dispatch("stopSetAttributeForSelection", { oldAttrs: localState.initialAttrs.shift(), property: elem.attr });
    console.log("submit content!");
    queryEditor.render();
  }

  function addToSelection(e, elem) {
    e.stopPropagation();
    if (elem.selected) return;
    if (!e.shiftKey || !localState.uiSelection) {
      localState.uiSelection = [];
    }
    var layer = ixer.index("uiComponentLayer")[elem.control[3]];
    if (layer[4] || layer[5]) return;
    localState.uiSelection.push(elem.control[1]);
    localState.uiActiveLayer = elem.control[3];
    queryEditor.render();
  }


  var __clientX, __clientY;
  document.body.addEventListener("dragover", function(e) {
    //@HACK: because Firefox is a browser full of sadness, they refuse to
    //set clientX and clientY on drag events. As such we have this ridiculous
    //workaround of tracking position at the body.
    __clientX = e.clientX;
    __clientY = e.clientY;
  });

  function toGrid(size, value) {
    return Math.round(value / size) * size;
  }

  function startMoveSelection(e, elem) {
    var x = e.clientX || __clientX;
    var y = e.clientY || __clientY;
    if (x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
    localState.dragOffsetX = x - elem.left - canvasRect.left;
    localState.dragOffsetY = y - elem.top - canvasRect.top;
    localState.initialElements.push(selectionToElements());
    clearDragImage(e, elem);
    if (e.altKey) {
      //@HACK: if you cause a rerender before the event finishes, the drag is killed?
      setTimeout(function() {
        dispatch("duplicateSelection", { componentId: elem.control[2] });
      }, 0);
    }
  }

  function moveSelection(e, elem) {
    var x = Math.floor(e.clientX || __clientX);
    var y = Math.floor(e.clientY || __clientY);
    if (x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    var neueX = toGrid(localState.uiGridSize, Math.floor(x - localState.dragOffsetX));
    var neueY = toGrid(localState.uiGridSize, Math.floor(y - localState.dragOffsetY));
    dispatch("moveSelection", { x: neueX, y: neueY, elemId: elem.control[1], componentId: elem.control[2] });
  }

  function stopMoveSelection(e, elem) {
    var elems = localState.initialElements.shift();
    dispatch("stopChangingSelection", { oldElements: elems })
  }

  function selectionToElements() {
    if (localState.uiSelection) {
      var elementIndex = ixer.index("uiComponentElement");
      return localState.uiSelection.map(function(cur) {
        return elementIndex[cur];
      });
    }
    return [];
  }

  function getSelectionInfo(componentId, withAttributes): any {
    var sel = localState.uiSelection;
    var elements;
    if (sel) {
      var elementIndex = ixer.index("uiComponentElement");
      elements = sel.map(function(cur) {
        return elementIndex[cur];
      });

      var result: any = getGroupInfo(elements, withAttributes);

      result.componentId = componentId;
      result.selectedIds = result.ids;
      return result;
    }
    return false;
  }

  function getGroupInfo(elements, withAttributes) {
    elements = elements || [];

    var attrsIndex = ixer.index("uiStyleToAttrs");
    var stylesIndex = ixer.index("uiElementToStyles");

    var ids = {};
    var attributes = {};
    var styles = {};
    var els = elements.map(function(cur) {
      var id = cur[1];
      ids[id] = true;
      if (withAttributes !== undefined) {
        var elStyles = stylesIndex[id];
        if (!elStyles) { return cur; }

        var attrs = [];
        for (var ix = 0, len = elStyles.length; ix < len; ix++) {
          var style = elStyles[ix];
          var type = style[2];
          if (styles[type] === undefined) { styles[type] = style; }
          else if (!style || !styles[type] || styles[type][1] !== style[1]) { styles[type] = null; }

          attrs.push.apply(attrs, attrsIndex[style[1]]);
        }

        if (attrs) {
          attrs.forEach(function(cur) {
            var key = cur[2];
            var value = cur[3];
            if (attributes[key] === undefined) {
              attributes[key] = value;
            } else if (attributes[key] !== value) {
              attributes[key] = null;
            }
          });
        }
      }
      return cur;
    });
    var bounds = boundElements(els);
    return { ids: ids, elements: els, bounds: bounds, attributes: attributes, styles: styles };
  }


  function boundElements(elems) {
    var bounds = { top: Infinity, left: Infinity, bottom: -Infinity, right: -Infinity };
    elems.forEach(function(cur) {
      var left = cur[5], top = cur[6], right = cur[7], bottom = cur[8];
      if (left < bounds.left) {
        bounds.left = left;
      }
      if (top < bounds.top) {
        bounds.top = top;
      }
      if (right > bounds.right) {
        bounds.right = right;
      }
      if (bottom > bounds.bottom) {
        bounds.bottom = bottom;
      }
    });
    return bounds;
  }


  var uiControlInfo = [{ text: "text", icon: "text-control", iconText: "T" },
    { text: "image", icon: "ion-image" },
    { text: "box", icon: "ion-stop" },
    { text: "spacer", icon: "ion-arrow-expand" },
    { text: "button", icon: "ion-share" },
    { text: "input", icon: "ion-compose" },
    //                        {text: "map", icon: "ion-ios-location"}
  ];

  function uiControls(componentId, activeLayer) {
    var items: any[] = uiControlInfo.map(function(cur: any) {
      var icon: any = { c: "icon " + cur.icon };
      if (cur.iconText) {
        icon.text = cur.iconText;
      }
      return {
        c: "control", click: addElement, controlType: cur.text, componentId: componentId, layer: activeLayer,
        children: [
          icon,
          { text: cur.text }
        ]
      };
    });
    var previewClass = localState.uiPreview ? " active" : "";
    items.push({
      c: "control design-mode-toggle" + previewClass, click: toggleUiPreview, children: [
        { c: "icon " + "ion-eye" },
        { text: "preview" }
      ]
    })
    return { c: "control-group", children: items };
  }

  function toggleUiPreview(e, elem) {
    localState.uiPreview = !localState.uiPreview;
    queryEditor.render();
  }

  function addElement(e, elem) {
    var layerId = elem.layer[1];
    var els = ixer.index("uiLayerToElements")[layerId];
    var zIndex = 0;
    if (els) {
      zIndex = els.length;
    }
    dispatch("addUiComponentElement", {
      componentId: elem.componentId,
      layerId: layerId,
      control: elem.controlType,
      left: elem.left || 100,
      right: elem.right || 200,
      top: elem.top || 100,
      bottom: elem.bottom || 200,
      zIndex: zIndex
    });
  }


  var attrMappings = { "content": "text" };
  export var uiProperties: any = {};
  function uiInspectors(componentId, selectionInfo, layers, activeLayer) {
    var inspectors = [];
    var activeLayerId;
    var binding;
    var elements;
    if (activeLayer) {
      activeLayerId = activeLayer[1];
      elements = ixer.index("uiLayerToElements")[activeLayerId];
      binding = ixer.index("groupToBinding")[activeLayerId];
    }
    if (selectionInfo) {
      // @TODO: Only show appropriate inspectors for each type based on trait instead of hardcoding.
      inspectors.push(layoutInspector(selectionInfo, binding),
        appearanceInspector(selectionInfo, binding),
        textInspector(selectionInfo, binding));

      //       var showMapInspector = selectionInfo.elements.every(function(cur) {
      //         return cur[4] === "map";
      //       });
      //       if(showMapInspector) {
      //         var mapInfo = getMapGroupInfo(selectionInfo.elements, true)
      //         inspectors.push(mapInspector(selectionInfo, mapInfo, binding));
      //       }
    } else if (activeLayer) {
      inspectors.push(layerInspector(activeLayer, elements));
    }
    return inspectors;
  }

  function adjustable(value, start, stop, step): any {
    return {
      c: "adjustable", mousedown: startAdjusting, adjustHandler: adjustAdjustable,
      value: value, start: start, stop: stop, step: step, text: value
    };
  }

  var adjustableShade = document.createElement("div");
  adjustableShade.className = "adjustable-shade";
  adjustableShade.addEventListener("mousemove", function(e) {
    if (adjusterInfo) {
      adjusterInfo.handler(e, renderer.tree[adjusterInfo.elem.id]);
    }
  })

  adjustableShade.addEventListener("mouseup", function(e) {
    if (adjusterInfo.elem.finalizer) {
      adjusterInfo.elem.finalizer(e, renderer.tree[adjusterInfo.elem.id]);
    }
    adjusterInfo = false;
    document.body.removeChild(adjustableShade);
  })

  var adjusterInfo;
  function startAdjusting(e, elem) {
    if (elem.initializer) {
      elem.initializer(e, elem);
    }
    adjusterInfo = { elem: elem, startValue: elem.value, handler: elem.adjustHandler, bounds: { left: e.clientX, top: e.clientY } };
    document.body.appendChild(adjustableShade);
  }

  function adjustAdjustable(e, elem) {
    var x = e.clientX || __clientX;
    var y = e.clientY || __clientY;
    if (x === 0 && y === 0) return;
    var rect = adjusterInfo.bounds;
    var offsetX = Math.floor(x - rect.left);
    var offsetY = Math.floor(y - rect.top);
    var adjusted = Math.floor(adjusterInfo.startValue + offsetX);
    var neue = Math.min(Math.max(elem.start, adjusted), elem.stop);
    if (elem.handler) {
      elem.handler(elem, neue);
    }
  }

  uiProperties.layout = ["top", "left", "width", "height"];
  function layoutInspector(selectionInfo, binding) {
    var componentId = selectionInfo.componentId;
    var bounds = selectionInfo.bounds;
    var width = bounds.right - bounds.left;
    var height = bounds.bottom - bounds.top;
    var widthAdjuster: any = adjustable(width, 1, 1000, 1);
    widthAdjuster.handler = adjustWidth;
    widthAdjuster.componentId = componentId;
    widthAdjuster.bounds = bounds;
    widthAdjuster.initializer = startResizeSelection;
    widthAdjuster.finalizer = stopResizeSelection;
    var heightAdjuster: any = adjustable(height, 1, 1000, 1);
    heightAdjuster.handler = adjustHeight;
    heightAdjuster.componentId = componentId;
    heightAdjuster.bounds = bounds;
    heightAdjuster.initializer = startResizeSelection;
    heightAdjuster.finalizer = stopResizeSelection;
    var topAdjuster: any = adjustable(bounds.top, 0, 100000, 1);
    topAdjuster.handler = adjustPosition;
    topAdjuster.componentId = componentId;
    topAdjuster.coord = "top";
    topAdjuster.initializer = startMoveSelection;
    topAdjuster.finalizer = stopMoveSelection;
    var leftAdjuster: any = adjustable(bounds.left, 0, 100000, 1);
    leftAdjuster.handler = adjustPosition;
    leftAdjuster.componentId = componentId;
    leftAdjuster.coord = "left";
    leftAdjuster.initializer = startMoveSelection;
    leftAdjuster.finalizer = stopMoveSelection;
    //pos, size
    return {
      c: "option-group size-attributes", children: [
        { c: "size-outline" },
        { c: "width-outline" },
        { c: "height-outline" },
        {
          c: "top-left-point", children: [
            leftAdjuster,
            { text: "," },
            topAdjuster,
          ]
        },
        { c: "width-adjuster", children: [widthAdjuster] },
        { c: "height-adjuster", children: [heightAdjuster] },
      ]
    };
  }

  uiProperties.appearance = ["backgroundColor", "backgroundImage", "borderColor", "borderWidth", "borderRadius", "opacity"];
  function appearanceInspector(selectionInfo, binding) {
    var attrs = selectionInfo.attributes;
    var componentId = selectionInfo.componentId;
    var styleName;
    if (selectionInfo.styles.appearance && selectionInfo.styles.appearance[4]) {
      styleName = { value: selectionInfo.styles.appearance[1], text: code.name(selectionInfo.styles.appearance[1]) };
    } else {
      styleName = { text: "No visual style", value: "none" };
    }

    var borderColorPicker = colorSelector(componentId, "borderColor", attrs["borderColor"]);
    borderColorPicker.backgroundColor = undefined;

    var opacity = attrs["opacity"] == undefined ? 100 : attrs["opacity"] * 100;
    var opacityAdjuster: any = adjustable(opacity, 0, 100, 1);
    opacityAdjuster.text = Math.floor(opacity) + "%";
    opacityAdjuster.handler = adjustOpacity;
    opacityAdjuster.componentId = componentId;
    opacityAdjuster.initializer = startAdjustAttr;
    opacityAdjuster.finalizer = stopAdjustAttr;
    opacityAdjuster.attr = "opacity";

    var borderWidth = attrs["borderWidth"] === undefined ? 0 : attrs["borderWidth"];
    var borderWidthAdjuster: any = adjustable(borderWidth, 0, 20, 1);
    borderWidthAdjuster.text = borderWidth;
    borderWidthAdjuster.handler = adjustAttr;
    borderWidthAdjuster.attr = "borderWidth";
    borderWidthAdjuster.componentId = componentId;
    borderWidthAdjuster.initializer = startAdjustAttr;
    borderWidthAdjuster.finalizer = stopAdjustAttr;

    var borderRadius = attrs["borderRadius"] === undefined ? 0 : attrs["borderRadius"];
    var borderRadiusAdjuster: any = adjustable(borderRadius, 0, 100, 1);
    borderRadiusAdjuster.text = borderRadius;
    borderRadiusAdjuster.handler = adjustAttr;
    borderRadiusAdjuster.attr = "borderRadius";
    borderRadiusAdjuster.componentId = componentId;
    borderRadiusAdjuster.initializer = startAdjustAttr;
    borderRadiusAdjuster.finalizer = stopAdjustAttr;

    if (!localState.addingAppearanceStyle) {
      var sharedAppearance = (ixer.index("stylesBySharedAndType")["true"] || {})["appearance"] || {};
      var uniqueStyles = Object.keys(sharedAppearance);
      var styles = uniqueStyles.map(function(cur) {
        return { value: cur, text: code.name(cur) };
      });
      styles.unshift({ text: "No text style", value: "none" });
      styles.push({ text: "Add a new style", value: "addStyle" });
      var visualStyle: any = selectable(styleName, styles, null);
      visualStyle.c += " styleSelector";
      visualStyle.handler = function(elem, value) {
        if (value === "none") {
          dispatch("setSelectionStyle", { type: "appearance", id: uuid(), shared: false });
        } else if (value === "addStyle") {
          localState.addingAppearanceStyle = uuid();
          dispatch("setSelectionStyle", { type: "appearance", id: localState.addingAppearanceStyle, shared: true, copyCurrent: true });
        } else {
          dispatch("setSelectionStyle", { type: "appearance", id: value, shared: true });
        }
        queryEditor.render();
      }
    } else {
      visualStyle = tableEditor.input("", localState.addingAppearanceStyle, tableEditor.rename, doneAddingStyle);
      visualStyle.postRender = focusOnce;
    }
    return {
      c: "option-group visual-attributes", children: [
        visualStyle,
        {
          c: "layout-box-filled", backgroundColor: attrs["backgroundColor"], borderRadius: attrs["borderRadius"], children: [
            colorSelector(componentId, "backgroundColor", attrs["backgroundColor"])
          ]
        },
        opacityAdjuster,
        {
          c: "border-options", children: [
            { c: "layout-box-outline", borderRadius: attrs["borderRadius"], borderWidth: (borderWidth > 10 ? 10 : borderWidth || 1), borderColor: attrs["borderColor"], children: [borderColorPicker] },
            { c: "border-radius-outline" },
            { c: "border-radius-adjuster", children: [borderRadiusAdjuster] },
          ]
        },
        borderWidthAdjuster,
      ]
    };
  }

  function selectable(activeItem, items, setFont): any {
    var options = items.map(function(cur) {
      var value, text;
      if (typeof cur === "string") {
        value = cur;
        text = cur;
      } else {
        value = cur.value;
        text = cur.text;
      }
      var item: any = { t: "option", value: value, text: text };
      if (setFont) {
        item.fontFamily = cur;
      }
      if ((activeItem.value || activeItem) === value) {
        item.selected = "selected";
      }
      return item;
    })
    var value = typeof activeItem === "string" ? activeItem : activeItem.text;
    return {
      c: "selectable", change: selectSelectable, children: [
        { t: "select", children: options },
        { c: "selectable-value", text: value }
      ]
    }
  }

  function selectSelectable(e, elem) {
    if (elem.handler) {
      elem.handler(elem, e.target.value);
    }
  }

  var alignMapping = {
    "flex-start": "Left",
    "center": "Center",
    "flex-end": "Right",
  }
  var vAlignMapping = {
    "flex-start": "Top",
    "center": "Center",
    "flex-end": "Bottom",
  }
  function selectVerticalAlign(elem, value) {
    var final = "center";
    if (value === "Top") {
      final = "flex-start";
    } else if (value === "Bottom") {
      final = "flex-end";
    }
    dispatch("setAttributeForSelection", { componentId: elem.componentId, property: "verticalAlign", value: final, storeEvent: true });
  }

  function selectAlign(elem, value) {
    var final = "center";
    if (value === "Left") {
      final = "flex-start";
    } else if (value === "Right") {
      final = "flex-end";
    }
    dispatch("setAttributeForSelection", { componentId: elem.componentId, property: "textAlign", value: final, storeEvent: true });
  }

  uiProperties.typography = ["fontFamily", "fontSize", "color", "textAlign", "verticalAlign"];
  uiProperties.content = ["text"];
  function textInspector(selectionInfo, binding) {
    var componentId = selectionInfo.componentId;
    var attrs = selectionInfo.attributes;
    var styleName;
    if (selectionInfo.styles.typography && selectionInfo.styles.typography[4]) {
      styleName = { value: selectionInfo.styles.typography[1], text: code.name(selectionInfo.styles.typography[1]) };
    } else {
      styleName = { text: "No text style", value: "none" };
    }

    var font = attrs["fontFamily"] || "Helvetica Neue";
    var fontPicker: any = selectable(font, ["Times New Roman", "Verdana", "Arial", "Georgia", "Avenir", "Helvetica Neue"], true);
    fontPicker.componentId = componentId;
    fontPicker.handler = adjustAttr;
    fontPicker.attr = "fontFamily";
    fontPicker.storeEvent = true;

    var fontSize = attrs["fontSize"] === undefined ? 16 : attrs["fontSize"];
    var fontSizeAdjuster: any = adjustable(fontSize, 0, 300, 1);
    fontSizeAdjuster.handler = adjustAttr;
    fontSizeAdjuster.attr = "fontSize";
    fontSizeAdjuster.componentId = componentId;
    fontSizeAdjuster.initializer = startAdjustAttr;
    fontSizeAdjuster.finalizer = stopAdjustAttr;

    var fontColor: any = colorSelector(componentId, "color", attrs["color"]);
    fontColor.backgroundColor = undefined;
    fontColor.color = attrs["color"];
    fontColor.c += " font-color";
    fontColor.text = "Text";
    fontColor.fontFamily = attrs["fontFamily"];

    var verticalAlign = vAlignMapping[attrs["verticalAlign"]] || "Top";
    var valign: any = selectable(verticalAlign, ["Top", "Center", "Bottom"], null);
    valign.componentId = componentId;
    valign.handler = selectVerticalAlign;

    var textAlign = alignMapping[attrs["textAlign"]] || "Left";
    var align: any = selectable(textAlign, ["Left", "Center", "Right"], null);
    align.componentId = componentId;
    align.handler = selectAlign;

    if (!localState.addingTypographyStyle) {
      var sharedTypography = (ixer.index("stylesBySharedAndType")["true"] || {})["typography"] || {};
      var uniqueStyles = Object.keys(sharedTypography);
      var styles = uniqueStyles.map(function(cur) {
        return { value: cur, text: code.name(cur) };
      });
      styles.unshift({ text: "No text style", value: "none" });
      styles.push({ text: "Add a new style", value: "addStyle" });
      var typographyStyle = selectable(styleName, styles, null);
      typographyStyle.c += " styleSelector";
      typographyStyle.handler = function(elem, value) {
        if (value === "none") {
          dispatch("setSelectionStyle", { type: "typography", id: uuid(), shared: false });
        } else if (value === "addStyle") {
          localState.addingTypographyStyle = uuid();
          dispatch("setSelectionStyle", { type: "typography", id: localState.addingTypographyStyle, shared: true, copyCurrent: true });
        } else {
          dispatch("setSelectionStyle", { type: "typography", id: value, shared: true });
        }
        queryEditor.render();
      }
    } else {
      typographyStyle = tableEditor.input("", localState.addingTypographyStyle, tableEditor.rename, doneAddingStyle);
      typographyStyle.postRender = focusOnce;
    }

    return {
      c: "option-group text-attributes", children: [
        typographyStyle,
        {
          c: "font-color-size", children: [
            fontColor,
            { c: "font-size" },
            fontSizeAdjuster,
          ]
        },
        { c: "font-family", children: [fontPicker] },
        {
          c: "font-align", children: [
            valign,
            align,
          ]
        },
      ]
    };
  }

  function doneAddingStyle(e, elem) {
    tableEditor.rename(e, elem, true);
    localState.addingTypographyStyle = null;
    localState.addingAppearanceStyle = null;
  }

  uiProperties.layer = [];
  function layerInspector(layer, elements) {
    var componentId = layer[2];
    var info = getGroupInfo(elements, true);
    var attrs = info.attributes; // @FIXME: Layer attributes.
    var bounds = info.bounds;

    return { c: "inspector-panel", children: [] };
  }

  uiProperties.map = [];
  function mapInspector(selectionInfo, mapInfo, binding) {
    var componentId = selectionInfo.componentId;
    var attrs = mapInfo.attributes;
    return {
      c: "inspector-panel", children: [
        { c: "title", text: "Map" },
        {
          c: "pair", children: [{ c: "label", text: "lat." },
            inspectorInput(attrs["lat"], [componentId, "lat"], setMapAttribute, binding)]
        },
        {
          c: "pair", children: [{ c: "label", text: "long." },
            inspectorInput(attrs["lng"], [componentId, "lng"], setMapAttribute, binding)]
        },
        {
          c: "pair", children: [{ c: "label", text: "zoom" },
            inspectorInput(attrs["zoom"], [componentId, "zoom"], setMapAttribute, binding)]
        },
      ]
    };
  }

  // Inputs
  function inspectorInput(value, key, onChange, binding) {
    var field: any = tableEditor.input(value, key, onChange, preventDefault);
    if (value === null) {
      field.placeholder = "---";
    } else if (typeof value === "number" && !isNaN(value)) {
      value = value.toFixed(2);
    } else if (value && value.constructor === Array) {
      value = "Bound to " + code.name(value[2]);
    }
    field.mousedown = stopPropagation;
    field.editorType = "binding";
    field.binding = binding;
    return field;
  }

  function colorSelector(componentId, attr, value) {
    return {
      c: "color-picker", backgroundColor: value || "#999999", mousedown: startSelectingColor, attr: attr, key: [componentId, attr],
      change: setAttribute, commit: stopSelectingColor
    };
  }

  function startSelectingColor(e, elem) {
    startAdjustAttr(e, elem);
    e.stopPropagation();
  }

  function stopSelectingColor(e, elem) {
    stopAdjustAttr(e, elem);
  }

  function setupColorPickers() {
    jQuery(".color-picker").colorPicker({
      doRender: false,
      opacity: false,
      onCommit: function($elm) {
        var div = $elm.get(0);
        var eveElem = renderer.tree[div._id] || renderer.prevTree[div._id];
        if (eveElem && eveElem.commit) {
          eveElem.commit({ currentTarget: div }, eveElem);
        }
      },
      renderCallback: function($elm, toggled) {
        if (toggled === false) return;
        var div = $elm.get(0);
        var eveElem = renderer.tree[div._id];
        if (eveElem && eveElem.change) {
          div.type = "color";
          div.value = this.color.colors.HEX;
          eveElem.change({ currentTarget: div }, eveElem);
        }
      }
    });
  }

  setupColorPickers();
  
  // Layout handlers
  function adjustWidth(elem, value) {
    var componentId = elem.componentId;
    var old = elem.bounds;
    var neue = { left: old.left, right: (old.left + value), top: old.top, bottom: old.bottom };
    var widthRatio = value / (old.right - old.left);
    if (widthRatio === 1) return;
    dispatch("resizeSelection", { widthRatio: widthRatio, heightRatio: 1, oldBounds: old, neueBounds: neue, componentId: componentId });
    elem.bounds = neue;
  }

  function adjustHeight(elem, value) {
    var componentId = elem.componentId;
    var old = elem.bounds;
    var neue = { left: old.left, right: old.right, top: old.top, bottom: (old.top + value) };
    var heightRatio = value / (old.bottom - old.top);
    if (heightRatio === 1) return;
    dispatch("resizeSelection", { widthRatio: 1, heightRatio: heightRatio, oldBounds: old, neueBounds: neue, componentId: componentId });
    elem.bounds = neue;
  }

  function adjustPosition(elem, value) {
    var componentId = elem.componentId;
    var coord = elem.coord;
    var diffX = 0, diffY = 0;
    if (coord === "top") {
      diffY = value - elem.value;
    } else {
      diffX = value - elem.value;
    }
    dispatch("offsetSelection", { diffX: diffX, diffY: diffY, componentId: componentId });
    elem.value = value;
  }

  function startAdjustAttr(e, elem) {
    var attrs = []
    var style = getUiPropertyType(elem.attr);
    if (!style) { throw new Error("Unknown attribute type for property:" + elem.attr + " known types: " + uiProperties); }
    var sel = localState.uiSelection;
    sel.forEach(function(cur) {
      var id = cur;
      var styleId = ixer.index("uiElementToStyle")[id][style][1];
      var oldProps = ixer.index("uiStyleToAttr")[styleId];
      if (oldProps && oldProps[elem.attr]) {
        attrs.push(oldProps[elem.attr]);
      }
    });
    localState.initialAttrs.push(attrs);
  }

  function stopAdjustAttr(e, elem) {
    var initial = localState.initialAttrs.shift();
    dispatch("stopSetAttributeForSelection", { oldAttrs: initial, property: elem.attr });
  }

  function adjustOpacity(elem, value) {
    dispatch("setAttributeForSelection", { componentId: elem.componentId, property: "opacity", value: value / 100, storeEvent: false });
  }
  function adjustAttr(elem, value) {
    dispatch("setAttributeForSelection", { componentId: elem.componentId, property: elem.attr, value: value, storeEvent: elem.storeEvent });
  }

  // Generic attribute handler
  function setAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.value;
    var storeEvent = false;
    if (target.type === "color") {
      value = target.value;
    } else if (target.type === "checkbox") {
      value = target.checked;
    } else if (target.type === undefined) {
      value = target.textContent;
    }

    dispatch("setAttributeForSelection", { componentId: componentId, property: property, value: value, storeEvent: storeEvent });
  }

  // Map attribute handler
  function setMapAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.checked !== undefined ? target.checked : target.value !== undefined ? target.value : target.textContent;
    dispatch("setMapAttributeForSelection", { componentId: componentId, property: property, value: value });
  }


  export function getUiPropertyType(prop) {
    if (uiProperties.typography.indexOf(prop) !== -1) {
      return "typography";
    }
    if (uiProperties.appearance.indexOf(prop) !== -1) {
      return "appearance";
    }
    if (uiProperties.layout.indexOf(prop) !== -1) {
      return "layout";
    }
    if (uiProperties.content.indexOf(prop) !== -1) {
      return "content";
    }
    return undefined;
  }


}