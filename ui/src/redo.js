//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var toolbarOffset = 50;
var ixer = new Indexing.Indexer();
var grid;
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
            toolbar(),
            stage(),
          ]};
}

//---------------------------------------------------------
// Toolbar
//---------------------------------------------------------

function toolbar() {
  return {c: "toolbar", text: "toolbar"};
}

//---------------------------------------------------------
// Stage
//---------------------------------------------------------

function stageElement() { return document.getElementsByClassName("stage-tiles-wrapper")[0]; }

function stage() {
  var rect = window.document.body.getBoundingClientRect();
  grid = Grid.makeGrid({bounds: {top: rect.top, left: rect.left + 10, width: rect.width - 120, height: rect.height - toolbarOffset}, gutter: 8});
  var active = "grid://default";
  var removed = ixer.index("remove");
  var allTiles = ixer.index("gridToTile")[active] || [];
  var tiles = allTiles.filter(function(cur) {
    return !removed[cur[0]];
  });
  var drawnTiles = tiles.map(function(cur) {
    return gridTile(cur, tiles);
  });
  var outline = ixer.index("tileOutline")[client];
  if(outline && removed[outline[0]]) {
    outline = null;
  }
  if(outline) {
    drawnTiles.push(tileOutline(outline));
  }
  return {c: "stage", children: [{c: "stage-tiles-wrapper", scroll: onStageScroll, tiles: tiles,
                                  draggable: true, dragstart: startTile, drag: layoutTile, dragend: createTile, outline: outline,
                                  children: [{c: "stage-tiles", top:0, left:0, height:(rect.height - toolbarOffset) * 10, children: drawnTiles}]},
                                 minimap(rect, tiles)]};
}

function tileOutline(outline) {
  var pos = Grid.getOutlineRect(grid, outline);
  return {c: "tile-outline", top: pos.top, left: pos.left, width: pos.width, height: pos.height};
}

var scrollTimer;
function stopScrolling() {
  document.body.classList.remove("scrolling");
}

function onStageScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(stopScrolling, 100)
  document.body.classList.add("scrolling");
  rerender();
}

function startTile(e, elem) {
  if(e.target !== e.currentTarget) return;
  clearDragImage(e);
  var x = e.clientX || __clientX;
  var y = (e.clientY || __clientY) + stageElement().scrollTop - toolbarOffset;
  var pos = Grid.coordsToPos(grid, x, y, true);
  if(!Grid.hasOverlap(elem.tiles, [null, null, null, null, pos[0], pos[1], 1, 1])) {
    dispatch("tileOutline", {outline: [null, client, pos[0], pos[1], 1, 1]});
  }
}

function layoutTile(e, elem) {
  if(!elem.outline) return;
  var x = e.clientX || __clientX;
  var y = (e.clientY || __clientY)
  if(x === 0 && y === 0) return;
  y = y + stageElement().scrollTop - toolbarOffset;
  var outline = elem.outline;
  var tiles = elem.tiles;
  var rect = Grid.getOutlineRect(grid, outline);
  var width = Math.max(x - rect.left, 1);
  var height = Math.max(y - rect.top, 1);
  var size = Grid.coordsToSize(grid, width, height, true);
  var neue = outline.slice();
  neue[4] = size[0];
  neue[5] = size[1];
  if((neue[4] !== outline[4] || neue[5] !== outline[5]) &&
     !Grid.hasOverlap(tiles, [null, null, null, null, outline[2], outline[3], neue[4], neue[5]])) {
    dispatch("tileOutline", {outline: neue});
  }

}

function createTile(e, elem) {
  if(!elem.outline || e.target !== e.currentTarget) return;
  dispatch("addTileFromOutline", {outline: elem.outline});
}

//---------------------------------------------------------
// Minimap
//---------------------------------------------------------

function navigateMinimap(e) {
  var y = e.clientY - toolbarOffset;
  var stageNode = document.getElementsByClassName("stage-tiles-wrapper")[0];
  var rect = window.document.body.getBoundingClientRect();
  stageNode.scrollTop = (y * 10) - ((rect.height - toolbarOffset) / 2)
}

function minimap(bounds, tiles) {
  var gridBounds = {top: 0, left: 0, width: 100, height: (bounds.height - toolbarOffset) / 10};
  var grid = Grid.makeGrid({bounds: gridBounds, gutter: 2});
  var drawnTiles = tiles.map(function(cur) {
    return minimapTile(grid, cur);
  });
  var stageNode = document.getElementsByClassName("stage-tiles-wrapper");
  var scroll = stageNode[0] ? stageNode[0].scrollTop / 10 : 0;
  var thumb = {c: "thumb", top: scroll, left: 0, width:100, height: gridBounds.height}
  return {c: "minimap", click: navigateMinimap, children: [thumb, {children: drawnTiles}]};
}

