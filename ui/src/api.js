if(!window.DEBUG) {
  window.DEBUG = {RECEIVE: 3,
                  SEND: 3,
                  INDEXER: 1};
}


var api = (function(Indexing) {
  function clone(item) {
    if (!item) { return item; }
    var result;

    if(item.constructor === Array) {
      result = [];
      item.forEach(function(child, index, array) {
        result[index] = clone( child );
      });
    } else if(typeof item == "object") {
      result = {};
      for (var i in item) {
        result[i] = clone( item[i] );
      }
    } else {
      //it's a primitive
      result = item;
    }
    return result;
  }

  //---------------------------------------------------------
  // Data
  //---------------------------------------------------------

  var ixer = new Indexing.Indexer();
  var tables = {
    compiler: {
      tag: {name: "tag", fields: ["view", "tag"]},
      view: {name: "view", fields: ["view", "kind"]},
      field: {name: "field", fields: ["view", "field", "kind"]},
      source: {name: "source", fields: ["view", "source", "source view"]},
      constant: {name: "constant", fields: ["constant", "value"]},
      select: {name: "select", fields: ["view", "view field", "source", "source field"]},

      "constraint": {name: "constraint", fields: ["constraint", "view"]},
      "constraint left": {name: "constraint left", fields: ["constraint", "left source", "left field"]},
      "constraint right": {name: "constraint right", fields: ["constraint", "right source", "right field"]},
      "constraint operation": {name: "constraint operation", fields: ["constraint", "operation"]},

      "aggregate grouping": {name: "aggregate grouping", fields: ["aggregate", "inner field", "outer field"]},
      "aggregate sorting": {name: "aggregate sorting", fields: ["aggregate", "inner field", "priority", "direction"]},
      "aggregate limit from": {name: "aggregate limit from", fields: ["aggregate", "from source", "from field"]},
      "aggregate limit to": {name: "aggregate limit to", fields: ["aggregate", "to source", "to field"]},
      "aggregate argument": {name: "aggregate argument", fields: ["aggregate", "reducer source", "reducer field", "argument source", "argument field"]},

      "display order": {name: "display order", fields: ["id", "priority"]},
      "display name": {name: "display name", fields: ["id", "name"]}
    },
    editor: {
      initialized: {name: "initialized", fields: ["initialized"], facts: [[true]]},
      primitive: {name: "primitive", fields: ["view", "kind"]},
      "editor item": {name: "editor item", fields: ["item", "type"], facts: [[1, "query"]]},
      block: {name: "block", fields: ["query", "block", "view"]},
      "block aggregate": {name: "block aggregate", fields: ["view", "kind"]},
      "block field": {name: "block field", fields: ["block field", "view", "source", "source view", "field"]},
      "grouped by": {name: "grouped by", fields: ["inner", "inner field", "outer", "outer field"]},
      empty: {name: "empty", fields: [], facts: [[]]},
      "eveuser": {name: "eveuser", fields: ["id", "username"]},

      //ui
      "uiComponentElement": {name: "uiComponentElement", fields: ["tx", "id", "component", "layer", "control", "left", "top", "right", "bottom"], facts: []},
      "uiComponentLayer": {name: "uiComponentLayer", fields: ["tx", "id", "component", "layer", "locked", "hidden", "parentLayer"], facts: []},
      "uiComponentAttribute": {name: "uiComponentAttribute", fields: ["tx", "id", "property", "value"]},
      "uiStyle": {name: "uiStyle", fields: ["tx", "id", "type", "element", "shared"]},
      "uiGroupBinding": {name: "uiGroupBinding", fields: ["group", "view"]},
      "uiAttrBinding": {name: "uiAttrBinding", fields: ["elementId", "attr", "field"]}
    },

    example: {
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
    }
  };

  function initIndexer(noFacts) {
    injectViews(tables, ixer, noFacts);
    //ixer.handleDiffs(diff.addViewBlock(code.activeItemId()));
  }

  // This index needs to be hardcoded for code.ix to work.
  ixer.addIndex("view to fields", "field", Indexing.create.collector([0]));

  ixer.addIndex("constant", "constant", Indexing.create.lookup([0, false]));
  ixer.addIndex("constant to value", "constant", Indexing.create.lookup([0, 1]));
  ixer.addIndex("display name", "display name", Indexing.create.lookup([0, 1]));
  ixer.addIndex("display order", "display order", Indexing.create.lookup([0, 1]));
  ixer.addIndex("field to view", "field", Indexing.create.lookup([1, 0]));
  ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to kind", "view", Indexing.create.lookup([0, 1]));
  ixer.addIndex("view kind to views", "view", Indexing.create.collector([1]));
  ixer.addIndex("source", "source", Indexing.create.lookup([0, 1, false]));
  ixer.addIndex("view and source view to source", "source", Indexing.create.lookup([0, 2, false]));
  ixer.addIndex("view to sources", "source", Indexing.create.collector([0]));
  ixer.addIndex("source view to sources", "source", Indexing.create.collector([2]));
  ixer.addIndex("view to constraints", "constraint", Indexing.create.collector([1]));
  ixer.addIndex("constraint", "constraint", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint to view", "constraint", Indexing.create.lookup([0, 1]));
  ixer.addIndex("constraint left", "constraint left", Indexing.create.lookup([0, false]));
  ixer.addIndex("source to constraints", "constraint left", Indexing.create.collector([1]));
  ixer.addIndex("constraint right", "constraint right", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint operation", "constraint operation", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to selects", "select", Indexing.create.collector([0]));
  ixer.addIndex("view and source field to select", "select", Indexing.create.lookup([0, 3, false]));
  ixer.addIndex("view and source and field to select", "select", Indexing.create.lookup([0, 2, 1, false]));
  ixer.addIndex("view to aggregate sorting", "aggregate sorting", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to aggregate limit from", "aggregate limit from", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to aggregate limit to", "aggregate limit to", Indexing.create.lookup([0, false]));

  // editor
  ixer.addIndex("block", "block", Indexing.create.lookup([1, false]));
  ixer.addIndex("block to query", "block", Indexing.create.lookup([1, 0]));
  ixer.addIndex("view to query", "block", Indexing.create.lookup([2, 0]));
  ixer.addIndex("view to block", "block", Indexing.create.lookup([2, 1]));
  ixer.addIndex("query to blocks", "block", Indexing.create.collector([0]));
  ixer.addIndex("query to views", "block", Indexing.create.collector([0, 2]));
  ixer.addIndex("block field", "block field", Indexing.create.lookup([0, false]));
  ixer.addIndex("view and source to block fields", "block field", Indexing.create.collector([1, 2]));
  ixer.addIndex("grouped by", "grouped by", Indexing.create.lookup([0, false]));
  ixer.addIndex("block aggregate", "block aggregate", Indexing.create.lookup([0, false]));
  ixer.addIndex("primitive", "primitive", Indexing.create.lookup([0, false]));
  ixer.addIndex("primitive kind to views", "primitive", Indexing.create.collector([1]));

  ixer.addIndex("editor item to type", "editor item", Indexing.create.lookup([0, 1]));

  ixer.addIndex("eveuser id to username", "eveuser", Indexing.create.lookup([0, 1]));

  // ui

  ixer.addIndex("uiComponentElement", "uiComponentElement", Indexing.create.lookup([1, false]));
  ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([2]));
  ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.lookup([1, false]));
  ixer.addIndex("parentLayerToLayers", "uiComponentLayer", Indexing.create.collector([6]));
  ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.collector([2]));
  ixer.addIndex("uiLayerToElements", "uiComponentElement", Indexing.create.collector([3]));
  ixer.addIndex("uiStyles", "uiStyle", Indexing.create.collector([1]));
  ixer.addIndex("uiStyle", "uiStyle", Indexing.create.lookup([1, false]));
  ixer.addIndex("uiElementToStyle", "uiStyle", Indexing.create.lookup([3, 2, false]));
  ixer.addIndex("uiElementToStyles", "uiStyle", Indexing.create.collector([3]));
  ixer.addIndex("stylesBySharedAndType", "uiStyle", Indexing.create.collector([4, 2]));
  ixer.addIndex("uiStyleToAttr", "uiComponentAttribute", Indexing.create.lookup([1, 2, false]));
  ixer.addIndex("uiStyleToAttrs", "uiComponentAttribute", Indexing.create.collector([1]));
  ixer.addIndex("groupToBinding", "uiGroupBinding", Indexing.create.lookup([0, 1]));
  ixer.addIndex("elementAttrToBinding", "uiAttrBinding", Indexing.create.lookup([0, 1, 2]));

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
    sortedViewFields: function(viewId) {
      var fields = (ixer.index("view to fields")[viewId] || []).slice();
      if(!fields || !fields.length) { return; }
      var fieldsLength = fields.length;
      for(var ix = 0; ix < fieldsLength; ix++) {
        var fieldId = fields[ix][1];
        fields[ix] = [ixer.index("display order")[fieldId], fieldId];
      }
      fields.sort(function(a, b) {
        var delta = a[0] - b[0];
        if(delta) { return delta; }
        else { return a[1] > b[1]; }
      });

      var fieldIds = [];
      for(var ix = 0; ix < fieldsLength; ix++) {
        fieldIds.push(fields[ix][1]);
      }

      return fieldIds;
    },
    ix: function(viewId, fieldName) {
      var field = code.nameToField(viewId, fieldName);
      if(!field) { throw new Error("Field " + fieldName + " of view " + code.name(viewId) + " not found."); }
      var namedFieldId = field[1];
      var fieldIds = code.sortedViewFields(viewId);

      for(var ix = 0; ix < fieldIds.length; ix++) {
        var fieldId = fieldIds[ix];
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
    },
    layerToChildLayers: function layerToChildLayers(layer) {
      var result = [];
      var lookup = ixer.index("parentLayerToLayers");
      var childLayers = lookup[layer[1]];
      if(!childLayers) {
        return result;
      } else {
        childLayers = childLayers.slice();
      }
      while(childLayers.length !== 0) {
        var curLayer = childLayers.pop();
        result.push(curLayer);
        var children = lookup[curLayer[1]];
        if(children && children.length) {
          childLayers.push.apply(childLayers, children);
        }
      }
      return result;
    },
    getConstraint: function(constraintId) {
      var constraint = ixer.index("constraint")[constraintId];
      var constraintLeft = ixer.index("constraint left")[constraintId] || [];
      var constraintRight = ixer.index("constraint right")[constraintId] || [];
      var constraintOperation = ixer.index("constraint operation")[constraintId] || [];

      var constraintFieldIx = code.ix("constraint left", "left field");
      var constraintSourceIx = code.ix("constraint left", "left source");
      var constraintOperationIx = code.ix("constraint operation", "operation");
      var neue = {};
      neue.leftField = constraintLeft[constraintFieldIx];
      neue.leftSource = constraintLeft[constraintSourceIx];
      neue.rightField = constraintRight[constraintFieldIx];
      neue.rightSource = constraintRight[constraintSourceIx];
      neue.operation = constraintOperation[constraintOperationIx];

      return neue;
    },
    isConstraintComplete: function(opts) {
      return (opts.leftField && opts.leftSource && opts.rightField && opts.rightSource && opts.operation) && true;
    }
  };

  var diff = {
    addView: function addView(viewId, view, noFacts) {
      var diffs = [["display name", "inserted", [viewId, view.name]],
                   ["view", "inserted", [viewId, view.kind || "table"]]];
      for(var ix = 0; ix < view.fields.length; ix++) {
        var fieldName = view.fields[ix];
        var fieldId = view.name + ": " + fieldName;
        diffs.push(["field", "inserted", [viewId, fieldId, "output"]]); // @NOTE: Can this be any other kind?
        diffs.push(["display name", "inserted", [fieldId, fieldName]]);
        diffs.push(["display order", "inserted", [fieldId, ix]]);
      }
      if(!noFacts && view.facts) {
        for(var ix = 0; ix < view.facts.length; ix++) {
          diffs.push([viewId, "inserted", view.facts[ix]]);
        }
      }

      return diffs;
    },

    addViewBlock: function addBlock(queryId, sourceViewId, kind) {
      kind = kind || "union";
      var viewId = uuid();
      var blockId = uuid();
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, kind]],
                   ["tag", "inserted", [viewId, "local"]]];

      if(sourceViewId) {
        diffs.push.apply(diffs, diff.addViewSource(viewId, sourceViewId));
      }
      return diffs;
    },

    addAggregateBlock: function addBlock(queryId, kind) {
      var viewId = uuid();
      var blockId = uuid();
      var diffs = [["view", "inserted", [viewId, "aggregate"]],
                   ["block", "inserted", [queryId, blockId, viewId]],
                   ["source", "inserted", [viewId, "inner", "empty"]],
                   ["source", "inserted", [viewId, "outer", "empty"]],
                   ["block aggregate", "inserted", [viewId, kind]]];
      return diffs;
    },

    addUnionBlock: function addBlock(queryId) {
      var viewId = uuid();
      var blockId = uuid();
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, "union"]]];
      return diffs;
    },

    addViewSelection: function addViewSelection(viewId, sourceId, sourceFieldId, fieldId) {
      var neue;
      var diffs = [];
      if(!fieldId) {
        fieldId = uuid();
        neue = [viewId, fieldId, sourceId, sourceFieldId];

        var old = ixer.index("view and source field to select")[viewId] || {};
        old = old[sourceFieldId];
        var changed = true;
        if(old) {
          changed = !Indexing.arraysIdentical(old, neue);
          if(changed) {
            diffs.push(["select", "removed", old]);
          }
        }
        if(changed) {
          var blockFieldId = uuid();
          var name = code.name(sourceFieldId);
          var order = ixer.index("display order")[sourceFieldId];

          diffs.push(["field", "inserted", [viewId, fieldId, "output"]],
                     ["display order", "inserted", [fieldId, 0]],
                     ["display name", "inserted", [fieldId, name]],
                     ["block field", "inserted", [blockFieldId, viewId, "selection", viewId, fieldId]],
                     ["display order", "inserted", [blockFieldId, 0]],
                     ["display name", "inserted", [blockFieldId, name]],
                     ["select", "inserted", neue]);
        }
      } else {
        neue = [viewId, fieldId, sourceId, sourceFieldId];
        var old = ixer.index("view and source and field to select")[viewId] || {};
        old = old[sourceId] || {};
        old = old[fieldId];
        var changed = true;
        if(old) {
          changed = !Indexing.arraysIdentical(old, neue);
          if(changed) {
            diffs.push(["select", "removed", old]);
          }
        }
        if(changed) {
          diffs.push(["select", "inserted", neue]);
        }
      }

      return diffs;
    },
    cacheViewSourceFields: function(viewId, sourceId, sourceViewId) {
      var diffs = [];
      var oldFacts = ixer.index("view and source to block fields")[viewId] || {};
      oldFacts = oldFacts[sourceId] || [];
      for(var ix = 0; ix < oldFacts.length; ix++) {
        var oldFact = oldFacts[ix];
        var id = oldFact[code.ix("block field", "block field")];
        var oldOrder = ixer.index("display order")[id];
        var oldName = ixer.index("display name")[id];
        diffs.push(["block field", "removed", oldFact]);
      };
      var fields = ixer.index("view to fields")[sourceViewId] || [];
      for(var ix = 0; ix < fields.length; ix++) {
        var blockId = uuid();
        var fieldId = fields[ix][code.ix("field", "field")];
        diffs.push(["block field", "inserted", [blockId, viewId, sourceId, sourceViewId, fieldId]]);
      }

      return diffs;
    },
    computePrimitives: function cachePrimitives() {
      var primitives = ixer.index("view kind to views").primitive || [];
      return primitives.map(function(primitive) {
        var viewId = primitive[code.ix("view", "view")];
        var fields = ixer.index("view to fields")[viewId] || [];
        var type = "scalar";
        var isVector = fields.some(function(field) {
          var kind = field[code.ix("field", "kind")];
          if(kind === "vector input") {
            return true;
          }
        });
        if(isVector) {
          type = "vector";
        }

        return ["primitive", "inserted", [viewId, type]];
      });
    },
    addViewSource: function addViewSource(viewId, sourceViewId, kind) {
      var sourceId = kind || uuid();
      var queryId = ixer.index("view to query")[viewId];

      var displayId = sourceId;
      if(sourceId == "inner" || sourceId === "outer" || sourceId === "insert" || sourceId === "remove") {
        displayId = viewId + "-" + sourceId;
      }

      if(queryId === undefined) { queryId = code.activeItemId(); }
      var count = code.countSource(queryId, sourceViewId);
      var name = code.name(sourceViewId) + (count ? " (" + (count + 1) + ")" : "");
      var neue = [viewId, sourceId, sourceViewId];
      var diffs = [["source", "inserted", neue],
                   ["display name", "inserted", [displayId, name]],
                   ["display order", "inserted", [displayId, 0]]];

      var old = ixer.index("source")[viewId] || {};
      old = old[sourceId];
      if(old && !Indexing.arraysIdentical(old, neue)) {
        diffs.push(["source", "removed", old]);
      }

      diffs = diffs.concat(diff.cacheViewSourceFields(viewId, sourceId, sourceViewId));

      return diffs;
    },
    addPrimitiveSource: function addPrimitiveSource(viewId, primitiveId) {
      var diffs = diff.addViewSource(viewId, primitiveId);
      var sourceId = diffs[0][2][code.ix("source", "source")];

      var fields = ixer.index("view to fields")[primitiveId] || [];
      fields.forEach(function(field) {
        var id = field[code.ix("field", "field")];
        var kind = field[code.ix("field", "kind")];
        if(kind === "vector input" || kind === "scalar input") {
          diffs = diffs.concat(diff.addViewConstraint(viewId, {operation: "=", leftSource: sourceId, leftField: id}));
        }
      });
      return diffs;
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
      if(oldConstraint && opts.view && oldConstraint[code.ix("constraint", "view")] !== opts.view) {
        diffs.push(["constraint", "removed", oldConstraint]);
      }
      var oldConstraintLeft = ixer.index("constraint left")[constraintId];
      if(oldConstraintLeft && (opts.leftSource || opts.leftField) &&
        (opts.leftSource !== oldConstraintLeft[sideSource] || opts.leftField !== oldConstraintLeft[sideField])) {
        diffs.push(["constraint left", "removed", oldConstraintLeft]);
      }
      var oldConstraintRight = ixer.index("constraint right")[constraintId];
      if(oldConstraintRight && (opts.rightSource || opts.rightField) &&
         (opts.rightSource !== oldConstraintRight[sideSource] || opts.rightField !== oldConstraintRight[sideField])) {
        diffs.push(["constraint right", "removed", oldConstraintRight]);
      }
      var oldConstraintOperation = ixer.index("constraint operation")[constraintId];
      if(oldConstraintOperation && opts.operation && opts.operation !== oldConstraintOperation[code.ix("constraint operation", "operation")]) {
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
    updateAggregateSort: function(viewId, field, direction) {
      var diffs = [];
      var neue;
      var old = ixer.index("view to aggregate sorting")[viewId];
      if(old) {
        neue = old.slice();
      } else {
        neue = [viewId, field || "", 1000, direction || ""];
      }

      neue[1] = field || neue[1];
      neue[3] = direction || neue[3] || "ascending";
      diffs.push(["aggregate sorting", "inserted", neue]);
      if(old && !Indexing.arraysIdentical(neue, old)) {
        diffs.push(["aggregate sorting", "removed", old]);
      }

      return diffs;
    },
    duplicateElement: function(element, id, txId) {
      var diffs = [];
      var oldId = element[1];
      var neue = element.slice();
      //generate new ids for the element, everything else remains
      neue[0] = txId;
      neue[1] = id;
      diffs.push(["uiComponentElement", "inserted", neue]);
      //duplicate all of the attributes
      var styles = ixer.index("uiElementToStyles")[oldId];
      if(styles) {
        styles.forEach(function(cur) {
          if(cur[4] === false) {
            diffs.push.apply(diffs, diff.duplicateStyle(cur, neue[1], txId));
          } else {
            var style = cur.slice();
            style[0] = txId;
            style[3] = id;
            diffs.push(["uiStyle", "inserted", style]);
          }
        });
      }
      return diffs;
    },
    duplicateStyle: function(toDuplicate, elementId, txId) {
      var diffs = [];
      var style = toDuplicate.slice();
      var oldId = toDuplicate[1];
      var neueId = uuid();
      style[0] = txId;
      style[1] = neueId;
      style[3] = elementId;
      diffs.push(["uiStyle", "inserted", style]);
      var styles = ixer.index("uiStyleToAttrs")[oldId];
      if(styles) {
        styles.forEach(function(attr) {
          var neueAttr = attr.slice();
          neueAttr[1] = neueId;
          diffs.push(["uiComponentAttribute", "inserted", neueAttr]);
        })
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

  function injectViews(tableGroups, ixer, noFacts) {
    var diffs = [];
    var add = function(viewId, view) {
      diffs = diffs.concat(diff.addView(viewId, view, noFacts));
      diffs.push(["editor item", "inserted", [viewId, "table"]]);
    };

    for(var tableGroup in tableGroups) {
      var tables = tableGroups[tableGroup];
      for(var tableId in tables) {
        add(tableId, tables[tableId]);
      }
    }

    ixer.handleDiffs(diffs);
  }

  var localState = {txId: 0,
                    uiActiveLayer: null,
                    openLayers: {},
                    activeItem: 1,
                    showMenu: true,
                    uiGridSize: 10};


  return {localState: localState,
          ixer: ixer,
          initIndexer: initIndexer,
          code: code,
          diff: diff,
          clone: clone,
          builtins: tables,
          arraysIdentical: Indexing.arraysIdentical};
})(Indexing);

