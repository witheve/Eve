//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var toolbarOffset = 50;
var ixer = new Indexing.Indexer();
var client = localStorage["client"] || uuid();
localStorage["client"] = client;

//@HACK: global vars for tracking drag position in FF.
var __clientX, __clientY;

//---------------------------------------------------------
// utils
//---------------------------------------------------------

var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

var KEYS = {UP: 38,
            DOWN: 40,
            ENTER: 13,
            Z: 90};

function coerceInput(input) {
  if(input.match(/^-?[\d]+$/gim)) {
    return parseInt(input);
  } else if(input.match(/^-?[\d]+\.[\d]+$/gim)) {
    return parseFloat(input);
  }
  return input;
}

function stopPropagation(e) {
  e.stopPropagation();
}
function preventDefault(e) {
  e.preventDefault();
}

function now() {
  if(window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
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

function clearDragImage(e, elem) {
  e.dataTransfer.setData("text", "foo");
  e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0, 0);
}

//---------------------------------------------------------
// Root
//---------------------------------------------------------

window.addEventListener("resize", rerender);
document.body.addEventListener("dragover", function(e) {
  //@HACK: because Firefox is a browser full of sadness, they refuse to
  //set clientX and clientY on drag events. As such we have this ridiculous
  //workaround of tracking position at the body.
  __clientX = e.clientX;
  __clientY = e.clientY;
});
document.body.addEventListener("drop", preventDefault);

function root() {
  return {id: "root",
          c: "root",
          children: [
            leftBar(),
            workspace()
          ]};
}

//---------------------------------------------------------
// Left Bar
//---------------------------------------------------------

function leftBar() {
  return {c: "left-bar column", children: [
    {c: "adder", children: [
      {c: "button add-table", click: addItem, event: "addTable", children: [
        {c: "ion-grid"},
        {c: "ion-plus"},
      ]},
      {c: "button add-view", click: addItem, event: "addQuery", children: [
        {c: "ion-cube"},
        {c: "ion-plus"},
      ]},
      {c: "button add-ui", click: addItem, event: "addUi", children: [
        {c: "ion-image"},
        {c: "ion-plus"},
      ]},
    ]},
    treeSelector()
  ]};
}

function addItem(e, elem) {
  dispatch(elem.event, {});
}

//---------------------------------------------------------
// Tree selector
//---------------------------------------------------------

function treeSelector() {
  //Get all the tables and queries
  var tables = [];
  var queries = [];
  ixer.facts("view").forEach(function(cur) {
    if(cur[2] === "union" || cur[2] === "input") {
      tables.push(cur);
    } else {
      queries.push(cur);
    }
  });
  //sort them by name

  var tableItems = tables.map(tableItem);
  var queryItems = queries.map(queryItem);

  //Get all the ui elements
  var uis = [];
  var componentIndex = ixer.index("uiComponentToLayers");
  for(var componentId in componentIndex) {
    uis.push({componentId: componentId,
             children: componentIndex[componentId]})
  }
  //sort
  var uiItems = uis.map(uiItem);

  var items = tableItems.concat(queryItems, uiItems);
  return {c: "tree-selector", children: items};
}

function tableItem(table) {
  var tableId = table[0];
  var name = code.name(tableId);
  return {c: "tree-item table", click: openItem, id:tableId, children: [
    {c: "item", children: [
      {c: "icon ion-grid"},
      {text: name},
    ]}
  ]};
}

function queryItem(query) {
  var queryId = query[0];
  var name = code.name(queryId);
  var open = ixer.index("openEditorItem")[client] === queryId;
  if(open) {
    var sources = ixer.index("viewToSources")[queryId] || [];
    var sourceItems = sources.map(function(cur) {
      var viewOrData = cur[3];
      if(viewOrData[0] === "view") {
        return {c: "tree-item query source", children: [
          {c: "item", children: [
            {c: "icon ion-android-arrow-back"},
            {text: code.name(viewOrData[1])}
          ]}
        ]};
      } else {
        return {c: "tree-item query calculation", text: "calculation"};
      }
    });
  }
  return {c: "tree-item query", click: openItem, id:queryId, children: [
    {c: "item", children: [
      {c: "icon ion-cube"},
      {text: name},
    ]},
    {c: "sub-items", children: sourceItems}
  ]};
}

function uiGroupItem(group, activeLayerId) {
  var groupId = group[1];
  var active = groupId === activeLayerId;
  var activeClass = "ion-android-checkbox-outline-blank";
  var hidden = group[5];
  var locked = group[4];
  var children;
  if(active) {
    activeClass = "ion-android-checkbox-blank";
    var items = ixer.index("uiLayerToElements")[groupId] || [];
    var children = items.map(function(cur) {
      return {c: "tree-item", children: [
        {c: "item", children: [
          {c: "icon ion-ios-crop-strong"},
          {text: cur[4]},
        ]},
      ]}

    })
  }
  return {c: "tree-item ui-group", children: [
    {c: "item", click: activateLayer, layer: group, children: [
      {c: "icon " + activeClass},
      {c: "name", text: code.name(groupId)},
      {c: hidden ? "ion-eye-disabled" : "ion-eye", click: toggleHidden, layer: group},
      {c: locked ? "ion-locked" : "ion-unlocked", click: toggleLocked, layer: group}
    ]},
    {c: "sub-items", children: children}
  ]}
}

function uiItem(ui) {
  var name = code.name(ui.componentId);
  var open = ixer.index("openEditorItem")[client] === ui.componentId;
  var elements = [];
  if(open) {
    var activeLayerId = ixer.index("uiActiveLayer")[client][ui.componentId];
    elements = (ui.children || []).map(function(cur) {
      return uiGroupItem(cur, activeLayerId);
    });
  }
  return {c: "tree-item ui", click: openItem, id:ui.componentId, children: [
    {c: "item", children: [
      {c: "icon ion-image"},
      {text: name || "ui"},
    ]},
    {c: "sub-items", children: elements}
  ]};
}

function openItem(e, elem) {
  dispatch("openItem", {id: elem.id});
}

//---------------------------------------------------------
// Workspace
//---------------------------------------------------------

function workspace() {
  var openItem = ixer.index("openEditorItem")[client];
  if(!openItem) { return {c: "workspace"}; }
  var content;
  var type = ixer.index("itemToType")[openItem];
  if(!type || type === "table") {
    content = tableWorkspace(openItem);
  } else if(type === "query") {
    content = queryWorkspace(openItem);
  } else if(type === "ui") {
    content = uiWorkspace(openItem)
  }
  return {c: "workspace", children: [
    content
  ]};
}

//---------------------------------------------------------
//---------------------------------------------------------
// input
//---------------------------------------------------------

function input(value, key, oninput, onsubmit) {
  var blur, keydown;
  if(onsubmit) {
    blur = function inputBlur(e, elem) {
      onsubmit(e, elem, "blurred");
    }
    keydown = function inputKeyDown(e, elem) {
      if(e.keyCode === KEYS.ENTER) {
        onsubmit(e, elem, "enter");
      }
    }
  }
  return {c: "input", contentEditable: true, input: oninput, text: value, key: key, blur: blur, keydown: keydown};
}

//---------------------------------------------------------
// table
// @TODO
// - field editing
// - adder rows
//---------------------------------------------------------

function rename(e, elem) {
  var value = e.currentTarget.textContent;
  if(value !== code.name(elem.key)) {
    dispatch("rename", {value: value, id: elem.key});
  }
}

function updateAdder(e, elem) {
  dispatch("updateAdderRow", {value: coerceInput(e.currentTarget.textContent),
                              row: elem.key.row,
                              ix: elem.key.ix});
}

function table(id, fields, rows, adderRows) {
  var ths = fields.map(function(cur) {
    var oninput, onsubmit;
    if(cur.id) {
      oninput = onsubmit = rename;
    }
    return {t: "th", children: [input(cur.name, cur.id, oninput, onsubmit)]};
  });
  var trs = rows.map(function(cur) {
    var tds = [];
    for(var i = 0, len = cur.length; i < len; i++) {
      tds[i] = {t: "td", text: cur[i]};
    }
    return {t: "tr", children: tds};
  });
  adderRows.forEach(function(adder) {
    var cur = adder[3];
    var tds = [];
    for(var i = 0, len = fields.length; i < len; i++) {
      tds[i] = {t: "td", children: [input(cur[i], {row: adder, ix: i}, updateAdder)]};
    }
    trs.push({t: "tr", children: tds});
  });
  return {t: "table", children: [
    {t: "thead", children: [
      {t: "tr", children: ths}
    ]},
    {t: "tbody", children: trs}
  ]};
}

//---------------------------------------------------------
// table tile
//---------------------------------------------------------

function addColumn(e, elem) {
  dispatch("addColumn", {view: elem.view});
}

function tableWorkspace(view) {
  var fields = code.viewToFields(view).map(function(cur) {
    return {name: code.name(cur[2]), id: cur[2]};
  });
  var rows = ixer.facts(view);
  var adderRows = ixer.index("adderRows")[view] || [];
  return {c: "workspace-content column", children: [
    {c: "title", children: [
      input(code.name(view), view, rename)
    ]},
    {c: "container", children: [
      table("foo", fields, rows, adderRows),
      {c: "add-column ion-plus", view: view, click: addColumn}
    ]}]};
}


//---------------------------------------------------------
// ui tile
// @TODO
// - attributes
// - stopPropagation doesn't appear to stop the outer div from scrolling
// - grid doesn't resize correctly
//---------------------------------------------------------

var attrMappings = {"content": "text"};

function uiWorkspace(componentId) {
  var removed = ixer.index("remove");
  var elements = ixer.index("uiComponentToElements")[componentId] || [];
  var layers = ixer.index("uiComponentToLayers")[componentId];
  var layerLookup = ixer.index("uiComponentLayer");
  var activeLayerId = ixer.index("uiActiveLayer")[client] ? ixer.index("uiActiveLayer")[client][componentId] : undefined;
  var activeLayer = layers[0];
  if(activeLayerId) {
    activeLayer = layerLookup[activeLayerId];
  }
  var attrsIndex = ixer.index("uiElementToAttrs");
  var selectionInfo = getSelectionInfo(componentId, true);
  var els = elements.map(function(cur) {
    if(removed[cur[0]]) return;
    var id = cur[1];
    var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;
    return control(cur, attrsIndex[id], selected, layerLookup[cur[3]]);
  });
  if(selectionInfo) {
    els.push(selection(selectionInfo));
//     els.push(uiGrid(componentId, activeLayer[3], {width: tileRect.width,  height: tileRect.height}));
  }
  return {c: "workspace-content column ui-workspace", mousedown: clearSelection, componentId: componentId, children: [
    {c: "title", children: [
      input(code.name(componentId), componentId, rename)
    ]},
    {c: "container", children: [
      uiControls(componentId, activeLayer),
      {c: "ui-canvas", children: els},
      inspector(componentId, selectionInfo, layers, activeLayer)
    ]}
  ]};
}

//---------------------------------------------------------
// ui control
//---------------------------------------------------------

function control(cur, attrs, selected, layer) {
  var id = cur[1];
  var type = cur[4];
  var selClass = selected ? " selected" : "";
  var hidden = layer[5] ? " hidden" : "";
  var locked = layer[4] ? " locked" : "";
  var klass = type + " control" + selClass + hidden + locked;
  var elem = {c: klass, id: id, left: cur[5], top: cur[6], width: cur[7] - cur[5], height: cur[8] - cur[6],
              control: cur, mousedown: addToSelection, selected: selected, zIndex: layer[3] + 1,
              draggable: true, drag: moveSelection, dragstart: startMoveSelection};
  if(!attrs) return elem;
  for(var i = 0, len = attrs.length; i < len; i++) {
    var curAttr = attrs[i];
    var name = attrMappings[curAttr[2]] || curAttr[2];
    elem[name] = curAttr[3];
  }
  return elem;
}

function addControl(e, elem) {
  dispatch("addUiComponentElement", {componentId: elem.componentId,
                                     layerId: elem.layer[1],
                                     control: elem.control,
                                     left: elem.left || 100,
                                     right: elem.right || 200,
                                     top: elem.top || 100,
                                     bottom: elem.bottom || 200})
}

var uiControlInfo = [{text: "text", icon: ""},
                     {text: "box", icon: ""},
                     {text: "button", icon: ""},
                     {text: "input", icon: ""}];
function uiControls(componentId, activeLayer) {
  var items = uiControlInfo.map(function(cur) {
    return {c: "control-item", click: addControl, control: cur.text, componentId: componentId, layer: activeLayer,
            children: [
              {c: "icon"},
              {text: cur.text}
            ]};
  })
  return {c: "controls", children: items};
}

//---------------------------------------------------------
// ui inspectors
//---------------------------------------------------------

function inspector(componentId, selectionInfo, layers, activeLayer) {
  var inspectors = [layersControl(componentId, layers, activeLayer)];
  if(selectionInfo) {
    inspectors.push(layoutInspector(selectionInfo),
                    appearanceInspector(selectionInfo),
                    textInspector(selectionInfo));
  }
  return {c: "inspector", children: inspectors};
}

function inspectorInput(value, key, onChange) {
  var field = input(value, key, onChange, preventDefault);
  field.mousedown = stopPropagation;
  return field;
}

function layoutInspector(selectionInfo) {
  var componentId = selectionInfo.componentId;
  var bounds = selectionInfo.bounds;
  //pos, size
  return {c: "inspector-panel", children: [
    {c: "pair", children: [{c: "label", text: "top"}, inspectorInput(bounds.top, [componentId, "top"], adjustPosition) ]},
    {c: "pair", children: [{c: "label", text: "left"}, inspectorInput(bounds.left, [componentId, "left"], adjustPosition) ]},
    {c: "pair", children: [{c: "label", text: "width"}, inspectorInput(bounds.right - bounds.left, selectionInfo, adjustWidth) ]},
    {c: "pair", children: [{c: "label", text: "height"}, inspectorInput(bounds.bottom - bounds.top, selectionInfo, adjustHeight) ]},
  ]};
}

function adjustWidth(e, elem) {
  var value = parseInt(e.currentTarget.textContent);
  if(isNaN(value)) return;
  if(value <= 0) value = 1;
  var componentId = elem.key.componentId;
  var old = elem.key.bounds;
  var neue = {left: old.left, right: (old.left + value), top: old.top,  bottom: old.bottom};
  var widthRatio = value / elem.text;
  dispatch("resizeSelection", {widthRatio: widthRatio, heightRatio: 1, oldBounds: old, neueBounds: neue, componentId: componentId});
}

function adjustHeight(e, elem) {
  var value = parseInt(e.currentTarget.textContent);
  if(isNaN(value)) return;
  if(value <= 0) value = 1;
  var componentId = elem.key.componentId;
  var old = elem.key.bounds;
  var neue = {left: old.left, right: old.right, top: old.top,  bottom: (old.top + value)};
  var heightRatio = value / elem.text;
  dispatch("resizeSelection", {widthRatio: 1, heightRatio: heightRatio, oldBounds: old, neueBounds: neue, componentId: componentId});
}

function adjustPosition(e, elem) {
  var value = parseInt(e.currentTarget.textContent);
  if(isNaN(value)) return;
  var componentId = elem.key[0];
  var coord = elem.key[1];
  var diffX = 0, diffY = 0;
  if(coord === "top") {
    diffY = value - elem.text;
  } else {
    diffX = value - elem.text;
  }
  dispatch("moveSelection", {diffX: diffX, diffY: diffY, componentId: componentId});
}

function appearanceInspector(selectionInfo) {
  var attrs = selectionInfo.attributes;
  var componentId = selectionInfo.componentId;
  //background, image, border
  return {c: "inspector-panel", children: [
    {c: "pair", children: [{c: "label", text: "background"},
                           colorSelector(componentId, "backgroundColor", attrs["backgroundColor"])]},
    {c: "pair", children: [{c: "label", text: "image"},
                           inspectorInput(attrs["backgroundImage"], [componentId, "backgroundImage"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "border"},
                          inspectorInput(attrs["border"], [componentId, "border"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "radius"},
                          inspectorInput(attrs["borderRadius"], [componentId, "borderRadius"], setAttribute)]},
  ]};
}

function colorSelector(componentId, attr, value) {
  return {c: "color-picker", backgroundColor: value || "#999999", mousedown: stopPropagation, children: [
    {t: "input", type: "color", key: [componentId, attr],
      value: value, input: setAttribute}
  ]};
}

function setAttribute(e, elem) {
  var componentId = elem.key[0];
  var property = elem.key[1];
  dispatch("setAttributeForSelection", {componentId: componentId, property: property, value: e.currentTarget.value || e.currentTarget.textContent});
}

function textInspector(selectionInfo) {
  var componentId = selectionInfo.componentId;
  var attrs = selectionInfo.attributes;
  //font, size, color, align vertical, align horizontal, bold/italic/underline
  return {c: "inspector-panel", children: [
    {c: "pair", children: [{c: "label", text: "content"}, inspectorInput(attrs["text"], [componentId, "text"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "font"},
                           inspectorInput(attrs["fontFamily"], [componentId, "fontFamily"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "size"},
                           inspectorInput(attrs["fontSize"], [componentId, "fontSize"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "color"}, colorSelector(componentId, "color", attrs["color"])]},
    {c: "pair", children: [{c: "label", text: "align"},
                           inspectorInput(attrs["textAlign"], [componentId, "textAlign"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "valign"},
                           inspectorInput(attrs["verticalAlign"], [componentId, "verticalAlign"], setAttribute)]},
    {c: "pair", children: [{c: "label", text: "bold/italic/underline"}]},
  ]};
}

function repeatInspector() {
}

//---------------------------------------------------------
// ui grid
//---------------------------------------------------------

var uiGridSize = 10;
function toGrid(size, value) {
  return Math.round(value / size) * size;
}

function uiGrid(componentId, layerIndex, size) {
  var id = componentId + "-grid";
  return {c: "grid", id: id, t: "canvas", top: 0, left: 0, width: size.width, height: size.height, zIndex: layerIndex,
         postRender: function(canvas) {
           if(canvas._rendered) return;
           var ctx = canvas.getContext("2d");
           var ratio = canvasRatio(ctx);
           canvas.width = size.width * ratio;
           canvas.height = size.height * ratio;
           ctx.scale(ratio, ratio);
           ctx.lineWidth = 1;
           ctx.strokeStyle = "#999999";
           for(var i = 0; i < 300; i++) {
             if(i % uiGridSize === 0) {
               ctx.globalAlpha = 0.3;
             } else {
               ctx.globalAlpha = 0.1;
             }
             ctx.beginPath();
             ctx.moveTo(i * uiGridSize,0);
             ctx.lineTo(i * uiGridSize,size.height * 2);
             ctx.stroke();
             ctx.beginPath();
             ctx.moveTo(0, i * uiGridSize);
             ctx.lineTo(size.width * 2, i * uiGridSize);
             ctx.stroke();
           }
           canvas._rendered = true;
         }};
}

//---------------------------------------------------------
// ui selection
//---------------------------------------------------------
var isResizing = false;
var color = "#ff0000";

function selection(selectionInfo) {
  var componentId = selectionInfo.componentId;
  var bounds = selectionInfo.bounds;
  var coordinates;
  if(isResizing) {
    coordinates = [{text: "w: " + (bounds.right - bounds.left)}, {text: "h: " + (bounds.bottom - bounds.top)}];
  } else {
    coordinates = [{text: "x: " + bounds.left}, {text: "y: " + bounds.top}];
  }
  return {c: "selection", top: bounds.top, left: bounds.left,
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
            {c: "color ion-waterdrop", children: [
              {t: "input", type: "color", value: color, mousedown: stopPropagation, input: setAttribute, key: [componentId, "backgroundColor"]},
            ]},
            {c: "trash ion-ios-trash", componentId: componentId, mousedown:stopPropagation, click: deleteSelection},
            {c: "coordinates", children: coordinates}
          ]};
}

function getSelectionInfo(componentId, withAttributes) {
  var sel = getUiSelection(componentId);
  var removed = ixer.index("remove");
  if(sel && !removed[sel[0]]) {
    var ids = {};
    var attributes = {};
    var elementIndex = ixer.index("uiComponentElement");
    var attrsIndex = ixer.index("uiElementToAttrs");
    elements = ixer.index("uiSelectionElements")[sel[1]].map(function(cur) {
      var id = cur[1];
      ids[id] = true;
      if(withAttributes !== undefined) {
        var attrs = attrsIndex[id];
        if(attrs) {
          attrs.forEach(function(cur) {
            var key = cur[2];
            var value = cur[3];
            if(attributes[key] === undefined) {
              attributes[key] = value;
            } else if(attributes[key] !== value) {
              attributes[key] = false;
            }
          });
        }
      }
      return elementIndex[id];
    });
    //get the bounding box of those
    var bounds = boundElements(elements);
    return {componentId: componentId, selectedIds: ids, elements: elements, bounds: bounds, attributes: attributes}
  }
  return false;
}

var resizeHandleSize = 7;
function resizeHandle(componentId, bounds, y, x) {
  var top, left;
  var halfSize = Math.floor(resizeHandleSize / 2);
  var height = bounds.bottom - bounds.top;
  var width = bounds.right - bounds.left;
  if(x === "left") {
    left = 0 - halfSize - 1;
  } else if(x === "right") {
    left = width - halfSize - 2;
  } else {
    left = (width / 2) - halfSize;
  }

  if(y === "top") {
    top = 0 - halfSize - 1;
  } else if(y === "bottom") {
    top = height - halfSize - 2;
  } else {
    top = (height / 2) - halfSize;
  }
  return {c: "resize-handle", y: y, x: x, top: top, left: left, width: resizeHandleSize, height: resizeHandleSize,  componentId: componentId,
          draggable: true, drag: resizeSelection, bounds: bounds, dragstart: clearDragImage, mousedown: stopPropagation, dragend: doneResizing};
}

function getUiSelection(componentId) {
  var sel = ixer.index("uiSelection")[client];
  if(sel) {
    return sel[componentId];
  }
  return false;
}

function boundElements(elems) {
  var bounds = {top: Infinity, left: Infinity, bottom: -Infinity, right: -Infinity};
  elems.forEach(function(cur) {
    var left = cur[5], top = cur[6], right = cur[7], bottom = cur[8];
    if(left < bounds.left) {
      bounds.left = left;
    }
    if(top < bounds.top) {
      bounds.top = top;
    }
    if(right > bounds.right) {
      bounds.right = right;
    }
    if(bottom > bounds.bottom) {
      bounds.bottom = bottom;
    }
  });
  return bounds;
}

function deleteSelection(e, elem) {
  dispatch("deleteSelection", {componentId: elem.componentId});
}

function clearSelection(e, elem) {
  dispatch("clearSelection", {componentId: elem.componentId});
}

function addToSelection(e, elem) {
  e.stopPropagation();
  if(elem.selected) return;
  var createNew = false;
  if(!e.shiftKey) {
    createNew = true;
  }
  dispatch("selectElements", {createNew: createNew, elements: [elem.control[1]], componentId: elem.control[2]});
}


var dragOffsetX = 0;
var dragOffsetY = 0;
function startMoveSelection(e, elem) {
  var x = e.clientX || __clientX;
  var y = e.clientY || __clientY;
  if(x === 0 && y === 0) return;
  var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
  dragOffsetX = x - elem.left - canvasRect.left;
  dragOffsetY = y - elem.top - canvasRect.top;
  clearDragImage(e);
  if(e.altKey) {
    dispatch("duplicateSelection", {componentId: elem.control[2]});
  }
}

function moveSelection(e, elem) {
  var x = Math.floor(e.clientX || __clientX);
  var y = Math.floor(e.clientY || __clientY);
  if(x === 0 && y === 0) return;
  var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
  x -= Math.floor(canvasRect.left);
  y -= Math.floor(canvasRect.top);
  var diffX = toGrid(uiGridSize, Math.floor(x - elem.control[5] - dragOffsetX));
  var diffY = toGrid(uiGridSize, Math.floor(y - elem.control[6] - dragOffsetY));
  if(diffX || diffY) {
    dispatch("moveSelection", {diffX: diffX, diffY: diffY, componentId: elem.control[2]});
  }
}

function doneResizing(e, elem) {
  isResizing = false;
}

function resizeSelection(e, elem) {
  isResizing = true;
  var x = Math.floor(e.clientX || __clientX);
  var y = Math.floor(e.clientY || __clientY);
  if(x === 0 && y === 0) return;
  var canvasRect = e.currentTarget.parentNode.parentNode.getBoundingClientRect();
  x -= Math.floor(canvasRect.left);
  y -= Math.floor(canvasRect.top);
  var old = elem.bounds;
  var neueBounds = {left: old.left, right: old.right, top: old.top, bottom: old.bottom};
  if(elem.x === "left") {
    neueBounds.left = toGrid(uiGridSize, x);
  } else if(elem.x === "right") {
    neueBounds.right = toGrid(uiGridSize, x);
  }
  if(elem.y === "top") {
    neueBounds.top = toGrid(uiGridSize, y);
  } else if(elem.y === "bottom") {
    neueBounds.bottom = toGrid(uiGridSize, y);
  }
  var neueWidth = neueBounds.right - neueBounds.left;
  var neueHeight = neueBounds.bottom - neueBounds.top;
  if(neueWidth < 10) {
    neueWidth = 10;
    if(elem.x === "left") { neueBounds.left = neueBounds.right - 10; }
    else { neueBounds.right = neueBounds.left + 10; }
  }
  if(neueHeight < 10) {
    neueHeight = 10;
    if(elem.y === "top") { neueBounds.top = neueBounds.bottom - 10; }
    else { neueBounds.bottom = neueBounds.top + 10; }
  }
  var widthRatio = neueWidth / (old.right - old.left);
  var heightRatio = neueHeight / (old.bottom - old.top);

  if(widthRatio !== 1 || heightRatio !== 1) {
    dispatch("resizeSelection", {widthRatio: widthRatio, heightRatio: heightRatio, oldBounds: old, neueBounds: neueBounds, componentId: elem.componentId});
  }
}

//---------------------------------------------------------
// ui layers
//---------------------------------------------------------

function layersControl(componentId, layers, activeLayer) {
  var layerElems = layers.map(function(cur) {
    var hidden = cur[5];
    var locked = cur[4];
    var name = code.name(cur[1]);
    var active = activeLayer === cur ? " active" : "";
    return {c: "layer" + active, click: activateLayer, layer: cur, children: [
      {c: hidden ? "ion-eye-disabled" : "ion-eye", click: toggleHidden, layer: cur},
//       {c: "ion-drag"},
      input(name, cur[1], rename),
      {c: locked ? "ion-locked" : "ion-unlocked", click: toggleLocked, layer: cur}
    ]};
  });
  layerElems.push({c: "add-layer ion-plus", componentId: componentId, click: addLayer});
  return {c: "layers", children: layerElems};
}

function addLayer(e, elem) {
  dispatch("addUiComponentLayer", {componentId: elem.componentId});
}

function activateLayer(e, elem) {
  dispatch("activateUiLayer", {layerId: elem.layer[1], componentId: elem.layer[2]});
}

function toggleHidden(e, elem) {
  var neue = elem.layer.slice();
  neue[5] = !neue[5];
  dispatch("updateUiLayer", {neue: neue});
}

function toggleLocked(e, elem) {
  var neue = elem.layer.slice();
  neue[4] = !neue[4];
  dispatch("updateUiLayer", {neue: neue});
}


//---------------------------------------------------------
// View List
//---------------------------------------------------------

// The filter parameter is an optional callback that can narrow views by type, tag, or what have you.
function search(ids, needle) { // (Id[], String) -> Id[]
  if(!ids) { throw new Error("Must provide an array of named ids to search."); }
  var displayName = ixer.index("displayName");
  var matches = [];

  for(var ix = 0, len = ids.length; ix < len; ix++) {
    var cur = ids[ix];
    if(!needle || displayName[cur].indexOf(needle) !== -1) {
      matches.push(cur);
    }
  }

  return matches;
}

function searcher(id, ids, opts, onClose) { // (Id, Id[], Any?, Fn((Id) -> Boolean)?, Fn((Id) -> undefined)) -> undefined
  if(!onClose) { onClose = opts; opts = undefined; }
  if(!onClose) { throw new Error("Must provide a callback for onClose."); }
  opts = opts || {};

  var needle = ixer.index("searchValue")[id]; // Load from ixer.
  var matches = search(ids, needle);
  var results = matches.map(function(cur, ix) {
    if(opts.limit && ix > opts.limit) { return; }
    return searcherResult(cur, opts, onClose);
  })
  .filter(Boolean);

  var searchInput = input(
    needle, id + "-input",
    function onInput(evt, el) {
      dispatch("updateSearchValue", {id: id, value: evt.target.innerHTML});
    },
    function onSubmit(evt, el, type) {
      if(type === "blurred") { return; }
      var matches = search(ids, needle);
      if(!matches.length) { return; }
      dispatch("updateSearchValue", {id: id, value: ""});
      onClose(matches[0]);

      evt.preventDefault();
      evt.target.blur();
    });
  searchInput.c = "searcher-input";
  return {c: "searcher", children: [
    searchInput,
    {t: "ul", c: "dropdown searcher-results", children: results}
  ]};
}

function searcherResult(id, opts, onClose) {
  return {t: "li", c: "dropdown-item search-result",
          text: ixer.index("displayName")[id] || "Untitled",
          viewId: id,
          click: function(evt, el) {
            onClose(el.viewId);
          }};
}

function viewList(id, onClose) {
  var views = ixer.facts("view").map(function(cur) {
    return cur[0];
  });

  return searcher(id, views, {limit: 25}, onClose);
}

//---------------------------------------------------------
// Expression
//---------------------------------------------------------

//---------------------------------------------------------
// view tile
// - @TODO: token renderer
// - @TODO: expression renderer
// - @TODO: token menu renderer
//---------------------------------------------------------

function queryWorkspace(view) {
  var sources = ixer.index("viewToSources")[view] || [];
  var results = ixer.facts(view);
  return {c: "workspace-content column query-workspace", children: [
    {c: "title", children: [
      input(code.name(view), view, rename)
    ]},
    {c: "container", children: [
      viewCode(view, sources),
      viewResults(sources, results),
    ]}
  ]};
}

function viewCode(view, sources) {
  var sourceElems = sources.map(function(cur) {
    var data = cur[3];
    if(data[0] === "view") {
      return {c: "step", children: [
        {children: [
          {t: "span", c: "token", text: "with "},
          viewToken("each row"),
          {t: "span", c: "token", text: " of "},
          {t: "span", c: "token", text: code.name(data[1])}
        ]}
      ]};
    }
    return {text: "calculate"};
  });

  // Add Source btn
  sourceElems.push({c: "view-query-builder", children: [
    {t: "button", c: "add-source-btn btn", text: "Add Step", click: function() {
      console.log("clicked", arguments);
    }},
    {t: "button", c: "add-calculation-btn btn", text: "Calculate", click: function() {
      console.log("clicked", arguments);
    }}
  ]});
  sourceElems.push(
    viewList(view + "-searcher", function addSource(sourceId) {
      // Bail if no view was selected.
      if(!sourceId) { return; }
      dispatch("addViewSource", {view: view, source: sourceId});
    }));

  return {c: "view-source-code", children: sourceElems};
}

function viewResults(sources, results) {
  var tableHeaders = [];
  var fieldHeaders = [];
  var rows = [];
  var sourceFieldsLength = [];
  sources.forEach(function(cur) {
    var data = cur[3];
    if(data[0] === "view") {
      var view = data[1];
      var fields = code.viewToFields(view);
      sourceFieldsLength.push(fields.length);
      tableHeaders.push({t: "th", colspan: fields.length, text: code.name(view)}, {t: "th", c: "gap"})
      fields.forEach(function(field) {
        fieldHeaders.push({t: "th", text: code.name(field[2])});
      });
      fieldHeaders.push({t: "th", c: "gap"});
    } else {
      tableHeaders.push({t: "th", text: "TODO: calculations"}, {t: "th", c: "gap"});
      fieldHeaders.push({t: "th", text: "result"}, {t: "th", c: "gap"});
      sourceFieldsLength.push(1);
    }
  });
  //remove trailing gaps
  tableHeaders.pop();
  fieldHeaders.pop();
  var sourcesLen = sources.length;
  results.forEach(function(row) {
    var neue = [];
    for(var i = 0; i < sourcesLen; i++) {
      var fields = row[i];
      if(!fields) {
        neue.push({t: "td", colspan: sourceFieldsLength[i], c: "failed"});
        neue.push({t: "td", c: "gap failed"});
      } else {
        var fieldsLen = fields.length;
        for(var fieldIx = 0; fieldIx < fieldsLen; fieldIx++) {
          neue.push({t: "td", text: fields[fieldIx]});
        }
        neue.push({t: "td", c: "gap"});
      }
    }
    neue.pop();
    rows.push({t: "tr", children: neue});
  });
  return {t: "table", c: "results", children: [
    {t: "thead", children: [
      {t: "tr", c: "table-headers", children: tableHeaders},
      {t: "tr", c: "field-headers", children: fieldHeaders}
    ]},
    {t: "tbody", children: rows}
  ]};
}

function viewToken(cur) {
  return {t: "span", c: "token editable", text: cur};
}

//---------------------------------------------------------
// Dispatch
//---------------------------------------------------------

function dispatch(event, info, returnInsteadOfSend) {
  var storeEvent = true;
  var diffs = [];
  var txId = {"eid": "auto"};

  switch(event) {
    case "rename":
      diffs.push(["displayName", "inserted", [txId, info.id, info.value]]);
      break;
    case "openItem":
      diffs.push(["openEditorItem", "inserted", [txId, info.id, client]]);
      break;
    case "addTable":
      var tableId = uuid();
      diffs = code.diffs.addView("Untitled Table", {A: "string"}, undefined, tableId, ["table"]);
      diffs.push(["adderRow", "inserted", [txId, txId, tableId, []]]);
      diffs.push(["editorItem", "inserted", [tableId, "table"]]);
      diffs.push.apply(diffs, dispatch("openItem", {id: tableId}, true));
      break;
    case "addQuery":
      var viewId = uuid();
      diffs = code.diffs.addView("Untitled Query", {}, undefined, viewId, ["view"], "query");
      diffs.push(["editorItem", "inserted", [viewId, "query"]]);
      diffs.push.apply(diffs, dispatch("openItem", {id: viewId}, true));
      break;
    case "addUi":
      var uiId = uuid();
      diffs.push.apply(diffs, dispatch("addUiComponentLayer", {componentId: uiId}));
      diffs.push(["editorItem", "inserted", [uiId, "ui"]]);
      diffs.push.apply(diffs, dispatch("openItem", {id: uiId}, true));
      break;
    case "addUiComponentElement":
      var neue = [txId, uuid(), info.componentId, info.layerId, info.control, info.left, info.top, info.right, info.bottom];
      diffs.push(["uiComponentElement", "inserted", neue]);
      diffs.push.apply(diffs, dispatch("selectElements", {componentId: info.componentId,
                                                          createNew: true,
                                                          elements: [neue[1]]},
                                      true));
      break;
    case "addUiComponentLayer":
      var layers = ixer.index("uiComponentToLayers")[info.componentId];
      var layerIx = 0;
      if(layers) {
        layerIx = layers.length;
      }
      var id = uuid();
      var neue = [txId, id, info.componentId, layerIx, false, false];
      diffs.push(["uiComponentLayer", "inserted", neue],
                 ["displayName", "inserted", [txId, id, "Layer " + layerIx]]);
      diffs.push.apply(diffs, dispatch("activateUiLayer", {componentId: info.componentId, layerId: id}));
      break;
    case "activateUiLayer":
      diffs.push(["uiActiveLayer", "inserted", [txId, info.componentId, client, info.layerId]])
      break;
    case "updateUiLayer":
      var neue = info.neue;
      neue[0] = txId;
      diffs.push(["uiComponentLayer", "inserted", neue]);
      break;
    case "clearSelection":
      var sel = getUiSelection(info.componentId);
      if(sel && !ixer.index("remove")[sel[0]]) {
        diffs.push(["remove", "inserted", [sel[0]]]);
      }
      break;
    case "selectElements":
      var sel = getUiSelection(info.componentId);
      if(sel && ixer.index("remove")[sel[0]]) { sel = null; }
      var id = uuid();
      if(info.createNew || !sel) {
        diffs.push(["uiSelection", "inserted", [txId, id, client, info.componentId]]);
      } else {
        id = sel[1];
      }
      info.elements.forEach(function(cur) {
        diffs.push(["uiSelectionElement", "inserted", [id, cur]]);
      });
      var first = ixer.index("uiComponentElement")[info.elements[0]];
      var activeLayer = ixer.index("uiActiveLayer")[client] ? ixer.index("uiActiveLayer")[client][info.componentId] : null;
      if(first && first[3] !== activeLayer) {
        diffs.push(["uiActiveLayer", "inserted", [txId, info.componentId, client, first[3]]])
      }
      break;
    case "deleteSelection":
      var sel = ixer.index("uiSelection")[client][info.componentId];
      var els = ixer.index("uiSelectionElements")[sel[1]];
      var elementIndex = ixer.index("uiComponentElement");
      els.forEach(function(cur) {
        var elem = elementIndex[cur[1]];
        diffs.push(["remove", "inserted", [elem[0]]]);
      });
      diffs.push.apply(diffs, dispatch("clearSelection", info));
      break;
    case "setAttributeForSelection":
      var sel = ixer.index("uiSelection")[client][info.componentId];
      var els = ixer.index("uiSelectionElements")[sel[1]];
      els.forEach(function(cur) {
        var id = cur[1];
        diffs.push.apply(diffs, code.ui.updateAttribute(id, info.property, info.value, txId));
      });
      break;
    case "duplicateSelection":
      var sel = ixer.index("uiSelection")[client][info.componentId];
      var els = ixer.index("uiSelectionElements")[sel[1]];
      var elementIndex = ixer.index("uiComponentElement");
      els.forEach(function(cur) {
        var elem = elementIndex[cur[1]];
        diffs.push.apply(diffs, code.ui.duplicateElement(elem, txId));
      });
      break;
    case "moveSelection":
      var sel = ixer.index("uiSelection")[client][info.componentId];
      var els = ixer.index("uiSelectionElements")[sel[1]];
      var elementIndex = ixer.index("uiComponentElement");
      var diffX = info.diffX;
      var diffY = info.diffY;
      els.forEach(function(cur) {
        var elem = elementIndex[cur[1]];
        var neue = elem.slice();
        neue[0] = txId;
        neue[5] += diffX; //left
        neue[7] += diffX; //right
        neue[6] += diffY; //top
        neue[8] += diffY; //bottom
        diffs.push(["uiComponentElement", "inserted", neue]);
      });
      break;
    case "resizeSelection":
      var sel = ixer.index("uiSelection")[client][info.componentId];
      var els = ixer.index("uiSelectionElements")[sel[1]];
      var elementIndex = ixer.index("uiComponentElement");
      var ratioX = info.widthRatio;
      var ratioY = info.heightRatio;
      var oldBounds = info.oldBounds;
      var neueBounds = info.neueBounds;
      els.forEach(function(cur) {
        var elem = elementIndex[cur[1]];
        var neue = elem.slice();
        neue[0] = txId;
        //We first find out the relative position of the item in the selection
        //then adjust by the given ratio and finall add the position of the selection
        //back in to get the new absolute coordinates
        neue[5] = ((neue[5] - oldBounds.left) * ratioX) + neueBounds.left; //left
        neue[7] = ((neue[7] - oldBounds.right) * ratioX) + neueBounds.right; //right
        neue[6] = ((neue[6] - oldBounds.top) * ratioY) + neueBounds.top; //top
        neue[8] = ((neue[8] - oldBounds.bottom) * ratioY) + neueBounds.bottom; //bottom
        diffs.push(["uiComponentElement", "inserted", neue]);
      });
      break;

    case "updateAdderRow":
      var neue = info.row.slice();
      if(neue[3].length === 0) {
        //this was the last empty adderRow, which means we need to add a new one
        diffs.push(["adderRow", "inserted", [txId, txId, neue[2], []]]);
      }
      neue[0] = txId;
      neue[3][info.ix] = info.value;
      diffs.push(["adderRow", "inserted", neue])
      break;
    case "addColumn":
      var viewId = info.view;
      var view = ixer.index("view")[viewId];
      var fields = code.viewToFields(viewId) || [];
      var schema = view[1];
      var fieldId = uuid();
      diffs.push(["field", "inserted", [schema, fields.length, fieldId, "unknown"]],
                 ["displayName", "inserted", [{"eid": "auto"}, fieldId, alphabet[fields.length]]]);
      break;
    case "remove":
      diffs.push(["remove", "inserted", [info.tx]]);
      break;
    case "addViewSource":
      var viewId = info.view;
      var sourceId = uuid();
      var view = ixer.index("view")[viewId];
      var nextIx = (ixer.index("viewToSources")[viewId] || []).length;
      diffs = code.diffs.autoJoins(viewId, info.source, sourceId);
      diffs.push(["field", "inserted", [view[1], nextIx, sourceId, "tuple"]]);
      diffs.push(["source", "inserted", [viewId, nextIx, sourceId, ["view", info.source], "get-tuple"]]);
      break;
    case "updateSearchValue":
      diffs = [["searchValue", "inserted", [{"eid": "auto"}, info.id, info.value]]];
      break;
    default:
      console.error("Dispatch for unknown event: ", event, info);
      return;
      break;
  }

//   if(storeEvent) {
//     var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack};
//     eventStack.children.push(eventItem);
//     eventStack = eventItem;
//   }

  if(returnInsteadOfSend) {
    return diffs;
  }
  sendToServer(diffs);
}

//---------------------------------------------------------
// Rendering
//---------------------------------------------------------

var renderer = new microReact.Renderer();
document.body.appendChild(renderer.content);
var queued = false;
function rerender() {
  if(!queued) {
    queued = true;
//     requestAnimationFrame(forceRender);
    forceRender();
  }
}

function forceRender() {
  queued = false;
  renderer.render(root());
}

//---------------------------------------------------------
// Data API
//---------------------------------------------------------

var code = {
  diffs: {
    addView: function(name, fields, initial, id, tags, type) { // (S, {[S]: Type}, Fact[]?, Uuid?, S[]?) -> Diffs
      id = id || uuid();
      var schema = uuid();
      var fieldIx = 0;
      var diffs = [["displayName", "inserted", [{"eid": "auto"}, id, name]],
                   ["schema", "inserted", [schema]]];
      for(var fieldName in fields) {
        if(!fields.hasOwnProperty(fieldName)) { continue; }
        var fieldId = uuid()
        diffs.push(["field", "inserted", [schema, fieldIx++, fieldId, fields[fieldName]]],
                   ["displayName", "inserted", [{"eid": "auto"}, fieldId, fieldName]]);
      }

      diffs.push(["view", "inserted", [id, schema, type || "input"]]);
      if(initial && initial.length) {
        for(var initIx = 0, initLen = initial.length; initIx < initLen; initIx++) {
          diffs.push([id, "inserted", initial[initIx]]);
        }
      }
      if(tags) {
        for(var tagIx = 0, tagLen = tags.length; tagIx < tagLen; tagIx++) {
          diffs.push(["tag", "inserted", [id, tags[tagIx]]]);
        }
      }
      return diffs;
    },
    autoJoins: function(view, sourceView, sourceId) {
      var displayNames = ixer.index("displayName");
      var sources = ixer.index("viewToSources")[view] || [];
      var fields = code.viewToFields(sourceView);
      var diffs = [];

      fields = fields.map(function(cur) {
        return [cur[2], displayNames[cur[2]]];
      });
      sources.forEach(function(cur) {
        theirFields = code.viewToFields(cur[3][1]);
        if(!theirFields) return;

        for(var i in theirFields) {
          var theirs = theirFields[i];
          for(var x in fields) {
            var myField = fields[x];
            if(displayNames[theirs[2]] === myField[1]) {
              //same name, join them.
              diffs.push(
                ["constraint", "inserted",
                 [code.ast.fieldSourceRef(sourceId, myField[0]),
                  "=",
                  code.ast.fieldSourceRef(cur[2], theirs[2])]]);
            }
          }
        }
      });
      return diffs;
    }
  },
  ui: {
    updateAttribute: function(id, property, value, txId) {
      var diffs = [];
      var neue = [txId, id, property, value, false];
      var oldProps = ixer.index("uiElementToAttr")[id];
      diffs.push(["uiComponentAttribute", "inserted", neue]);
      return diffs;
    },
    duplicateElement: function(element, txId) {
      var diffs = [];
      var neue = element.slice();
      //generate new ids for the element, everything else remains
      var id = uuid();
      neue[0] = txId;
      neue[1] = id;
      diffs.push(["uiComponentElement", "inserted", neue]);
      //duplicate all of the attributes
      var attrs = ixer.index("uiElementToAttrs")[element[1]];
      if(attrs) {
        attrs.forEach(function(cur) {
          var attr = cur.slice();
          attr[0] = txId;
          attr[1] = id;
          diffs.push(["uiComponentAttribute", "inserted", attr]);
        });
      }
      return diffs;
    }
  },
  hasTag: function(id, tag) {
    var tags = ixer.index("tag")[id];
    for(var ix in tags) {
      if(tags[ix][1] == tag) {
        return true;
      }
    }
    return false;
  },
  ast: {
    fieldSourceRef: function(source, field) {
      return ["column", source, field];
    },
  },
  viewToFields: function(view) {
    var schema = ixer.index("viewToSchema")[view];
    return ixer.index("schemaToFields")[schema];
  },
  refToName: function(ref) {
    switch(ref[0]) {
      case "column":
        var view = code.name(ixer.index("sourceToData")[ref[1]][1]);
        var field = code.name(ref[2]);
        return {string: view + "." + field, view: view, field: field};
        break;
      default:
        return "Unknown ref: " + JSON.stringify(ref);
        break;
    }
  },
  refToType: function(ref) {
    return ixer.index("field")[ref[2]][3];
  },
  typesEqual: function(a, b) {
    //@TODO: equivalence. e.g. int = number
    return a === b;
  },
  viewToRefs: function(view, ofType) {
    var refs = [];
    var sources = ixer.index("viewToSources")[view] || [];
    sources.forEach(function(source) {
      var viewOrData = source[3];
      var sourceView = viewOrData[1];
      //view
      if(viewOrData[0] !== "view") {
        //@TODO: handle getting the refs for functions
        sourceView = null;
      } else {
        code.viewToFields(sourceView).forEach(function(field) {
          if(!ofType || ofType === field[3]) {
            refs.push(code.ast.fieldSourceRef(source[2], field[2]));
          }
        });
      }
    });
    return refs;
  },
  tileToName: function(tile) {
    switch(tile[3]) {
      case "ui":
        return "ui";
        break;
      case "table":
        var table = ixer.index("tableTile")[tile[1]][1];
        return code.name(table);
        break;
      case "view":
        var table = ixer.index("viewTile")[tile[1]][1];
        return code.name(table);
        break;
    }
  },
  name: function(id) {
    return ixer.index("displayName")[id];
  }
};

//---------------------------------------------------------
// Indexes
//---------------------------------------------------------

// Core
ixer.addIndex("tag", "tag", Indexing.create.collector([0]));
ixer.addIndex("displayName", "displayName", Indexing.create.latestLookup({keys: [1, 2]}));
ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
ixer.addIndex("field", "field", Indexing.create.lookup([2, false]));
ixer.addIndex("sourceToData", "source", Indexing.create.lookup([2, 3]));
ixer.addIndex("editId", "editId", Indexing.create.latestLookup({keys: [1,2,3]}));
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("viewToSources", "source", Indexing.create.collector([0]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([0]));
ixer.addIndex("remove", "remove", Indexing.create.lookup([0, 0]));
ixer.addIndex("adderRows", "adderRow", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));

//editorItem
ixer.addIndex("itemToType", "editorItem", Indexing.create.lookup([0,1]));
ixer.addIndex("openEditorItem", "openEditorItem", Indexing.create.latestLookup({keys: [2, 1]}));

// ui
ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiLayerToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [3], uniqueness: [1]}));
ixer.addIndex("uiElementToAttrs", "uiComponentAttribute", Indexing.create.latestCollector({keys: [1], uniqueness: [1, 2]}));
ixer.addIndex("uiElementToAttr", "uiComponentAttribute", Indexing.create.latestLookup({keys: [1, 2, false]}));
ixer.addIndex("uiSelection", "uiSelection", Indexing.create.latestLookup({keys: [2, 3, false]}));
ixer.addIndex("uiSelectionElements", "uiSelectionElement", Indexing.create.collector([0]));
ixer.addIndex("uiActiveLayer", "uiActiveLayer", Indexing.create.latestLookup({keys: [2, 1, 3]}));

// State
ixer.addIndex("searchValue", "searchValue", Indexing.create.latestLookup({keys: [1, 2]}));
ixer.addIndex("modal", "modal", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("searchModal", "searchModal", Indexing.create.latestLookup({keys: [1, false]}));



function initIndexer() {
  var add = function(name, info, fields, id, tags) {
    ixer.handleDiffs(code.diffs.addView(name, info, fields, id, tags));
  }
  add("schema", {id: "id"}, [], "schema", ["table"]);
  add("field", {schema: "id", ix: "int", id: "id", type: "type"}, [], "field", ["table"]);
  add("primitive", {id: "id", inSchema: "id", outSchema: "id"}, [], "primitive", ["table"]);
  add("view", {id: "id", schema: "id", kind: "query|union"}, [], "view", ["table"]);
  add("source", {view: "id", ix: "int", id: "id", data: "data", action: "get-tuple|get-relation"}, [], "source", ["table"]);
  add("constraint", {left: "reference", op: "op", right: "reference"}, [], "constraint", ["table"]);
  add("tag", {id: "id", tag: "string"}, undefined, "tag", ["table"]);
  add("displayName", {tx: "number", id: "string", name: "string"}, undefined, "displayName", ["table"]);

  add("adderRow", {tx: "id", id: "id", table: "id", row: "tuple"}, undefined, "adderRow", ["table"]);
  add("remove", {id: "id"}, undefined, "remove", ["table"]);

  // ui views
  add("uiComponentElement", {tx: "number", id: "string", component: "string", layer: "id", control: "string", left: "number", top: "number", right: "number", bottom: "number"}, [], "uiComponentElement", ["table"]);
  add("uiComponentLayer", {tx: "number", id: "string", component: "string", layer: "number", locked: "boolean", invisible: "boolean"}, [], "uiComponentLayer", ["table"]);
  add("uiComponentAttribute", {tx: "number", id: "string", property: "string", value: "string", isBinding: "boolean"}, [], "uiComponentAttribute", ["table"]); // @FIXME: value: any
  add("uiSelection", {tx: "number", id: "id", client: "string", component: "id"}, [], "uiSelection", ["table"]);
  add("uiSelectionElement", {id: "id", element: "id"}, [], "uiSelectionElement", ["table"]);
  add("uiActiveLayer", {tx: "number", component: "id", client: "id", layer: "id"}, [], "uiActiveLayer", ["table"]);

  // editor item
  add("editorItem", {id: "id", type: "table|query|ui"}, [], "editorItem", ["table"]);
  add("openEditorItem", {tx: "number", id: "id", client: "client"}, [], "openEditorItem", ["table"]);

  //misc transient state
  add("searchValue", {tx: "number", id: "id", value: "string"}, [], "searchValue", ["table"]);
  add("modal", {tx: "number", id: "id", type: "string"}, [], "modal", ["table"]);
  add("searchModal", {tx: "number", id: "id", type: "string"}, [], "searchModal", ["table"]);

  //example tables
  add("zomg", {a: "string", e: "number", f: "number"}, [["a", "b", "c"], ["d", "e", "f"]], "zomg", ["table"]);
  add("foo", {a: "string", b: "number"}, [["a", "b"], ["d", "e"]], "foo", ["table"]);
  add("employees", {department: "string", name: "string", salary: "float"}, [], false, ["table"]);
  add("department heads", {department: "string", head: "string"}, [], false, ["table"]);
}

//---------------------------------------------------------
// Websocket
//---------------------------------------------------------

var server = {connected: false, queue: [], initialized: false, lastSent: []};
function connectToServer() {
  var queue = server.queue;
  var ws = new WebSocket('ws://localhost:2794', []);
  server.ws = ws;

  ws.onerror = function (error) {
    console.log('WebSocket Error ' + error);
  };

  ws.onmessage = function (e) {
    var start = now();
    var data = JSON.parse(e.data);
    var time = now() - start;
    if(time > 5) {
      console.log("slow parse (> 5ms):", time);
    }

    if(!server.initialized && !data.changes.length) {
      initIndexer();
      server.ws.send(JSON.stringify(ixer.dumpMapDiffs()));
      ixer.clear();
      server.initialized = true;
    } else if(!server.initialized) {
      server.initialized = true;
    }
//     console.log("received", data.changes);
    var start = now();
    ixer.handleMapDiffs(data.changes);
    var time = now() - start;
    if(time > 5) {
      console.log("slow handleDiffs (> 5ms):", time);
    }

    rerender();
  };

  ws.onopen = function() {
    server.connected = true;
    for(var i = 0, len = queue.length; i < len; i++) {
      sendToServer(queue[i]);
    }
  }
}

function sendToServer(message) {
  if(!server.connected) {
    server.queue.push(message);
  } else {
    if(!Indexing.arraysIdentical(server.lastSent, message)) {
//     console.log("sending", message);
      server.lastSent = message;
      server.ws.send(JSON.stringify(toMapDiffs(message)));
    }
  }
}

function toMapDiffs(diffs) {
  var final = {};
  for(var i = 0, len = diffs.length; i < len; i++) {
    var cur = diffs[i];
    var table = cur[0];
    var action = cur[1];
    var fact = cur[2];
    if(!final[table]) {
      final[table] = {inserted: [], removed: []};
    }
    final[table][action].push(fact);
  }
  var changes = [];
  for (var table in final) {
    changes.push([table, final[table].inserted, final[table].removed]);
  }
  return {changes: changes};
}

connectToServer();
