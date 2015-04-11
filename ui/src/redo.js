//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var ixer = new Indexing.Indexer();
var grid;

//---------------------------------------------------------
// utils
//---------------------------------------------------------

function stopPropagation(e) {
  e.stopPropagation();
}

function now() {
  if(window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
}

//---------------------------------------------------------
// Root
//---------------------------------------------------------

window.addEventListener("resize", rerender);

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

function stage() {
  var rect = window.document.body.getBoundingClientRect();
  grid = Grid.makeGrid({bounds: {top: rect.top, left: rect.left + 10, width: rect.width - 120, height: rect.height - 50}, gutter: 8});
  var active = "grid://default";
  var tiles = ixer.index("gridToTile")[active];
  var drawnTiles = tiles.map(gridTile);
  return {c: "stage", children: [{c: "stage-tiles-wrapper", scroll: rerender,
                                  children: [{c: "stage-tiles", top:0, left:0, height:(rect.height - 50) * 10, children: drawnTiles}]},
                                 minimap(rect, tiles)]};
}

//---------------------------------------------------------
// Minimap
//---------------------------------------------------------

function navigateMinimap(e) {
  var y = e.clientY - 50;
  var stageNode = document.getElementsByClassName("stage-tiles-wrapper")[0];
  var rect = window.document.body.getBoundingClientRect();
  stageNode.scrollTop = (y * 10) - ((rect.height - 50) / 2)
}

function minimap(bounds, tiles) {
  var gridBounds = {top: 0, left: 0, width: 100, height: (bounds.height - 50) / 10};
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

function input(value, oninput, onsubmit) {
  var blur, keydown;
  if(onsubmit) {
    blur = function(e) {
      onsubmit(e, "blurred");
    }
    keydown = function(e) {
      if(e.keyCode === KEYS.ENTER) {
        onsubmit(e, "enter");
      }
    }
  }
  return {c: "foo", contentEditable: true, input: oninput, text: value, blur: blur, keydown: keydown};
}

//---------------------------------------------------------
// Grid tile
//---------------------------------------------------------

function gridTile(cur) {
  var pos = Grid.getRect(grid, cur);
  return {c: "grid-tile", top: pos.top, left: pos.left, width: pos.width, height: pos.height,
          children: [tiles[cur[3]](cur)]};
}

//---------------------------------------------------------
// table
// @TODO
// - field editing
// - adder rows
//---------------------------------------------------------

function table(id, fields, rows) {
  var ths = fields.map(function(cur) {
    return {t: "th", children: [input(cur)]};
  });
  var trs = rows.map(function(cur) {
    var tds = [];
    for(var i = 0, len = cur.length; i < len; i++) {
      tds[i] = {t: "td", text: cur[i]};
    }
    return {t: "tr", children: tds};
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

function tableTile(cur) {
  var view = ixer.index("tableTile")[cur[1]][1];
  var fields = code.viewToFields(view).map(function(cur) {
    return code.name(cur[2]);
  });
  var rows = ixer.facts(view);
  return {c: "table-tile", children: [table("foo", fields, rows)]};
}


//---------------------------------------------------------
// ui tile
// @TODO
// - grid
// - attributes
// - stopPropagation doesn't appear to stop the outer div from
//   scrolling
//---------------------------------------------------------

var attrMappings = {"content": "text"};

function uiTile(cur) {
  var tileId = cur[1];
  var elements = ixer.index("uiComponentToElements")[tileId];
  var layers = ixer.index("uiComponentToLayers")[tileId];
  var attrs = ixer.index("uiElementToAttrs");
  var els = elements.map(function(cur) {
    var id = cur[1];
    var elem = {c: "control", left: cur[5], top: cur[6], width: cur[7] - cur[5], height: cur[8] - cur[6]};
    var elemAttrs = attrs[id];
    if(!elemAttrs) return elem;
    for(var i = 0, len = elemAttrs.length; i < len; i++) {
      var curAttr = elemAttrs[i];
      var name = attrMappings[curAttr[2]] || curAttr[2];
      elem[name] = curAttr[3];
    }
    return elem;
  });
  return {c: "ui-editor", children: [
    {c: "controls", children: [{text: "text"}, {text: "box"}, {text: "button"}]},
    {c: "ui-canvas", children: els},
    {c: "inspector", children: [layersControl(layers)]}
  ]};
}

function layersControl(layers) {
  var layerElems = layers.map(function(cur) {
    var hidden = cur[5];
    var locked = cur[4];
    var name = code.name(cur[1]);
    return {c: "layer", children: [
      {c: "ion-drag"},
      input(name),
      {c: hidden ? "ion-eye-disabled" : "ion-eye"},
      {c: locked ? "ion-locked" : "ion-unlocked"}
    ]};
  });
  return {c: "layers", children: layerElems};
}

//---------------------------------------------------------
// Expression
//---------------------------------------------------------

//---------------------------------------------------------
// view tile
//---------------------------------------------------------

function viewTile(cur) {
  var view = ixer.index("viewTile")[cur[1]][1];
  var sources = ixer.index("viewToSources")[view] || [];
  var results = ixer.facts(view);
  return {c: "view-tile", children: [
    viewCode(view, sources),
    viewResults(sources, results)
  ]};
}

function viewCode(view, sources) {
  var sourceElems = sources.map(function(cur) {
    var data = cur[3];
    if(data[0] === "view") {
      return {c: "step", children: [
        {children: [
          {text: "with "},
          {c: "token", text: "each row"},
          {text: " of "},
          {text: code.name(data[1])}
        ]}
      ]};
    }
    return {text: "calculate"};
  });
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

//---------------------------------------------------------
// chooser tile
//---------------------------------------------------------

function chooserTile(cur) {
  return {c: "chooser-tile", children: [
    {c: "option", children: [
      {c: "icon ion-image",},
      {c: "description", text: "Present your data in a new drawing."},
    ]},
    {c: "option", children: [
      {c: "icon ion-compose"},
      {c: "description", text: "Record data in a new table."},
    ]},
    {c: "option", children: [
      {c: "icon ion-ios-calculator"},
      {c: "description", text: "Work with your data in a new view."},
    ]},
  ]};
}

var tiles = {ui: uiTile, table: tableTile, view: viewTile, addChooser: chooserTile};

//---------------------------------------------------------
// Rendering
//---------------------------------------------------------

var queued = false;
var prevTree = {};
function rerender() {
  if(!queued) {
    queued = true;
    requestAnimationFrame(forceRender);
  }
}

function forceRender() {
  var start = now();
  var neueTree = {};
  microReact.prepare(neueTree, root());
  var d = microReact.diff(prevTree, neueTree);
  prevTree = neueTree;
  microReact.render(neueTree, d);
  var time = now() - start;
  if(time > 5) {
    console.log("slow render (> 5ms): ", time);
  }
  queued = false;
}

//---------------------------------------------------------
// Data API
//---------------------------------------------------------

var code = {
  diffs: {
    addColumn: function(viewId) {
      var view = ixer.index("view")[viewId];
      var fields = code.viewToFields(viewId) || [];
      var schema = view[1];
      var fieldId = uuid();
      return [["field", "inserted", [schema, fields.length, fieldId, "unknown"]],
              ["displayName", "inserted", [fieldId, alphabet[fields.length]]]];
    },
    addView: function(name, fields, initial, id, tags, type) { // (S, {[S]: Type}, Fact[]?, Uuid?, S[]?) -> Diffs
      id = id || uuid();
      var schema = uuid();
      var fieldIx = 0;
      var diffs = [["displayName", "inserted", [id, name]],
                   ["schema", "inserted", [schema]]];
      for(var fieldName in fields) {
        if(!fields.hasOwnProperty(fieldName)) { continue; }
        var fieldId = uuid()
        diffs.push(["field", "inserted", [schema, fieldIx++, fieldId, fields[fieldName]]],
                   ["displayName", "inserted", [fieldId, fieldName]]);
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
    updateAttribute: function(attribute, txId) {
      var diffs = [];
      var neue = [txId, attribute.id, attribute.property, attribute.value, false];
      var oldProps = ixer.index("uiElementToAttr")[attribute.id];
      diffs.push(["uiComponentAttribute", "inserted", neue]);
      if(oldProps) {
        var oldProp = oldProps[attribute.property];
        if(oldProp) {
          diffs.push(["deletion", "inserted", [txId, oldProp[0]]]);
        }
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
ixer.addIndex("displayName", "displayName", Indexing.create.latestLookup({keys: [0, 1]}));
ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
ixer.addIndex("field", "field", Indexing.create.lookup([2, false]));
ixer.addIndex("sourceToData", "source", Indexing.create.lookup([2, 3]));
ixer.addIndex("editId", "editId", Indexing.create.latestLookup({keys: [1,2,3]}));
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("viewToSources", "source", Indexing.create.collector([0]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([0]));
ixer.addIndex("remove", "remove", Indexing.create.lookup([0, 0]));
// ui
ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("uiElementToAttrs", "uiComponentAttribute", Indexing.create.latestCollector({keys: [1], uniqueness: [1, 2]}));
ixer.addIndex("uiElementToAttr", "uiComponentAttribute", Indexing.create.latestLookup({keys: [1, 2, false]}));

// Grid Indexes
ixer.addIndex("gridTarget", "gridTarget", Indexing.create.latestLookup({keys: [1, 2]}));
ixer.addIndex("gridTile", "gridTile", Indexing.create.latestLookup({keys: [1, false]}));
ixer.addIndex("gridToTile", "gridTile", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
ixer.addIndex("tableTile", "tableTile", Indexing.create.lookup([0, false]));
ixer.addIndex("viewTile", "viewTile", Indexing.create.lookup([0, false]));

function initIndexer() {
  ixer.handleDiffs(code.diffs.addView("transaction", {id: "id"}, undefined, "transaction", ["table"]));
  ixer.handleDiffs(code.diffs.addView("remove", {id: "id"}, undefined, "remove", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("schema", {id: "id"}, [], "schema", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("field", {schema: "id", ix: "int", id: "id", type: "type"}, [], "field", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("primitive", {id: "id", inSchema: "id", outSchema: "id"}, [], "primitive", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("view", {id: "id", schema: "id", kind: "query|union"}, [], "view", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("source", {view: "id", ix: "int", id: "id", data: "data", action: "get-tuple|get-relation"}, [], "source", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("constraint", {left: "reference", op: "op", right: "reference"}, [], "constraint", ["table"]));
  ixer.handleDiffs(code.diffs.addView("tag", {id: "id", tag: "string"}, undefined, "tag", ["table"]));
  ixer.handleDiffs(code.diffs.addView("displayName", {tx: "number", id: "string", name: "string"}, undefined, "displayName", ["table"]));
  ixer.handleDiffs(code.diffs.addView("tableTile", {id: "string", view: "string"}, undefined, "tableTile", ["table"]));
  ixer.handleDiffs(code.diffs.addView("viewTile", {id: "string", view: "string"}, undefined, "viewTile", ["table"]));

  ixer.handleDiffs(code.diffs.addView("zomg", {
    a: "string",
    e: "number",
    f: "number"
  }, [
    ["a", "b", "c"],
    ["d", "e", "f"]
  ], "zomg", ["table"]));

  ixer.handleDiffs(code.diffs.addView("foo", {
    a: "string",
    b: "number",
  }, [
    ["a", "b"],
    ["d", "e"]
  ], "foo", ["table"]));

  //example tables
  ixer.handleDiffs(
    code.diffs.addView("employees", {department: "string", name: "string", salary: "float"}, [], false, ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("department heads", {department: "string", head: "string"}, [], false, ["table"]));


  // grid views
  var gridId = "grid://default";
  var uiViewId = uuid();
  var bigUiViewId = uuid();
  ixer.handleDiffs(code.diffs.addView("gridTile", {
    tx: "number",
    tile: "string",
    grid: "string",
    type: "string",
    x: "number",
    y: "number",
    w: "number",
    h: "number"
  }, [
    [-1, uiViewId, gridId, "ui", 0, 12, 12, 6],
    [-2, bigUiViewId, "grid://ui", "ui", 0, 12, 12, 12],
  ], "gridTile", ["table"]));

  ixer.handleDiffs(code.diffs.addView(
    "activeGrid",
    {tx: "number", grid: "string"},
    [[-3, gridId]],
    "activeGrid", ["table"]));

  ixer.handleDiffs(code.diffs.addView(
    "gridTarget",
    {tx: "number", tile: "string", target: "string"}, [
      [uiViewId, "grid://ui"],
      [bigUiViewId, "grid://default"]
    ], "gridTarget", ["table"]));

  // ui views
  ixer.handleDiffs(
    code.diffs.addView("uiComponentElement", {tx: "number", id: "string", component: "string", layer: "number", control: "string", left: "number", top: "number", right: "number", bottom: "number"}, [], "uiComponentElement", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("uiComponentLayer", {tx: "number", id: "string", component: "string", layer: "number", locked: "boolean", invisible: "boolean"}, [], "uiComponentLayer", ["table"]));
  ixer.handleDiffs(
    code.diffs.addView("uiComponentAttribute", {tx: "number", id: "string", property: "string", value: "string", isBinding: "boolean"}, [], "uiComponentAttribute", ["table"])); // @FIXME: value: any

  var firstLayerId = uuid();
  ixer.handleDiffs([["uiComponentLayer", "inserted", [-4, firstLayerId, uiViewId, 0, false, false]],
                   ["displayName", "inserted", [-5, firstLayerId, "Layer 0"]]]);
}

//---------------------------------------------------------
// Websocket
//---------------------------------------------------------

var server = {connected: false, queue: [], initialized: false};
function connectToServer() {
  var queue = server.queue;
  var ws = new WebSocket('ws://localhost:2794', []);
  server.ws = ws;

  ws.onerror = function (error) {
    console.log('WebSocket Error ' + error);
  };

  ws.onmessage = function (e) {
    var data = JSON.parse(e.data);
    if(!server.initialized && !data.changes["view"]) {
      dispatch("initServer");
      sendToServer(ixer.dumpMapDiffs());
      ixer.clear();
      server.initialized = true;
    }
    ixer.handleMapDiffs(data.changes);

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
    server.ws.send(JSON.stringify(message));
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
  return {changes: final};
}

connectToServer();
