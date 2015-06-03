if(!window.DEBUG) {
  window.DEBUG = {RECEIVE: 3,
                  SEND: 3,
                  INDEXER: 0};
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

  function displaySort(idA, idB) {
    var orderA = ixer.index("display order")[idA];
    var orderB = ixer.index("display order")[idB];
    if(orderB - orderA) { return orderB - orderA; }
    else { return idA.localeCompare(idB); }
  }

  function invert(obj) {
    var res = {};
    for(var key in obj) {
      if(!obj.hasOwnProperty(key)) { continue; }
      res[obj[key]] = key;
    }
    return res;
  }

  var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  var alphabetLower = alphabet.map(function(char) {
    return char.toLowerCase();
  });
  var alphabetLowerToIx = invert(alphabetLower);


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

      "display order": {name: "display order", fields: ["id", "priority"]},
      "display name": {name: "display name", fields: ["id", "name"]},

      "view dependency": {name: "view dependency", fields: ["upstream view", "ix", "source", "downstream view"]},
      "view schedule": {name: "view schedule", fields: ["view", "ix"]},
      "source dependency": {name: "source dependency", fields: ["upstream source", "upstream field", "downstream source", "downstream field"]},
      "source schedule": {name: "source schedule", fields: ["view", "source", "ix"]},
      "constraint schedule": {name: "constraint schedule", fields: ["constraint", "ix"]},
      "index layout": {name: "index layout", fields: ["view", "field", "ix"]},
      "view constant": {name: "view constant", fields: ["view", "constant"]},
      "view layout": {name: "view layout", fields: ["view", "source", "field", "ix"]},
    },
    editor: {
      initialized: {name: "initialized", fields: ["initialized"], facts: [[true]]},
      primitive: {name: "primitive", fields: ["view", "kind"]},
      "editor item": {name: "editor item", fields: ["item", "type"], facts: []},
      block: {name: "block", fields: ["query", "block", "view"]},
      "block aggregate": {name: "block aggregate", fields: ["view", "kind"]},
      "block field": {name: "block field", fields: ["block field", "view", "source", "source view", "field"]},
      "calculated field": {name: "calculated field", fields: ["calculated field", "view", "source", "source view", "field"]},
      "empty view": {name: "empty view", fields: [], facts: [[]]},
      "client event": {name: "client event", fields: ["session", "eventId", "type", "element", "row"]},
      "mouse position": {name: "mouse position", fields: ["session", "eventId", "x", "y"]},
      "eveusers": {name: "eveusers", fields: ["id", "username"]},
      "sessions": {name: "sessions", fields: ["id", "user id", "status"]},
      "query export": {name: "query export", fields: ["query", "view"]},

      //ui
      "uiComponentElement": {name: "uiComponentElement", fields: ["tx", "id", "component", "layer", "control", "left", "top", "right", "bottom", "zindex"], facts: []},
      "uiComponentLayer": {name: "uiComponentLayer", fields: ["tx", "id", "component", "layer", "locked", "hidden", "parentLayer"], facts: []},
      "uiComponentAttribute": {name: "uiComponentAttribute", fields: ["tx", "id", "property", "value"]},
      "uiStyle": {name: "uiStyle", fields: ["tx", "id", "type", "element", "shared"]},
      "uiGroupBinding": {name: "uiGroupBinding", fields: ["group", "view"]},
      "uiAttrBinding": {name: "uiAttrBinding", fields: ["elementId", "attr", "field"]},

    },

    example: {

      "department heads": {name: "department heads", fields: ["department", "head"]},
      "employees": {name: "employees", fields: ["department", "name", "salary"]},


      "book": {name: "book", fields: ["isbn", "title", "author", "price", "cost"]},
      "book sales": {name: "book sales", fields: ["order", "sales"]},
      "PDGF assay": {name: "PDGF assay", fields: ["PDGF concentration", "Seed density", "Well #", "Absorbance"]},
    },

    foursquare: {
      "click": {name: "click", fields: ["event number", "button", "binding"]},
      "place": {name: "place", fields: ["place", "name", "priceRange"]},
      "place to address": {name: "place to address", fields: ["place", "street", "city", "state", "zip"]},
      "place to hours": {name: "place to hours", fields: ["place", "day", "start", "end"]},
      "place to rating": {name: "place to rating", fields: ["place", "rating", "reviewCount"]},
      "place to image": {name: "place to image", fields: ["image", "place"]},
      "image": {name: "image", fields: ["image", "user", "url", "description", "tick"]},
      "taste": {name: "taste", fields: ["taste", "name"]},
      "place to taste": {name: "place to taste", fields: ["tick","place", "taste", "rank"]},
      "review": {name: "review", fields: ["tick", "place", "user", "text", "rating", "approved"]},
      "user": {name: "user", fields: ["id", "token", "name"]},
      "user checkin": {name: "user checkin", fields: ["tick", "user", "place"]}
    },

    test: {
      edge: {name: "edge", fields: ["to", "from"], facts: [["a", "b"], ["b", "c"], ["c", "d"]]},
      numbers: {name: "numbers", fields: ["x"], facts: [[0], [1], [2], [3]]},
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
  ixer.addIndex("field", "field", Indexing.create.lookup([1, false]));
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
  ixer.addIndex("constraint to source", "constraint left", Indexing.create.lookup([0, 1]));
  ixer.addIndex("constraint right", "constraint right", Indexing.create.lookup([0, false]));
  ixer.addIndex("constraint operation", "constraint operation", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to selects", "select", Indexing.create.collector([0]));
  ixer.addIndex("view and source field to select", "select", Indexing.create.lookup([0, 3, false]));
  ixer.addIndex("view and source and field to select", "select", Indexing.create.lookup([0, 2, 1, false]));
  ixer.addIndex("aggregate sorting", "aggregate sorting", Indexing.create.lookup([0, false]));
  ixer.addIndex("aggregate limit from", "aggregate limit from", Indexing.create.lookup([0, false]));
  ixer.addIndex("aggregate limit to", "aggregate limit to", Indexing.create.lookup([0, false]));
  ixer.addIndex("aggregate grouping", "aggregate grouping", Indexing.create.lookup([0, false]));
  ixer.addIndex("id to tags", "tag", Indexing.create.collector([0]));

  // editor
  ixer.addIndex("block", "block", Indexing.create.lookup([1, false]));
  ixer.addIndex("block to query", "block", Indexing.create.lookup([1, 0]));
  ixer.addIndex("view to query", "block", Indexing.create.lookup([2, 0]));
  ixer.addIndex("view to block", "block", Indexing.create.lookup([2, 1]));
  ixer.addIndex("query to blocks", "block", Indexing.create.collector([0]));
  ixer.addIndex("block field", "block field", Indexing.create.lookup([0, false]));
  ixer.addIndex("view and source to block fields", "block field", Indexing.create.collector([1, 2]));
  ixer.addIndex("calculated field", "calculated field", Indexing.create.lookup([0, false]));
  ixer.addIndex("view to calculated fields", "calculated field", Indexing.create.collector([1]));
  ixer.addIndex("field to calculated field", "calculated field", Indexing.create.lookup([4, 0]));
  ixer.addIndex("view and source to calculated field", "calculated field", Indexing.create.lookup([1, 2, 0]));
  ixer.addIndex("block aggregate", "block aggregate", Indexing.create.lookup([0, false]));
  ixer.addIndex("primitive", "primitive", Indexing.create.lookup([0, false]));
  ixer.addIndex("primitive kind to views", "primitive", Indexing.create.collector([1]));
  ixer.addIndex("query to export", "query export", Indexing.create.lookup([0, 1]));

  ixer.addIndex("editor item to type", "editor item", Indexing.create.lookup([0, 1]));

  ixer.addIndex("eveusers id to username", "eveusers", Indexing.create.lookup([0, 1]));

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
  ixer.addIndex("stylesBySharedAndType", "uiStyle", Indexing.create.collector([4, 2, 1]));
  ixer.addIndex("uiStyleToAttr", "uiComponentAttribute", Indexing.create.lookup([1, 2, false]));
  ixer.addIndex("uiStyleToAttrs", "uiComponentAttribute", Indexing.create.collector([1]));
  ixer.addIndex("groupToBinding", "uiGroupBinding", Indexing.create.lookup([0, 1]));
  ixer.addIndex("elementAttrToBinding", "uiAttrBinding", Indexing.create.lookup([0, 1, 2]));
  ixer.addIndex("elementAttrBindings", "uiAttrBinding", Indexing.create.collector([0]));

  ixer.addIndex("uiElementToMap", "uiMap", Indexing.create.latestLookup({keys: [2, false]}));
  ixer.addIndex("uiMapAttr", "uiMapAttr", Indexing.create.lookup([0, 1, 2]));


  //---------------------------------------------------------
  // Data interaction code
  //---------------------------------------------------------

  var code = {
    name: function(id) {
      return ixer.index("display name")[id];
    },
    hasTag: function(id, tag) {
      var tags = ixer.index("id to tags")[id] || [];
      var valueIx = code.ix("tag", "tag");
      return tags.some(function(cur) {
        return cur[valueIx] === tag;
      });
    },
    activeItemId: function() {
      //       return (ixer.first("active editor item") || [])[0];
      return localState.activeItem;
    },
    queryViews: function(queryId) {
      var blockViewIx = code.ix("block", "view");
      return (ixer.index("query to blocks")[queryId] || []).map(function(block) {
        return block[blockViewIx];
      });
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
        var delta = b[0] - a[0];
        if(delta) { return delta; }
        else { return a[1].localeCompare(b[1]); }
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
      var neue = {id: constraintId,
                  view: constraint[code.ix("constraint", "view")],
                  leftField: constraintLeft[constraintFieldIx],
                  leftSource: constraintLeft[constraintSourceIx],
                  rightField: constraintRight[constraintFieldIx],
                  rightSource: constraintRight[constraintSourceIx],
                  operation: constraintOperation[constraintOperationIx]};


      return neue;
    },
    isConstraintComplete: function(opts) {
      return (opts.leftField && opts.leftSource && opts.rightField && opts.rightSource && opts.operation) && true;
    },
    getViewSourceConstraints: function(viewId, sourceId) {
      var constraintIdIx = code.ix("constraint left", "constraint");
      var constraints = ixer.index("source to constraints")[sourceId] || {};
      var constraintIds = constraints.map(function(constraint) {
        return constraint[constraintIdIx];
      }).filter(function(constraintId) {
        return ixer.index("constraint to view")[constraintId] === viewId;
      });
      return constraintIds;
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
        diffs.push(["display order", "inserted", [fieldId, -ix]]);
      }
      if(!noFacts && view.facts) {
        for(var ix = 0; ix < view.facts.length; ix++) {
          diffs.push([viewId, "inserted", view.facts[ix]]);
        }
      }

      return diffs;
    },

    addViewBlock: function addBlock(queryId, sourceViewId, kind, viewId) {
      kind = kind || "union";
      var viewId = viewId || uuid();
      var blockId = uuid();
      var queryViews = code.queryViews(queryId);
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, kind]],
                   ["display name", "inserted", [viewId, getUniqueName(queryViews, alphabet)]],
                   ["tag", "inserted", [viewId, "local"]],
                   ["tag", "inserted", [viewId, "remote"]]];

      if(sourceViewId) {
        diffs.push.apply(diffs, diff.addViewSource(viewId, sourceViewId));
      }
      return diffs;
    },

    addAggregateBlock: function addBlock(queryId, kind) {
      var viewId = uuid();
      var blockId = uuid();
      var queryViews = code.queryViews(queryId);
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, "aggregate"]],
                   ["display name", "inserted", [viewId, getUniqueName(queryViews, alphabet)]],
                   ["tag", "inserted", [viewId, "local"]],
                   ["tag", "inserted", [viewId, "remote"]],
                   ["source", "inserted", [viewId, "inner", "empty view"]],
                   ["source", "inserted", [viewId, "outer", "empty view"]],
                   ["display name", "inserted", [viewId + "-inner", "empty"]],
                   ["display name", "inserted", [viewId + "-outer", "empty"]],
                   ["block aggregate", "inserted", [viewId, kind]]];
      return diffs;
    },

    addUnionBlock: function addBlock(queryId) {
      var viewId = uuid();
      var blockId = uuid();
      var queryViews = code.queryViews(queryId);
      var diffs = [["block", "inserted", [queryId, blockId, viewId]],
                   ["view", "inserted", [viewId, "union"]],
                   ["display name", "inserted", [viewId, getUniqueName(queryViews, alphabet)]],
                   ["tag", "inserted", [viewId, "local"]]];
      return diffs;
    },

    addViewSelection: function addViewSelection(viewId, sourceId, sourceFieldId, fieldId, isCalculated) {
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
          if(isCalculated) {
            var calculatedId = ixer.index("field to calculated field")[sourceFieldId];
            if(calculatedId) {
              name = code.name(calculatedId);
            }
          }
          var fields = ixer.index("view to fields")[viewId] || [];

          diffs.push(["field", "inserted", [viewId, fieldId, "output"]],
                     ["display order", "inserted", [fieldId, -fields.length]],
                     ["display name", "inserted", [fieldId, name || ""]],
                     ["block field", "inserted", [blockFieldId, viewId, "selection", viewId, fieldId]],
                     ["select", "inserted", neue]);

          ixer.clearTable(viewId); // Hack to ensure we delete stale context.
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
      if(!ixer.index("primitive")[sourceViewId]) {
        var oldFacts = ixer.index("view and source to block fields")[viewId] || {};
        oldFacts = oldFacts[sourceId] || [];
        for(var ix = 0; ix < oldFacts.length; ix++) {
          var oldFact = oldFacts[ix];
          diffs.push(["block field", "removed", oldFact]);
        };
        var fieldIdIx = code.ix("field", "field")
        var fields = ixer.index("view to fields")[sourceViewId] || [];
        for(var ix = 0; ix < fields.length; ix++) {
          var blockId = uuid();
          var fieldId = fields[ix][fieldIdIx];
          diffs.push(["block field", "inserted", [blockId, viewId, sourceId, sourceViewId, fieldId]]);
        }
      } else {
        var calculatedIdIx = code.ix("calculated field", "calculated field");
        var calculatedFieldIds = (ixer.index("view to calculated fields")[viewId] || []).map(function(calculated) {
          return calculated[calculatedIdIx];
        });
        var calculatedNameIx = getUniqueNameIx(calculatedFieldIds, alphabetLower);

        var fieldIdIx = code.ix("field", "field")
        var fieldKindIx = code.ix("field", "kind")
        var fields = ixer.index("view to fields")[sourceViewId] || [];
        for(var ix = 0; ix < fields.length; ix++) {
          var calculatedId = uuid();
          var fieldId = fields[ix][fieldIdIx];
          var kind = fields[ix][fieldKindIx];
          if(kind === "output") {
            diffs.push(["calculated field", "inserted", [calculatedId, viewId, sourceId, sourceViewId, fieldId]],
                       ["display name", "inserted", [calculatedId, alphabetLower[calculatedNameIx++]]]);
          }
        }

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
        var oldName = ixer.index("display name")[displayId];
        diffs.push(["source", "removed", old],
                   ["display name", "removed", [displayId, oldName]]);
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
    autoJoin: function(viewId, sourceId, sourceViewId) {
      var diffs = [];
      var sources = ixer.index("view to sources")[viewId];
      if(!sources) { return diffs; }

      var fields = ixer.index("view to fields")[sourceViewId];
      if(!fields) { return diffs; }
      var fieldIdIx = code.ix("field", "field");
      var names = fields.map(function(field) {
        var fieldId = field[fieldIdIx];
        return code.name(fieldId);
      });

      var sourceIdIx = code.ix("source", "source");
      var sourceViewIx = code.ix("source", "source view");
      sources.forEach(function(source) {
        var curSourceId = source[sourceIdIx];
        var curSourceViewId = source[sourceViewIx];
        if(curSourceViewId === sourceViewId) {
          // It never makes sense to join every field in a source.
          return;
        }
        var curFields = ixer.index("view to fields")[curSourceViewId];
        if(!curFields) { return; }
        curFields.forEach(function(cur) {
          var curId = cur[fieldIdIx];
          var curName = code.name(curId);
          var fieldIx = names.indexOf(curName);
          if(fieldIx !== -1) {
            var field = fields[fieldIx];
            var fieldId = field[fieldIdIx];
            diffs = diffs.concat(diff.addViewConstraint(viewId, {leftSource: sourceId,
                                                                 leftField: fieldId,
                                                                 operation: "=",
                                                                 rightSource: curSourceId,
                                                                 rightField: curId}));
          }
        });
      });
      return diffs;
    },
    removeViewBlock: function removeViewBlock(viewId) {
      var blockId = ixer.index("view to block")[viewId];
      var block = ixer.index("block")[blockId];
      var diffs = [["block", "removed", block]];
      diffs = diffs.concat(diff.removeView(viewId));
      return diffs;
    },
    removeView: function removeView(viewId) {
      var diffs = [["view", "removed", ixer.index("view")[viewId]]];
      var view = ixer.index("view")[viewId];
      var sources = ixer.index("source")[viewId] || {};
      for(var sourceId in sources) {
        diffs = diffs.concat(diff.removeViewSource(viewId, sourceId));
      }

      var fields = ixer.index("view to fields")[viewId] || [];
      diffs = diffs.concat(fields.map(function(field) {
        return ["field", "removed", field];
      }));

      var selects = ixer.index("view to selects")[viewId] || [];
      diffs = diffs.concat(selects.map(function(select) {
        return ["select", "removed", select];
      }));

      if(view[code.ix("view", "kind")] === "aggregate") {
        diffs = diffs.concat(diff.removeAggregate(viewId));
      }
      return diffs;
    },
    removeAggregate: function removeAggregate(viewId) {
      var diffs = [];
      var aggregateGrouping = ixer.index("aggregate grouping")[viewId];
      if(aggregateGrouping) {
        diffs.push(["aggregate grouping", "removed", aggregateGrouping]);
      }

      var aggregateSorting = ixer.index("aggregate sorting")[viewId];
      if(aggregateSorting) {
        diffs.push(["aggregate sorting", "removed", aggregateSorting]);
      }

      var aggregateLimitFrom = ixer.index("aggregate limit from")[viewId];
      if(aggregateLimitFrom) {
        diffs.push(["aggregate limit from", "removed", aggregateLimitFrom]);
      }

      var aggregateLimitTo = ixer.index("aggregate limit to")[viewId];
      if(aggregateLimitTo) {
        diffs.push(["aggregate limit to", "removed", aggregateLimitTo]);
      }

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
      var old = ixer.index("aggregate sorting")[viewId];
      if(old) {
        neue = old.slice();
      } else {
        neue = [viewId, field || "", 1000, direction || "ascending"];
      }

      neue[1] = field || neue[1];
      neue[3] = direction || neue[3];
      diffs.push(["aggregate sorting", "inserted", neue]);
      if(old && !Indexing.arraysIdentical(neue, old)) {
        diffs.push(["aggregate sorting", "removed", old]);
      }

      return diffs;
    },
    updateAggregateGrouping: function(viewId, source, field) {
      var old = ixer.index("aggregate grouping")[viewId];
      var neue = old ? old.slice() : [viewId, "", ""];
      var ix = code.ix("aggregate grouping", source + " field");
      neue[ix] = field;
      var diffs = [["aggregate grouping", "inserted", neue]];
      if(old && !Indexing.arraysIdentical(old, neue)) {
        diffs.push(["aggregate grouping", "removed", old]);
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
      console.log(diffs);
      return diffs;
    },
    duplicateStyle: function(toDuplicate, elementId, txId, useStyleId) {
      var diffs = [];
      var style = toDuplicate.slice();
      var oldId = toDuplicate[1];
      var neueId = useStyleId || uuid();
      style[0] = txId;
      style[1] = neueId;
      style[3] = elementId;
      if(!useStyleId) {
        diffs.push(["uiStyle", "inserted", style]);
      }
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

  var groupsToHide = {
    "example": true,
    "compiler": true,
    "editor": true,
    "test": true
  };

  function injectViews(tableGroups, ixer, noFacts) {
    var diffs = [];
    var add = function(viewId, view, group, shouldHide) {
      diffs = diffs.concat(diff.addView(viewId, view, noFacts));
      diffs.push(["editor item", "inserted", [viewId, "table"]],
                 ["tag", "inserted", [viewId, group]]);
      if(shouldHide) {
        diffs.push(["tag", "inserted", [viewId, "hidden"]]);
      }
    };

    for(var tableGroup in tableGroups) {
      var tables = tableGroups[tableGroup];
      var shouldHide = groupsToHide[tableGroup];
      for(var tableId in tables) {
        add(tableId, tables[tableId], tableGroup, shouldHide);
      }
    }

    ixer.handleDiffs(diffs);
  }

  function getUniqueNameIx(existing, names) {
    var toIx = invert(names);
    var ix = 0;
    existing = existing || [];
    existing.forEach(function(curId) {
      var curIx = +toIx[code.name(curId)] || 0;
      if(curIx >= ix) {
        ix = curIx + 1;
      }
    });

    if(ix > names.length) {
      console.warn("name space exhausted, reusing existing names!");
      ix = 0;
    }

    return ix;
  }

  function getUniqueName(existing, names) {
    return names[getUniqueNameIx(existing, names)];
  }

  var localState = {txId: 0,
                    uiActiveLayer: null,
                    openLayers: {},
                    initialAttrs: [],
                    initialElements: [],
                    activeItem: null,
                    showMenu: true,
                    uiGridSize: 10};


  return {localState: localState,
          ixer: ixer,
          initIndexer: initIndexer,
          code: code,
          diff: diff,
          clone: clone,
          builtins: tables,
          arraysIdentical: Indexing.arraysIdentical,
          displaySort: displaySort,
          invert: invert,
          alphabet: alphabet};
})(Indexing);