function minimapTile(grid, tile) {
  var pos = Grid.getRect(grid, tile);
  var name = code.tileToName(tile);
  return {c: "minimap-tile " + tile[3], top: pos.top, left: pos.left, width: pos.width, height: pos.height, text: name };
}

//---------------------------------------------------------
// input
//---------------------------------------------------------

function input(value, key, oninput, onsubmit) {
  var blur, keydown;
  if(onsubmit) {
    blur = function inputBlur(e, elem) {
      onsubmit(e, elem, "blurred");
      e.preventDefault();
    }
    keydown = function inputKeyDown(e, elem) {
      if(e.keyCode === KEYS.ENTER) {
        onsubmit(e, elem, "enter");
        e.preventDefault();
      }
    }
  }
  return {c: "input", contentEditable: true, input: oninput, text: value, key: key, blur: blur, keydown: keydown};
}

//---------------------------------------------------------
// Grid tile
//---------------------------------------------------------

function gridTile(cur, activeTiles) {
  var pos = Grid.getRect(grid, cur);
  return {c: "grid-tile", top: pos.top, left: pos.left, width: pos.width, height: pos.height,
          children: [tiles[cur[3]](cur), tileControls(cur, activeTiles)]};
}

function tileControls(cur, activeTiles) {
  return {c: "controls", children: [
    {c: "close-tile ion-close", tx: cur[0], click: removeTile},
    {c: "move-tile ion-arrow-move", tile: cur, tiles: activeTiles, draggable: true, drag: moveTile, dragstart: clearDragImage},
    {c: "resize-tile ion-drag", tile: cur, tiles: activeTiles, dragover: preventDefault, draggable: true, drag: resizeTile, dragstart: clearDragImage}
  ]}
}

function removeTile(e, elem) {
  dispatch("remove", {tx: elem.tx});
}

function moveTile(e, elem) {
  var x = e.clientX || __clientX;
  var y = e.clientY || __clientY;
  if(x === 0 && y === 0) return;
  y = y - toolbarOffset;
  var tile = elem.tile;
  var tiles = elem.tiles;
  var rect = Grid.getRect(grid, tile);
  var handlePos = e.currentTarget.getBoundingClientRect();
  var top = rect.top + (y - handlePos.top);
  var left = rect.left + (x - handlePos.left);
  var pos = Grid.coordsToPos(grid, left, top, true);
  var neue = tile.slice();
  neue[4] = Math.max(pos[0], 0);
  neue[5] = Math.max(pos[1], 0);
  if((neue[4] !== tile[4] || neue[5] !== tile[5]) &&
     !Grid.hasOverlap(tiles, neue)) {
    dispatch("updateTile", {neue: neue});
  }
  e.stopPropagation();
}

