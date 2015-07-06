/// <reference path="uiEditor.ts" />
/// <reference path="tableEditor.ts" />
/// <reference path="microReact.ts" />
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="indexer.ts" />
/// <reference path="client.ts" />
/// <reference path="eveEditor.ts" />
/// <reference path="api.ts" />
module queryEditor {
  declare var uuid;
  declare var queryEditor;
  declare var DEBUG;

  var document = window.document;
  var ixer = api.ixer;
  var code = api.code;
  var diff = api.diff;
  var localState = api.localState;
  var clone = api.clone;
  var alphabet = api.alphabet;
  var KEYS = api.KEYS;

  if(window["queryEditor"]) {
    try {
      document.body.removeChild(window["queryEditor"].container);
    } catch (err) {
      // meh
    }
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

  
  function coerceInput(input) {
    if(input.match(/^-?[\d]+$/gim)) {
      return parseInt(input);
    } else if(input.match(/^-?[\d]+\.[\d]+$/gim)) {
      return parseFloat(input);
    } else if(input === "true") {
      return true;
    } else if(input === "false") {
      return false;
    }
    return input;
  }
  
  function stopPropagation(e) {
    e.stopPropagation();
  }
  function preventDefault(e) {
    e.preventDefault();
  }


  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------

  export function dispatch(evt: string, info: any) {
    //         console.info("[dispatch]", evt, info);
    var storeEvent = true;
    var sendToServer = true;
    var txId = ++localState.txId;
  	var redispatched = false;
    var diffs:api.Diff = [];
    switch(evt) {
      case "exportView":
        var changes = [api.remove("query export", {query: info.queryId}),
                       api.insert("query export", {query: info.queryId, view: info.viewId})];
        diffs = api.toDiffs(changes);
        break;
      case "addViewBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        var name = api.getUniqueName(code.queryViews(queryId), api.alphabet);
        
        diffs = api.toDiffs(api.insert("view", {
          view: info.viewId,
          kind: info.kind,
          dependents: {
            "display name": {name: name},
            tag: [{tag: "local"}, {tag: "remote"}],
            block: {query: queryId},
            source: (info.sourceId ? {
              "source view": info.sourceId
            } : undefined)
          }
        }));                                                             
        break;
      case "addAggregateBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        var name = api.getUniqueName(code.queryViews(queryId), api.alphabet);
        
        diffs = api.toDiffs(api.insert("view", {
          view: info.viewId,
          kind: "aggregate",
          dependents: {
            "display name": {name: name},
            tag: [{tag: "local"}, {tag: "remote"}],
            block: {query: queryId},
            "block aggregate": {kind: info.kind},
            source: [
              {source: "inner", "source view": "empty view"},
              {source: "outer", "source view": "empty view"},
            ]
          }
        }));
        break;
      case "removeViewBlock":
        diffs = api.toDiffs(api.remove("view", {view: info.viewId}));
        break;
      case "addViewSelection":
        var neueField;
        if(!info.fieldId || !ixer.selectOne("field", {view: info.viewId, field: info.fieldId})) {
          var name = code.name(info.sourceFieldId);
          var calculated = ixer.selectOne("calculated field", {view: info.viewId, source: info.sourceId, field: info.sourceFieldId});
          if(calculated) {
            name = code.name(calculated["calculated field: calculated field"]);
          }

          var fields = ixer.selectPretty("field", {view: info.viewId}) || [];
          neueField = api.insert("field", {view: info.viewId, field: info.fieldId, kind: "output", dependents: {
            "display name": {name: name},
            "display order": {priority: -fields.length}
          }});
          info.fieldId = neueField.content.field;
          console.log("neue", info.fieldId);
        }
      
        diffs = api.toDiffs([
          neueField,
          api.remove("select", {view: info.viewId, "view field": info.fieldId, source: (info.isUnion ? info.sourceId : undefined)}),
          api.insert("select", {view: info.viewId, "view field": info.fieldId, source: info.sourceId, "source field": info.sourceFieldId})
        ]);

        if(info.isUnion) {
          var sources = ixer.select("source", {view: info.viewId}) || [];
          var numSources = sources.reduce(function(memo, source) {
            return (source.source !== info.sourceId) ? memo + 1 : memo;
          }, 1);
          var fields = ixer.select("field", {view: info.viewId}) || [];
          var numFields = fields.reduce(function(memo, field) {
            return (field.field !== info.fieldId) ? memo + 1 : memo;
          }, 1);
          var selects = ixer.select("select", {view: info.viewId}) || [];
          var numSelects = selects.reduce(function(memo, select) {
            return (select.source !== info.sourceId || select["view field"] !== info.fieldId) ? memo + 1 : memo;
          }, 1);
          
          if(numSelects !== numFields * numSources) {
            sendToServer = false;
          } else {
            diffs = diffs.concat(api.toDiffs({type: "view", content: api.retrieve("view", {view: info.viewId}), mode: "inserted"}));
          }
        }
        break;
      case "addViewSource":
        var neueSource = api.insert("source", {
          "source view": info.sourceId,
          source: info.kind
        }, {view: info.viewId});
        var autoJoinConstraints = api.diff2.autojoin(info.viewId, neueSource.content["source"], info.sourceId);
        
        var viewKind = (api.ixer.selectOne("view", {view: info.viewId}) || {})["view: kind"];
        if(viewKind === "union") {
          let selects = ixer.select("select", {view: info.viewId});
          if(selects.length) {
            sendToServer = false;
          }
        }
        diffs = api.toDiffs([neueSource].concat(autoJoinConstraints));
        break;
      case "removeViewSource":
        diffs = api.toDiffs(api.remove("source", {view: info.viewId, source: info.sourceId}));
        break;
      case "addViewConstraint":
      var rightSource = info.rightSource || info.leftSource;
      var rightField = info.rightField || info.leftField;
      diffs = api.toDiffs(api.insert("constraint", {
        view: info.viewId,
        operation: "=",
        "left source": info.leftSource,
        "left field": info.leftField,
        "right source": rightSource,
        "right field": rightField
      }));
      sendToServer = info.leftSource && info.leftField && info.rightSource && info.rightField;
      break;
      case "updateViewConstraint":
        // @TODO: redesign this to pass in opts directly.
        var overrides = {};
        if(!info.isConstant) {
          if(info.type === "left") {
            overrides["left field"] = info.value.field[code.ix("field", "field")];
            overrides["left source"] = info.value.source[code.ix("source", "source")];
          } else if(info.type === "right") {
            overrides["right field"] = info.value.field[code.ix("field", "field")];
            overrides["right source"] = info.value.source[code.ix("source", "source")];
          } else if(info.type === "operation") {
            overrides["operation"] = info.value;
          }
        } else {
          var constantFieldId = uuid();
          if(info.type === "left") {
            overrides["left field"] = constantFieldId;
            overrides["left source"] = "constant";
          } else if(info.type === "right") {
            overrides["right field"] = constantFieldId;
            overrides["right source"] = "constant";
          }
          diffs.push(["constant", "inserted", [constantFieldId, info.value]]);
        }
        var change = api.change("constraint", {constraint: info.constraintId}, overrides);
        var constraint = change.content[0];
        diffs = diffs.concat(api.toDiffs(change));
        
        var calculatedFields = ixer.selectPretty("calculated field", {view: viewId, source: constraint["left source"]});
        if(calculatedFields.length) {
          for(var calculatedField of calculatedFields) {
            var calculatedFieldId = calculatedField["calculated field"];
            diffs.push(["calculated field", "inserted", api.mapToFact("calculated field", calculatedField)]);
            diffs.push(["display name", "inserted", [calculatedFieldId, code.name(calculatedFieldId)]]);
          }
        }
        break;
      case "removeViewConstraint":
        // Test if the constraint is binding a primitive input. If so, destroy the whole source.
        var constraint = api.retrieve("constraint", {constraint: info.constraintId})[0];
        var source = api.ixer.selectOne("source", {view: constraint.view, source: constraint["left source"]});
        var primitive = api.ixer.selectOne("primitive", {view: source["source: source view"]});
        if(primitive) {
          diffs = api.toDiffs(api.remove("source", {view: constraint.view, source: constraint["left source"]}));
        } else {
          diffs = api.toDiffs(api.remove("constraint", {constraint: info.constraintId}));
        }
        break;
      case "updateAggregateSort":  //@FIXME: Resume conversion of dispatch here.
        diffs = diff.updateAggregateSort(info.viewId, info.field, info.direction);
        var neue = diffs[0][2]; //@FIXME: Hacky.
        sendToServer = neue[code.ix("aggregate sorting", "inner field")]
        && neue[code.ix("aggregate sorting", "direction")];
        break;
      case "updateAggregateLimit":
        sendToServer = info.sendToServer;
        var table = (info.key === "from") ? "aggregate limit from" : "aggregate limit to";

        // @FIXME: Hard-coded to work with constants only.
        var constantId = uuid();
        var limit = ixer.index(table)[info.viewId];
        if(!limit) { limit = [info.viewId, "constant", constantId]; }
        else {
          constantId = limit[2];
          var oldConstant = ixer.index("constant")[constantId];
          if(oldConstant && oldConstant[1] !== info.value) {
            diffs.push(["constant", "removed", oldConstant]);
          }
        }

        if(info.value) {
          diffs.push(["constant", "inserted", [constantId, info.value]],
                     [table, "inserted", limit]);
        } else {
          diffs.push([table, "removed", limit]);
        }
        if(sendToServer && localState.initialValue && localState.initialValue !== info.value) {
          diffs.push(["constant", "removed", [constantId, localState.initialValue]]);
        }
        break;
      case "updateAggregateGrouping":
//         diffs = diff.updateAggregateGrouping(info.aggregate, info.source, info.field);
//         if(diffs.length) {
//           var neue = diffs[0][2];//@FIXME: Hacky.
//           sendToServer = neue[code.ix("aggregate grouping", "inner field")] && neue[code.ix("aggregate grouping", "outer field")];
//         }
        var viewId = info.aggregate;
        var old = ixer.index("aggregate grouping")[viewId];
        var neue: any = [viewId, info.field, info.field];
        if(old && !api.arraysIdentical(old, neue)) {
          diffs.push(["aggregate grouping", "removed", old]);
        } else if(!old) {
          let sources = ixer.index("source")[viewId];
          var innerSource = sources.inner;
          if(sources.outer) {
            diffs.push(["source", "removed", sources.outer]);
          }
          diffs.push(["source", "inserted", [viewId, "outer", innerSource[code.ix("source", "source view")]]]);
        }
        diffs.push(["aggregate grouping", "inserted", neue]);

        break;
      case "addPrimitiveSource":
        diffs = diff.addPrimitiveSource(info.viewId, info.primitiveId);
        break;
      case "setQueryEditorActive":
        localState.queryEditorActive = info.viewId;
        localState.queryEditorInfo = {
          viewId: info.viewId,
          handler: info.handler,
        };
        break;
      case "constraintOpSuggestions":
        localState.queryEditorActive = info.viewId;
        localState.queryEditorInfo = {
          type: "constraint op",
          sourceId: info.sourceId,
          viewId: info.viewId,
          fieldId: info.fieldId,
          token: info,
          handler: info.handler
        };
        break;
      case "fieldSuggestions":
        localState.queryEditorActive = info.viewId;
        localState.queryEditorInfo = {
          type: "field",
          sourceId: info.sourceId,
          viewId: info.viewId,
          fieldId: info.fieldId,
          token: info,
          handler: info.handler
        };
        break;
      case "editToken":
        var state = tokenState[info.parentId];
        if (!state) { state = tokenState[info.parentId] = {}; }
        state[info.key] = 1
        break;
      case "stopEditToken":
        var state = tokenState[info.parentId];
        state[info.key] = 0;
        break;
      case "toggleConstant":
        var edInfo = localState.queryEditorInfo;
        var token = edInfo.token || {};
        edInfo.token = token;
        token.isConstant = true;
        break;
      default:
        redispatched = true;
        eveEditor.dispatch(evt, info);
        break;
    }
    
    if(!redispatched) {
      eveEditor.executeDispatch(diffs, storeEvent, sendToServer);
    }
    
    
  }

   //---------------------------------------------------------
  // Query workspace
  //---------------------------------------------------------

  export function queryWorkspace(queryId) {
    return eveEditor.genericWorkspace("query", queryId,
                            {c: "query-editor",
                             children: [
                               editor(queryId)
                             ]});
  }

  //---------------------------------------------------------
  // Tree + Toolbar
  //---------------------------------------------------------

  function fieldItem(name, fieldId, opts) {
    opts = opts || {};
    return {c: "tree-item " + opts.c, dragData: {fieldId: fieldId, type: "field"}, draggable: true, dragstart: dragItem, children: [
      (opts.icon ? {c: "opts.icon"} : undefined),
      (name ? {text: name} : undefined),
      opts.content
    ]};
  }

  function dragItem(evt, elem) {
    for(var key in elem.dragData) {
      evt.dataTransfer.setData(key, elem.dragData[key]);
    }
    evt.stopPropagation();
  }

  //---------------------------------------------------------
  // Editor
  //---------------------------------------------------------
  
  function selectInput(value, key, options, onsubmit): any {
    var blur, input;
    if (onsubmit) {
      blur = function inputBlur(e, elem) {
        onsubmit(e, elem, "blurred");
      }
      input = function inputInput(e, elem) {
        onsubmit(e, elem, "enter");
      }
    }
    var children = [];
    for (var val in options) {
      var name = options[val];
      children.push({ t: "option", value: val, text: name, selected: val === value });
    }
    return { t: "select", c: "input", key: key, input: input, focus: tableEditor.storeInitialInput, blur: blur, children: children };
  }
  
  function editor(queryId) {
    var blocks = ixer.index("query to blocks")[queryId] || [];
    var items = [];
    var order = ixer.index("display order");
    blocks.sort(function(a, b) {
      var viewA = code.name(a[code.ix("block", "view")]);
      var viewB = code.name(b[code.ix("block", "view")]);
      return viewA.localeCompare(viewB);
    });
    for(var ix = 0; ix < blocks.length; ix++) {
      var viewId = blocks[ix][code.ix("block", "view")];
      var viewKind = ixer.index("view to kind")[viewId];
      var rows = ixer.facts(viewId) || [];
      var fields = (ixer.index("view to fields")[viewId] || []).map(function(field) {
        var id = field[code.ix("field", "field")];
        return {name: getLocalFieldName(id), id: id, priority: order[id] || 0};
      });
      fields.sort(function(a, b) {
        var delta = b.priority - a.priority;
        if(delta) { return delta; }
        else { return a.id.localeCompare(b.id); }
      });

      var sorting = ixer.index("aggregate sorting")[viewId] || [];
      var sortingFieldIx = code.ix("aggregate sorting", "inner field");
      var sortingDirectionIx = code.ix("aggregate sorting", "direction");

      var sortingField = sorting[sortingFieldIx];
      var sortingIx;
      if(sortingField) {
        var innerSource = ixer.index("source")[viewId] || {};
        innerSource = innerSource.inner;
        if(innerSource) {
          var innerSourceViewId = innerSource[code.ix("source", "source view")];
          sortingIx = code.ixById(innerSourceViewId, sortingField);
        }
      }
      var sortingDirection = sorting[sortingDirectionIx];

      rows.sort(function(a, b) {
        var aIx = order[viewId + JSON.stringify(a)];
        var bIx = order[viewId + JSON.stringify(b)];
        if(!aIx && !bIx && sortingIx !== undefined) {
          if(a[sortingIx] === b[sortingIx]) { return 0; }
          if(sortingDirection === "ascending") {
            return (a[sortingIx] < b[sortingIx]) ? -1 : 1;
          } else {
            return (a[sortingIx] < b[sortingIx]) ? 1 : -1;
          }
        }
        return aIx - bIx;
      });

      var editorPane;
      var inspectorPane: any = {c: "inspector-pane", children: [tableEditor.virtualizedTable(viewId, fields, rows, false)]};
      if(viewKind === "join") {
        editorPane = viewBlock(viewId, ix);
        inspectorPane.viewId = viewId;
        inspectorPane.drop = viewSelectionsDrop;
        inspectorPane.dragOver = preventDefault;
      }
      if(viewKind === "aggregate") {
        editorPane = aggregateBlock(viewId);
        inspectorPane.viewId = viewId;
        inspectorPane.drop = viewSelectionsDrop;
        inspectorPane.dragOver = preventDefault;
      }
      if(viewKind === "union") { editorPane = unionBlock(viewId, ix);  }
      var controls;
      if(localState.queryEditorActive === viewId) {
        controls = querySuggestionBar(queryId, viewId);
      }

      items.push({c: "block " + viewKind, editorIx: ix, viewId: viewId, handler: blockSuggestionHandler, click: setQueryEditorActive, dragover: preventDefault, drop: stopPropagation,
                  dragData: {value: viewId, type: "view"}, itemId: viewId, draggable: true, dragstart: dragItem, children: [
        {c: "block-title", children: [
          {t: "h3", text: code.name(viewId)}
          //                 ,
        ]},
        {c: "full-flex", children: [
          editorPane,
          controls,
          inspectorPane,
        ]},
      ]});
    }

    var primitiveKindIx = code.ix("primitive", "kind");
    var scalarPrimitiveItems = (ixer.facts("primitive") || []).filter(function(primitive) {
      return primitive[primitiveKindIx] === "scalar";
    }).map(function(primitive) {
      var id = primitive[0];
      return {c: "control function", dragData: {value: id, type: "view"}, itemId: id, draggable: true, dragstart: dragItem, text: code.name(id)};
    });

    items.push({c: "block new-block", children: [
      {c: "block unused flex-column", children: [
        {c: "controls", children: [
          {c: "control join", click: newJoinBlock, queryId: queryId, text: "join"},
          {c: "control union", click: newUnionBlock, queryId: queryId, text: "merge"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "sort+limit", text: "sort and limit"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "count", text: "count"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "sum", text: "sum"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "mean", text: "avg"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "stddev", text: "stdev"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "empty", text: "is empty?"},
        ]},
        {c: "controls", children: scalarPrimitiveItems}
      ]},
    ]});

    return {c: "query-workspace", queryId: queryId, drop: editorDrop, dragover: preventDefault, children: items.length ? items : [
      {c: "feed", text: "Feed me sources"}
    ]};
  }

  function exportView(evt, elem) {
    dispatch("exportView", {viewId: elem.viewId, queryId: elem.queryId});
  }

  function blockSuggestionHandler(e, elem) {
    var info = localState.queryEditorInfo;
    if(elem.key === "add filter") {
      var source = ixer.selectOne("source", {view: info.viewId});
      if(!source) { return console.error("Cannot add a constraint to a view with no sources."); }
      var field = ixer.selectOne("field", {view: source["source: source view"]});
      if(!field) { return console.error("Cannot add a constraint to a view source with no fields."); }
      dispatch("addViewConstraint", {viewId: info.viewId, leftSource: source["source: source"], leftField: field["field: field"]});
    }
  }

  function suggestionBarItem(key, text) {
    var info = localState.queryEditorInfo;
    return {c: "suggestion-bar-item", key: key, text: text, click: info ? info.handler : undefined};
  }

  function querySuggestionBar(queryId, viewId) {
    var info = localState.queryEditorInfo;
    var items;
    if(info && info.type === "field") {
      if(info.sourceId) {
        //get the fields for this source
        var sourceView = ixer.index("source")[info.viewId][info.sourceId][code.ix("source", "source view")];
        items = (ixer.index("view to fields")[sourceView] || []).map(function(cur) {
          var fieldId = cur[code.ix("field", "field")];
          return suggestionBarItem(fieldId, code.name(fieldId));
        });
      } else if(info.viewId) {
        //it's any available field from the sources
        var sourceViewIx = code.ix("source", "source view");
        items = getBlockFields(info.viewId)
        .filter(function(fieldAndSource) {
          // Strip all fields from primitive sources.
          var sourceViewId = fieldAndSource.source[sourceViewIx];
          return !ixer.index("primitive")[sourceViewId];
        })
        .map(function(fieldAndSource) {
          var fieldId = fieldAndSource.field[code.ix("field", "field")];
          return suggestionBarItem(fieldAndSource, code.name(fieldId));
        });

        var viewSources = ixer.index("source")[info.viewId] || {};
        var calculatedFields = (ixer.index("view to calculated fields")[info.viewId] || []);
        items = items.concat(calculatedFields.map(function(calculated) {
          var calculatedId = calculated[code.ix("calculated field", "calculated field")];
          var fieldId = calculated[code.ix("calculated field", "field")];
          var field = ixer.index("field")[fieldId];
          var sourceId = calculated[code.ix("calculated field", "source")];
          var source = viewSources[sourceId];
          return suggestionBarItem({field: field, source: source}, code.name(calculatedId) || "Untitled");
        }));
      }
      if(info && info.token && info.token.constantHandler) {
        items.push(suggestionBarItem("new constant", "new constant"));
      }
    } else if(info.type === "constraint op") {
      items = ["="].map(function(op) {
        return suggestionBarItem(op, op);
      });
    } else {
      items = [
        suggestionBarItem("add filter", "add filter"),
        suggestionBarItem("add calculation", "add calculation"),
      ]
    }

    // Misc. block controls.
    var exported = ixer.index("query to export")[queryId] === viewId;
    items.push(
      {c: "suggestion-bar-item ion-log-out export-view-btn" + (exported ? " exported" : ""), viewId: viewId, queryId: queryId, click: exportView},
      {c: "suggestion-bar-item ion-android-close close-btn", viewId: viewId, click: removeSelectedItem}
    );
    return {c: "suggestion-bar", children: items};
  }

  function removeSelectedItem(evt, elem) {
    var info = localState.queryEditorInfo;
    if(!info || !info.token) {
      removeViewBlock(evt, elem);
    } else {
      var token = info.token;
      var id = token.expression;
      if(ixer.index("constraint")[id]) {
        dispatch("removeViewConstraint", {constraintId: id});
      }
    }
  }

  function setQueryEditorActive(e, elem) {
    dispatch("setQueryEditorActive", elem);
  }

  function newJoinBlock(e, elem) {
    dispatch("addViewBlock", {queryId: elem.queryId, kind: "join"});
  }

  function newAggregateBlock(e, elem) {
    dispatch("addAggregateBlock", {queryId: elem.queryId, kind: elem.kind});
  }

  function newUnionBlock(e, elem) {
      dispatch("addViewBlock", {queryId: elem.queryId, kind: "union"});
  }

  function editorDrop(evt, elem) {
    evt.stopPropagation();
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      var isPrimitive = ixer.selectOne("primitive", {view: value});
      if(isPrimitive) { return; }
      return dispatch("addViewBlock", {queryId: elem.queryId, sourceId: value, kind: "join"});
    }
  }

