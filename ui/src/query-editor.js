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
    "editor item": {name: "editor item", fields: ["item", "type"], facts: [[1, "query"]]},
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
    "uiComponentElement": {name: "uiComponentElement", fields: ["tx", "id", "component", "layer", "control", "left", "top", "right", "bottom"], facts: []},
    "uiComponentLayer": {name: "uiComponentLayer", fields: ["tx", "id", "component", "layer", "locked", "hidden"], facts: []},
    "uiComponentAttribute": {name: "uiComponentAttribute", fields: ["tx", "id", "property", "value"]},
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

  ixer.addIndex("block", "block", Indexing.create.lookup([1, false]));
  ixer.addIndex("block to query", "block", Indexing.create.lookup([1, 0]));
  ixer.addIndex("view to query", "block", Indexing.create.lookup([2, 0]));
  ixer.addIndex("view to block", "block", Indexing.create.lookup([2, 1]));
  ixer.addIndex("query to blocks", "block", Indexing.create.collector([0]));
  ixer.addIndex("query to views", "block", Indexing.create.collector([0, 2]));

  ixer.addIndex("editor item to type", "editor item", Indexing.create.lookup([0, 1]));

  // ui
  ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.lookup([1, false]));
  ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([2]));
  ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.latestLookup({keys: [1, false]}));
  ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.latestCollector({keys: [2], uniqueness: [1]}));
  ixer.addIndex("uiLayerToElements", "uiComponentElement", Indexing.create.latestCollector({keys: [3], uniqueness: [1]}));
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
    removeViewSource(viewId, sourceId) {
      var source = ixer.index("source")[viewId][sourceId];
      var diffs = [["source", "removed", source]];
      var constraints = ixer.index("view to constraints")[viewId] || [];
      for(var ix = 0; ix < constraints.length; ix++) {
        var constraintId = constraints[ix][code.ix("constraint", "constraint")];
        diffs = diffs.concat(diff.removeViewConstraint(constraintId));
      }
      return diffs;
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
    },
    duplicateElement: function(element, id, txId) {
      var diffs = [];
      var neue = element.slice();
      //generate new ids for the element, everything else remains
      neue[0] = txId;
      neue[1] = id;
      diffs.push(["uiComponentElement", "inserted", neue]);
      //duplicate all of the attributes
      var styles = ixer.index("uiElementToStyles")[element[1]];
      if(styles) {
        styles.forEach(function(cur) {
          var style = cur.slice();
          style[0] = txId;
          style[3] = id;
          diffs.push(["uiStyle", "inserted", style]);
        });
      }
      return diffs;
    },
    removeViewConstraint: function removeConstraint(constraintId) {
      var diffs = [];
      var oldConstraint = ixer.index("constraint")[constraintId];
      var oldConstraintLeft = ixer.index("constraint left")[constraintId];
      var oldConstraintRight = ixer.index("constraint right")[constraintId];
      var oldConstraintOperation = ixer.index("constraint operation")[constraintId];
      if(oldConstraint) { diffs.push(["constraint", "removed", oldConstraint]); }
      if(oldConstraintLeft) { diffs.push(["constraint left", "removed", oldConstraintLeft]); }
      if(oldConstraintRight) { diffs.push(["constraint right", "removed", oldConstraintRight]); }
      if(oldConstraintOperation) { diffs.push(["constraint operation", "removed", oldConstraintOperation]); }
      return diffs;
    }
  };

  function injectViews(tables, ixer) {
    var diffs = [];
    var add = function(viewId, view) {
      diffs = diffs.concat(diff.addView(viewId, view));
      diffs.push(["editor item", "inserted", [viewId, "table"]]);
    };

    for(var tableId in tables) {
      add(tableId, tables[tableId]);
    }

    ixer.handleDiffs(diffs);
  }

  function dispatch(evt, info) {
//         console.info("[dispatch]", evt, info);
    var txId = ++localState.txId;

    var diffs = [];
    switch(evt) {
      case "addTable":
        var id = uuid();
        var fieldId = uuid();
        diffs.push(["editor item", "inserted", [id, "table"]],
                   ["view", "inserted", [id, "table"]],
                   ["field", "inserted", [id, fieldId, "output"]],
                   ["display order", "inserted", [fieldId, 0]],
                   ["display name", "inserted", [id, "Untitled Table"]],
                   ["display name", "inserted", [fieldId, "A"]]);
        localState.activeItem = id;
        break;
      case "addQuery":
        var id = uuid();
        diffs.push(["editor item", "inserted", [id, "query"]],
                   ["display name", "inserted", [id, "Untitled Query"]]);
        localState.activeItem = id;
        break;
      case "addUi":
        var id = uuid();
        diffs.push(["editor item", "inserted", [id, "ui"]],
                   ["display name", "inserted", [id, "Untitled Page"]],
                   ["uiComponentLayer", "inserted", [txId, uuid(), id, 0, false, false]]);
        localState.activeItem = id;
        break;
      case "rename":
        var id = info.id;
        diffs.push(["display name", "inserted", [id, info.value]],
                   ["display name", "removed", [id, code.name(id)]])
        break;
      case "addViewBlock":
        diffs = diff.addViewBlock(code.activeItemId(), info.sourceId);
        break;
      case "removeViewBlock":
        var view = ixer.index("view")[info.viewId];
        var blockId = ixer.index("view to block")[info.viewId];
        var block = ixer.index("block")[blockId];
        var sources = ixer.index("view to sources")[info.viewId];
        diffs = [["view", "removed", view],
                 ["block", "removed", block]];
        for(var ix = 0; ix < sources.length; ix++) {
          var sourceId = sources[ix][code.ix("source", "source")];
          diffs = diffs.concat(diff.removeViewSource(info.viewId, sourceId));
        }
        break;
      case "addViewSelection":
        diffs = diff.addViewSelection(info.viewId, info.fieldId);
        break;
      case "addViewSource":
        diffs = diff.addViewSource(info.viewId, info.sourceId);
        break;
      case "removeViewSource":
        diffs = diff.removeViewSource(info.viewId, info.sourceId);
        break;
      case "addViewConstraint":
        diffs = diff.addViewConstraint(info.viewId, {operation: "=", leftSource: info.leftSource, leftField: info.leftField});
        break;
      case "addUiComponentElement":
        var elemId = uuid();
        var neue = [txId, elemId, info.componentId, info.layerId, info.control, info.left, info.top, info.right, info.bottom];
        var appStyleId = uuid();
        var typStyleId = uuid();
        diffs.push(["uiComponentElement", "inserted", neue]);
        diffs.push(["uiStyle", "inserted", [txId, appStyleId, "appearance", elemId]],
                   ["uiStyle", "inserted", [txId, typStyleId, "typography", elemId]]);

        // @TODO: Instead of hardcoding, have a map of special element diff handlers.
        if(info.control === "map") {
          var mapId = uuid();
          diffs.push(["uiMap", "inserted", [txId, mapId, elemId, 0, 0, 4]],
                     ["uiMapAttr", "inserted", [txId, mapId, "lat", 0]],
                     ["uiMapAttr", "inserted", [txId, mapId, "lng", 0]],
                     ["uiMapAttr", "inserted", [txId, mapId, "zoom", 0]]);
        }
        localState.uiSelection = [elemId];
        break;
      case "resizeSelection":
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        var ratioX = info.widthRatio;
        var ratioY = info.heightRatio;
        var oldBounds = info.oldBounds;
        var neueBounds = info.neueBounds;
        sel.forEach(function(cur) {
          var elem = elementIndex[cur];
          var neue = elem.slice();
          neue[0] = txId;
          //We first find out the relative position of the item in the selection
          //then adjust by the given ratio and finall add the position of the selection
          //back in to get the new absolute coordinates
          neue[5] = Math.floor(((neue[5] - oldBounds.left) * ratioX) + neueBounds.left); //left
          neue[7] = Math.floor(((neue[7] - oldBounds.right) * ratioX) + neueBounds.right); //right
          neue[6] = Math.floor(((neue[6] - oldBounds.top) * ratioY) + neueBounds.top); //top
          neue[8] = Math.floor(((neue[8] - oldBounds.bottom) * ratioY) + neueBounds.bottom); //bottom
          diffs.push(["uiComponentElement", "inserted", neue], ["uiComponentElement", "removed", elem]);
        });
        break;
      case "moveSelection":
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        var diffX = info.diffX || 0;
        var diffY = info.diffY || 0;
        sel.forEach(function(cur) {
          var elem = elementIndex[cur];
          var neue = elem.slice();
          neue[0] = txId;
          neue[3] = info.layer || neue[3];
          neue[5] += diffX; //left
          neue[7] += diffX; //right
          neue[6] += diffY; //top
          neue[8] += diffY; //bottom
          diffs.push(["uiComponentElement", "inserted", neue],
                     ["uiComponentElement", "removed", elem]);
        });
        break;
      case "deleteSelection":
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        sel.forEach(function(cur) {
          var elem = elementIndex[cur];
          diffs.push(["uiComponentElement", "removed", elem]);
        });
        localState.uiSelection = null;
        break;
      case "setAttributeForSelection":
        var style = getUiPropertyType(info.property);
        if(!style) { throw new Error("Unknown attribute type for property:", info.property, "known types:", uiProperties); }

        var sel = localState.uiSelection;
        sel.forEach(function(cur) {
          var id = cur;
          var styleId = ixer.index("uiElementToStyle")[id][style][1];
          var oldProps = ixer.index("uiStyleToAttr")[styleId];
          if(oldProps) {
            diffs.push(["uiComponentAttribute", "removed", oldProps]);
          }
          diffs.push(["uiComponentAttribute", "inserted", [txId, styleId, info.property, info.value, false]]);
        });
        break;
      case "setSelectionStyle":
        var sel = localState.uiSelection;
        sel.forEach(function(cur) {
          diffs.push(["uiStyle", "inserted", [txId, info.style, info.type, cur[1]]]);
        });
        break;
      case "duplicateSelection":
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        sel.forEach(function(cur) {
          var elem = elementIndex[cur];
          var neueId = uuid();
          diffs.push.apply(diffs, diff.duplicateElement(elem, neueId, localState.txId++));
        });
        break;
      case "updateViewConstraint":
        var viewId = ixer.index("constraint to view")[info.constraintId];

        // @TODO: redesign this to pass in opts directly.
        var opts = {};
        if(info.type === "left") {
          opts.leftField = info.value;
          opts.leftSource = info.source;
        } else if(info.type === "right") {
          opts.rightField = info.value;
          opts.rightSource = info.source;
        } else if(info.type === "operation") {
          opts.operation = info.value;
        }
        diffs = diff.updateViewConstraint(info.constraintId, opts);
        break;
      case "removeViewConstraint":
        diffs = diff.removeViewConstraint(info.constraintId);
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

  var localState = {txId: 0,
                    uiActiveLayer: null,
                    activeItem: 1,
                    showMenu: true,
                    uiGridSize: 10};

  //---------------------------------------------------------
  // Root
  //---------------------------------------------------------

  function root() {
    var itemId = code.activeItemId();
    var type = ixer.index("editor item to type")[itemId];

    var workspace;
    if(type === "query") {
      workspace = queryWorkspace(itemId);
    } else if(type === "ui") {
      workspace = uiWorkspace(itemId);
    } else if(type === "table") {
      workspace = tableWorkspace(itemId);
    }
    return {id: "root", c: "root", children: [
      editorItemList(itemId),
      workspace,
    ]};
  }

  function editorItemList(itemId) {
    var items = ixer.facts("editor item").map(function(cur) {
      var id = cur[0];
      var type = cur[1];
      var klass = "editor-item " + type;
      var icon = "ion-grid";
      if(type === "query") {
        icon = "ion-cube";
      } else if(type === "ui") {
        icon = "ion-image";
      }
      if(itemId === id) {
        klass += " selected";
      }
      return {c: klass, click: selectEditorItem, dblclick: closeSelectEditorItem, dragData: {value: id, type: "view"}, itemId: id, draggable: true, dragstart: dragItem, children: [
        {c: "icon " + icon},
        {text: code.name(id)},
      ]};
    })
    var width = 0;
    if(localState.showMenu) {
      width = 200;
    }
    return {c: "editor-item-list", width:width, children: [
      {c: "title", click: toggleMenu, text: "items"},
      {c: "adder", children: [
        {c: "button table", click: addItem, event: "addTable", children: [
          {c: "ion-grid"},
          {c: "ion-plus"},
        ]},
        {c: "button query", click: addItem, event: "addQuery", children: [
          {c: "ion-cube"},
          {c: "ion-plus"},
        ]},
        {c: "button ui", click: addItem, event: "addUi", children: [
          {c: "ion-image"},
          {c: "ion-plus"},
        ]},
      ]},
      {c: "items", children: items}
    ]};
  }

  function addItem(e, elem) {
    dispatch(elem.event, {});
  }

  function selectEditorItem(e, elem) {
    localState.activeItem = elem.itemId;
    render();
  }

  function closeSelectEditorItem(e, elem) {
    localState.showMenu = false;
    selectEditorItem(e, elem);
  }

  function genericWorkspace(klass, controls, options, content) {
    var finalControls = controls;
    if(!localState.showMenu) {
      var finalControls = [{c: "menu-toggle", click: toggleMenu, text: "items"}].concat(controls);
    }
    return {id: "workspace",
            c: "workspace-container " + klass,
            children: [
              {c: "control-bar", children: finalControls},
              {c: "option-bar", children: options},
              {c: "content", children: [content]}
            ]};
  }

  function toggleMenu() {
    localState.showMenu = !localState.showMenu;
    render();
  }

  function controlGroup(controls) {
    return {c: "control-group", children: controls};
  }

  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  function tableWorkspace(tableId) {
    var fields = ixer.index("view to fields")[tableId].map(function(cur) {
      return {name: code.name(cur[1]), id: cur[1]};
    });
    var rows = ixer.facts(tableId);
    //     var adderRows = (ixer.index("adderRows")[tableId] || []).filter(function(row) {
    //       var txId = row[0];
    //       return !ixer.index("remove")[txId];
    //     });
    return genericWorkspace("",
                            [],
                            [input(code.name(tableId), tableId, rename, rename)],
                            {c: "table-editor",
                             children: [
                               virtualizedTable(tableId, fields, rows, [])
                             ]});
  }

  function rename(e, elem) {
    var value = e.currentTarget.textContent;
    if(value !== code.name(elem.key)) {
      dispatch("rename", {value: value, id: elem.key});
    }
  }

  function virtualizedTable(id, fields, rows, adderRows) {
    var ths = fields.map(function(cur) {
      var oninput, onsubmit;
      if(cur.id) {
        oninput = onsubmit = rename;
      }
      return {c: "header", children: [input(cur.name, cur.id, oninput, onsubmit)]};
    });
    // @NOTE: We check for the existence of adderRows to determine if the table is editable. This is somewhat surprising.
    var isEditable = adderRows && adderRows.length;
    var trs = [];
    rows.forEach(function(cur) {
      var tds = [];
      for(var tdIx = 0, len = cur.length; tdIx < len; tdIx++) {
        tds[tdIx] = {c: "field"};

        // @NOTE: We can hoist this if perf is an issue.
        if(isEditable) {
          tds[tdIx].children = [input(cur[tdIx], {row: cur, ix: tdIx, view: id}, updateRow)];
        } else {
          tds[tdIx].text = cur[tdIx];
        }
      }
      trs.push({c: "row", children: tds});
    })
    adderRows.forEach(function(adder) {
      var cur = adder[3];
      var tds = [];
      for(var i = 0, len = fields.length; i < len; i++) {
        tds[i] = {c: "field", children: [input(cur[i], {row: adder, ix: i}, updateAdder)]};
      }
      trs.push({c: "row", children: tds});
    });
    //   trs.push({id: "spacer2", c: "spacer", height: Math.max(totalRows - start - numRows, 0) * itemHeight});
    return {c: "table", children: [
      {c: "headers", children: ths},
      {c: "rows", children: trs}
    ]};
  }


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
    return {c: "input text-input", contentEditable: true, input: oninput, text: value, key: key, blur: blur, keydown: keydown};
  }

  //---------------------------------------------------------
  // UI workspace
  //---------------------------------------------------------

  function uiWorkspace(componentId) {
    var elements = ixer.index("uiComponentToElements")[componentId] || [];
    var layers = ixer.index("uiComponentToLayers")[componentId] || [];
    var layerLookup = ixer.index("uiComponentLayer");
    var activeLayerId = localState.uiActiveLayer;
    var activeLayer = layers[0];
    if(activeLayerId && layerLookup[activeLayerId]) {
      activeLayer = layerLookup[activeLayerId];
    }

    var attrsIndex = ixer.index("uiStyleToAttrs");
    var stylesIndex = ixer.index("uiElementToStyles");

    var selectionInfo = getSelectionInfo(componentId, true);
    var els = elements.map(function(cur) {
      var id = cur[1];
      var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;

      var attrs = [];
      var styles = stylesIndex[id] || [];
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
    return genericWorkspace("query",
                            [uiControls(componentId, activeLayer)],
                            uiInspectors(componentId, selectionInfo, layers, activeLayer),
                            {c: "ui-editor",
                             children: [
                               {c: "ui-canvas", componentId: componentId, children: els, mousedown: clearSelection},
                             ]});
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

  function uiGrid(componentId, layerIndex) {
    var id = componentId + "-grid";
    return {c: "grid", id: id, t: "canvas", top: 0, left: 0, zIndex: layerIndex,
            postRender: function(canvas) {
              var uiGridCount = 3000;
              if(canvas._rendered) return;

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
              for(var i = 0; i < uiGridCount; i++) {
                if(i % localState.uiGridSize === 0) {
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
            }};
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
            draggable: true, drag: resizeSelection, bounds: bounds, dragstart: clearDragImage, mousedown: stopPropagation};
  }

  function stopPropagation(e) {
    e.stopPropagation();
  }
  function preventDefault(e) {
    e.preventDefault();
  }

  function clearDragImage(e, elem) {
    e.dataTransfer.setData("text", "foo");
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0, 0);
  }

  function resizeSelection(e, elem) {
    var x = Math.floor(e.clientX || __clientX);
    var y = Math.floor(e.clientY || __clientY);
    if(x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.parentNode.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    var old = elem.bounds;
    var neueBounds = {left: old.left, right: old.right, top: old.top, bottom: old.bottom};
    if(elem.x === "left") {
      neueBounds.left = toGrid(localState.uiGridSize, x);
    } else if(elem.x === "right") {
      neueBounds.right = toGrid(localState.uiGridSize, x);
    }
    if(elem.y === "top") {
      neueBounds.top = toGrid(localState.uiGridSize, y);
    } else if(elem.y === "bottom") {
      neueBounds.bottom = toGrid(localState.uiGridSize, y);
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

  function selection(selectionInfo) {
    var componentId = selectionInfo.componentId;
    var bounds = selectionInfo.bounds;
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
              {c: "trash ion-ios-trash", componentId: componentId, mousedown:stopPropagation, click: deleteSelection},
            ]};
  }

  function deleteSelection(e, elem) {
    dispatch("deleteSelection", {componentId: elem.componentId});
  }

  function clearSelection(e, elem) {
    localState.uiSelection = null;
    render();
  }

  function control(cur, attrs, selected, layer) {
    var id = cur[1];
    var type = cur[4];
    var selClass = selected ? " selected" : "";
    var hidden = layer[5] ? " hidden" : "";
    var locked = layer[4] ? " locked" : "";
    var klass = type + " ui-element" + selClass + hidden + locked;
    var elem = {c: klass, id: "elem" + id, left: cur[5], top: cur[6], width: cur[7] - cur[5], height: cur[8] - cur[6],
                control: cur, mousedown: addToSelection, selected: selected, zIndex: layer[3] + 1,
                draggable: true, drag: moveSelection, dragstart: startMoveSelection};
    if(attrs) {
      for(var i = 0, len = attrs.length; i < len; i++) {
        var curAttr = attrs[i];
        var name = attrMappings[curAttr[2]] || curAttr[2];
        if(curAttr[3].constructor !== Array) {
          elem[name] = curAttr[3];
        }
      }
    }

    //   if(uiCustomControlRender[type]) {
    //     elem = uiCustomControlRender[type](elem);
    //   }
    return elem;
  }

  function addToSelection(e, elem) {
    e.stopPropagation();
    if(elem.selected) return;
    if(!e.shiftKey || !localState.uiSelection) {
      localState.uiSelection = [];
    }
    localState.uiSelection.push(elem.control[1]);
    render();
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
    if(x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
    localState.dragOffsetX = x - elem.left - canvasRect.left;
    localState.dragOffsetY = y - elem.top - canvasRect.top;
    clearDragImage(e);
    if(e.altKey) {
      //@HACK: if you cause a rerender before the event finishes, the drag is killed?
      setTimeout(function() {
        dispatch("duplicateSelection", {componentId: elem.control[2]});
      }, 0);
    }
  }

  function moveSelection(e, elem) {
    var x = Math.floor(e.clientX || __clientX);
    var y = Math.floor(e.clientY || __clientY);
    if(x === 0 && y === 0) return;
    var canvasRect = e.currentTarget.parentNode.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    var diffX = toGrid(localState.uiGridSize, Math.floor(x - elem.control[5] - localState.dragOffsetX));
    var diffY = toGrid(localState.uiGridSize, Math.floor(y - elem.control[6] - localState.dragOffsetY));
    if(diffX || diffY) {
      dispatch("moveSelection", {diffX: diffX, diffY: diffY, componentId: elem.control[2]});
    }
  }


  function getSelectionInfo(componentId, withAttributes) {
    var sel = localState.uiSelection;
    var elements;
    if(sel) {
      var elementIndex = ixer.index("uiComponentElement");
      elements = sel.map(function(cur) {
        return elementIndex[cur];
      });

      var result = getGroupInfo(elements, withAttributes);

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
      if(withAttributes !== undefined) {
        var elStyles = stylesIndex[id];
        if(!elStyles) { return cur; }

        var attrs = [];
        for(var ix = 0, len = elStyles.length; ix < len; ix++) {
          var style = elStyles[ix];
          var type = style[2];
          if(styles[type] === undefined) { styles[type] = style; }
          else if(!style || !styles[type] || styles[type][1] !== style[1]) { styles[type] = null; }

          attrs.push.apply(attrs, attrsIndex[style[1]]);
        }

        if(attrs) {
          attrs.forEach(function(cur) {
            var key = cur[2];
            var value = cur[3];
            if(attributes[key] === undefined) {
              attributes[key] = value;
            } else if(attributes[key] !== value) {
              attributes[key] = null;
            }
          });
        }
      }
      return cur;
    });
    var bounds = boundElements(els);
    return {ids: ids, elements: els, bounds: bounds, attributes: attributes, styles: styles};
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


  var uiControlInfo = [{text: "text", icon: ""},
                       {text: "box", icon: ""},
                       {text: "button", icon: ""},
                       {text: "input", icon: ""},
                       {text: "map", icon: ""}];

  function uiControls(componentId, activeLayer) {
    var items = uiControlInfo.map(function(cur) {
      return {c: "control", click: addElement, controlType: cur.text, componentId: componentId, layer: activeLayer,
              children: [
                {c: "icon"},
                {text: cur.text}
              ]};
    })
    return controlGroup(items);
  }

  function addElement(e, elem) {
    dispatch("addUiComponentElement", {componentId: elem.componentId,
                                       layerId: elem.layer[1],
                                       control: elem.controlType,
                                       left: elem.left || 100,
                                       right: elem.right || 200,
                                       top: elem.top || 100,
                                       bottom: elem.bottom || 200})
  }


  var attrMappings = {"content": "text"};
  var uiProperties = {};
  function uiInspectors(componentId, selectionInfo, layers, activeLayer) {
    var inspectors = [];
    var activeLayerId;
    var binding;
    var elements;
    if(activeLayer) {
      activeLayerId = activeLayer[1];
      elements = ixer.index("uiLayerToElements")[activeLayerId];
      binding = ixer.index("groupToBinding")[activeLayerId];
    }
    if(selectionInfo) {
      // @TODO: Only show appropriate inspectors for each type based on trait instead of hardcoding.
      inspectors.push(layoutInspector(selectionInfo, binding),
                      appearanceInspector(selectionInfo, binding),
                      textInspector(selectionInfo, binding));

      var showMapInspector = selectionInfo.elements.every(function(cur) {
        return cur[4] === "map";
      });
      if(showMapInspector) {
        var mapInfo = getMapGroupInfo(selectionInfo.elements, true)
        inspectors.push(mapInspector(selectionInfo, mapInfo, binding));
      }
    } else if(activeLayer) {
      inspectors.push(layerInspector(activeLayer, elements));
    }
    return inspectors;
  }

  function adjustable(value, start, stop, step) {
    return {c: "adjustable", mousedown: startAdjusting, adjustHandler: adjustAdjustable,
            value: value, start: start, stop: stop, step: step,  text: value};
  }

  var adjustableShade = document.createElement("div");
  adjustableShade.className = "adjustable-shade";
  adjustableShade.addEventListener("mousemove", function(e) {
    if(adjusterInfo) {
      adjusterInfo.handler(e, renderer.tree[adjusterInfo.elem.id]);
    }
  })

  adjustableShade.addEventListener("mouseup", function(e) {
    adjusterInfo = false;
    document.body.removeChild(adjustableShade);
  })

  var adjusterInfo;
  function startAdjusting(e, elem) {
    adjusterInfo = {elem: elem, startValue: elem.value, handler: elem.adjustHandler, bounds: {left: e.clientX, top: e.clientY}};
    document.body.appendChild(adjustableShade);
  }

  function adjustAdjustable(e, elem) {
    var x = e.clientX || __clientX;
    var y = e.clientY || __clientY;
    if(x === 0 && y === 0) return;
    var rect = adjusterInfo.bounds;
    var offsetX = Math.floor(x - rect.left);
    var offsetY = Math.floor(y - rect.top);
    var adjusted = Math.floor(adjusterInfo.startValue + offsetX);
    var neue = Math.min(Math.max(elem.start, adjusted), elem.stop);
    if(elem.handler) {
      elem.handler(elem, neue);
    }
  }

  uiProperties.layout = ["top", "left", "width", "height"];
  function layoutInspector(selectionInfo, binding) {
    var componentId = selectionInfo.componentId;
    var bounds = selectionInfo.bounds;
    var width = bounds.right - bounds.left;
    var height = bounds.bottom - bounds.top;
    var widthAdjuster = adjustable(width, 1, 1000, 1);
    widthAdjuster.handler = adjustWidth;
    widthAdjuster.componentId = componentId;
    widthAdjuster.bounds = bounds;
    var heightAdjuster = adjustable(height, 1, 1000, 1);
    heightAdjuster.handler = adjustHeight;
    heightAdjuster.componentId = componentId;
    heightAdjuster.bounds = bounds;
    var topAdjuster = adjustable(bounds.top, 0, 100000, 1);
    topAdjuster.handler = adjustPosition;
    topAdjuster.componentId = componentId;
    topAdjuster.coord = "top";
    var leftAdjuster = adjustable(bounds.left, 0, 100000, 1);
    leftAdjuster.handler = adjustPosition;
    leftAdjuster.componentId = componentId;
    leftAdjuster.coord = "left";
    //pos, size
    return {c: "option-group", children: [
      {c: "label", text: "x:"},
      leftAdjuster,
      {c: "label", text: "y:"},
      topAdjuster,
      {c: "label", text: "w:"},
      widthAdjuster,
      {c: "label", text: "h:"},
      heightAdjuster,
    ]};
  }

  uiProperties.appearance = ["backgroundColor", "backgroundImage", "borderColor", "borderWidth", "borderRadius", "opacity"];
  function appearanceInspector(selectionInfo, binding) {
    var attrs = selectionInfo.attributes;
    var componentId = selectionInfo.componentId;
    var styleName;
    if(selectionInfo.styles.appearance) {
      styleName = code.name(selectionInfo.styles.appearance[1]);
    } else {
      styleName = "---";
    }

    var borderColorPicker = colorSelector(componentId, "borderColor", attrs["borderColor"]);
    borderColorPicker.backgroundColor = undefined;

    var opacity = attrs["opacity"] == undefined ? 100 : attrs["opacity"] * 100;
    var opacityAdjuster = adjustable(opacity, 0, 100, 1);
    opacityAdjuster.text = Math.floor(opacity) + "%";
    opacityAdjuster.handler = adjustOpacity;
    opacityAdjuster.componentId = componentId;

    var borderWidth = attrs["borderWidth"] === undefined ? 0 : attrs["borderWidth"];
    var borderWidthAdjuster = adjustable(borderWidth, 0, 20, 1);
    borderWidthAdjuster.text = borderWidth + "px";
    borderWidthAdjuster.handler = adjustAttr;
    borderWidthAdjuster.attr = "borderWidth";
    borderWidthAdjuster.componentId = componentId;

    var borderRadius = attrs["borderRadius"] === undefined ? 0 : attrs["borderRadius"];
    var borderRadiusAdjuster = adjustable(borderRadius, 0, 100, 1);
    borderRadiusAdjuster.text = borderRadius + "px";
    borderRadiusAdjuster.handler = adjustAttr;
    borderRadiusAdjuster.attr = "borderRadius";
    borderRadiusAdjuster.componentId = componentId;


    var visualStyle = selectable("No visual style", ["No visual style", "Foo", "Bar", "Add a new style"]);
    visualStyle.c += " styleSelector";
    visualStyle.handler = function(elem, value) {
      console.log("got style", value);
    }

    return {c: "option-group", children: [
      visualStyle,
      {c: "layoutBoxFilled", borderRadius: attrs["borderRadius"], children: [
        colorSelector(componentId, "backgroundColor", attrs["backgroundColor"])
      ]},
      {c: "layoutBoxOutline", borderRadius: attrs["borderRadius"], borderWidth: attrs["borderWidth"], borderColor: attrs["borderColor"], children: [borderColorPicker]},
      {c: "label", text: "w:"},
      borderWidthAdjuster,
      {c: "label", text: "r:"},
      borderRadiusAdjuster,
      {c: "label", text: "opacity:"},
      opacityAdjuster
    ]};
  }

  function selectable(value, items, setFont) {
    var options = items.map(function(cur) {
      var item = {t: "option", value: cur, text: cur};
      if(setFont) {
        item.fontFamily = cur;
      }
      if(cur === value) {
        item.selected = "selected";
      }
      return item;
    })
    return {c: "selectable", change: selectSelectable, children: [
      {t: "select", children: options},
      {c: "selectable-value", text: value}
    ]}
  }

  function selectSelectable(e, elem) {
    if(elem.handler) {
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
    if(value === "Top") {
      final = "flex-start";
    } else if(value === "Bottom") {
      final = "flex-end";
    }
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "verticalAlign", value: final});
  }

  function selectAlign(elem, value) {
    var final = "center";
    if(value === "Left") {
      final = "flex-start";
    } else if(value === "Right") {
      final = "flex-end";
    }
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "textAlign", value: final});
  }

  function selectFont(elem, value) {
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "fontFamily", value: value});
  }

  uiProperties.typography = ["text", "fontFamily", "fontSize", "color", "textAlign", "verticalAlign"];
  function textInspector(selectionInfo, binding) {
    var componentId = selectionInfo.componentId;
    var attrs = selectionInfo.attributes;
    var styleName;
    if(selectionInfo.styles.appearance) {
      styleName = code.name(selectionInfo.styles.appearance[1]);
    } else {
      styleName = "no shared style";
    }

    var font = attrs["fontFamily"] || "Helvetica Neue";
    var fontPicker = selectable(font, ["Times New Roman", "Verdana", "Arial", "Georgia", "Avenir", "Helvetica Neue"], true);
    fontPicker.componentId = componentId;
    fontPicker.handler = selectFont;

    var fontSize = attrs["fontSize"] === undefined ? 16 : attrs["fontSize"];
    var fontSizeAdjuster = adjustable(fontSize, 0, 300, 1);
    fontSizeAdjuster.handler = adjustAttr;
    fontSizeAdjuster.attr = "fontSize";
    fontSizeAdjuster.componentId = componentId;

    var fontColor = colorSelector(componentId, "color", attrs["color"]);
    fontColor.color = attrs["color"];
    fontColor.c += " font-color";

    var verticalAlign = vAlignMapping[attrs["verticalAlign"]] || "Top";
    var valign = selectable(verticalAlign, ["Top", "Center", "Bottom"]);
    valign.componentId = componentId;
    valign.handler = selectVerticalAlign;

    var textAlign = alignMapping[attrs["textAlign"]] || "Left";
    var align = selectable(textAlign, ["Left", "Center", "Right"]);
    align.componentId = componentId;
    align.handler = selectAlign;

    var typographyStyle = selectable("No text style", ["No typorgaphy style", "Foo", "Bar", "Add a new style"]);
    typographyStyle.c += " styleSelector";
    typographyStyle.handler = function(elem, value) {
      console.log("got style", value);
    }

    return {c: "option-group", children: [
      typographyStyle,
      fontColor,
      {c: "label", text: "size:"},
      fontSizeAdjuster,
      {c: "label", text: "font:"},
      fontPicker,
      {c: "label", text: "align:"},
      valign,
      align,
    ]};
  }

  uiProperties.layer = [];
  function layerInspector(layer, elements) {
    var componentId = layer[2];
    var info = getGroupInfo(elements, true);
    var attrs = info.attributes; // @FIXME: Layer attributes.
    var bounds = info.bounds;

    return {c: "inspector-panel", children: []};
  }

  uiProperties.map = [];
  function mapInspector(selectionInfo, mapInfo, binding) {
    var componentId = selectionInfo.componentId;
    var attrs = mapInfo.attributes;
    return {c: "inspector-panel", children: [
      {c: "title", text: "Map"},
      {c: "pair", children: [{c: "label", text: "lat."},
                             inspectorInput(attrs["lat"], [componentId, "lat"], setMapAttribute, binding)]},
      {c: "pair", children: [{c: "label", text: "long."},
                             inspectorInput(attrs["lng"], [componentId, "lng"], setMapAttribute, binding)]},
      {c: "pair", children: [{c: "label", text: "zoom"},
                             inspectorInput(attrs["zoom"], [componentId, "zoom"], setMapAttribute, binding)]},
      {c: "pair", children: [{c: "label", text: "interactive"},
                             inspectorCheckbox(attrs["draggable"], [componentId, "draggable"], setMapAttribute, binding)]},
    ]};
  }

  uiProperties.repeat = [];
  function repeatInspector() {
  }

  // Inputs
  function inspectorInput(value, key, onChange, binding) {
    if(value === null) {
      input.placeholder = "---";
    } else if(typeof value === "number" && !isNaN(value)) {
      value = value.toFixed(2);
    } else if(value && value.constructor === Array) {
      value = "Bound to " + code.name(value[2]);
    }
    var field = input(value, key, onChange, preventDefault);
    field.mousedown = stopPropagation;
    field.editorType = "binding";
    field.binding = binding;
    field.focus = activateTokenEditor;
    field.blur = closeTokenEditor;
    return field;
  }

  function inspectorCheckbox(value, key, onChange, binding) {
    if(value && value.constructor === Array) {
      value = "Bound to " + code.name(value[2]);
    }
    var field = checkboxInput(value, key, onChange);
    field.mousedown = stopPropagation;
    field.editorType = "binding";
    field.binding = binding;
    field.focus = activateTokenEditor;
    field.blur = closeTokenEditor;
    return field;
  }

  function closeBindingEditor(e, elem) {
    if(editorInfo.element === e.currentTarget) {
      setTimeout(function() { editorInfo = false; rerender(); }, 0);
    }
  }

  function bindingEditor(editorInfo) {
    var binding = editorInfo.info.binding;
    if(!binding) return;
    var fields = code.viewToFields(binding).map(function(cur) {
      return ["field", binding, cur[2]];
    });
    return genericEditor(fields, false, false, false, "column", setBinding);
  }

  function setBinding(e, elem) {
    var info = editorInfo.info;
    var componentId = info.key[0];
    var property = info.key[1];
    console.log("SET", componentId, property, elem.cur);
    editorInfo = false;
    dispatch("setAttributeForSelection", {componentId: componentId, property: property, value: ["binding", elem.cur[1], elem.cur[2]]});
  }

  function colorSelector(componentId, attr, value) {
    return {c: "color-picker", backgroundColor: value || "#999999", mousedown: stopPropagation, children: [
      {t: "input", type: "color", key: [componentId, attr],
       value: value, input: setAttribute}
    ]};
  }

  function styleSelector(id, opts, onClose) {
    var options = {};
    if(opts.initial === "---") {
      options["default"] = "---";
    }
    var styles = ixer.index("uiStyles");
    for(var key in styles) {
      var cur = styles[key][0];
      if(cur[2] === opts.type && code.name(cur[1])) {
        options[cur[1]] = code.name(cur[1]);
      }
    }

    return selectInput(opts.initial, opts.id, options, onClose);
  }

  // Layout handlers
  function adjustWidth(elem, value) {
    var componentId = elem.componentId;
    var old = elem.bounds;
    var neue = {left: old.left, right: (old.left + value), top: old.top,  bottom: old.bottom};
    var widthRatio = value / (old.right - old.left);
    if(widthRatio === 1) return;
    dispatch("resizeSelection", {widthRatio: widthRatio, heightRatio: 1, oldBounds: old, neueBounds: neue, componentId: componentId});
  }

  function adjustHeight(elem, value) {
    var componentId = elem.componentId;
    var old = elem.bounds;
    var neue = {left: old.left, right: old.right, top: old.top,  bottom: (old.top + value)};
    var heightRatio = value / (old.bottom - old.top);
    if(heightRatio === 1) return;
    dispatch("resizeSelection", {widthRatio: 1, heightRatio: heightRatio, oldBounds: old, neueBounds: neue, componentId: componentId});
  }

  function adjustPosition(elem, value) {
    var componentId = elem.componentId;
    var coord = elem.coord;
    var diffX = 0, diffY = 0;
    if(coord === "top") {
      diffY = value - elem.value;
    } else {
      diffX = value - elem.value;
    }
    dispatch("moveSelection", {diffX: diffX, diffY: diffY, componentId: componentId});
  }

  function adjustOpacity(elem, value) {
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "opacity", value: value / 100});
  }
  function adjustAttr(elem, value) {
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: elem.attr, value: value});
  }

  // Generic attribute handler
  function setAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.value;
    if(target.type === "color") {
      value = target.value;
    } else if(target.type === "checkbox") {
      value = target.checked;
    } else if(target.type === undefined) {
      value = target.textContent;
    }
    dispatch("setAttributeForSelection", {componentId: componentId, property: property, value: value});
  }

  // Map attribute handler
  function setMapAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.checked !== undefined ? target.checked : target.value !== undefined ? target.value : target.textContent;
    dispatch("setMapAttributeForSelection", {componentId: componentId, property: property, value: value});
  }


  // Ui layer handlers
  function addLayer(e, elem) {
    dispatch("addUiComponentLayer", {componentId: elem.componentId});
  }

  function activateLayer(e, elem) {
    dispatch("activateUiLayer", {layerId: elem.layer[1], componentId: elem.layer[2]});
  }
  function selectAllFromLayer(e, elem) {
    var elements = ixer.index("uiLayerToElements")[elem.layer[1]] || [];
    var elIds = [];
    elements.forEach(function(cur) {
      if(!ixer.index("remove")[cur[0]]) {
        elIds.push(cur[1]);
      }
    });
    dispatch("selectElements", {elements: elIds || [], createNew: !e.shiftKey, componentId: elem.layer[2]});

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

  function getUiPropertyType(prop) {
    if(uiProperties.typography.indexOf(prop) !== -1) {
      return "typography";
    }
    if(uiProperties.appearance.indexOf(prop) !== -1) {
      return "appearance";
    }
    if(uiProperties.layout.indexOf(prop) !== -1) {
      return "layout";
    }
    return undefined;
  }

  //---------------------------------------------------------
  // Query workspace
  //---------------------------------------------------------

  function queryWorkspace(queryId) {
    return genericWorkspace("query", [queryControls(queryId)], [],
                            {c: "query-editor",
                             children: [
                               {c: "query-workspace", children: [
                                 editor(queryId),
                                 inspectorPane(queryId)
                               ]},
                               queryResult(queryId)
                             ]});
  }

  //---------------------------------------------------------
  // Tree + Toolbar
  //---------------------------------------------------------

  function treeItem(name, value, type, opts) {
    opts = opts || {};
    return {c: "tree-item " + opts.c, dragData: {value: value, type: type}, draggable: true, dragstart: dragItem, children: [
      (opts.icon ? {c: "opts.icon"} : undefined),
      (name ? {text: name} : undefined),
      opts.content
    ]};
  }

  function fieldItem(name, fieldId, sourceId, opts) {
    opts = opts || {};
    var type = "sourceField";
    if(!sourceId) { type = "queryField"; }
    return {c: "tree-item " + opts.c, dragData: {fieldId: fieldId, sourceId: sourceId, type: type}, draggable: true, dragstart: dragItem, children: [
      (opts.icon ? {c: "opts.icon"} : undefined),
      (name ? {text: name} : undefined),
      opts.content
    ]};
  }

  function dragItem(evt, elem) {
    for(var key in elem.dragData) {
      evt.dataTransfer.setData(key, elem.dragData[key]);
    }
  }

  var queryAggregates = ["sum", "count", "min", "max", "empty"];
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
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      dispatch("addViewBlock", {sourceId: value});
    }
    if(type === "tool" && value === "aggregate") {
      dispatch("addAggregateBlock", {});
    }
  }

  /**
   * View Block
   */
  function viewBlock(viewId) {
    var fields = ixer.index("view to fields")[viewId] || [];
    var selectionItems = fields.map(function(field) {
      var id = field[code.ix("field", "field")];
      return fieldItem(code.name(id) || "Untitled", id, undefined, {c: "pill field"});
    });
    if(!selectionItems.length) {
      selectionItems.push({text: "Drag local fields into me to make them available in the query."});
    }

    return {c: "block view-block", viewId: viewId, drop: viewBlockDrop, dragover: preventDefault, children: [
      {c: "block-title", children: [
        {t: "h3", text: "Untitled Block"},
        {c: "hover-reveal close-btn ion-android-close", viewId: viewId, click: removeViewBlock}
      ]},
      viewSources(viewId),
      viewConstraints(viewId),
      {c: "block-section view-selections tree bar", viewId: viewId, drop: viewSelectionsDrop, dragover: preventDefault, children: selectionItems}
    ]};
  }

  function viewBlockDrop(evt, elem) {
    var viewId = elem.viewId;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      if(viewId === value) { return console.error("Cannot join view with parent."); }
      dispatch("addViewSource", {viewId: viewId, sourceId: value});
      evt.stopPropagation();
      return;
    }
    if(type === "tool" && value === "filter") {
      dispatch("addViewConstraint", {viewId: viewId});
      evt.stopPropagation();
      return;
    }
    if(type === "sourceField") {
      var sources = ixer.index("source")[viewId] || {};
      var fieldId = evt.dataTransfer.getData("fieldId");
      var draggedSourceId = evt.dataTransfer.getData("sourceId");
      var draggedSource = sources[draggedSourceId];
      if(!draggedSource) { return; }
      dispatch("addViewConstraint", {viewId: viewId, leftSource: draggedSourceId, leftField: fieldId});
    }
  }

  function removeViewBlock(evt, elem) {
    dispatch("removeViewBlock", {viewId: elem.viewId});
  }

  function viewSelectionsDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "sourceField") { return; }
    var viewId = elem.viewId;
    var fieldId = evt.dataTransfer.getData("fieldId");
    var sourceId = evt.dataTransfer.getData("sourceId");
    dispatch("addViewSelection", {viewId: viewId, fieldId: fieldId, sourceId: sourceId});
    evt.stopPropagation();
  }

  // Sources
  function viewSources(viewId) {
    var sources = ixer.index("view to sources")[viewId] || [];
    var sourceIdIx = code.ix("source", "source");
    sources.sort(function(a, b) {
      var idA = a[sourceIdIx];
      var idB = b[sourceIdIx];
      var orderA = ixer.index("display order")[idA];
      var orderB = ixer.index("display order")[idB];
      if(orderB - orderA) { return orderB - orderA; }
      else { return idA > idB }
    });
    var sourceItems = sources.map(function(source) {
      var sourceId = source[code.ix("source", "source")];
      var sourceViewId = source[code.ix("source", "source view")];

      var fields = ixer.index("view to fields")[sourceViewId] || [];
      var fieldItems = fields.map(function(field) {
        var id = field[code.ix("field", "field")];
        return fieldItem(code.name(id) || "Untitled", id, sourceId, {c: "pill field"});
      });

      var children = [
        {c: "view-source-title", children: [
          {t: "h4", text: code.name(sourceId) || "Untitled"},
          {c: "hover-reveal close-btn ion-android-close", viewId: viewId, sourceId: sourceId, click: removeSource}
        ]}
      ].concat(fieldItems);
      return {c: "tree bar view-source", children: children};

    });

    return {c: "block-section view-sources", children: sourceItems};
  }

  function removeSource(evt, elem) {
    dispatch("removeViewSource", {viewId: elem.viewId, sourceId: elem.sourceId});
  }

  // Constraints
  function viewConstraints(viewId) {
    var constraintIdIx = code.ix("constraint", "constraint");
    var constraints = ixer.index("view to constraints")[viewId] || [];

    var constraintItems = constraints.map(function(constraint) {
      var id = constraint[constraintIdIx];
      var op = ixer.index("constraint operation")[id] || [];
      var operation = op[code.ix("constraint operation", "operation")];
      var left = ixer.index("constraint left")[id] || [];
      var leftSource = left[code.ix("constraint left", "left source")];
      var leftField = left[code.ix("constraint left", "left field")];
      var right = ixer.index("constraint right")[id] || [];
      var rightSource = right[code.ix("constraint right", "right source")];
      var rightField = right[code.ix("constraint right", "right field")];

      return {c: "view-constraint", children: [
        {c: "hover-reveal grip", children: [{c: "ion-android-more-vertical"}, {c: "ion-android-more-vertical"}]},
        token.blockField({key: "left", constraintId: id, source: leftSource, field: leftField}, updateViewConstraint),
        token.operation({key: "operation", constraintId: id, operation: operation}, updateViewConstraint),
        token.blockField({key: "right", constraintId: id, source: rightSource, field: rightField}, updateViewConstraint),
        {c: "hover-reveal close-btn ion-android-close", constraintId: id, click: removeConstraint}
      ]};
    });

    return {c: "block-section view-constraints", children: constraintItems};
  }

  function updateViewConstraint(evt, elem) {
    var id = elem.constraintId;
    dispatch("updateViewConstraint", {constraintId: id, type: elem.key, value: elem.value});
    stopEditToken(evt, elem);
    evt.stopPropagation();
  }

  function removeConstraint(evt, elem) {
    dispatch("removeViewConstraint", {constraintId: elem.constraintId});
  }


  //---------------------------------------------------------
  // Tokens
  //---------------------------------------------------------

  var tokenState = {};

  var token = {
    operation: function(params, onChange) {
      var state = tokenState[params.constraintId];
      if(state) { state = state[params.key]; }

      return {c: "token operation",
              key: params.key,
              constraintId: params.constraintId,
              children: [{c: "name", text: params.operation || "<op>"},
                         (state === 1) ? tokenEditor.operation(params, onChange) : undefined],
              click: editToken};
    },
    blockField: function(params, onChange) {
      var state = tokenState[params.constraintId];
      if(state) { state = state[params.key]; }
      var name = "<field>";
      var source;
      if(params.field) {
        name = code.name(params.field);
        if(params.source) {
          source = code.name(params.source);
        }
      }

      return {c: "token field",
              key: params.key,
              constraintId: params.constraintId,
              children: [{c: "name", text: name},
                         (source ? {c: "source", text: "(" + source +")"} : undefined),
                         (state === 1) ? tokenEditor.blockField(params, onChange) : undefined],
              click: editToken,
              dragover: preventDefault,
              drop: tokenBlockFieldDrop};
    }
  };

  function tokenBlockFieldDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "sourceField") { return; }
    var viewId = ixer.index("constraint to view")[elem.constraintId];
    var sources = ixer.index("source")[viewId] || {};

    var fieldId = evt.dataTransfer.getData("fieldId");
    var draggedSourceId = evt.dataTransfer.getData("sourceId");
    var draggedSource = sources[draggedSourceId];
    if(!draggedSource) { return; }
    // @NOTE: This probably shouldn't be hardcoded.
    dispatch("updateViewConstraint", {constraintId: elem.constraintId, type: elem.key, value: fieldId, source: draggedSourceId});
    evt.stopPropagation();
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
    operation: function(params, onChange) {
      var items = ["=", "<", "≤", ">", "≥", "≠"].map(function(rel) {
        var item = selectorItem({c: "operation", key: params.key, name: rel, value: rel}, onChange);
        item.constraintId = params.constraintId;
        return item;
      });
      var select = selector(items, {c: "operation", key: params.key, tabindex: -1, focus: true}, stopEditToken);
      select.constraintId = params.constraintId;
      return select;
    },
    blockField: function(params, onChange) {
      var viewId = ixer.index("constraint to view")[params.constraintId];
      var fields = getBlockFields(viewId);
      var items = fields.map(function(field) {
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
        item.constraintId = params.constraintId;
        return item;
      });
      var select = selector(items, {c: "field", key: params.key, tabindex: -1, focus: true}, stopEditToken);
      select.constraintId = params.constraintId;
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

  return { container: renderer.content, ixer: ixer, localState: localState, renderer: renderer };
})(window, microReact, Indexing);
