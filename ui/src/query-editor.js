var queryEditor = (function(window, microReact, Indexing) {
  var document = window.document;

  if(queryEditor) {
    try {
      document.body.removeChild(queryEditor.container);
    } catch (err) {
      // meh
    }
  }

  window.addEventListener("resize", render);
  document.body.addEventListener("drop", preventDefault);


  var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  function render() {
    renderer.render(root());
  }

  function preventDefault(evt) {
    evt.preventDefault();
  }

  function focusOnce(node, elem) {
    if(!elem.__focused) {
      setTimeout(function() { node.focus(); }, 5);
      elem.__focused = true;
    }
  }

  //---------------------------------------------------------
  // Data
  //---------------------------------------------------------

  var ixer = new Indexing.Indexer();
  var tables = {
    // Compiler
    view: {name: "view", fields: ["view", "kind"]},
    field: {name: "field", fields: ["view", "field", "kind"]},
    source: {name: "source", fields: ["view", "source", "source view"]},
    constant: {name: "constant", fields: ["constant", "value"]},
    select: {name: "select", fields: ["view", "view field", "source", "source field"]},

    "constraint": {name: "constraint", fields: ["constraint", "view"]},
    "constraint left": {name: "constraint left", fields: ["constraint", "left source", "left field"]},
    "constraint right": {name: "constraint right", fields: ["constraint", "right source", "right field"]},
    "constraint operation": {name: "constraint operation", fields: ["constraint", "operation"]},

    "aggregate grouping": {name: "aggregate grouping", fields: ["aggregate", "inner field", "group source", "group field"]},
    "aggregate sorting": {name: "aggregate sorting", fields: ["aggregate", "inner field", "priority", "direction"]},
    "aggregate limit from": {name: "aggregate limit from", fields: ["aggregate", "from source", "from field"]},
    "aggregate limit to": {name: "aggregate limit to", fields: ["aggregate", "to source", "to field"]},
    "aggregate argument": {name: "aggregate argument", fields: ["aggregate", "reducer source", "reducer field", "argument source", "argument field"]},

    "display order": {name: "display order", fields: ["id", "priority"]},
    "display name": {name: "display name", fields: ["id", "name"]},

    // Editor
    "editor item": {name: "editor item", fields: ["item", "type"], facts: [[1, "query"], [2, "ui"]]},
//     "active editor item": {name: "active editor item", fields: ["item"], facts: [[1]]},
    block: {name: "block", fields: ["query", "block", "view"]},

    // Examples
    "department heads": {name: "department heads", fields: ["department", "head"]},
    "employees": {name: "employees", fields: ["department", "name", "salary"]},
    "foo": {name: "foo", fields: ["a", "b"]},
    "book": {name: "book", fields: ["isbn", "title", "author", "price", "cost"]},

    // FourSquare
    "place": {name: "place", fields: ["place", "name", "priceRange"]},
    "placeToAddress": {name: "placeToAddress", fields: ["place", "street", "city", "state", "zip"]},
    "placeToHours": {name: "placeToHours", fields: ["place", "day", "start", "end"]},
    "placeToImage": {name: "placeToImage", fields: ["image", "place"]},
    "image": {name: "image", fields: ["image", "user", "url", "description", "tick"]},
    "taste": {name: "taste", fields: ["taste", "name"]},
    "placeToTaste": {name: "placeToTaste", fields: ["tick","place", "taste", "rank"]},
    "review": {name: "review", fields: ["tick", "place", "user", "text", "rating", "approved"]},
    "placeToRating": {name: "placeToRating", fields: ["place", "rating", "reviewCount"]},
    "user": {name: "user", fields: ["id", "token", "name"]},
    "userCheckin": {name: "userCheckin", fields: ["tick", "user", "place"]},

    //ui
    "uiComponentelement": {name: "uiComponentElement", fields: ["tx", "id", "component", "layer", "control", "left", "top", "right", "bottom"]},
    "uiComponentlayer": {name: "uiComponentLayer", fields: ["tx", "id", "component", "layer", "locked", "hidden"]},
    "uiComponentattribute": {name: "uiComponentAttribute", fields: ["tx", "id", "property", "value"]},
    "uiStyle": {name: "uiStyle", fields: ["tx", "id", "type", "element"]},
    "uiGroupBinding": {name: "uiGroupBinding", fields: ["group", "union"]},

  };

  // This index needs to be hardcoded for code.ix to work.
  ixer.addIndex("view to fields", "field", Indexing.create.collector([0]));

  ixer.addIndex("field to view", "field", Indexing.create.lookup([1, 0]));
  ixer.addIndex("display name", "display name", Indexing.create.lookup([0, 1]));
  ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
  ixer.addIndex("source", "source", Indexing.create.lookup([0, 1, false]));
  ixer.addIndex("view and source view to source", "source", Indexing.create.lookup([0, 2, false]));
  ixer.addIndex("view to sources", "source", Indexing.create.collector([0]));
  ixer.addIndex("source view to sources", "source", Indexing.create.collector([2]));
  ixer.addIndex("view to constraints", "constraint", Indexing.create.collector([1]));
  ixer.addIndex("constraint", "constraint", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint to view", "constraint", Indexing.create.lookup([0, 1]));
  ixer.addIndex("constraint left", "constraint left", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint right", "constraint right", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint operation", "constraint operation", Indexing.create.lookup([0, false]));
  ixer.addIndex("display order", "display order", Indexing.create.lookup([0, 1]));

  ixer.addIndex("block", "block", Indexing.create.lookup([0, false]));
  ixer.addIndex("block to query", "block", Indexing.create.lookup([1, 0]));
  ixer.addIndex("view to query", "block", Indexing.create.lookup([2, 0]));
  ixer.addIndex("view to block", "block", Indexing.create.lookup([2, 1]));
  ixer.addIndex("query to blocks", "block", Indexing.create.collector([0]));
  ixer.addIndex("query to views", "block", Indexing.create.collector([0, 2]));

  ixer.addIndex("editor item to type", "editor item", Indexing.create.lookup([0, 1]));

  // ui
  ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.latestLookup({keys: [1, false]}));
  ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
  ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.latestLookup({keys: [1, false]}));
  ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
  ixer.addIndex("uiLayerToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [3], uniqueness: [1]}));
  ixer.addIndex("uiSelection", "uiSelection", Indexing.create.latestLookup({keys: [2, 3, false]}));
  ixer.addIndex("uiSelectionElements", "uiSelectionElement", Indexing.create.collector([0]));
  ixer.addIndex("uiActiveLayer", "uiActiveLayer", Indexing.create.latestLookup({keys: [2, 1, 3]}));
  ixer.addIndex("uiBoxSelection", "uiBoxSelection", Indexing.create.latestLookup({keys: [1, false]}));
  ixer.addIndex("uiStyles", "uiStyle", Indexing.create.latestCollector({keys: [1], uniqueness: [1]}));
  ixer.addIndex("uiStyle", "uiStyle", Indexing.create.latestLookup({keys: [1, false]}));
  ixer.addIndex("uiElementToStyle", "uiStyle", Indexing.create.latestLookup({keys: [3, 2, false]}));
  ixer.addIndex("uiElementToStyles", "uiStyle", Indexing.create.latestCollector({keys: [3], uniqueness: [2]}));
  ixer.addIndex("uiStyleToAttr", "uiComponentAttribute", Indexing.create.latestLookup({keys: [1, 2, false]}));
  ixer.addIndex("uiStyleToAttrs", "uiComponentAttribute", Indexing.create.latestCollector({keys: [1], uniqueness: [2]}));
  ixer.addIndex("groupToBinding", "uiGroupBinding", Indexing.create.lookup([0, 1]));

  ixer.addIndex("uiElementToMap", "uiMap", Indexing.create.latestLookup({keys: [2, false]}));
  ixer.addIndex("uiMapAttr", "uiMapAttr", Indexing.create.lookup([0, 1, 2]));

  //---------------------------------------------------------
  // Data interaction code
  //---------------------------------------------------------

  var code = {
    name: function(id) {
      return ixer.index("display name")[id];
    },
    activeItemId: function() {
//       return (ixer.first("active editor item") || [])[0];
      return localState.activeItem;
    },
    nameToField(viewId, fieldName) {
      var fields = ixer.index("view to fields")[viewId];
      for(var ix = 0, len = fields.length; ix < len; ix++) {
        var fieldId = fields[ix][1]; // Hard-coded to bootstrap code.ix
        if(code.name(fieldId) === fieldName) {
          return fields[ix];
        }
      }
    },
    ix: function(viewId, fieldName) {
      var field = code.nameToField(viewId, fieldName);
      if(!field) { throw new Error("Field " + fieldName + " of view " + code.name(viewId) + " not found."); }
      var namedFieldId = field[1];

      var fields = ixer.index("view to fields")[viewId];
      for(var ix = 0; ix < fields.length; ix++) {
        var fieldId = fields[ix][1];
        fields[ix] = [ixer.index("display order")[fieldId], fieldId];
      }
      fields.sort(function(a, b) {
        return a[0] - b[0];
      });

      for(var ix = 0; ix < fields.length; ix++) {
        var fieldId = fields[ix][1];
        if(fieldId === namedFieldId) {
          return ix;
        }
      }
    },
    countSource: function(queryId, sourceViewId) {
      var blocks = ixer.index("query to blocks")[queryId] || [];
      var viewIds = blocks.map(function(block) {
        return block[code.ix("block", "view")];
      });
      var sources = viewIds.reduce(function(memo, viewId) {
        return memo.concat(ixer.index("view to sources")[viewId] || []);
      }, []);

      var count = sources.filter(function(source) {
        return source[code.ix("source", "source view")] === sourceViewId;
      }).length;

      return count;
    }
  };

  var diff = {
    remove: function remove(index, id) {
      var old = ixer.index(index)[id];
      return [["view", "removed", old]];
    },

    addView: function addView(viewId, view) {
      var diffs = [["display name", "inserted", [viewId, view.name]],
                   ["view", "inserted", [viewId, view.kind || "table"]]];
      for(var ix = 0; ix < view.fields.length; ix++) {
        var fieldName = view.fields[ix];
        var fieldId = fieldName + "-" + uuid().slice(0, 8);
        diffs.push(["field", "inserted", [viewId, fieldId, "output"]]); // @NOTE: Can this be any other kind?
        diffs.push(["display name", "inserted", [fieldId, fieldName]]);
        diffs.push(["display order", "inserted", [fieldId, ix]]);
      }
      for(var ix = 0; view.facts && ix < view.facts.length; ix++) {
        diffs.push([viewId, "inserted", view.facts[ix]]);
      }

      return diffs;
    },

    addViewBlock: function addBlock(queryId, sourceViewId) {
      var viewId = uuid();
      var blockId = uuid();
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, "join"]]];

      if(sourceViewId) {
        diffs.push.apply(diffs, diff.addViewSource(viewId, sourceViewId));
      }
      return diffs;
    },

    addViewSelection: function addViewSelection(viewId, sourceFieldId) {
      var fieldId = uuid();
      var sourceViewId = ixer.index("field to view")[sourceFieldId];
      return [["field", "inserted", [viewId, fieldId]],
              ["display order", "inserted", [fieldId, 0]],
              ["select", "inserted", [viewId, fieldId, sourceViewId, sourceFieldId]],
              ["display name", "inserted", [fieldId, code.name(sourceFieldId)]]];
    },
    addViewSource: function addViewSource(viewId, sourceViewId, kind) {
      var sourceId = kind || uuid();
      var queryId = ixer.index("view to query")[viewId];

      if(queryId === undefined) { queryId = code.activeItemId(); }
      var count = code.countSource(queryId, sourceViewId);
      var name = code.name(sourceViewId) + (count ? " (" + (count + 1) + ")" : "");

      var sourceId = uuid();
      return [["source", "inserted", [viewId, sourceId, sourceViewId]],
              ["display name", "inserted", [sourceId, name]],
              ["display order", "inserted", [sourceId, 0]]];
    },
    addViewConstraint: function addViewConstraint(viewId, opts) {
      var constraintId = uuid();
      var diffs = [["constraint", "inserted", [constraintId, viewId]]];
      // @FIXME: Stage incomplete constraint bits instead of committing them.
      if(opts.leftSource) { diffs.push(["constraint left", "inserted", [constraintId, opts.leftSource, opts.leftField || ""]]); }
      if(opts.rightSource) { diffs.push(["constraint right", "inserted", [constraintId, opts.rightSource, opts.rightField || ""]]); }
      if(opts.operation) { diffs.push(["constraint operation", "inserted", [constraintId, opts.operation]]); }
      return diffs;
    },

    updateViewConstraint: function updateViewConstraint(constraintId, opts) {
      // @FIXME: Stage incomplete constraint bits instead of committing them.
      var diffs = [];
      var sideSource = code.ix("constraint left", "left source");
      var sideField = code.ix("constraint left", "left field");

      var oldConstraint = ixer.index("constraint")[constraintId];
      if(oldConstraint && opts.view) {
        diffs.push(["constraint", "removed", oldConstraint]);
      }
      var oldConstraintLeft = ixer.index("constraint left")[constraintId];
      if(oldConstraintLeft && (opts.leftSource || opts.leftField)) {
        diffs.push(["constraint left", "removed", oldConstraintLeft]);
      }
      var oldConstraintRight = ixer.index("constraint right")[constraintId];
      if(oldConstraintRight && (opts.rightSource || opts.rightField)) {
        diffs.push(["constraint right", "removed", oldConstraintRight]);
      }
      var oldConstraintOperation = ixer.index("constraint operation")[constraintId];
      if(oldConstraintOperation && opts.operation) {
        diffs.push(["constraint operation", "removed", oldConstraintOperation]);
      }

      if(opts.view) { diffs.push(["constraint", "inserted", [constraintId, opts.view]]); }
      if(opts.leftField || opts.leftSource) {
        diffs.push(["constraint left", "inserted", [constraintId,
                                                    opts.leftSource || oldConstraintLeft[sideSource],
                                                    opts.leftField || oldConstraintLeft[sideField]]]);
      }
      if(opts.rightField || opts.rightSource) {
        diffs.push(["constraint right", "inserted", [constraintId,
                                                     opts.rightSource || oldConstraintRight[sideSource],
                                                     opts.rightField || oldConstraintRight[sideField]]]);
      }
      if(opts.operation) { diffs.push(["constraint operation", "inserted", [constraintId, opts.operation]]); }

      return diffs;
    }
  };

  function injectViews(tables, ixer) {
    var diffs = [];
    var add = function(viewId, view) {
      diffs = diffs.concat(diff.addView(viewId, view));
    };

    for(var tableId in tables) {
      add(tableId, tables[tableId]);
    }

    ixer.handleDiffs(diffs);
  }

  function dispatch(evt, info) {
    console.info("[dispatch]", evt, info);

    var diffs = [];
    switch(evt) {
      case "addViewBlock":
        diffs = diff.addViewBlock(code.activeItemId(), info.sourceId);
        break;
      case "addViewSelection":
        diffs = diff.addViewSelection(info.viewId, info.fieldId);
        break;
      case "addViewSource":
        diffs = diff.addViewSource(info.viewId, info.sourceId);
        break;
      case "addViewConstraint":
        diffs = diff.addViewConstraint(info.viewId, {leftSource: info.sourceId});
        break;
      case "updateViewConstraint":
        var viewId = ixer.index("constraint to view")[info.constraintId];

        // @TODO: redesign this to pass in opts directly.
        var opts = {};
        if(info.type === "field") {
          var sourceViewId = ixer.index("field to view")[info.value];
          var source = ixer.index("view and source view to source")[viewId][sourceViewId];
          opts.leftField = info.value;
          opts.leftSource = source[code.ix("source", "source")];
        } else if(info.type === "value") {
          var sourceViewId = ixer.index("field to view")[info.value];
          var source = ixer.index("view and source view to source")[viewId][sourceViewId];
          opts.rightField = info.value;
          opts.rightSource = source[code.ix("source", "source")];
        } else if(info.type === "operation") {
          opts.operation = info.value;
        }
        console.log(opts);
        diffs = diff.updateViewConstraint(info.constraintId, opts);
        break;
      default:
        console.error("Unhandled dispatch:", evt, info);
        break;
    }
    if(diffs && diffs.length) {
      ixer.handleDiffs(diffs);
      render();
    } else {
      console.warn("No diffs to index, skipping.");
    }
  }

  //---------------------------------------------------------
  // Local state
  //---------------------------------------------------------

  var localState = {activeItem: 1,
                    showMenu: false};

  //---------------------------------------------------------
  // Root
  //---------------------------------------------------------

  function root() {
    var itemId = code.activeItemId();
    var type = ixer.index("editor item to type")[itemId];

    if(type === "query") {
      return queryWorkspace(itemId);
    } else if(type === "ui") {
      return uiWorkspace(itemId);
    } else if(type === "table") {
      return tableWorkspace(itemId);
    }
  }

  function genericWorkspace(klass, controls, options, content) {
    var finalControls = [{c: "menu-toggle", text: "open"}].concat(controls);
    return {id: "root",
            c: "root " + klass,
            children: [
              {c: "control-bar", children: finalControls},
              {c: "option-bar", children: options},
              {c: "content", children: [content]}
            ]};
  }

  function controlGroup(controls) {
    return {c: "control-group", children: controls};
  }

  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  function tableWorkspace(tableId) {
    return genericWorkspace("", [], [],
                            {c: "table-editor",
                             children: [
                               {text: "table!"}
                             ]});
  }

  //---------------------------------------------------------
  // UI workspace
  //---------------------------------------------------------

  function uiWorkspace(componentId) {
    var removed = ixer.index("remove");
    var elements = ixer.index("uiComponentToElements")[componentId] || [];
    var layers = ixer.index("uiComponentToLayers")[componentId];
    var layerLookup = ixer.index("uiComponentLayer");
    var activeLayerId = ixer.index("uiActiveLayer")[client] ? ixer.index("uiActiveLayer")[client][componentId] : undefined;
    var activeLayer = layers[0];
    if(activeLayerId && layerLookup[activeLayerId]) {
      activeLayer = layerLookup[activeLayerId];
    }

    var attrsIndex = ixer.index("uiStyleToAttrs");
    var stylesIndex = ixer.index("uiElementToStyles");

    var selectionInfo = getSelectionInfo(componentId, true);
    var els = elements.map(function(cur) {
      if(removed[cur[0]]) return;
      var id = cur[1];
      var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;

      var attrs = [];
      var styles = stylesIndex[id];
      for(var ix = 0, len = styles.length; ix < len; ix++) {
        var style = styles[ix];
        attrs.push.apply(attrs, attrsIndex[style[1]]);
      }

      return control(cur, attrs, selected, layerLookup[cur[3]]);
    });
    if(selectionInfo) {
      els.push(selection(selectionInfo));
      els.push(uiGrid(componentId, activeLayer[3]));
    }
    var box = ixer.index("uiBoxSelection")[componentId];
    if(box) {
      if(!ixer.index("remove")[box[0]] && box[4] != -1) {
        var boxEl = {c: "ui-box-selection",
                     left: (box[2] <= box[4] ? box[2] : box[4]),
                     right: (box[2] > box[4] ? box[2] : box[4]),
                     top: (box[3] <= box[5] ? box[3] : box[5]),
                     bottom: (box[3] > box[5] ? box[3] : box[5])};
        boxEl.width = boxEl.right - boxEl.left;
        boxEl.right = undefined;
        boxEl.height = boxEl.bottom - boxEl.top;
        boxEl.bottom = undefined;
        els.push(boxEl);
      }
    }
    return genericWorkspace("query", [uiControls(componentId)], [],
                            {c: "ui-editor",
                             children: [
                               {c: "ui-canvas", componentId: componentId, children: els, mousedown: startBoxSelect, mousemove: updateBoxSelect, mouseup: endBoxSelect, mouseleave: endBoxSelect},
                             ]});
  }

  var uiControlInfo = [{text: "text", icon: ""},
                       {text: "box", icon: ""},
                       {text: "button", icon: ""},
                       {text: "input", icon: ""},
                       {text: "map", icon: ""}];

  function uiControls(componentId) {
    var items = uiControlInfo.map(function(cur) {
      return {c: "control", click: addControl, control: cur.text, componentId: componentId,
              children: [
                {c: "icon"},
                {text: cur.text}
              ]};
    })
    return controlGroup(items);
  }

  function addControl(e, elem) {
  }

  //---------------------------------------------------------
  // Query workspace
  //---------------------------------------------------------

  function queryWorkspace(queryId) {
    return genericWorkspace("query", [queryControls(queryId)], [],
                            {c: "query-editor",
                             children: [
                               {c: "query-workspace", children: [
                                 treePane(queryId),
                                 editor(queryId),
                                 inspectorPane(queryId)
                               ]},
                               queryResult(queryId)
                             ]});
  }

  //---------------------------------------------------------
  // Tree + Toolbar
  //---------------------------------------------------------

  function treePane(queryId) {
    var items = [];

//     var viewlets = ixer.index("queryToViewlets")[queryId];
//     for(var ix = 0; ix < viewlets.length; ix++) {
//       var id = viewlets[ix][0];
//       items.push(treeItem(code.name(id) || "Untitled", id, "view"));
//     }

//     items.push({t: "hr", c: "sep"});

    var views = ixer.facts("view");
    for(var ix = 0; ix < views.length; ix++) {
      var id = views[ix][code.ix("view", "view")];
      items.push(treeItem(code.name(id) || "Untitled", id, "view"));
    }

    return {c: "tree pane", children: items};
  }

  function treeItem(name, value, type, opts) {
    opts = opts || {};
    return {c: "tree-item " + opts.c, value: value, type: type, draggable: true, dragstart: dragItem, children: [
      (opts.icon ? {c: "opts.icon"} : undefined),
      (name ? {text: name} : undefined),
      opts.content
    ]};
  }

  function dragItem(evt, elem) {
    evt.dataTransfer.setData("type", elem.type || "tree-item");
    evt.dataTransfer.setData("value", elem.value);
  }

  function queryControls(queryId) {
    var items = ["filter", "aggregate"].map(queryToolbarItem);
    return controlGroup(items);
  }

  function queryToolbarItem(type) {
    return treeItem(type, type, "tool", {c: "control tool query-tool"});
  }

  //---------------------------------------------------------
  // Editor
  //---------------------------------------------------------
  function editor(queryId) {
    var blocks = ixer.index("query to blocks")[queryId] || [];
    var items = [];
    for(var ix = 0; ix < blocks.length; ix++) {
      var viewId = blocks[ix][code.ix("block", "view")];
      items.push(viewBlock(viewId));
    }

    return {c: "workspace", drop: editorDrop, dragover: preventDefault, children: items.length ? items : [
      {c: "feed", text: "Feed me sources"}
    ]};
  }

  function editorDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "view") { return; }
    var sourceId = evt.dataTransfer.getData("value");
    dispatch("addViewBlock", {sourceId: sourceId});
  }

  function viewBlock(viewId) {
    var sources = ixer.index("view to sources")[viewId] || [];
    var sourceIdIx = code.ix("source", "source");
    sources.sort(function(a, b) {
      var idA = a[sourceIdIx];
      var idB = b[sourceIdIx];
      var orderA = ixer.index("display order")[idA];
      var orderB = ixer.index("display order")[idB];
      if(orderA - orderB) { return orderA - orderB; }
      else { return idA > idB }
    });
    var sourceItems = sources.map(function(source) {
      return viewSource(viewId, source);
    });

    var fields = ixer.index("view to fields")[viewId] || [];
    var selectionItems = fields.map(function(field) {
      var id = field[code.ix("field", "field")];
      return treeItem(code.name(id) || "Untitled", id, "queryField", {c: "pill field"});
    });
    if(!selectionItems.length) {
      selectionItems.push({text: "Drag local fields into me to make them available in the query."});
    }

    return {c: "block view-block", viewId: viewId, drop: viewBlockDrop, dragover: preventDefault, children: [
      {t: "h3", c: "", text: "Untitled Block"},
      {c: "block-section sources", children: sourceItems},
      {c: "block-section selections tree bar", viewId: viewId, drop: viewSelectionsDrop, dragover: preventDefault, children: selectionItems}
    ]};
  }

  function viewBlockDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "view") { return; }
    var viewId = elem.viewId;
    var sourceId = evt.dataTransfer.getData("value");
    if(viewId === sourceId) { return console.error("Cannot join view with parent."); }
    dispatch("addViewSource", {viewId: viewId, sourceId: sourceId});
    evt.stopPropagation();
  }

  function viewSelectionsDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    console.log("viewSelectionsDrop", type);
    if(type !== "localField") { return; }
    var viewId = elem.viewId;
    var fieldId = evt.dataTransfer.getData("value");
    dispatch("addViewSelection", {viewId: viewId, fieldId: fieldId});
    evt.stopPropagation();
  }

  function viewSource(viewId, source) {
    var sourceId = source[code.ix("source", "source")];
    var queryId = ixer.index("view to query")[viewId];
    var fields = ixer.index("view to fields")[viewId] || [];
    var fieldItems = fields.map(function(field) {
      var id = field[code.ix("field", "field")];
      return treeItem(code.name(id) || "Untitled", id, "localField", {c: "pill field"});
    });

    var constraintIdIx = code.ix("constraint", "constraint");
    var constraints = ixer.index("view to constraints")[viewId] || [];
    constraints = constraints.filter(function(constraint) {
      var id = constraint[constraintIdIx];
      var left = ixer.index("constraint left")[id];
      if(!left) { return; }
      var leftSource = left[code.ix("constraint left", "left source")];
      return leftSource === sourceId;
    });

    var constraintItems = constraints.map(function(constraint) {
      var id = constraint[constraintIdIx];
      return {c: "view-constraint", children: [
        token.sourceField({key: "field", sourceId: sourceId, constraintId: id}, updateViewConstraint),
        token.operation({key: "operation", sourceId: sourceId, constraintId: id}, updateViewConstraint),
        token.blockField({key: "value", sourceId: sourceId, constraintId: id}, updateViewConstraint)
      ]};
    });

    var viewSourceItems = [{t: "h4", c: "view-source-title", text: code.name(sourceId) || "Untitled"}].concat(fieldItems);
    return {c: "view-source", viewId: viewId, sourceId: sourceId, drop: viewSourceDrop, dragover: preventDefault, children: [
      {c: "tree bar view-source-row", children: viewSourceItems},
      (constraintItems.length ? {c: "view-constraints", children: constraintItems} : undefined)
    ]};
  }

  function viewSourceDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var tool = evt.dataTransfer.getData("value");
    if(type === "tool" && tool === "filter") {
      var viewId = elem.viewId;
      var sourceId = elem.sourceId;
      dispatch("addViewConstraint", {viewId: viewId, sourceId: sourceId});
      evt.stopPropagation();
    }
  }

  function updateViewConstraint(evt, elem) {
    var id = elem.constraintId;
    dispatch("updateViewConstraint", {constraintId: id, type: elem.key, value: elem.value});
    stopEditToken(evt, elem);
    evt.stopPropagation();
  }

  //---------------------------------------------------------
  // Tokens
  //---------------------------------------------------------

  var tokenState = {};

  var token = {
    sourceField: function(params, onChange) {
      var state = tokenState[params.constraintId];
      if(state) { state = state[params.key]; }
      var left = ixer.index("constraint left")[params.constraintId] || [];
      var leftSource = left[code.ix("constraint left", "left source")];
      var leftField = left[code.ix("constraint left", "left field")];
      var value = code.name(leftField);

      return {c: "token field",
              key: params.key,
              sourceId: params.sourceId,
              constraintId: params.constraintId,
              children: [{c: "name", text: value || "<field>"},
                         (state === 1) ? tokenEditor.sourceField(params, onChange) : undefined],
              click: editToken,
              dragover: preventDefault,
              drop: tokenSourceFieldDrop};
    },
    operation: function(params, onChange) {
      var state = tokenState[params.constraintId];
      if(state) { state = state[params.key]; }
      var op = ixer.index("constraint operation")[params.constraintId] || [];
      var operation = op[code.ix("constraint operation", "operation")];

      return {c: "token operation",
              key: params.key,
              sourceId: params.sourceId,
              constraintId: params.constraintId,
              children: [{c: "name", text: operation || "<op>"},
                         (state === 1) ? tokenEditor.operation(params, onChange) : undefined],
              click: editToken};
    },
    blockField: function(params, onChange) {
      var state = tokenState[params.constraintId];
      if(state) { state = state[params.key]; }
      var right = ixer.index("constraint right")[params.constraintId] || [];
      var rightSource = right[code.ix("constraint right", "right source")];
      var rightField = right[code.ix("constraint right", "right field")];
      var value = rightSource ? code.name(rightField) + " from " + code.name(rightSource) : rightField; //@FIXME: implicit constant table link.

      return {c: "token field",
              key: params.key,
              sourceId: params.sourceId,
              constraintId: params.constraintId,
              children: [{c: "name", text: value || "<field>"},
                         (state === 1) ? tokenEditor.blockField(params, onChange) : undefined],
              click: editToken,
              dragover: preventDefault,
              drop: tokenBlockFieldDrop};
    }
  };

  // @FIXME: Simplify this by passing source information along with field.
  function tokenSourceFieldDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "localField") { return; }
    var sourceId = elem.sourceId;
    var fieldId = evt.dataTransfer.getData("value");
    var draggedViewId = ixer.index("field to view")[fieldId];
    var sourcesContainingDraggedView = ixer.index("source view to sources")[draggedViewId];
    var sourceIdIx = code.ix("source", "source");
    var isLocal = sourcesContainingDraggedView.some(function(source) {
      return source[sourceIdIx] === sourceId;
    });
    if(!isLocal) { return; }
    // @NOTE: This probably shouldn't be hardcoded.
    dispatch("updateViewConstraint", {constraintId: elem.key, type: "field", value: fieldId});
  }

  // @FIXME: Simplify this by passing source information along with field.
  function tokenBlockFieldDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var fieldId = evt.dataTransfer.getData("value");
    var sourceId = elem.sourceId;

    if(type === "localField") {
      var draggedViewId = ixer.index("field to view")[fieldId];
      var sourcesContainingDraggedView = ixer.index("source view to sources")[draggedViewId];
      var sourceIdIx = code.ix("source", "source");
      var isLocal = sourcesContainingDraggedView.some(function(source) {
        return source[sourceIdIx] === sourceId;
      });
      if(!isLocal) { return; }

      dispatch("updateViewConstraint", {constraintId: elem.key, type: "type", value: "filter"});
      dispatch("updateViewConstraint", {constraintId: elem.key, type: "value", value: fieldId});
    }
  }

  function editToken(evt, elem) {
    var state = tokenState[elem.constraintId];
    if(!state) { state = tokenState[elem.constraintId] = {}; }
    state[elem.key] = 1;
    render();
  }

  function stopEditToken(evt, elem) {
    var state = tokenState[elem.constraintId];
    state[elem.key] = 0;
    render();
  }

  var tokenEditor = {
    sourceField: function(params, onChange) {
      var viewId = ixer.index("constraint to view")[params.constraintId];
      var fields = getSourceFields(viewId, params.sourceId);
      var items = fields.map(function fieldItem(field) {
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
        item.constraintId = params.constraintId;
        return item;
      });
      var select = selector(items, {c: "field", key: params.key, tabindex: -1, constraintId: params.constraintId, focus: true}, stopEditToken);
      return select;
    },
    operation: function(params, onChange) {
      var items = ["=", "<", "≤", ">", "≥", "≠"].map(function(rel) {
        var item = selectorItem({c: "operation", key: params.key, name: rel, value: rel}, onChange);
        item.constraintId = params.constraintId;
        return item;
      });
      var select = selector(items, {c: "operation", key: params.key, tabindex: -1, constraintId: params.constraintId, focus: true}, stopEditToken);
      return select;
    },
    blockField: function(params, onChange) {
      var viewId = ixer.index("constraint to view")[params.constraintId];
      var fields = getBlockFields(viewId);
      var items = fields.map(function fieldItem(field) {
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
        item.constraintId = params.constraintId;
        return item;
      });
      var select = selector(items, {c: "field", key: params.key, tabindex: -1, constraintId: params.constraintId, focus: true}, stopEditToken);
      return select;
    }
  };

  function getSourceFields(viewId, sourceId) {
    var source = ixer.index("source")[viewId][sourceId];
    var sourceViewId = source[code.ix("source", "source view")];
    return ixer.index("view to fields")[sourceViewId] || [];
  }

  function getBlockFields(viewId) {
    var sources = ixer.index("view to sources")[viewId] || [];
    return sources.reduce(function(memo, source) {
      var sourceViewId = source[code.ix("source", "source view")];
      memo.push.apply(memo, ixer.index("view to fields")[sourceViewId]);
      return memo;
    }, []);
  }

  function getQueryFields(queryId, exclude) {
    var viewIds = ixer.index("query to views")[queryId] || [];
    return viewIds.reduce(function(memo, viewId) {
      if(viewId !== exclude && viewId) {
        memo.push.apply(memo, getBlockFields(viewId));
      }

      return memo;
    }, []);
  }

  function selector(options, opts, onBlur) {
    return {t: "ul", c: "selector " + opts.c, tabindex: opts.tabindex, key: opts.key,
            postRender: (opts.focus ? focusOnce : undefined), blur: onBlur, children: options};
  }

  function selectorItem(opts, onChange) {
    return {t: "li", c: "selector-item field " + opts.c, key: opts.key, text: opts.name, value: opts.value, click: onChange};
  }

  //---------------------------------------------------------
  // Inspector
  //---------------------------------------------------------

  function inspectorPane(queryId) {
    return {c: "inspector pane"};
  }

  //---------------------------------------------------------
  // Result
  //---------------------------------------------------------

  function queryResult(queryId) {
    return {c: "query-result"};
  }




  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------
  injectViews(tables, ixer);
  ixer.handleDiffs(diff.addViewBlock(code.activeItemId()));
  render();

  return { container: renderer.content, ixer: ixer };
})(window, microReact, Indexing);