  /**
   * View Block
   */
  function viewBlock(viewId, ix) {
    var fields = ixer.index("view and source to block fields")[viewId] || {};

    var blockFieldIdIx = code.ix("block field", "block field");
    var fieldIdIx = code.ix("block field", "field");
    fields = fields["selection"] || [];
    var selectionItems = fields.map(function(field) {
      var id = field[blockFieldIdIx];
      var fieldId = field[fieldIdIx];
      return fieldItem(code.name(fieldId) || "Untitled", id, {c: "pill field"});
    });
    if(!selectionItems.length) {
      selectionItems.push({text: "Drag local fields into me to make them available in the query."});
    }

    var lines = viewSources(viewId, null).concat(viewConstraints(viewId)).concat(viewPrimitives(viewId, null));
    return {c: "block view-block", viewId: viewId, drop: viewBlockDrop, dragover: preventDefault,
            children: [
//               {c: "block-title", children: [
//                 {t: "h3", text: alphabet[ix]},
// //                 {c: "hover-reveal close-btn ion-android-close", viewId: viewId, click: removeViewBlock},
//               ]},
              {c: "block-lines", children: lines},
            ]};
  }

  function viewBlockDrop(evt, elem) {
    var viewId = elem.viewId;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      evt.stopPropagation();
      if(viewId === value) { return console.error("Cannot join view with parent."); }
      var primitive = ixer.index("primitive")[value];
      if(primitive) {
        dispatch("addPrimitiveSource", {viewId: viewId, primitiveId: value});
      } else {
        dispatch("addViewSource", {viewId: viewId, sourceId: value});
      }
      return;
    }
  }

  function removeViewBlock(evt, elem) {
    dispatch("removeViewBlock", {viewId: elem.viewId});
  }

  function viewSelectionsDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "field") { return; }
    var id = evt.dataTransfer.getData("fieldId");
    var blockField = ixer.index("block field")[id];
    var isCalculated = false;
    if(!blockField) {
      blockField = ixer.index("calculated field")[id];
      isCalculated = true;
    }
    if(blockField[code.ix("block field", "view")] !== elem.viewId) { return; }
    var fieldId = blockField[code.ix("block field", "field")];
    var sourceId = blockField[code.ix("block field", "source")];
    dispatch("addViewSelection", {viewId: elem.viewId, sourceFieldId: fieldId, sourceId: sourceId, isCalculated: isCalculated});
    evt.stopPropagation();
  }

  // Sources
  function viewSources(viewId, drop) {
    var sourceIdIx = code.ix("source", "source");
    var sources = ixer.index("view to sources")[viewId] || [];
    var sourceViewIx = code.ix("source", "source view");
    sources = sources.filter(function(source) {
      var sourceView = source[sourceViewIx];
      var primitive = ixer.index("primitive")[sourceView];
      return !primitive;
    });
    var sourceIds = sources.map(function(source) {
      return source[sourceIdIx];
    });

    sourceIds.sort(api.displaySort);
    var sourceItems = sourceIds.map(function(sourceId) {
      return sourceWithFields("view", viewId, sourceId, drop);
    });
    return sourceItems;
  }

  function getSourceName(viewId, sourceId) {
    var source = ixer.selectOne("source", {view: viewId, source: sourceId});
    if(!source) { throw new Error("Source " + sourceId + " not found on view " + viewId + "."); }
    var sourceName = code.name(source["source: source view"]);
    
    var sources = ixer.select("source", {view: viewId});
    var ix = 0;
    for(var cur of sources) {
      if(cur["source: source"] === source["source: source"]) { break; }
      if(cur["source: source view"] === source["source: source view"]) { ix++; }
    }
    if(ix) {
      sourceName += " (" + (ix + 1) + ")";
    }
    
    if(sourceId == "inner" || sourceId === "outer" || sourceId === "insert" || sourceId === "remove") {
      sourceName += " [" + sourceId + "]";
    }

    return sourceName;
  }

  function sourceWithFields(type, viewId, sourceId, drop) {
    var fields = ixer.select("block field", {view: viewId, source: sourceId}) || [];
    var fieldItems = [];
    fields.forEach(function(field) {
      var id = field["block field: block field"];
      var fieldId = field["block field: field"];
      fieldItems.push(fieldItem(code.name(fieldId) || "Untitled", id, {c: "pill field"}));
      fieldItems.push({t: "pre", text: ", "});
    });
    fieldItems.pop();
    fieldItems.push({text: ")"});

    var title = {c: type + "-source-title source-title", children: [
      {t: "h4", text: getSourceName(viewId, sourceId) || "Untitled"}
    ]};

    var children = [
      title,
      {text: "("}
    ].concat(fieldItems);

    return {c: "source " + type + "-source", viewId: viewId, sourceId: sourceId,
            dragover: (drop ? preventDefault : undefined), drop: drop, children: children};
  }

  function removeSource(evt, elem) {
    dispatch("removeViewSource", {viewId: elem.viewId, sourceId: elem.sourceId});
  }

  // Calculations
  function getFieldName(viewId, sourceId, fieldId) {
    if(sourceId === "constant") {
      return ixer.index("constant to value")[fieldId];
    }

    var calculatedId = ixer.index("field to calculated field")[fieldId];
    if(calculatedId) {
      return code.name(calculatedId);
    } else {
      var sourceName = getSourceName(viewId, sourceId);
      var fieldName = code.name(fieldId);
      if(sourceName && fieldName) {
        return sourceName + "." + fieldName;
      } else if(fieldName) {
        return fieldName;
      } else {
        return "field";
      }
    }
  }
  function getLocalFieldName(fieldId) {
    var calculatedId = ixer.index("field to calculated field")[fieldId];
    if(calculatedId) {
      return code.name(calculatedId);
    } else {
      return code.name(fieldId);
    }
  }

  var primitiveEditor = {
    default: function(viewId, sourceId, sourceViewId) {
      var calculatedFields = ixer.select("calculated field", {view: viewId, source: sourceId});
      var constraints = api.retrieve("constraint", {view: viewId}).filter(function(constraint) {
        return constraint["left source"] === sourceId;
      });
      var constraintArgs = constraints.map(function(constraint, ix) {
        var name = constraint["right field"] ? getFieldName(viewId, constraint["right source"], constraint["right field"]) : "<field " + alphabet[ix] + ">";
        return viewConstraintToken("right", constraint.constraint, viewId, name);
      });

      var content = calculatedFields.map(function(calculatedField) {
        var id = calculatedField["calculated field: calculated field"];
        return fieldItem(code.name(id), id, {c: "pill field"})
      }).concat(
        {text: "⇒"},
        {text: code.name(sourceViewId) + "("},
        constraintArgs,
        {text: ")"});
      return {c: "spaced-row primitive-constraint", children: content};
    },
    infix: function(viewId, sourceId, sourceViewId, operator) {
      var calculatedFields = ixer.select("calculated field", {view: viewId, source: sourceId});

      var constraints = api.retrieve("constraint", {view: viewId}).filter(function(constraint) {
        return constraint["left source"] === sourceId;
      });
      var constraintArgs = constraints.map(function(constraint, ix) {
        var name = constraint["right field"] ? getFieldName(viewId, constraint["right source"], constraint["right field"]) : "<field " + alphabet[ix] + ">";
        return viewConstraintToken("right", constraint.constraint, viewId, name);
      });
      if(constraintArgs.length !== 2) { throw new Error("Invalid arity for infix primitive " + constraintArgs.length); }
      
      var content = calculatedFields.map(function(calculatedField) {
        var id = calculatedField["calculated field: calculated field"];
        return fieldItem(code.name(id), id, {c: "pill field"})
      }).concat(
        {text: "⇒"},
        constraintArgs[0],
        {text: operator},
        constraintArgs[1]
      );        

      return {c: "spaced-row primitive-constraint", children: content}
    },

    add: function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "+");
    },
    subtract: function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "-");
    },
    "<": function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "<");
    },
    "<=": function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "<=");
    },
    "!=": function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "!=");
    },
  };

  function viewPrimitives(viewId, drop) {
    var sourceIdIx = code.ix("source", "source");
    var sourceViewIx = code.ix("source", "source view");
    var primitiveKindIx = code.ix("primitive", "kind");
    var sources = ixer.index("view to sources")[viewId] || [];

    var primitives = sources.map(function(source) {
      var sourceView = source[sourceViewIx];
      var primitive = ixer.index("primitive")[sourceView];
      return [source[sourceIdIx], source[sourceViewIx], primitive && primitive[primitiveKindIx]];
    }).filter(function(primitive) {
      return primitive[2];
    });

    var primitiveItems = primitives.map(function(primitive) {
      return (primitiveEditor[primitive[1]] || primitiveEditor.default)(viewId, primitive[0], primitive[1]);
    });
    return primitiveItems;
  }

  // Constraints
  function viewConstraints(viewId) {
    var constraintIdIx = code.ix("constraint", "constraint");
    var sourceViewIx = code.ix("source", "source view");
    var constraints = ixer.index("view to constraints")[viewId] || [];

    var constraintItems = constraints.map(function(constraint) {
      var constraintId = constraint[constraintIdIx];
      var sourceId = ixer.index("constraint to source")[constraintId];
      var source = ixer.index("source")[viewId] || {};
      source = source[sourceId];
      if(!source || !ixer.index("primitive")[source[sourceViewIx]]) {
        return viewConstraintItem(viewId, constraintId);
      }
    });
    return constraintItems;
  }

  function viewConstraintItem(viewId, constraintId) {
    var op = ixer.index("constraint operation")[constraintId] || [];
    var operation = op[code.ix("constraint operation", "operation")];
    var left = ixer.index("constraint left")[constraintId] || [];
    var leftSource = left[code.ix("constraint left", "left source")];
    var leftField = left[code.ix("constraint left", "left field")];
    var right = ixer.index("constraint right")[constraintId] || [];
    var rightSource = right[code.ix("constraint right", "right source")];
    var rightField = right[code.ix("constraint right", "right field")];

    return {c: "view-constraint", children: [
      viewConstraintToken("left", constraintId, viewId, getFieldName(viewId, leftSource, leftField)),
      viewConstraintToken("operation", constraintId, viewId, operation),
      viewConstraintToken("right", constraintId, viewId, getFieldName(viewId, rightSource, rightField))
    ]};

  }

  function viewConstraintToken(side, constraintId, viewId, text) {
    var type = "field";
    if(side === "operation") {
      type = "operation";
    }
    return queryToken(type, side, constraintId, text, {viewId: viewId, handler: updateViewConstraint, constantHandler: updateViewConstraintConstant});
  }
  function queryToken(type, key, expression, text, opts) {
    opts = opts || {};
    var klass = "token " + type + " " + (opts.c || "");
    var dragover = (opts.drop ? preventDefault : undefined);

    var handler = fieldSuggestions;
    if(type === "operation") {
      handler = constraintOpSuggestions;
    }

    //check if we are editing this token
    var info = localState.queryEditorInfo;
    var tokenInfo = info ? info.token || {} : {};
    var isActive = tokenInfo.expression === expression && tokenInfo.key === key;
    if(isActive) {
      klass += " active";
    }
    var token: any = {c: klass, key: key, expression: expression, text: text, click: handler};
    if(isActive && tokenInfo.isConstant) {
      token = tableEditor.input(info.constantValue || "", key, updateConstantTokenValue, saveConstantToken);
      token.expression = expression;
      token.isConstant = true;
      token.postRender = focusOnce;
    }
    for(var prop in opts) {
      token[prop] = opts[prop];
    }
    if(opts.drop && ! token.dragover) {
      token.dragover = preventDefault;
    }
    if(type === "field" && opts.constantHandler) {
      token.handler = maybeToggleConstant(opts.handler);
    }
    return token;
  }

  function maybeToggleConstant(handler) {
    return function(evt, elem) {
      if(elem.key === "new constant") {
        evt.stopPropagation();
        dispatch("toggleConstant", null);
      } else if(handler) {
        return handler(evt, elem);
      }
    };
  }

  function updateConstantTokenValue(evt, elem) {
    localState.queryEditorInfo.token.constantValue = coerceInput(evt.target.value || evt.target.textContent);
  }
  function saveConstantToken(evt, elem) {
    var handler = localState.queryEditorInfo.token.constantHandler;
    if(!handler) { return console.error("No handler specified for", evt, elem); }
    var value = coerceInput(evt.target.value || evt.target.textContent);
    handler(evt, elem, value);
  }

  function constraintOpSuggestions(e, elem) {
    e.stopPropagation();
    dispatch("constraintOpSuggestions", elem);
  }

  function viewConstraintsDrop(evt, elem) {
    var viewId = elem.viewId;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "field") {
      var id = evt.dataTransfer.getData("fieldId");
      var blockField = ixer.index("block field")[id];
      if(blockField[code.ix("block field", "view")] !== viewId) { return; }
      var fieldId = blockField[code.ix("block field", "field")];
      var sourceId = blockField[code.ix("block field", "source")];
      dispatch("addViewConstraint", {viewId: viewId, leftSource: sourceId, leftField: fieldId});
    }
  }

  function updateViewConstraint(evt, elem) {
    var info = localState.queryEditorInfo;
    var token = info.token;
    dispatch("updateViewConstraint", {constraintId: token.expression, type: token.key, value: elem.key});
    evt.stopPropagation();
  }

  function updateViewConstraintConstant(evt, elem, value) {
    var info = localState.queryEditorInfo;
    var token = info.token;
    dispatch("updateViewConstraint", {constraintId: token.expression, type: token.key, value: value, isConstant: true});
    evt.stopPropagation();
  }

  function dropConstraintField(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "field") { return; }
    var viewId = ixer.index("constraint to view")[elem.parentId];
    var id = evt.dataTransfer.getData("fieldId");
    var blockField = ixer.index("block field")[id];
    var draggedViewId = blockField[code.ix("block field", "view")];
    var fieldId = blockField[code.ix("block field", "field")];
    var sourceId = blockField[code.ix("block field", "source")];

    if(draggedViewId === viewId) {
      // If the field is block local, add it as a constraint.
      dispatch("updateViewConstraint", {constraintId: elem.parentId, type: elem.key, value: fieldId, source: sourceId});
      evt.stopPropagation();
    } else if(elem.key === "right") {
      // If the field is accessible in the query, use it for grouping.
      var select = ixer.index("view and source field to select")[draggedViewId] || {};
      select = select[fieldId];
      if(!select) { return; }
      if(ixer.index("view to query")[viewId] !== ixer.index("view to query")[draggedViewId]) { return; }
      console.warn("@TODO: group by", draggedViewId, fieldId);
      dispatch("groupView", {constraintId: elem.parentId, inner: viewId, outer: draggedViewId, outerField: fieldId});
      evt.stopPropagation();
    }
  }

  function removeConstraint(evt, elem) {
    dispatch("removeViewConstraint", {constraintId: elem.constraintId});
  }


  //---------------------------------------------------------
  // Tokens
  //---------------------------------------------------------

  var tokenState = {};

  var token = {
    operation: function(params, onChange, onDrop) {
      var state = tokenState[params.parentId];
      if(state) { state = state[params.key]; }

      return {c: "token operation",
              key: params.key,
              parentId: params.parentId,
              children: [{c: "name", text: params.operation || "<op>"},
                         (state === 1) ? tokenEditor.operation(params, onChange) : undefined],
              click: editToken};
    },
    blockField: function(params, onChange, onDrop) {
      var state = tokenState[params.parentId];
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
              parentId: params.parentId,
              children: [{c: "name", text: name},
                         (source ? {c: "source", text: "(" + source +")"} : undefined),
                         (state === 1) ? tokenEditor.blockField(params, onChange) : undefined],
              click: editToken,
              dragover: preventDefault,
              drop: onDrop};
    }
  };

  function editToken(evt, elem) {
    dispatch("editToken", elem);
  }

  function stopEditToken(evt, elem) {
    dispatch("stopEditToken", elem);
  }

  var tokenEditor = {
    operation: function(params, onChange) {
      var items = ["=", "<", "≤", ">", "≥", "≠"].map(function(rel) {
        var item: any = selectorItem({c: "operation", key: params.key, name: rel, value: rel}, onchange);
        item.parentid = params.parentid;
        return item;
      });
      var select = selector(items, {c: "operation", key: params.key, tabindex: -1, focus: true}, stopEditToken);
      select.parentId = params.parentId;
      return select;
    },
    blockField: function(params, onChange) {
      var viewId = ixer.index("constraint to view")[params.parentId];
      var fields = getBlockFields(viewId);
      var items = fields.map(function(sourceAndField) {
        var field = sourceAndField.field;
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: sourceAndField}, onChange);
        item.parentId = params.parentId;
        return item;
      });
      var select = selector(items, {c: "field", key: params.key, tabindex: -1, focus: true}, stopEditToken);
      select.parentId = params.parentId;
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
      memo.push.apply(memo, (ixer.index("view to fields")[sourceViewId] || []).map(function(field) {
        return {source: source, field: field};
      }));
      return memo;
    }, []);
  }

  /**
   * Union Block
   */
  function unionBlock(viewId, ix) {
    var fields = ixer.select("field", {view: viewId}) || [];
    var sources = ixer.select("source", {view: viewId}) || []; 

    var sourceItems = [];
    for(var source of sources) {
      var rowItems:any[] = [
        {t: "td", c: "source-name", children: [
          {t: "h4", c: "union-source-title source-title", text: getSourceName(viewId, source.source) || "Untitled"}
        ]}
      ];
      
      for(var field of fields) {
        var select = ixer.selectOne("select", {view: viewId, "view field": field["field: field"], source: source.source});
        rowItems.push({t: "td", c: "mapped-field", text: (select) ? code.name(select["select: source field"]) : "---",
                       viewId: viewId, sourceId: source.source, fieldId: field["field: field"],
                       click: fieldSuggestions, handler: setMappingField});
      }
      rowItems.push({t: "td", c: "mapped-field", text: "---", viewId: viewId, sourceId: source.source,
                     click: fieldSuggestions, handler: setMappingField});
      sourceItems.push({t: "tr", children: rowItems});
    }

    var headerItems:any = [{td: "th", c: "spacer"}];    
    for(var field of fields) {
      headerItems.push({t: "th", c: "mapping-header", text: code.name(field["field: field"])});  
    }
    headerItems.push({t: "th", c: "mapping-header", text: "---"});
    
    return {c: "block union-block", viewId: viewId, dragover: preventDefault, drop: viewBlockDrop, children: [
              {t: "table", children: [
                {t: "thead", children: [
                  {t: "tr", children: headerItems}
                ]},
                {t: "tbody", children: sourceItems}
              ]}
            ]};
  }

  function fieldSuggestions(e, elem) {
    e.stopPropagation();
    dispatch("fieldSuggestions", elem);
  }

  function setMappingField(e, elem) {
    var info = localState.queryEditorInfo;
    dispatch("addViewSelection", {viewId: info.viewId, sourceFieldId: elem.key, sourceId: info.sourceId, fieldId: info.fieldId, isUnion: true});
    e.stopPropagation();
  }

  function unionSourceMappingDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "field") { return; }
    var blockFieldId = evt.dataTransfer.getData("fieldId");
    var blockField = ixer.index("block field")[blockFieldId];
    var fieldId = blockField[code.ix("block field", "field")];
    var viewId = blockField[code.ix("block field", "view")];
    var sourceId = blockField[code.ix("block field", "source")];
    if(viewId !== elem.viewId) { return; }
    dispatch("addViewSelection", {viewId: viewId, sourceFieldId: fieldId, sourceId: sourceId, fieldId: elem.fieldId, isUnion: true});
    evt.stopPropagation();
  }

  /**
   * Aggregate Block
   */
  function aggregateBlock(viewId) {
    var blockAggregate = ixer.index("block aggregate")[viewId];
    var aggregateKind = blockAggregate[code.ix("block aggregate", "kind")];

    var sources = ixer.index("source")[viewId] || {};
    var outerSource = sources.outer;
    var innerSource = sources.inner;

    var grouping = ixer.index("aggregate grouping")[viewId];
    if(grouping) {
      var innerField = grouping[code.ix("aggregate grouping", "inner field")];
      var outerField = grouping[code.ix("aggregate grouping", "outer field")];
    }

    var content;
    if(aggregateKind === "sort+limit") {
      content = sortLimitAggregate(viewId, outerSource, innerSource);
    } else {
      content = primitiveAggregate(viewId, outerSource, innerSource, aggregateKind);
    }

    return {c: "block aggregate-block", children: [
      // {c: "block-section view-sources", viewId: viewId, children: viewSources(viewId, aggregateSourceDrop).concat(viewPrimitives(viewId))},
//       {c: "block-section aggregate-grouping spaced-row", children: [
//         {text: "Group by"},
//         queryToken("field", "outer", viewId, getLocalFieldName(outerField) || "<outer field>", {handler: updateAggregateGrouping, drop: dropAggregateGroupingField, viewId: viewId, sourceId: "outer"}),
//         {text: "="},
//         queryToken("field", "inner", viewId, getLocalFieldName(innerField) || "<inner field>", {handler: updateAggregateGrouping, drop: dropAggregateGroupingField, viewId: viewId, sourceId: "inner"})
//       ]},
      {c: "block-section view-sources", viewId: viewId, children: [sourceWithFields("view", viewId, "inner", aggregateSourceDrop)].concat(viewPrimitives(viewId, null))},
      {c: "block-section aggregate-grouping spaced-row", children: [
        {text: "Group by"},
        queryToken("field", "inner", viewId, getLocalFieldName(innerField) || "<field>", {handler: updateAggregateGrouping, drop: dropAggregateGroupingField, viewId: viewId, sourceId: "inner"}),
      ]},
      content
    ]};
  }

  function updateAggregateGrouping(evt, elem) {
    var info = localState.queryEditorInfo;
    var token = info.token;
    var fieldId = elem.key;
    dispatch("updateAggregateGrouping", {aggregate: token.viewId, source: token.sourceId, field: fieldId});
  }

  function dropAggregateGroupingField(evt, elem) {
    var viewId = elem.expression;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");

    if(type === "field") {
      var id = evt.dataTransfer.getData("fieldId");
      var blockField = ixer.index("block field")[id];
      if(blockField[code.ix("block field", "view")] !== viewId) { return; }
      var fieldId = blockField[code.ix("block field", "field")];
      var sourceId = blockField[code.ix("block field", "source")];

      if(sourceId !== elem.key) { return; }

      dispatch("updateAggregateGrouping", {aggregate: viewId, source: sourceId, field: fieldId});
    }
  }

  function sortLimitAggregate(viewId, outerSource, innerSource) {
    var sortSource = "inner";
    var sortField, sortDir;
    var aggregateSorting = ixer.index("aggregate sorting")[viewId];
    if(aggregateSorting) {
      sortField = aggregateSorting[code.ix("aggregate sorting", "inner field")];
      sortDir = aggregateSorting[code.ix("aggregate sorting", "direction")];
    }

    // @FIXME: hard coded to work with constants only.
    var limitFrom = ixer.index("aggregate limit from")[viewId] || [];
    var limitFromValue = ixer.index("constant to value")[limitFrom[code.ix("aggregate limit from", "from field")]];
    var limitTo = ixer.index("aggregate limit to")[viewId] || [];
    var limitToValue = ixer.index("constant to value")[limitTo[code.ix("aggregate limit to", "to field")]];

    var fromLimitInput = tableEditor.input(limitFromValue, "from", updateAggregateLimit, updateAggregateLimit);
    fromLimitInput.parentId = viewId;
    var toLimitInput = tableEditor.input(limitToValue, "to", updateAggregateLimit, updateAggregateLimit);
    toLimitInput.parentId = viewId;

    var dirInput = selectInput(sortDir || "ascending", "direction", {ascending: "▲", descending: "▼"}, updateAggregateSortDirection);
    dirInput.parentId = viewId;

    return {c: "sort-limit-aggregate", viewId: viewId, children: [
      {c: "spaced-row block-section aggregate-sort", children: [
        {text: "Sort by"},
        queryToken("field", "sort", viewId, getLocalFieldName(sortField) || "<field>", {handler: updateAggregateSortField, drop: dropAggregateField, viewId: viewId, sourceId: "inner"}),
        //token.blockField({key: "field", parentId: viewId, source: sortSource, field: sortField}, updateAggregateSort, dropAggregateField),
        dirInput
      ]},
      {c: "spaced-row block-section aggregate-limit", children: [
        {text: "Limit"},
        fromLimitInput,
        {text: "-"},
        toLimitInput,
      ]},
    ]};
  }

  function updateAggregateLimit(evt, elem, type) {
    dispatch("updateAggregateLimit", {viewId: elem.parentId, key: elem.key, value:  +evt.target.value || +evt.currentTarget.textContent, sendToServer: !!type});
  }

  function updateAggregateSortField(evt, elem) {
    var info = localState.queryEditorInfo;
    var token = info.token;
    dispatch("updateAggregateSort", {viewId: token.viewId, field: elem.key});
  }

  function updateAggregateSortDirection(evt, elem) {
    dispatch("updateAggregateSort", {viewId: elem.parentId, direction: evt.target.value});
  }

  function dropAggregateField(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    if(type !== "field") { return; }
    var viewId = elem.parentId;
    var id = evt.dataTransfer.getData("fieldId");
    var blockField = ixer.index("block field")[id];
    var fieldId = blockField[code.ix("block field", "field")];
    var draggedViewId = blockField[code.ix("block field", "view")];
    if(viewId !== draggedViewId) { return; }

    var info = {viewId: elem.parentId, key: elem.key, value: fieldId};
    dispatch("updateAggregateSort", info);
  }

  function primitiveAggregate(viewId, outerSource, innerSource, kind) {
    return undefined;
  }

  function aggregateSourceDrop(evt, elem) {
    var viewId = elem.viewId;
    var sourceId = elem.sourceId;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      evt.stopPropagation();
      if(viewId === value) { return console.error("Cannot join view with parent."); }
      var kind = "inner";
      if(sourceId === "inner" || sourceId === "outer") {
        kind = sourceId;
      } else if(ixer.index("primitive")[value]) {
        kind = undefined;
      }

      dispatch("addViewSource", {viewId: viewId, sourceId: value, kind: kind});
    }

  }

  function selector(options, opts, onBlur): any {
    return {t: "ul", c: "selector " + opts.c, tabindex: opts.tabindex, key: opts.key,
            postRender: (opts.focus ? focusOnce : undefined), blur: onBlur, children: options};
  }

  function selectorItem(opts, onChange): any {
    return {t: "li", c: "selector-item field " + opts.c, key: opts.key, text: opts.name, value: opts.value, click: onChange};
  }

  
}