function resizeTile(e, elem) {
  var x = e.clientX || __clientX;
  var y = e.clientY || __clientY;
  if(x === 0 && y === 0) return;
  x = x + stageElement().scrollLeft;
  y = y + stageElement().scrollTop - toolbarOffset;
  var tile = elem.tile;
  var tiles = elem.tiles;
  var rect = Grid.getRect(grid, tile);
  var width = Math.max(x - rect.left, 1);
  var height = Math.max(y - rect.top, 1);
  var size = Grid.coordsToSize(grid, width, height, true);
  var neue = tile.slice();
  neue[6] = size[0];
  neue[7] = size[1];
  if((neue[6] !== tile[6] || neue[7] !== tile[7]) &&
     !Grid.hasOverlap(tiles, neue)) {
    dispatch("updateTile", {neue: neue});
  }
  e.stopPropagation();
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

function tableTile(cur) {
  var view = ixer.index("tableTile")[cur[1]][1];
  var fields = code.viewToFields(view).map(function(cur) {
    return {name: code.name(cur[2]), id: cur[2]};
  });
  var rows = ixer.facts(view);
  var adderRows = ixer.index("adderRows")[view] || [];
  return {c: "tile table-tile", children: [
    {t: "pre", c: "lifted", text: JSON.stringify(view)},
    table("foo", fields, rows, adderRows),
    {c: "add-column ion-plus", view: view, click: addColumn}]};
}


//---------------------------------------------------------
// ui tile
// @TODO
// - attributes
// - stopPropagation doesn't appear to stop the outer div from scrolling
// - grid doesn't resize correctly
//---------------------------------------------------------

var attrMappings = {"content": "text"};

function uiTile(cur) {
  var componentId = cur[1];
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
  var selectionInfo = getSelectionInfo(componentId);
  var els = elements.map(function(cur) {
    if(removed[cur[0]]) return;
    var id = cur[1];
    var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;
    return control(cur, attrsIndex[id], selected, layerLookup[cur[3]]);
  });
  if(selectionInfo) {
    els.push(selection(selectionInfo));
    var tileRect = Grid.getRect(grid, cur);
    els.push(uiGrid(componentId, activeLayer[3], {width: tileRect.width,  height: tileRect.height}));
  }
  return {c: "tile ui-editor", mousedown: clearSelection, componentId: componentId, children: [
    uiControls(componentId, activeLayer),
    {c: "ui-canvas", children: els},
    inspector(componentId, selectionInfo, layers, activeLayer)
  ]};
}

//---------------------------------------------------------
// ui control
//---------------------------------------------------------

function control(cur, attrs, selected, layer) {
  var id = cur[1];
  var selClass = selected ? " selected" : "";
  var hidden = layer[5] ? " hidden" : "";
  var locked = layer[4] ? " locked" : "";
  var klass = "control" + selClass + hidden + locked;
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
                     {text: "button", icon: ""}];
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

function appearanceInspector() {
  //background, image, border
  return {c: "inspector-panel", children: [
    {c: "pair", children: [{c: "label", text: "background"}, input("background") ]},
    {c: "pair", children: [{c: "label", text: "image"}, input("image") ]},
    {c: "pair", children: [{c: "label", text: "border"}, input("border") ]},
  ]};
}

function textInspector() {
  //font, size, color, align vertical, align horizontal, bold/italic/underline
  return {c: "inspector-panel", children: [
    {c: "pair", children: [{c: "label", text: "font"}, input("font") ]},
    {c: "pair", children: [{c: "label", text: "size"}, input("size") ]},
    {c: "pair", children: [{c: "label", text: "color"}, input("color") ]},
    {c: "pair", children: [{c: "label", text: "align"} ]},
    {c: "pair", children: [{c: "label", text: "valign"} ]},
    {c: "pair", children: [{c: "label", text: "bold/italic/underline"} ]},
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
              {t: "input", type: "color", value: color, mousedown: stopPropagation, input: changeColor, componentId: componentId},
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

function changeColor(e, elem) {
  dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "backgroundColor", value: e.currentTarget.value});
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
    function onSubmit(evt, el) {
      var matches = search(ids, needle);
      if(!matches.length) { return; }
      dispatch("updateSearchValue", {id: id, value: ""});
      onClose(matches[0]);
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

function viewTile(cur) {
  var view = ixer.index("viewTile")[cur[1]][1];
  var sources = ixer.index("viewToSources")[view] || [];
  var results = ixer.facts(view);
  return {c: "tile view-tile", children: [
    {t: "pre", c: "lifted", text: JSON.stringify(view)},
    viewCode(view, sources),

    viewResults(sources, results),

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
// chooser tile
//---------------------------------------------------------

function chooseTile(e, info) {
  dispatch(info.type, {tileId: info.tile[1]});
}

function chooserTile(cur) {
  return {c: "chooser-tile", children: [
    {c: "option", click: chooseTile, type: "addUi", tile: cur, children: [
      {c: "icon ion-image",},
      {c: "description", text: "Present data in a new drawing"},
    ]},
    {c: "option", click: chooseTile, type: "addTable", tile: cur, children: [
      {c: "icon ion-compose"},
      {c: "description", text: "Record data in a new table"},
    ]},
    {c: "option",click: chooseTile, type: "addView", tile: cur, children: [
      {c: "icon ion-ios-calculator"},
      {c: "description", text: "Work with data in a new view"},
    ]},
  ]};
}

var tiles = {ui: uiTile, table: tableTile, view: viewTile, addChooser: chooserTile};

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
    case "addTable":
      var tileId = info.tileId;
      var oldTile = ixer.index("gridTile")[tileId].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[0] = txId;
      tile[3] = "table";
      var tableId = uuid();
      diffs = code.diffs.addView("Untitled Table", {A: "string"}, undefined, tableId, ["table"]);
      diffs.push(["gridTile", "inserted", tile],
                 ["tableTile", "inserted", [tileId, tableId]],
                 ["adderRow", "inserted", [txId, txId, tableId, []]]);
      break;
    case "addView":
      var tileId = info.tileId;
      var oldTile = ixer.index("gridTile")[tileId].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[0] = txId;
      tile[3] = "view";
      var viewId = uuid();
      diffs = code.diffs.addView("Untitled View", {}, undefined, viewId, ["view"], "query");
      diffs.push(["gridTile", "inserted", tile],
                 ["viewTile", "inserted", [tileId, viewId]]);
      break;
    case "addUi":
      var tileId = info.tileId;
      var oldTile = ixer.index("gridTile")[tileId].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[0] = txId;
      tile[3] = "ui";
      diffs.push(["gridTile", "inserted", tile]);
      diffs.push.apply(diffs, dispatch("addUiComponentLayer", {componentId: info.tileId}));
      break;
    case "updateTile":
      var neue = info.neue.slice();
      neue[0] = txId;
      diffs.push(["gridTile", "inserted", neue]);
      break;
    case "tileOutline":
      var neue = info.outline;
      neue[0] = txId;
      diffs.push(["tileOutline", "inserted", neue]);
      break;
    case "addTileFromOutline":
      var outline = info.outline;
      var x = outline[2];
      var y = outline[3];
      var w = outline[4];
      var h = outline[5];
      var neue = [txId, uuid(), "grid://default", "addChooser", x, y, w, h];
      diffs.push(["gridTile", "inserted", neue],
                 ["remove", "inserted", [outline[0]]]);
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
  renderer.render(root());
  queued = false;
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

// ui
ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiElementToAttrs", "uiComponentAttribute", Indexing.create.latestCollector({keys: [1], uniqueness: [1, 2]}));
ixer.addIndex("uiElementToAttr", "uiComponentAttribute", Indexing.create.latestLookup({keys: [1, 2, false]}));
ixer.addIndex("uiSelection", "uiSelection", Indexing.create.latestLookup({keys: [2, 3, false]}));
ixer.addIndex("uiSelectionElements", "uiSelectionElement", Indexing.create.collector([0]));
ixer.addIndex("uiActiveLayer", "uiActiveLayer", Indexing.create.latestLookup({keys: [2, 1, 3]}));

// Grid Indexes
ixer.addIndex("gridTarget", "gridTarget", Indexing.create.latestLookup({keys: [1, 2]}));
ixer.addIndex("gridTile", "gridTile", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("gridToTile", "gridTile", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("tableTile", "tableTile", Indexing.create.lookup([0, false]));
ixer.addIndex("viewTile", "viewTile", Indexing.create.lookup([0, false]));
ixer.addIndex("tileOutline", "tileOutline", Indexing.create.latestLookup({keys: [1, false]}));

// State
ixer.addIndex("searchValue", "searchValue", Indexing.create.latestLookup({keys: [1, 2]}));


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

  // grid views
  add("gridTile", {tx: "number", tile: "string", grid: "string", type: "string", x: "number", y: "number", w: "number", h: "number"}, [], "gridTile", ["table"]);
  add("gridTarget", {tx: "number", tile: "string", target: "string"}, [], "gridTarget", ["table"]);
  add("tableTile", {id: "string", view: "string"}, undefined, "tableTile", ["table"]);
  add("viewTile", {id: "string", view: "string"}, undefined, "viewTile", ["table"]);
  add("tileOutline", {tx: "id", client: "id", x: "number", y: "number", w: "number", h: "number"}, undefined, "tileOutline", ["table"]);
  add("activeGrid", {tx: "number", grid: "string"}, [[0, "grid://default"]], "activeGrid", ["table"]);

  // ui views
  add("uiComponentElement", {tx: "number", id: "string", component: "string", layer: "number", control: "string", left: "number", top: "number", right: "number", bottom: "number"}, [], "uiComponentElement", ["table"]);
  add("uiComponentLayer", {tx: "number", id: "string", component: "string", layer: "number", locked: "boolean", invisible: "boolean"}, [], "uiComponentLayer", ["table"]);
  add("uiComponentAttribute", {tx: "number", id: "string", property: "string", value: "string", isBinding: "boolean"}, [], "uiComponentAttribute", ["table"]); // @FIXME: value: any
  add("uiSelection", {tx: "number", id: "id", client: "string", component: "id"}, [], "uiSelection", ["table"]);
  add("uiSelectionElement", {id: "id", element: "id"}, [], "uiSelectionElement", ["table"]);
  add("uiActiveLayer", {tx: "number", component: "id", client: "id", layer: "id"}, [], "uiActiveLayer", ["table"]);

  //misc transient state
  add("searchValue", {tx: "number", id: "id", value: "string"}, [], "searchValue", ["table"]);

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
