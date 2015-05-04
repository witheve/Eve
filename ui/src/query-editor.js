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
    // Editor
    "activeQuery": {name: "activeQuery", fields: ["query"], facts: [[1]]},
    "block": {name: "block", fields: ["block", "query", "viewlet"]},
    "viewlet": {name: "viewlet", fields: ["viewlet", "query", "schema"]},
    "viewletSource": {name: "viewletSource", fields: ["source", "viewlet", "sourceView", "ix"]},
    "viewletSourceFilter": {name: "viewletSourceFilter", fields: ["filter", "viewlet", "source", "field", "relation", "value", "type"]},

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
  };

  // These two need to be hardcoded for code.ix to work.
  ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
  ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));

  ixer.addIndex("displayName", "displayName", Indexing.create.lookup([0, 1]));
  ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
  ixer.addIndex("block", "block", Indexing.create.lookup([0, false]));
  ixer.addIndex("queryToBlocks", "block", Indexing.create.collector([1]));
  ixer.addIndex("viewlet", "viewlet", Indexing.create.lookup([0, false]));
  ixer.addIndex("viewletToQuery", "viewlet", Indexing.create.lookup([0, 1]));
  ixer.addIndex("viewletToSchema", "viewlet", Indexing.create.lookup([0, 2]));
  ixer.addIndex("queryToViewlets", "viewlet", Indexing.create.collector([1]));
  ixer.addIndex("viewletToSources", "viewletSource", Indexing.create.collector([1]));
  ixer.addIndex("viewletSourceToFilters", "viewletSourceFilter", Indexing.create.collector([1, 2]));
  ixer.addIndex("viewletSourceFilter", "viewletSourceFilter", Indexing.create.lookup([0, false]));

  //---------------------------------------------------------
  // Data interaction code
  //---------------------------------------------------------

  var code = {
    name: function(id) {
      return ixer.index("displayName")[id];
    },
    activeQueryId: function() {
      return (ixer.first("activeQuery") || [])[0];
    },
    nameToField(viewId, fieldName) {
      var schemaId = ixer.index("viewToSchema")[viewId];
      var fields = ixer.index("schemaToFields")[schemaId];
      for(var ix = 0, len = fields.length; ix < len; ix++) {
        if(code.name(fields[ix][0]) === fieldName) {
          return fields[ix];
        }
      }
    },
    ix: function(viewId, fieldName) {
      var field = code.nameToField(viewId, fieldName);
      if(field) {
        return field[2];
      }
    }
  };

  var diff = {
    addView: function addView(viewId, view) {
      var schemaId = view.name + "Schema-" + uuid().slice(0, 8);
      var diffs = [["displayName", "inserted", [viewId, view.name]],
                   ["view", "inserted", [viewId, schemaId]]];
      for(var ix = 0; ix < view.fields.length; ix++) {
        var fieldName = view.fields[ix];
        var fieldId = fieldName + "-" + uuid().slice(0, 8);
        diffs.push(["field", "inserted", [fieldId, schemaId, ix]]);
        diffs.push(["displayName", "inserted", [fieldId, fieldName]]);
      }
      for(var ix = 0; view.facts && ix < view.facts.length; ix++) {
        diffs.push([viewId, "inserted", view.facts[ix]]);
      }

      return diffs;
    },

    addViewBlock: function addBlock(queryId, sourceId) {
      var viewletId = uuid();
      var schemaId = "viewletSchema-" + viewletId.slice(0, 8);
      var blockId = uuid();
      var diffs = [["block", "inserted", [blockId, queryId, viewletId]],
                   ["viewlet", "inserted", [viewletId, queryId, schemaId]]];

      if(sourceId) {
        diffs.push.apply(diffs, diff.addViewletSource(viewletId, sourceId));
        var name = code.name(sourceId);
        if(name) {
          diffs.push(["displayName", "inserted", [viewletId, name + " viewlet"]]);
        }
      }
      return diffs;
    },
    removeViewlet: function removeViewlet(viewletId) {
      var old = ixer.index("viewlet")[viewletId];
      return [["viewlet", "removed", old]];
    },
    removeBlock: function removeBlock(blockId) {
      var old = ixer.index("block")[blockId];
      return [["block", "removed", old]];
    },
    addViewletSource: function addViewletSource(viewletId, sourceId) {
      var sources = ixer.index("viewletToSources")[viewletId] || [];
      return [["viewletSource", "inserted", [uuid(), viewletId, sourceId, sources.length]]];
    },
    addViewletSourceFilter: function addViewletSourceFilter(viewletId, sourceId) {
      return [["viewletSourceFilter", "inserted", [uuid(), viewletId, sourceId, "foo", "=", "bar", "constant"]]];
    }
  };

  function injectViews(tables, ixer) {
    var diffs = [];
    var add = function(viewId, view) {
      diffs = diffs.concat(diff.addView(viewId, view));
    };
    add("displayName", {name: "displayName", fields: ["id", "name"]});
    add("view", {name: "view", fields: ["view", "schema"]});
    add("field", {name: "field", fields: ["field", "schema", "ix"]});

    for(var tableId in tables) {
      add(tableId, tables[tableId]);
    }

    ixer.handleDiffs(diffs);
  }

  function dispatch(evt, info) {
    var diffs = [];
    switch(evt) {
      case "addViewBlock":
        diffs = diff.addViewBlock(code.activeQueryId(), info.sourceId);
        break;
      case "addViewletSource":
        diffs = diff.addViewletSource(info.viewletId, info.sourceId);
        break;
      case "addViewletSourceFilter":
        diffs = diff.addViewletSourceFilter(info.viewletId, info.sourceId);
        break;
      case "updateViewletSourceFilter":
        var ix = code.ix("viewletSourceFilter", info.type);
        var old = ixer.index("viewletSourceFilter")[info.filterId];
        var neue = old.slice();
        neue[ix] = info.value;
        if(info.type === "type") {
          neue[code.ix("viewletSourceFilter", "value")] = ""; // Clear value on type change.
        }
        diffs = [["viewletSourceFilter", "removed", old],
                ["viewletSourceFilter", "inserted", neue]];


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
  // Root
  //---------------------------------------------------------

  function root() {
    var queryId = code.activeQueryId();

    return {id: "root",
            c: "query-editor",
            children: [
              treePane(queryId),
              editor(queryId),
              inspectorPane(queryId)
            ]};
  }

  //---------------------------------------------------------
  // Tree + Toolbar
  //---------------------------------------------------------

  function treePane(queryId) {
    var items = [];

    var viewlets = ixer.index("queryToViewlets")[queryId];
    for(var ix = 0; ix < viewlets.length; ix++) {
      var id = viewlets[ix][0];
      items.push(treeItem(id, "viewlet"));
    }

    items.push({t: "hr", c: "sep"});

    var views = ixer.facts("view");
    for(var ix = 0; ix < views.length; ix++) {
      var id = views[ix][0];
      items.push(treeItem(id, "view"));
    }

    return {c: "tree pane", children: items};
  }

  function treeItem(id, type) {
    return {c: "tree-item", text: code.name(id) || "Untitled", itemId: id, itemType: type, treeType: "view", draggable: true, dragstart: dragItem};
  }

  function dragItem(evt, elem) {
    evt.dataTransfer.setData("type", elem.treeType || "tree-item");
    evt.dataTransfer.setData("itemId", elem.itemId);
    evt.dataTransfer.setData("itemType", elem.itemType);
  }

  function queryToolbar(queryId) {
    var items = ["filter", "aggregate"].map(queryToolbarItem);
    return {c: "toolbar query-toolbar", children: items};
  }

  function queryToolbarItem(type) {
    return {c: "tool query-tool", text: type, itemId: type, itemType: type, treeType: "tool", draggable: true, dragstart: dragItem};
  }

  //---------------------------------------------------------
  // Editor
  //---------------------------------------------------------
  function editor(queryId) {
    var blocks = ixer.index("queryToViewlets")[queryId];
    var items = [];
    for(var ix = 0; ix < blocks.length; ix++) {
      var viewletId = blocks[ix][code.ix("viewlet", "viewlet")];
      items.push(viewBlock(viewletId));
    }

    if(items.length) {
      items.unshift(queryToolbar(queryId));
    }

    return {c: "workspace", drop: editorDrop, dragover: preventDefault, children: items.length ? items : [
      {c: "feed", text: "Feed me sources"}
    ]};
  }

  function editorDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var itemType = evt.dataTransfer.getData("itemType");
    if(type !== "view") {
      console.log("Incorrect tree type", type, itemType);
      return;
    }
    var sourceId = evt.dataTransfer.getData("itemId");
    dispatch("addViewBlock", {sourceId: sourceId});
  }

  function viewBlock(viewletId) {
    var sources = ixer.index("viewletToSources")[viewletId] || [];
    sources.sort(function(a, b) {
      var ixIx = code.ix("viewletSource", "ix");
      return a[ixIx] - b[ixIx];
    });
    var sourceItems = sources.map(function(source) {
      var sourceId = source[code.ix("viewletSource", "sourceView")];
      return viewletSourceItem(viewletId, sourceId);
    });

    return {c: "block view-block", viewletId: viewletId, drop: viewBlockDrop, dragover: preventDefault, children: [
      {t: "h3", c: "title", text: code.name(viewletId) || "Untitled"},
      {c: "block-section sources", children: sourceItems},
      {c: "block-section group-filters", children: []}
    ]};
  }

  function viewBlockDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var itemType = evt.dataTransfer.getData("itemType");
    if(type !== "view") {
      console.log("Incorrect tree type", type, itemType);
      return;
    }
    var viewletId = elem.viewletId;
    var sourceId = evt.dataTransfer.getData("itemId");
    if(viewletId === sourceId) { return console.error("Cannot join viewlet with self."); }
    dispatch("addViewletSource", {viewletId: viewletId, sourceId: sourceId});
    evt.stopPropagation();
  }

  function viewletSourceItem(viewletId, sourceId) {
    var queryId = ixer.index("viewletToQuery")[viewletId];
    var schemaId = ixer.index("viewletToSchema")[sourceId];
    if(!schemaId) {
      schemaId = ixer.index("viewToSchema")[sourceId];
    }
    var filters = ixer.index("viewletSourceToFilters")[viewletId];
    if(filters) { filters = filters[sourceId]; }
    if(!filters) { filters = []; }

    var filterItems = filters.map(function(filter) {
      var filterId = filter[code.ix("viewletSourceFilter", "filter")];
      var field = filter[code.ix("viewletSourceFilter", "field")];
      var relation = filter[code.ix("viewletSourceFilter", "relation")];
      var value = filter[code.ix("viewletSourceFilter", "value")];
      var type = filter[code.ix("viewletSourceFilter", "type")];
      return {c: "viewlet-source-filter", children: [
        token.field({schema: schemaId, value: field, key: filterId}, updateViewletSourceFilter),
        token.relation({value: relation, key: filterId}, updateViewletSourceFilter),
        token.value({value: (type === "constant" ? value : code.name(value)) || "<value>", key: filterId, type: type, viewletId: viewletId, queryId}, updateViewletSourceFilter)
      ]};
    });
    return {c: "viewlet-source", viewletId: viewletId, sourceId: sourceId, drop: viewletSourceDrop, dragover: preventDefault, children: [
      {t: "h4", c: "title", text: code.name(sourceId) || "Untitled"},
      (filterItems.length ? {c: "filters", children: filterItems} : undefined)
    ]};
  }

  function viewletSourceDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var itemType = evt.dataTransfer.getData("itemType");
    if(type !== "tool" || itemType !== "filter") {
      console.log("Incorrect tree/item type", type, itemType);
      return;
    }
    var viewletId = elem.viewletId;
    var sourceId = elem.sourceId;
    dispatch("addViewletSourceFilter", {viewletId: viewletId, sourceId: sourceId});
    evt.stopPropagation();
  }

  function updateViewletSourceFilter(evt, elem) {
    dispatch("updateViewletSourceFilter", {filterId: elem.key, type: elem.tokenType, value: elem.value});
    stopEditToken(evt, elem);
    evt.stopPropagation();
  }


  //---------------------------------------------------------
  // Tokens
  //---------------------------------------------------------

  var tokenState = {};

  var token = {
    field: function(params, onChange) {
      var state = tokenState[params.key];
      if(state) { state = state.field; }

      return {c: "token field",
              key: params.key,
              tokenType: "field",
              children: [{c: "name", text: code.name(params.value) || "<field>"},
                         (state === 1) ? tokenEditor.field(params, onChange) : undefined],
              click: editToken};
    },
    relation: function(params, onChange) {
      var state = tokenState[params.key];
      if(state) { state = state.relation; }

      return {c: "token relation",
              key: params.key,
              tokenType: "relation",
              children: [{c: "name", text: params.value || "<rel>"},
                         (state === 1) ? tokenEditor.relation(params, onChange) : undefined],
              click: editToken};
    },
    value: function(params, onChange) {
      var state = tokenState[params.key];
      if(state) { state = state.value; }

      return {c: "token value",
              key: params.key,
              tokenType: "value",
              children: [{c: "name", text: params.value || "<value>"},
                         (state === 1) ? tokenEditor.value(params, onChange) : undefined],
              click: editToken};
    }
  };

  function editToken(evt, elem) {
    var state = tokenState[elem.key];
    if(!state) { state = tokenState[elem.key] = {}; }
    state[elem.tokenType] = 1;
    render();
  }

  function stopEditToken(evt, elem) {
    var state = tokenState[elem.key];
    state[elem.tokenType] = 0;
    render();

  }

  var tokenEditor = {
    field: function(params, onChange) {
      var fields = getSchemaFields(params.schema);
      var items = fields.map(function fieldItem(field) {
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
        item.tokenType = "field";
        return item;
      });
      var select = selector(items, {c: "field", tabindex: -1, key: params.key, focus: true}, stopEditToken);
      select.tokenType = "field";
      return select;
    },
    relation: function(params, onChange) {
      var items = ["=", "<", "≤", ">", "≥", "≠"].map(function(rel) {
        var item = selectorItem({c: "relation", key: params.key, name: rel, value: rel}, onChange);
        item.tokenType = "relation";
        return item;
      });
      var select = selector(items, {c: "relation", tabindex: -1, key: params.key, focus: true}, stopEditToken);
      select.tokenType = "relation";
      return select;
    },
    value: function(params, onChange) {
      var type = params.type;
      var typeItems = ["constant", "filter", "gather"].map(function(cur) {
        var item = selectorItem({c: "value-type" + (type === "cur" ? " active" : ""), key: params.key, name: cur, value: cur}, onChange);
        item.tokenType = "type";
        return item;
      });
      var valueEditor;
      var fields;
      if(type === "constant") {
        valueEditor = {t: "input"};
      } else if(type === "filter") {
        fields = getViewletFields(params.viewletId);
      } else if(type === "gather") {
        fields = getQueryFields(params.queryId, params.viewletId);
      }
      if(!valueEditor && fields) {
        var items = fields.map(function fieldItem(field) {
          var fieldId = field[code.ix("field", "field")];
          var item = selectorItem({c: "value", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
          item.tokenType = "value";
          return item;
        });
        valueEditor = selector(items, {c: "value", key: params.key}, stopEditToken);
        valueEditor.tokenType = "value";
      }

      return {c: "token-selector value", tabindex: -1, tokenType: "value", key: params.key,
              postRender: focusOnce, blur: stopEditToken, children: [
                {t: "ul", c: "type-selector", children: typeItems},
                {c: "value-pane", children: [valueEditor]}
              ]};
    }
  };

  function getSchemaFields(schemaId) {
    return ixer.index("schemaToFields")[schemaId] || [];
  }

  function getViewletFields(viewletId) {
    var sources = ixer.index("viewletToSources")[viewletId] || [];
    return sources.reduce(function(memo, source) {
      var sourceViewId = source[code.ix("viewletSource", "sourceView")];
      var schemaId = ixer.index("viewletToSchema")[sourceViewId];
      if(!schemaId) {
        schemaId = ixer.index("viewToSchema")[sourceViewId];
      }
      memo.push.apply(memo, getSchemaFields(schemaId));
      return memo;
    }, []);
  }

  function getQueryFields(queryId, exclude) {
    var viewlets = ixer.index("queryToViewlets")[queryId] || [];
    return viewlets.reduce(function(memo, viewlet) {
      var viewletId = viewlet[code.ix("viewlet", "viewlet")];
      if(viewletId !== exclude && viewletId) {
        memo.push.apply(memo, getViewletFields(viewletId));
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

  function resultPane(queryId) {
    return {c: "result pane"};
  }




  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------
  injectViews(tables, ixer);
  ixer.handleDiffs(diff.addViewBlock(code.activeQueryId()));
  render();

  return { container: renderer.content, ixer: ixer };
})(window, microReact, Indexing);
