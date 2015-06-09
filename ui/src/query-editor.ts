/// <reference path="uiEditor.ts" />
/// <reference path="tableEditor.ts" />
/// <reference path="microReact.ts" />
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="Indexer.ts" />
/// <reference path="client.ts" />
module queryEditor {
  declare var uuid;
  declare var api;
  declare var queryEditor;
  declare var DEBUG;
  var document = window.document;
  var ixer = api.ixer;
  var code = api.code;
  var diff = api.diff;
  var localState = api.localState;
  var clone = api.clone;
  var alphabet = api.alphabet;

  if(window["queryEditor"]) {
    try {
      document.body.removeChild(window["queryEditor"].container);
    } catch (err) {
      // meh
    }
  }

  window.addEventListener("resize", render);
  document.body.addEventListener("drop", preventDefault);


  export var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  renderer.queued = false;
  export function render() {
   if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        renderer.queued = false;
        renderer.render(root());
        uiEditorRenderer.render();
      });
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

  var KEYS = {UP: 38,
              DOWN: 40,
              ENTER: 13,
              Z: 90};

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


  function reverseDiff(diff) {
    var neue = [];
    for(var diffIx = 0, diffLen = diff.length; diffIx < diffLen; diffIx++) {
      var copy = diff[diffIx].slice();
      neue[diffIx] = copy;
      if(copy[1] === "inserted") {
        copy[1] = "removed";
      } else {
        copy[1] = "inserted";
      }
    }
    return neue;
  }
  
  function stopPropagation(e) {
    e.stopPropagation();
  }
  function preventDefault(e) {
    e.preventDefault();
  }

  //---------------------------------------------------------
  // Local state
  //---------------------------------------------------------
  export var eventStack = {root: true, children: [], localState: clone(localState), parent: null, diffs: null};

  function scaryUndoEvent(): any[] {
    if(!eventStack.parent || !eventStack.diffs) return [];

    var old = eventStack;
    eventStack = old.parent;
    localState = clone(eventStack.localState);
    api.localState = localState;
    return reverseDiff(old.diffs);
  }

  function scaryRedoEvent(): any[] {
    if(!eventStack.children.length) return [];

    eventStack = eventStack.children[eventStack.children.length - 1];
    localState = clone(eventStack.localState);
    return eventStack.diffs;
  }

  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------

  export function dispatch(evt, info) {
    //         console.info("[dispatch]", evt, info);
    var storeEvent = true;
    var sendToServer = true;
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
        localState.adderRows = [[], []];
        break;
      case "addQuery":
        var id = uuid();
        diffs.push(["editor item", "inserted", [id, "query"]],
                   ["display name", "inserted", [id, "Untitled Query"]]);
        localState.activeItem = id;
        break;
      case "addUi":
        var id = uuid();
        var layerId = uuid();
        diffs.push(["editor item", "inserted", [id, "ui"]],
                   ["display name", "inserted", [id, "Untitled Page"]],
                   ["uiComponentLayer", "inserted", [txId, layerId, id, 0, false, false, id]],
                   ["display name", "inserted", [layerId, "Page"]]);
        localState.activeItem = id;
        localState.uiActiveLayer = layerId;
        localState.openLayers[layerId] = true;
        break;
      case "addUiLayer":
        var layerId = uuid();
        var groupNum = ixer.index("uiComponentToLayers")[info.componentId].length;
        var groupIx = (ixer.index("parentLayerToLayers")[info.parentLayer] || []).length;
        diffs.push(["uiComponentLayer", "inserted", [txId, layerId, info.componentId, groupIx, false, false, info.parentLayer]],
                   ["display name", "inserted", [layerId, "Group " + groupNum]]);
        localState.uiActiveLayer = layerId;
        localState.openLayers[layerId] = true;
        break;

      case "updateUiLayer":
        var subLayers = code.layerToChildLayers(info.neue);
        var neueLocked = info.neue[4];
        var neueHidden = info.neue[5];
        subLayers.forEach(function(sub) {
          if(sub[4] !== neueLocked || sub[5] !== neueHidden) {
            var neue = sub.slice();
            neue[4] = neueLocked;
            neue[5] = neueHidden;
            diffs.push(["uiComponentLayer", "inserted", neue],
                       ["uiComponentLayer", "removed", sub])
          }
        });
        diffs.push(["uiComponentLayer", "inserted", info.neue],
                   ["uiComponentLayer", "removed", info.old])
        break;

      case "deleteLayer":
        var subLayers = code.layerToChildLayers(info.layer);
        var elementsLookup = ixer.index("uiLayerToElements");
        subLayers.push(info.layer);
        subLayers.forEach(function(sub) {
          diffs.push(["uiComponentLayer", "removed", sub]);
          var elements = elementsLookup[sub[1]];
          if(elements) {
            elements.forEach(function(element) {
              diffs.push(["uiComponentElement", "removed", element]);
            });
          }
        });
        break;

      case "changeParentLayer":
        var layer = ixer.index("uiComponentLayer")[info.layerId];
        if(layer[6] !== info.parentLayerId) {
          var neue = layer.slice();
          neue[0] = txId;
          neue[6] = info.parentLayerId;
          diffs.push(["uiComponentLayer", "inserted", neue],
                     ["uiComponentLayer", "removed", layer])
        }
        break;
      case "changeElementLayer":
        var elem = ixer.index("uiComponentElement")[info.elementId];
        if(elem[3] !== info.parentLayerId) {
          var neue = elem.slice();
          neue[0] = txId;
          neue[3] = info.parentLayerId;
          diffs.push(["uiComponentElement", "inserted", neue],
                     ["uiComponentElement", "removed", elem])
        }
        break;
      case "changeElementPosition":
        var elem = ixer.index("uiComponentElement")[info.elementId];
        var target = ixer.index("uiComponentElement")[info.targetId];
        var neue = elem.slice();
        var changed = false;
        neue[0] = txId;
        if(elem[3] !== target[3]) {
          changed = true;
          neue[3] = target[3];
        }
        if(elem[9] !== target[9]) {
          changed = true;
          //move all the others
          neue[9] = target[9];
          var others = ixer.index("uiLayerToElements")[target[3]] || [];
          for(var othersIx = 0, othersLen = others.length; othersIx < othersLen; othersIx++) {
            var other = others[othersIx];
            if(other[9] >= neue[9] && neue[1] !== other[1]) {
              var neueOther = other.slice();
              neueOther[9] = other[9] + 1;
              diffs.push(["uiComponentElement", "inserted", neueOther],
                         ["uiComponentElement", "removed", other]);
            }
          }
        }
        if(changed) {
          diffs.push(["uiComponentElement", "inserted", neue],
                     ["uiComponentElement", "removed", elem]);
        }
        break;
      case "rename":
        var id = info.id;
        sendToServer = !!info.sendToServer;
        if(info.value === undefined || info.value === info.initial[1]) { return; }
        diffs.push(["display name", "inserted", [id, info.value]],
                   ["display name", "removed", info.initial])
        break;

      case "addField":
        var fieldId = uuid();
        var ix = ixer.index("view to fields")[info.table].length;
        diffs.push(["field", "inserted", [info.table, fieldId, "output"]], // @NOTE: Can this be any other kind?
                   ["display name", "inserted", [fieldId, alphabet[ix]]],
                   ["display order", "inserted", [fieldId, -ix]]);
        var oldFacts = (ixer.facts(info.table) || []).slice();
        var neueFacts = oldFacts.map(function(fact) {
          var neue = fact.slice();
          neue.push("");
          var oldKey = info.table + JSON.stringify(fact);
          var neueKey = info.table + JSON.stringify(neue);
          var priority = ixer.index("display order")[oldKey];
          diffs.push(["display order", "removed", [oldKey, priority]],
                     ["display order", "inserted", [neueKey, priority]]);

          return neue;
        });
        ixer.clearTable(info.table); // @HACKY way to clear the existing indexes.
        setTimeout(function() {
          dispatch("replaceFacts", {table: info.table, neue: neueFacts});
        }, 1000);
        break;
      case "replaceFacts":
        var diffs = [];
        diffs = diffs.concat((info.old || []).map(function(fact) {
          return [info.table, "removed", fact];
        }));
        diffs = diffs.concat((info.neue || []).map(function(fact) {
          return [info.table, "inserted", fact];
        }));
        break;
      case "addRow":
        var ix = ixer.facts(info.table).length || 0;
        diffs.push([info.table, "inserted", info.neue],
                   ["display order", "inserted", [info.table + JSON.stringify(info.neue), ix]]);
        break;
      case "updateRow":
        sendToServer = info.submit;
        var oldString = info.table + JSON.stringify(info.old);
        var ix = info.priority;
        if(ix === undefined) {
          console.error("No ix specified for", oldString);
          ix = 0;
        }
        var neueString = info.table + JSON.stringify(info.neue);
        if(oldString === neueString) return;
        diffs.push([info.table, "inserted", info.neue],
                   ["display order", "inserted", [neueString, ix]]);
        if(info.old) {
          diffs.push([info.table, "removed", info.old],
          ["display order", "removed", [oldString, ix]]);
        }
        break;
      case "exportView":
        // @TODO: Should we make this capable of exporting multiple views?
//         var query = ixer.index("view to query")[info.viewId];
//         var queryBlocks = ixer.index("query to blocks")[query] || [];
//         var blockViewIx = code.ix("block", "view");
//         queryBlocks.forEach(function(block) {
//           var viewId = block[blockViewIx];
//           if(!code.hasTag(viewId, "local")) {
//             diffs.push(["tag", "inserted", [viewId, "local"]]);
//           }
//         });
//        diffs.push(["tag", "removed", [info.viewId, "local"]]);
        var prevExport = ixer.index("query to export")[info.queryId];
        if(prevExport) {
          diffs.push(["query export", "removed", [info.queryId, prevExport]]);
        }
        diffs.push(["query export", "inserted", [info.queryId, info.viewId]]);
        break;
      case "addViewBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        var viewId = uuid();
        diffs = diff.addViewBlock(queryId, info.sourceId, info.kind, viewId);
        break;
      case "addAggregateBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        diffs = diff.addAggregateBlock(queryId, info.kind);
        var primitive = ixer.index("primitive")[info.kind];
        if(primitive) {
          var viewId = diffs[1][2][code.ix("view", "view")]; //@FIXME: Hacky.
          dispatch("addPrimitiveSource", {viewId: viewId, primitiveId: info.kind}); // @FIXME: Hacky, I know, but I need to send half to the server.
        }
        break;
      case "addUnionBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        diffs = diff.addUnionBlock(queryId);
        break;
      case "removeViewBlock":
        diffs = diff.removeViewBlock(info.viewId);
        break;
      case "addViewSelection":
        diffs = diff.addViewSelection(info.viewId, info.sourceId, info.sourceFieldId, info.fieldId, info.isCalculated);
        break;
      case "addUnionSelection":
        diffs = diff.addViewSelection(info.viewId, info.sourceId, info.sourceFieldId, info.fieldId);

        // do not send to server unless selects.length = fields.length * sources.length
        var sourceIdIx = code.ix("source", "source");
        var numSources = (ixer.index("view to sources")[info.viewId] || []).reduce(function(memo, source) {
          if(source[sourceIdIx] !== info.sourceId) { return memo + 1; }
          return memo;
        }, 1);
        var fieldIdIx = code.ix("field", "field");
        var numFields = (ixer.index("view to fields")[info.viewId] || []).reduce(function(memo, field) {
          if(field[fieldIdIx] !== info.fieldId) { return memo + 1; }
          return memo;
        }, 1);
        var selectSourceIx = code.ix("select", "source");
        var selectFieldIx = code.ix("select", "view field");
        var selects = (ixer.index("view to selects")[info.viewId] || []);
        var numSelects = selects.reduce(function(memo, select) {
          if(select[selectSourceIx] !== info.sourceId
             || select[selectFieldIx] !== info.fieldId) { return memo + 1; }
          return memo;
        }, 1);

        // @FIXME: This went from okay to bad fast.
        if(numSelects !== numFields * numSources) {
          sendToServer = false;
        } else {
          diffs = diffs.concat(selects.map(function(select) {
            return ["select", "inserted", select];
          }));
          var sources = ixer.index("view to sources")[info.viewId] || [];
          diffs = diffs.concat(sources.map(function(source) {
            return ["source", "inserted", source];
          }));
          var blockFields = ixer.index("view and source to block fields")[info.viewId]["selection"] || [];
          diffs = diffs.concat(blockFields.map(function(blockField) {
            return ["block field", "inserted", blockField];
          }));
          var fields = ixer.index("view to fields")[info.viewId] || [];
          diffs = diffs.concat(fields.map(function(field) {
            return ["field", "inserted", field];
          }));
          var fieldIdIx = code.ix("field", "field");
          diffs = diffs.concat(fields.map(function(field) {
            var id = field[fieldIdIx];
            return ["display name", "inserted", [id, code.name(id)]];
          }));
        }
        break;
      case "addViewSource":
        diffs = diff.addViewSource(info.viewId, info.sourceId, info.kind);
        var sourceId = diffs[0][2][code.ix("source", "source")]; //@FIXME: Hacky.
        diffs = diffs.concat(diff.autoJoin(info.viewId, sourceId, info.sourceId));
        var view = ixer.index("view")[info.viewId];
        var kind = view[code.ix("view", "kind")];
        if(kind === "union") {
          var selects = (ixer.index("view to selects")[info.viewId] || []);
          if(selects.length) {
            sendToServer = false;
          }
        }
        break;
      case "removeViewSource":
        diffs = diff.removeViewSource(info.viewId, info.sourceId);
        break;
      case "addViewConstraint":
        diffs = diff.addViewConstraint(info.viewId, {operation: "=", leftSource: info.leftSource, leftField: info.leftField});
        sendToServer = false;
        break;
      case "updateViewConstraint":
        var viewId = ixer.index("constraint to view")[info.constraintId];

        // @TODO: redesign this to pass in opts directly.
        var opts = code.getConstraint(info.constraintId);
        if(!info.isConstant) {
          if(info.type === "left") {
            opts.leftField = info.value.field[code.ix("field", "field")];
            opts.leftSource = info.value.source[code.ix("source", "source")];
          } else if(info.type === "right") {
            opts.rightField = info.value.field[code.ix("field", "field")];
            opts.rightSource = info.value.source[code.ix("source", "source")];
          } else if(info.type === "operation") {
            opts.operation = info.value;
          }
        } else {
          var constantFieldId = uuid();
          if(info.type === "left") {
            opts.leftField = constantFieldId;
            opts.leftSource = "constant";
          } else if(info.type === "right") {
            opts.rightField = constantFieldId;
            opts.rightSource = "constant";
          }
          diffs.push(["constant", "inserted", [constantFieldId, info.value]]);
          console.log("adding constant", diffs, opts);
        }

        var complete = code.isConstraintComplete(opts);
        var constraints = ixer.index("source to constraints")[opts.leftSource] || [];
        var constraintOpts = constraints.map(function(constraint) {
          var constraintId = constraint[0];
          if(constraintId === info.constraintId) { return; }
          var opts = code.getConstraint(constraintId);

          if(!code.isConstraintComplete(opts)) {
            complete = false;
          }
          return [constraintId, opts];
        });

        diffs = diffs.concat(diff.updateViewConstraint(info.constraintId, opts));
        if(complete) {
          diffs = constraintOpts.reduce(function(memo, constraintPair) {
            if(!constraintPair) { return memo; }
            return memo.concat(diff.updateViewConstraint(constraintPair[0], constraintPair[1]));
          }, diffs);
          diffs.push(["source", "inserted", ixer.index("source")[viewId][opts.leftSource]]);

          var calculatedFieldId = ixer.index("view and source to calculated field")[viewId] || {};
          calculatedFieldId = calculatedFieldId[opts.leftSource];
          if(calculatedFieldId) {
            diffs.push(["calculated field", "inserted", ixer.index("calculated field")[calculatedFieldId]]);
            diffs.push(["display name", "inserted", [calculatedFieldId, code.name(calculatedFieldId)]]);
          }

          //@FIXME: Chris added this because the server was never being sent the actual constraint entry
          //I suspect this is supposed to work some other way?
          diffs.push(["constraint", "inserted", [info.constraintId, viewId]]);

        } else {
          sendToServer = false; // @FIXME: Here be monsters. Constant fields can get lost if added to otherwise incomplete constraints.
        }

        break;
      case "removeViewConstraint":
        var constraint = code.getConstraint(info.constraintId);
        var calculatedId = ixer.index("view and source to calculated field")[constraint.view] || {};
        calculatedId = calculatedId[constraint.leftSource];
        if(calculatedId) {
          var constraintIdIx = code.ix("constraint", "constraint");
          var constraints = ixer.index("source to constraints")[constraint.leftSource] || [];
          constraints.forEach(function(constraint) {
            diffs = diffs.concat(diff.removeViewConstraint(constraint[constraintIdIx]));
          });
          diffs.push(["calculated field", "removed", ixer.index("calculated field")[calculatedId]],
                     ["source", "removed", ixer.index("source")[constraint.view][constraint.leftSource]]);
        } else {
          diffs = diff.removeViewConstraint(info.constraintId);
        }

        break;
      case "updateAggregateSort":
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
          var sources = ixer.index("source")[viewId];
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

        sendToServer = false;
        break;
      case "addUiComponentElement":
        var elemId = uuid();
        var neue: any = [txId, elemId, info.componentId, info.layerId, info.control, info.left, info.top, info.right, info.bottom, info.zIndex];
        var appStyleId = uuid();
        var typStyleId = uuid();
        var contentStyleId = uuid();
        diffs.push(["uiComponentElement", "inserted", neue]);
        diffs.push(["uiStyle", "inserted", [txId, appStyleId, "appearance", elemId, false]],
                   ["uiStyle", "inserted", [txId, typStyleId, "typography", elemId, false]],
                   ["uiStyle", "inserted", [txId, contentStyleId, "content", elemId, false]]);

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
        storeEvent = false;
        sendToServer = false;
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
        storeEvent = false;
        sendToServer = false;
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        var elem = elementIndex[info.elemId];
        var diffX: number = info.x !== undefined ? info.x - elem[5] : 0;
        var diffY: number = info.y !== undefined ? info.y - elem[6] : 0;
        if(diffX || diffY) {
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
        }
        break;
      case "bindGroup":
        var prev = ixer.index("groupToBinding")[info.groupId];
        if(prev) {
          diffs.push(["uiGroupBinding", "removed", [info.groupId, prev]]);
        }
        diffs.push(["uiGroupBinding", "inserted", [info.groupId, info.itemId]]);
        break;
      case "bindAttr":
        var elemId = info.elementId;
        var attr = info.attr;
        var field = info.field;
        var prev = (ixer.index("elementAttrToBinding")[elemId] || {})[attr];
        if(prev) {
          diffs.push(["uiAttrBinding", "removed", [elemId, attr, prev]]);
        }
        diffs.push(["uiAttrBinding", "inserted", [elemId, attr, field]]);
        break;
      case "stopChangingSelection":
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        var elem = elementIndex[info.elemId];
        var oldElements = info.oldElements;
        sel.forEach(function(cur, ix) {
          var elem = elementIndex[cur];
          var old = oldElements[ix];
          if(!Indexing.arraysIdentical(elem, old)) {
            diffs.push(["uiComponentElement", "inserted", elem],
                       ["uiComponentElement", "removed", old]);
          }
        });
        break;
      case "offsetSelection":
        storeEvent = false;
        sendToServer = false;
        var sel = localState.uiSelection;
        var elementIndex = ixer.index("uiComponentElement");
        var diffX: number = info.diffX;
        var diffY: number = info.diffY;
        if(diffX || diffY) {
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
        }
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
        storeEvent = info.storeEvent;
        sendToServer = info.storeEvent;
        var style = uiEditor.getUiPropertyType(info.property);
        if(!style) { throw new Error("Unknown attribute type for property: " + info.property + " known types:" + uiEditor.uiProperties); }

        var sel = localState.uiSelection;
        sel.forEach(function(cur) {
          var id = cur;
          var styleId = ixer.index("uiElementToStyle")[id][style][1];
          var oldProps = ixer.index("uiStyleToAttr")[styleId];
          if(oldProps && oldProps[info.property]) {
            diffs.push(["uiComponentAttribute", "removed", oldProps[info.property]]);
          }
          diffs.push(["uiComponentAttribute", "inserted", [txId, styleId, info.property, info.value]]);
        });
        break;
      case "stopSetAttributeForSelection":
        var style = uiEditor.getUiPropertyType(info.property);
        if(!style) { throw new Error("Unknown attribute type for property: " + info.property + " known types:" + uiEditor.uiProperties); }

        var sel = localState.uiSelection;
        var oldAttrs = info.oldAttrs;
        sel.forEach(function(cur, ix) {
          var id = cur;
          var styleId = ixer.index("uiElementToStyle")[id][style][1];
          var oldProps = ixer.index("uiStyleToAttr")[styleId];
          if(oldProps && oldProps[info.property]) {
            diffs.push(["uiComponentAttribute", "inserted", oldProps[info.property]]);
          }
          if(oldAttrs[ix]) {
            diffs.push(["uiComponentAttribute", "removed", oldAttrs[ix]]);
          }
        });
        break;
      case "setSelectionStyle":
        var styleId = info.id;
        var type = info.type;
        var sel = localState.uiSelection;
        sel.forEach(function(id) {
          var prevStyle = ixer.index("uiElementToStyle")[id][type];
          diffs.push(["uiStyle", "inserted", [txId, styleId, type, id, info.shared]],
                     ["uiStyle", "removed", prevStyle]);
        });
        if(info.copyCurrent && sel && sel.length) {
          console.log("copying current");
          //duplicate the attrs to this newly created style
          var id = sel[0];
          var prevStyle = ixer.index("uiElementToStyle")[id][type];
          diffs.push.apply(diffs, diff.duplicateStyle(prevStyle, id, txId, styleId));
        }
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
      case "toggleKey":
        var isKey = code.hasTag(info.fieldId, "key");
        if(isKey) {
          diffs.push(["tag", "removed", [info.fieldId, "key"]]);
        } else {
          diffs.push(["tag", "inserted", [info.fieldId, "key"]]);
        }
        break;
      case "undo":
        storeEvent = false;
        diffs = scaryUndoEvent();
        break;
      case "redo":
        storeEvent = false;
        diffs = scaryRedoEvent();
        break;
      default:
        console.error("Unhandled dispatch:", evt, info);
        break;
    }


    if(diffs && diffs.length) {
      if(storeEvent) {
        var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack, localState: clone(localState), root: false};
        eventStack.children.push(eventItem);
        eventStack = eventItem;
      }

      ixer.handleDiffs(diffs);
      if(sendToServer) {
        if(DEBUG.DELAY) {
          setTimeout(function() {
            client.sendToServer(diffs, false);
          }, DEBUG.DELAY);
        } else {
          client.sendToServer(diffs, false);
        }
      }
      render();
    } else {
      //       console.warn("No diffs to index, skipping.");
    }
  }

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
      workspace = uiEditor.uiWorkspace(itemId);
    } else if(type === "table") {
      workspace = tableEditor.tableWorkspace(itemId);
    }
    var arrowDir = localState.showMenu ? "left" : "right";
    return {id: "root", c: "root", children: [
      editorItemList(itemId),
      {c: "items-toggle ion-ios-arrow-" + arrowDir, click: toggleMenu},
      workspace,
    ]};
  }

  function editorItemList(itemId) {
    var views = ixer.facts("editor item");
    // @TODO: filter me based on tags local and compiler.
    var items = ixer.facts("editor item").map(function(cur) {
      var id = cur[0];
      if(!localState.showHidden && code.hasTag(id, "hidden")) {
        return;
      }
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

      var dragId = id;
      var draggable = true;
      if(type === "query") {
        dragId = ixer.index("query to export")[id];
        if(!dragId) {
          draggable = false;
        }
      }

      var name = code.name(id) || "";
      return {c: klass, name: name, click: selectEditorItem, dblclick: closeSelectEditorItem, dragData: {value: dragId, type: "view"}, itemId: id, draggable: draggable, dragstart: dragItem, children: [
        {c: "icon " + icon},
        {text: name},
      ]};
    })
    items.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    var width = 0;
    if(localState.showMenu) {
      width = 200;
    }
    return {c: "editor-item-list", width:width, children: [
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
      {c: "items", children: items},
      {c: "show-hidden", click: toggleHiddenEditorItems, children: [
        {text: "show hidden"}
      ]}
    ]};
  }

  function toggleHiddenEditorItems(e, elem) {
    localState.showHidden = !localState.showHidden;
    render();
  }

  function addItem(e, elem) {
    dispatch(elem.event, {});
  }

  function selectEditorItem(e, elem) {
    localState.activeItem = elem.itemId;
    var type = ixer.index("editor item to type")[elem.itemId];
    if(type === "table") {
      localState.adderRows = [[], []];
    } else if(type === "ui") {
      var layer = ixer.index("parentLayerToLayers")[elem.itemId][0];
      localState.uiActiveLayer = layer[1];
    }
    render();
  }

  function closeSelectEditorItem(e, elem) {
    localState.showMenu = false;
    selectEditorItem(e, elem);
  }

  function genericWorkspace(klass, itemId, content) {
    var title = tableEditor.input(code.name(itemId), itemId, tableEditor.rename, tableEditor.rename);
    title.c += " title";
    return {id: "workspace",
            c: "workspace-container " + klass,
            children: [
              title,
              {c: "content", children: [content]}
            ]};
  }

  function toggleMenu() {
    localState.showMenu = !localState.showMenu;
    render();
  }
  
   //---------------------------------------------------------
  // Query workspace
  //---------------------------------------------------------

  function queryWorkspace(queryId) {
    return genericWorkspace("query", queryId,
                            {c: "query-editor",
                             children: [
                               editor(queryId)
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
      dispatch("addViewConstraint", {viewId: info.viewId});
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
      items = ["=", "<", "<=", ">", ">=", "!="].map(function(op) {
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
    localState.queryEditorActive = elem.viewId;
    localState.queryEditorInfo = {
      viewId: elem.viewId,
      handler: elem.handler,
    };
    render();
  }

  function newJoinBlock(e, elem) {
    dispatch("addViewBlock", {queryId: elem.queryId, kind: "join"});
  }

  function newAggregateBlock(e, elem) {
    dispatch("addAggregateBlock", {queryId: elem.queryId, kind: elem.kind});
  }

  function newUnionBlock(e, elem) {
      dispatch("addUnionBlock", {queryId: elem.queryId});
  }

  function editorDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
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

  function sourceTitle(type, viewId, sourceId) {
    var sourceName;

    if(sourceId == "inner" || sourceId === "outer" || sourceId === "insert" || sourceId === "remove") {
      sourceName = code.name(viewId + "-" + sourceId) + " (" + sourceId + ")";
    } else {
      sourceName = code.name(sourceId);
    }

    return {c: type + "-source-title source-title", children: [
      {t: "h4", text: sourceName || "Untitled"}
    ]};
  }

  function sourceWithFields(type, viewId, sourceId, drop) {
    var fields = ixer.index("view and source to block fields")[viewId] || {};
    fields = fields[sourceId] || [];
    var fieldItems = [];
    fields.forEach(function(field) {
      var id = field[code.ix("block field", "block field")];
      var fieldId = field[code.ix("block field", "field")];
      fieldItems.push(fieldItem(code.name(fieldId) || "Untitled", id, {c: "pill field"}));
      fieldItems.push({t: "pre", text: ", "});
    });
    fieldItems.pop();
    fieldItems.push({text: ")"});

    var title = sourceTitle(type, viewId, sourceId);

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
      var sourceName = code.name(sourceId);
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
      var out = ixer.index("view and source to calculated field")[viewId][sourceId];
      var outField = ixer.index("calculated field")[out][code.ix("calculated field", "field")];
      var constraintIds = code.getViewSourceConstraints(viewId, sourceId);
      var constraintArgs = constraintIds.map(function(constraintId, ix) {
        var constraint = code.getConstraint(constraintId);
        var name = constraint.rightField ? getFieldName(viewId, constraint.rightSource, constraint.rightField) : "<field " + alphabet[ix] + ">";
        return viewConstraintToken("right", constraint.id, viewId, name);
      });

      var content = [
        fieldItem(code.name(out), out, {c: "pill field"}),
        {text: "⇒"},
        {text: code.name(sourceViewId) + "("},
      ].concat(constraintArgs);
      content.push({text: ")"});

      return {c: "spaced-row primitive-constraint", children: content};
    },
    infix: function(viewId, sourceId, sourceViewId, operator) {
      var out = ixer.index("view and source to calculated field")[viewId][sourceId];
      var outField = ixer.index("calculated field")[out][code.ix("calculated field", "field")];
      var constraintIds = code.getViewSourceConstraints(viewId, sourceId);
      var a = code.getConstraint(constraintIds[0]);
      var b = code.getConstraint(constraintIds[1]);
      var aName = a.rightField ? getFieldName(viewId, a.rightSource, a.rightField) : "<field A>";
      var bName = b.rightField ? getFieldName(viewId, b.rightSource, b.rightField) : "<field B>";

      return {c: "spaced-row primitive-constraint", children: [
        fieldItem(code.name(out), out, {c: "pill field"}),
        {text: "⇒"},
        viewConstraintToken("right", a.id, viewId, aName),
        {text: operator},
        viewConstraintToken("right", b.id, viewId, bName)
      ]}
    },

    add: function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "+");
    },
    subtract: function(viewId, sourceId, sourceViewId) {
      return primitiveEditor.infix(viewId, sourceId, sourceViewId, "-");
    }
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
      var info = localState.queryEditorInfo;
      var token = info.token || {};
      info.token = token;

      if(elem.key === "new constant") {
        evt.stopPropagation();
        token.isConstant = true;
        render();
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
    localState.queryEditorActive = elem.viewId;
    localState.queryEditorInfo = {
      type: "constraint op",
      sourceId: elem.sourceId,
      viewId: elem.viewId,
      fieldId: elem.fieldId,
      token: elem,
      handler: elem.handler
    };
    render();
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
    var state = tokenState[elem.parentId];
    if(!state) { state = tokenState[elem.parentId] = {}; }
    state[elem.key] = 1;
    render();
  }

  function stopEditToken(evt, elem) {
    var state = tokenState[elem.parentId];
    state[elem.key] = 0;
    render();
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
    var fields = ixer.index("view and source to block fields")[viewId] || {};
    fields = fields.selection || [];
    var selectSources = ixer.index("view and source and field to select")[viewId] || {};
    var sources = ixer.index("source")[viewId] || {};
    var sourceIds = Object.keys(sources);

    var sourceItems = [];
    var fieldMappingItems = [];
    for(var sourceIx = 0; sourceIx < sourceIds.length; sourceIx++) {
      var sourceId = sourceIds[sourceIx];
      var source = sources[sourceId];
      var rowItems = [];
      rowItems.push({t: "td", c: "source-name", children: [sourceTitle("union", viewId, sourceId)]});

      if(fields.length) {
        var selectFields = selectSources[sourceId] || [];

        var mappingPairs = [];
        for(var fieldIx = 0; fieldIx < fields.length; fieldIx++) {
          var field = fields[fieldIx];
          var fieldId = field[code.ix("block field", "field")];
          var selectField = selectFields[fieldId] || [];
          var mappedFieldId = selectField[code.ix("select", "source field")];
          rowItems.push({t: "td", c: "mapped-field", viewId: viewId, sourceId: sourceId, fieldId: fieldId, click: fieldSuggestions, handler: setMappingField,
                         text: (mappedFieldId ? code.name(mappedFieldId) || "Untitled" : "---")});
        }
      }
      rowItems.push({t: "td", c: "mapped-field", viewId: viewId, sourceId: sourceId, click: fieldSuggestions, handler: setMappingField, text: "---"});
      sourceItems.push({t: "tr", children: rowItems});
    }

    var headers = [{t: "th", c: "spacer"}];
    fields.forEach(function(cur) {
      headers.push({t: "th", c: "mapping-header", text: code.name(cur[code.ix("block field", "field")])});
    });
    headers.push({t: "th", c: "mapping-header", text: "---"});

    return {c: "block union-block", viewId: viewId, dragover: preventDefault, drop: viewBlockDrop, children: [
              {t: "table", children: [
                {t: "thead", children: [
                  {t: "tr", children: headers}
                ]},
                {t: "tbody", children: sourceItems}
              ]}
//               {c: "block-pane mapping", viewId: viewId, dragover: preventDefault, drop: unionSourceMappingDrop, children: fieldMappingItems},
    ]};
  }

  function fieldSuggestions(e, elem) {
    e.stopPropagation();
    localState.queryEditorActive = elem.viewId;
    localState.queryEditorInfo = {
      type: "field",
      sourceId: elem.sourceId,
      viewId: elem.viewId,
      fieldId: elem.fieldId,
      token: elem,
      handler: elem.handler
    };
    render();
  }

  function setMappingField(e, elem) {
    var info = localState.queryEditorInfo;
    dispatch("addUnionSelection", {viewId: info.viewId, sourceFieldId: elem.key, sourceId: info.sourceId, fieldId: info.fieldId});
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
    dispatch("addUnionSelection", {viewId: viewId, sourceFieldId: fieldId, sourceId: sourceId, fieldId: elem.fieldId});
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

  //---------------------------------------------------------
  // Global key handling
  //---------------------------------------------------------

  document.addEventListener("keydown", function(e) {
    //Don't capture keys if they are
    var target: any = e.target;
    if(e.defaultPrevented
       || target.nodeName === "INPUT"
       || target.getAttribute("contentEditable")) {
      return;
    }

    //undo + redo
    if((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === KEYS.Z) {
      dispatch("redo", null);
    } else if((e.metaKey || e.ctrlKey) && e.keyCode === KEYS.Z) {
      dispatch("undo", null);
    }

  });

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------
  if(window["queryEditor"]) { render(); }
  window["dispatcher"] = queryEditor;
}
