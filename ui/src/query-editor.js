var queryEditor = (function(window, microReact, api) {
  var document = window.document;
  var ixer = api.ixer;
  var code = api.code;
  var diff = api.diff;
  var localState = api.localState;
  var clone = api.clone;
  var alphabet = api.alphabet;

  if(window.queryEditor) {
    try {
      document.body.removeChild(window.queryEditor.container);
    } catch (err) {
      // meh
    }
  }

  window.addEventListener("resize", render);
  document.body.addEventListener("drop", preventDefault);


  var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  renderer.queued = false;
  function render() {
    if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        renderer.queued = false;
        renderer.render(root());
      });
    }
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


  function reverseDiff(diff) {
    var neue = [];
    for(var diffIx = 0, diffLen = diff.length; diffIx < diffLen; diffIx++) {
      var copy = diff[diffIx].slice();
      neue[diffIx] = copy
      if(copy[1] === "inserted") {
        copy[1] = "removed";
      } else {
        copy[1] = "inserted";
      }
    }
    return neue;
  }

  //---------------------------------------------------------
  // Local state
  //---------------------------------------------------------
  var eventStack = {root: true, children: [], localState: clone(localState)};

  function scaryUndoEvent() {
    if(!eventStack.parent || !eventStack.diffs) return {};

    var old = eventStack;
    eventStack = old.parent;
    localState = clone(eventStack.localState);
    api.localState = localState;
    return reverseDiff(old.diffs);
  }

  function scaryRedoEvent() {
    if(!eventStack.children.length) return {};

    eventStack = eventStack.children[eventStack.children.length - 1];
    localState = clone(eventStack.localState);
    return eventStack.diffs;
  }

  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------

  function dispatch(evt, info) {
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
        var ix = info.ix;
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
        if(code.hasTag(info.viewId, "local")) {
          diffs.push(["tag", "removed", [info.viewId, "local"]]);
        } else {
          diffs.push(["tag", "inserted", [info.viewId, "local"]]);
        }
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
          var viewId = diffs[0][2][0];
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
        if(info.type === "left") {
          opts.leftField = info.value.field[code.ix("field", "field")];
          opts.leftSource = info.value.source[code.ix("source", "source")];
        } else if(info.type === "right") {
          opts.rightField = info.value.field[code.ix("field", "field")];
          opts.rightSource = info.value.source[code.ix("source", "source")];
        } else if(info.type === "operation") {
          opts.operation = info.value;
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

        diffs = diff.updateViewConstraint(info.constraintId, opts);
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
          sendToServer = false;
          console.log("incomplete", diffs);
        }

        break;
      case "removeViewConstraint":
        var constraint = code.getConstraint(info.constraintId);
        console.log("!", constraint);


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
        var params = {};
        params[info.key] = info.value;
        diffs = diff.updateAggregateSort(info.viewId, params.field, params.direction);
        var neue = diffs[0][2];
        sendToServer = neue[code.ix("aggregate sorting", "inner field")]
        && neue[code.ix("aggregate sorting", "direction")];
        break;
      case "updateAggregateLimit":
        sendToServer = info.sendToServer;
        var table = (info.key === "from") ? "aggregate limit from" : "aggregate limit to";

        // @FIXME: Hard-coded to work with constants only.
        var constantId = uuid();
        var limit = ixer.index("view to " + table)[info.viewId];
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
        diffs = diff.updateAggregateGrouping(info.aggregate, info.source, info.field);
        if(diffs.length) {
          var neue = diffs[0][2];//@FIXME: Hacky.
          sendToServer = neue[code.ix("aggregate grouping", "inner field")] && neue[code.ix("aggregate grouping", "outer field")];
        }
        break;
      case "addPrimitiveSource":
        diffs = diff.addPrimitiveSource(info.viewId, info.primitiveId);

        sendToServer = false;
        break;
      case "addUiComponentElement":
        var elemId = uuid();
        var neue = [txId, elemId, info.componentId, info.layerId, info.control, info.left, info.top, info.right, info.bottom];
        var appStyleId = uuid();
        var typStyleId = uuid();
        diffs.push(["uiComponentElement", "inserted", neue]);
        diffs.push(["uiStyle", "inserted", [txId, appStyleId, "appearance", elemId, false]],
                   ["uiStyle", "inserted", [txId, typStyleId, "typography", elemId, false]],
                   ["uiStyle", "inserted", [txId, typStyleId, "content", elemId, false]]);

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
        var diffX = info.x !== undefined ? info.x - elem[5] : 0;
        var diffY = info.y !== undefined ? info.y - elem[6] : 0;
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
          if(!window.Indexing.arraysIdentical(elem, old)) {
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
        var diffX = info.diffX;
        var diffY = info.diffY;
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
        var style = getUiPropertyType(info.property);
        if(!style) { throw new Error("Unknown attribute type for property:", info.property, "known types:", uiProperties); }

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
        var style = getUiPropertyType(info.property);
        if(!style) { throw new Error("Unknown attribute type for property:", info.property, "known types:", uiProperties); }

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
        var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack, localState: clone(localState)};
        eventStack.children.push(eventItem);
        eventStack = eventItem;
      }

      ixer.handleDiffs(diffs);
      if(sendToServer) {
        window.client.sendToServer(diffs);
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
      workspace = uiWorkspace(itemId);
    } else if(type === "table") {
      workspace = tableWorkspace(itemId);
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

      var name = code.name(id) || "";
      return {c: klass, name: name, click: selectEditorItem, dblclick: closeSelectEditorItem, dragData: {value: id, type: "view"}, itemId: id, draggable: true, dragstart: dragItem, children: [
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
      {c: "items", children: items}
    ]};
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
//     var finalControls = controls;
//     if(!localState.showMenu) {
//       var finalControls = [{c: "menu-toggle", click: toggleMenu, text: "items"}].concat(controls);
//     }
    var title = input(code.name(itemId), itemId, rename, rename);
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

  function controlGroup(controls) {
    return {c: "control-group", children: controls};
  }

  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  function tableWorkspace(tableId) {
    var order = ixer.index("display order");
    var fields = (ixer.index("view to fields")[tableId] || []).map(function(field) {
      var id = field[code.ix("field", "field")];
      return {name: getLocalFieldName(id), id: id, priority: order[id] || 0};
    });
    fields.sort(function(a, b) {
      var delta = b.priority - a.priority;
      if(delta) { return delta; }
      else { return a.id.localeCompare(b.id); }
    });

    var rows = ixer.facts(tableId);
    rows.sort(function(a, b) {
      var aIx = order[tableId + JSON.stringify(a)];
      var bIx = order[tableId + JSON.stringify(b)];
      return aIx - bIx;
    });
    return genericWorkspace("",
                            tableId,
                            {c: "table-editor",
                             children: [
                               virtualizedTable(tableId, fields, rows, true)
                             ]});
  }

  function rename(e, elem, sendToServer) {
    var value = e.currentTarget.textContent;
    if(value !== undefined) {
      dispatch("rename", {value: value, id: elem.key, sendToServer: sendToServer, initial: [localState.initialKey, localState.initialValue]});
    }
  }

  function virtualizedTable(id, fields, rows, isEditable) {
    var ths = fields.map(function(cur) {
      var oninput, onsubmit;
      if(cur.id) {
        oninput = onsubmit = rename;
      }
      return {c: "header", children: [input(cur.name, cur.id, oninput, onsubmit)]};
    });
    if(isEditable) {
      ths.push({c: "header add-column ion-plus", click: addField, table: id});
    }
    var trs = [];
    rows.forEach(function(cur, rowIx) {
      var priority = ixer.index("display order")[id + JSON.stringify(cur)];
      var tds = [];
      for(var tdIx = 0, len = fields.length; tdIx < len; tdIx++) {
        tds[tdIx] = {c: "field"};

        // @NOTE: We can hoist this if perf is an issue.
        if(isEditable) {
          tds[tdIx].children = [input(cur[tdIx], {rowIx: priority, row: cur, ix: tdIx, view: id}, updateRow, submitRow)];
        } else {
          tds[tdIx].text = cur[tdIx];
        }
      }
      trs.push({c: "row", children: tds});
    })
    if(isEditable) {
      var adderRows = localState.adderRows;
      adderRows.forEach(function(cur, rowNum) {
        var tds = [];
        for(var i = 0, len = fields.length; i < len; i++) {
          tds[i] = {c: "field", children: [input(cur[i], {row: cur, numFields:len, rowNum: rowNum, ix: i, view: id}, updateAdder, maybeSubmitAdder)]};
        }
        trs.push({c: "row", children: tds});
      });
    }
    //   trs.push({id: "spacer2", c: "spacer", height: Math.max(totalRows - start - numRows, 0) * itemHeight});
    return {c: "table", children: [
      {c: "headers", children: ths},
      {c: "rows", children: trs}
    ]};
  }

  function addField(e, elem) {
    dispatch("addField", {table: elem.table});
  }

  function updateAdder(e, elem) {
    var key = elem.key;
    var row = localState.adderRows[key.rowNum];
    row[key.ix] = coerceInput(e.currentTarget.textContent);
  }

  function maybeSubmitAdder(e, elem, type) {
    var key = elem.key;
    var row = localState.adderRows[key.rowNum];
    row[key.ix] = coerceInput(e.currentTarget.textContent);
    if(row.length !== key.numFields) { return; }
    var isValid = row.every(function(cell) {
      return cell !== undefined;
    });
    if(!isValid) { return; }
    localState.adderRows.splice(key.rowNum, 1);
    if(localState.adderRows.length <= 1) {
      localState.adderRows.push([]);
    }
    dispatch("addRow", {table: key.view, neue: row});
  }

  function updateRow(e, elem) {
    var neue = elem.key.row.slice();
    neue[elem.key.ix] = coerceInput(e.currentTarget.textContent);
    dispatch("updateRow", {table: elem.key.view, ix:localState.initialKey.rowIx, old: elem.key.row.slice(), neue: neue, submit: false})
  }

  function submitRow(e, elem, type) {
    var neue = elem.key.row.slice();
    neue[elem.key.ix] = coerceInput(e.currentTarget.textContent);
    dispatch("updateRow", {table: elem.key.view, ix:localState.initialKey.rowIx, old: localState.initialKey.row.slice(), neue: neue, submit: true})
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
    return {c: "input text-input", contentEditable: true, input: oninput, focus: storeInitialInput, text: value, key: key, blur: blur, keydown: keydown};
  }

  function storeInitialInput(e, elem) {
    localState.initialKey = elem.key;
    localState.initialValue = elem.text;
  }

  function selectInput(value, key, options, onsubmit) {
    var blur, input;
    if(onsubmit) {
      blur = function inputBlur(e, elem) {
        onsubmit(e, elem, "blurred");
      }
      input = function inputInput(e, elem) {
        onsubmit(e, elem, "enter");
      }
    }
    var children = [];
    for(var val in options) {
      var name = options[val];
      children.push({t: "option", value: val, text: name, selected: val === value});
    }

    return {t: "select", c: "input", key: key, input: input, focus: storeInitialInput, blur: blur, children: children};
  }

  //---------------------------------------------------------
  // UI workspace
  //---------------------------------------------------------

  function uiWorkspace(componentId) {
    var elements = ixer.index("uiComponentToElements")[componentId] || [];
    var layers = ixer.index("uiComponentToLayers")[componentId] || [];
    var layerLookup = ixer.index("uiComponentLayer");
    var activeLayerId = localState.uiActiveLayer;
    if(activeLayerId && layerLookup[activeLayerId]) {
      activeLayer = layerLookup[activeLayerId];
    }

    var selectionInfo = getSelectionInfo(componentId, true);
    var canvasLayers = (ixer.index("parentLayerToLayers")[componentId] || []).map(function(layer) {
      return canvasLayer(layer, selectionInfo);
    });

    if(selectionInfo) {
      canvasLayers.push(selection(selectionInfo));
    }
    if(localState.boxSelectStart) {
      var rect = boxSelectRect();
      canvasLayers.push({c: "box-selection", top: rect.top, left: rect.left, width: rect.width, height: rect.height});
    }
    return genericWorkspace("query",
                            componentId,
                            {c: "ui-editor",
                             children: [
                               layersBox(componentId, layers, activeLayer),
                               {c: "ui-canvas-container", children: [
                                 uiControls(componentId, activeLayer),
                                 {c: "row", children: [
                                   {c: "ui-canvas", componentId: componentId, children: canvasLayers, mousedown: startBoxSelection, mouseup: stopBoxSelection, mousemove: adjustBoxSelection},
                                   {c: "attributes", children: uiInspectors(componentId, selectionInfo, layers, activeLayer)},
                                 ]},
                               ]},
                             ]});
  }

  function canvasLayer(layer, selectionInfo) {
    var layerId = layer[1];
    var subLayers = (ixer.index("parentLayerToLayers")[layerId] || []).map(function(sub) {
      return canvasLayer(sub, selectionInfo);
    });
    if(selectionInfo && layerId === localState.uiActiveLayer) {
      subLayers.unshift(uiGrid());
    }
    var elements = ixer.index("uiLayerToElements")[layerId] || [];
    var attrsIndex = ixer.index("uiStyleToAttrs");
    var stylesIndex = ixer.index("uiElementToStyles");
    var els = elements.map(function(cur) {
      var id = cur[1];
      var selected = selectionInfo ? selectionInfo.selectedIds[id] : false;

      var attrs = [];
      var styles = stylesIndex[id] || [];
      for(var ix = 0, len = styles.length; ix < len; ix++) {
        var style = styles[ix];
        attrs.push.apply(attrs, attrsIndex[style[1]]);
      }

      return control(cur, attrs, selected, layer);
    });
    return {c: "ui-canvas-layer", id: layer[1], zIndex: layer[3] + 1, children: subLayers.concat(els)};
  }

  function layersBox(componentId, layers, activeLayer) {
    var parentIndex = ixer.index("parentLayerToLayers");
    var rootLayers = parentIndex[componentId] || [];
    rootLayers.sort(function(a, b) {
      return a[3] - b[3];
    });
    var items = rootLayers.map(function(cur) {
      return layerListItem(cur, 0)
    });
    return {c: "layers-box", children: [
      {c: "controls", children: [
        {c: "add-layer ion-plus", click: addLayer, componentId: componentId},
        {c: "add-layer ion-ios-trash", click: deleteLayer, componentId: componentId},
      ]},
      {c: "layers-list", children: items}
    ]};
  }


  function addLayer(e, elem) {
    localState.openLayers[localState.uiActiveLayer] = true;
    dispatch("addUiLayer", {componentId: elem.componentId, parentLayer: localState.uiActiveLayer})
  }

  function deleteLayer(e, elem) {
    var layerId = localState.uiActiveLayer;
    var layer = ixer.index("uiComponentLayer")[layerId];
    localState.uiActiveLayer = layer[6];
    localState.uiSelection = false;
    dispatch("deleteLayer", {layer: layer});
  }

  function layerListItem(layer, depth) {
    var layerId = layer[1];
    var isOpen = localState.openLayers[layerId];
    var subItems = [];
    var indent = 15;
    if(isOpen) {
      var binding = ixer.index("groupToBinding")[layerId];
      if(binding) {
        var fieldItems = code.sortedViewFields(binding).map(function(field) {
          return {c: "layer-element group-binding", children: [
          {c: "layer-row", draggable:true, dragstart: layerDrag, type: "binding", itemId: field, children:[
            {c: "icon ion-ios-arrow-thin-right"},
            {text: code.name(field)}
          ]},
        ]}
        });
        subItems.push({c: "layer-element group-binding", children: [
          {c: "layer-row", children:[
            {c: "icon ion-ios-photos"},
            {text: code.name(binding)}
          ]},
          {c: "layer-items", children: fieldItems}
        ]});
      }

      var subLayers = ixer.index("parentLayerToLayers")[layerId];
      if(subLayers) {
        subLayers.sort(function(a, b) {
          return a[3] - b[3];
        });
        subLayers.forEach(function(cur) {
          subItems.push(layerListItem(cur, depth+1));
        });
      }
      var elements = ixer.index("uiLayerToElements")[layerId] || [];
      elements.forEach(function(cur) {
        var elemId = cur[1];
        var selectedClass = "";
        if(localState.uiSelection && localState.uiSelection.indexOf(elemId) > -1) {
          selectedClass = " selected";
        }
        subItems.push({c: "layer-element depth-" + (depth + 1) + selectedClass, control: cur, click: addToSelection, children: [
          {c: "layer-row", itemId: elemId, draggable:true, dragstart: layerDrag, type: "element", children:[
            {c: "icon ion-ios-crop" + (selectedClass ? "-strong" : "")},
            {text: cur[4]}
          ]}
        ]});
      });
    }
    var icon = isOpen ? "ion-ios-arrow-down" : "ion-ios-arrow-right";
    var activeClass = localState.uiActiveLayer === layerId ? " active" : "";
    var lockedClass = layer[4] ? "ion-locked" : "ion-unlocked";
    var hiddenClass = layer[5] ? "ion-eye-disabled" : "ion-eye";
    return {c: "layer-item depth-" + depth + activeClass, layerId: layerId, dragover: preventDefault, drop: layerDrop, click: activateLayer, dblclick: selectAllFromLayer, children: [
      {c: "layer-row", draggable: true, itemId: layerId, dragstart: layerDrag, type: "layer", children:[
        {c: "icon " + icon, click: toggleOpenLayer, layerId: layerId},
        input(code.name(layerId), layerId, rename, rename),
        {c: "controls", children: [
          {c: hiddenClass, click: toggleHidden, dblclick:stopPropagation, layer: layer},
          {c: lockedClass, click: toggleLocked, dblclick:stopPropagation, layer: layer},
        ]}
      ]},
      {c: "layer-items", children: subItems}
    ]};
  }

  function toggleOpenLayer(e, elem) {
    localState.openLayers[elem.layerId] = !localState.openLayers[elem.layerId];
    render();
  }

  function layerDrag(e, elem) {
    e.dataTransfer.setData("type", elem.type);
    e.dataTransfer.setData("itemId", elem.itemId);
    e.stopPropagation();
  }

  function layerDrop(e, elem) {
    e.stopPropagation();
    var type = e.dataTransfer.getData("type");
    if(type === "view" || type === "table" || type === "query") {
      //if it's a data item, then we need to setup a binding
      dispatch("bindGroup", {groupId: elem.layerId, itemId: e.dataTransfer.getData("value")});
    } else if(type === "layer") {
      //if it's a layer, we need to reparent it
      var layerId = e.dataTransfer.getData("itemId");
      if(layerId === elem.layerId) return;
      dispatch("changeParentLayer", {parentLayerId: elem.layerId, layerId: layerId});
    } else if(type === "element") {
      //if it's an element, set the layer
      var elementId = e.dataTransfer.getData("itemId");
      dispatch("changeElementLayer", {parentLayerId: elem.layerId, elementId: elementId});
    }
  }

  function activateLayer(e, elem) {
    e.stopPropagation();
    if(localState.uiActiveLayer !== elem.layerId) {
      localState.uiActiveLayer = elem.layerId;
      clearSelection();
    }
  }

  function selectAllFromLayer(e, elem) {
    e.stopPropagation();
    var layer = ixer.index("uiComponentLayer")[elem.layerId];
    if(layer[4] || layer[5]) return;
    var elements = ixer.index("uiLayerToElements")[elem.layerId] || [];
    var sel = e.shiftKey ? localState.uiSelection : [];
    elements.forEach(function(cur) {
      sel.push(cur[1]);
    });
    if(sel.length) {
      localState.uiSelection = sel;
    } else {
      localState.uiSelection = false;
    }
    render();
  }

  function toggleHidden(e, elem) {
    e.stopPropagation();
    //@TODO: this needs to recursively hide or unhide sub groups
    var neue = elem.layer.slice();
    neue[5] = !neue[5];
    dispatch("updateUiLayer", {neue: neue, old: elem.layer});
  }

  function toggleLocked(e, elem) {
    e.stopPropagation();
    //@TODO: this needs to recursively lock or unlock sub groups
    var neue = elem.layer.slice();
    neue[4] = !neue[4];
    dispatch("updateUiLayer", {neue: neue, old: elem.layer});
  }


  function boxSelectRect() {
    var start = localState.boxSelectStart;
    var stop = localState.boxSelectStop;
    var topBottom = start[1] < stop[1] ? [start[1], stop[1]] : [stop[1], start[1]];
    var leftRight = start[0] < stop[0] ? [start[0], stop[0]] : [stop[0], start[0]];
    var width = leftRight[1] - leftRight[0];
    var height = topBottom[1] - topBottom[0];
    return {top: topBottom[0], bottom: topBottom[1], left: leftRight[0], right: leftRight[1], width: width, height: height};
  }

  function startBoxSelection(e, elem) {
    var x = e.clientX;
    var y = e.clientY;
    var canvasRect = e.currentTarget.getBoundingClientRect();
    //@HACK: we have to allow blurs and other events to finish before we
    //clear and start adjusting the selection, otherwise they'll try to set
    //attributes for a selection that no longer exists. E.g. when setting the
    //text of an element and then clicking on the canvas to blur.
    setTimeout(function() {
      if(!e.shiftKey) { clearSelection(e, elem); }
      x -= Math.floor(canvasRect.left);
      y -= Math.floor(canvasRect.top);
      localState.boxSelectStart = [x, y];
      localState.boxSelectStop = [x, y];
      render();
    }, 0);
  }

  function adjustBoxSelection(e, elem) {
    if(!localState.boxSelectStart) return;
    var x = e.clientX;
    var y = e.clientY;
    var canvasRect = e.currentTarget.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    localState.boxSelectStop[0] = x;
    localState.boxSelectStop[1] = y;
    render();
  }

  function elementIntersects(elem, rect) {
    var left = elem[5];
    var top = elem[6];
    var right = elem[7];
    var bottom = elem[8];
    return !(rect.left > right
             || rect.right < left
             || rect.top > bottom
             || rect.bottom < top);
  }

  function stopBoxSelection(e, elem) {
    if(!localState.boxSelectStart) return;
    var sel = e.shiftKey ? localState.uiSelection : [];
    var rect = boxSelectRect();
    var componentId = elem.componentId;
    var elems = ixer.index("uiComponentToElements")[componentId];
    var layerLookup = ixer.index("uiComponentLayer");
    if(elems) {
      elems.forEach(function(cur) {
        // @TODO: this allows you to select from layers that are either hidden or locked
        var elemId = cur[1];
        var layer = layerLookup[cur[3]];
        if(layer[4] || layer[5]) return;
        if(elementIntersects(cur, rect)) {
          sel.push(elemId);
        }
      });
    }
    localState.boxSelectStart = null;
    localState.boxSelectStop = null;
    if(sel.length) {
      localState.uiSelection = sel;
    } else {
      localState.uiSelection = false;
    }
    render();
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

  function uiGrid() {
    return {c: "grid", id: "ui-editor-grid", t: "canvas", top: 0, left: 0,
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
            draggable: true, drag: resizeSelection, dragend: stopResizeSelection, bounds: bounds, dragstart: startResizeSelection, mousedown: stopPropagation};
  }

  function stopPropagation(e) {
    e.stopPropagation();
  }
  function preventDefault(e) {
    e.preventDefault();
  }

  function clearDragImage(e, elem) {
    if(e.dataTransfer) {
      e.dataTransfer.setData("text", "foo");
      e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0, 0);
    }
  }

  function startResizeSelection(e, elem) {
    localState.oldElements = selectionToElements();
    clearDragImage(e);
  }

  function stopResizeSelection(e, elem) {
    var elems = localState.oldElements;
    localState.oldElements = null;
    dispatch("stopChangingSelection", {oldElements: elems})
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
      elem.bounds = neueBounds;
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
                draggable: true, dragover: preventDefault, drop: dropOnControl, drag: moveSelection, dragend: stopMoveSelection, dragstart: startMoveSelection, dblclick: setModifyingText};
    if(attrs) {
      for(var i = 0, len = attrs.length; i < len; i++) {
        var curAttr = attrs[i];
        var name = attrMappings[curAttr[2]] || curAttr[2];
        if(curAttr[3].constructor !== Array) {
          elem[name] = curAttr[3];
        }
      }
    }


    if(type === "image") {
      elem.attr = "backgroundImage";
    } else {
      elem.attr = "text";
    }

    var binding = (ixer.index("elementAttrToBinding")[id] || {})[elem.attr];
    if(binding) {
      elem.children = [
        {c: "attr-binding", children: [
          {c: "icon ion-ios-arrow-thin-right"},
          {text: code.name(binding)}
        ]}
      ];
      elem.text = undefined;
    }

    if(localState.modifyingUiText === id) {
      if(type === "image") {
        var curInput = input(elem.backgroundImage, {id: id}, updateImage, submitContent);
        curInput.postRender = focusOnce;
        elem.children = [curInput];
        curInput.attr = "backgroundImage";
        elem.text = undefined;
      } else {
        var curInput = input(elem.text, {id: id}, updateContent, submitContent);
        curInput.postRender = focusOnce;
        elem.children = [curInput];
        curInput.attr = "text";
        elem.text = undefined;
      }
    }

    //   if(uiCustomControlRender[type]) {
    //     elem = uiCustomControlRender[type](elem);
    //   }
    return elem;
  }

  function dropOnControl(e, elem) {
    var type = e.dataTransfer.getData("type");
    if(type === "binding") {
      dispatch("bindAttr", {attr: elem.attr, elementId: elem.control[1], field: e.dataTransfer.getData("itemId")})
      e.stopPropagation();
    }
  }

  function setModifyingText(e, elem) {
    localState.modifyingUiText = elem.control[1];
    startAdjustAttr(e, elem);
    render();
  }

  function updateContent(e, elem) {
    dispatch("setAttributeForSelection", {componentId: elem.key.id, property: "text", value: e.currentTarget.textContent});
  }

  function updateImage(e, elem) {
    dispatch("setAttributeForSelection", {componentId: elem.key.id, property: "backgroundImage", value: e.currentTarget.textContent});
  }

  function submitContent(e, elem) {
    localState.modifyingUiText = false;
    dispatch("stopSetAttributeForSelection", {oldAttrs: localState.initialAttrs.shift(), property: elem.attr});
    console.log("submit content!");
    render();
  }

  function addToSelection(e, elem) {
    e.stopPropagation();
    if(elem.selected) return;
    if(!e.shiftKey || !localState.uiSelection) {
      localState.uiSelection = [];
    }
    var layer = ixer.index("uiComponentLayer")[elem.control[3]];
    if(layer[4] || layer[5]) return;
    localState.uiSelection.push(elem.control[1]);
    localState.uiActiveLayer = elem.control[3];
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
    localState.initialElements.push(selectionToElements());
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
    var neueX = toGrid(localState.uiGridSize, Math.floor(x - localState.dragOffsetX));
    var neueY = toGrid(localState.uiGridSize, Math.floor(y - localState.dragOffsetY));
    dispatch("moveSelection", {x: neueX, y: neueY, elemId: elem.control[1], componentId: elem.control[2]});
  }

  function stopMoveSelection(e, elem) {
    var elems = localState.initialElements.shift();
    dispatch("stopChangingSelection", {oldElements: elems})
  }

  function selectionToElements() {
    if(localState.uiSelection) {
      var elementIndex = ixer.index("uiComponentElement");
      return localState.uiSelection.map(function(cur) {
        return elementIndex[cur];
      });
    }
    return [];
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


  var uiControlInfo = [{text: "text", icon: "text-control", iconText: "T"},
                       {text: "image", icon: "ion-image"},
                       {text: "box", icon: "ion-stop"},
                       {text: "button", icon: "ion-share"},
                       {text: "input", icon: "ion-compose"},
                       {text: "map", icon: "ion-ios-location"}
                      ];

  function uiControls(componentId, activeLayer) {
    var items = uiControlInfo.map(function(cur) {
      var icon = {c: "icon " + cur.icon};
      if(cur.iconText) {
        icon.text = cur.iconText;
      }
      return {c: "control", click: addElement, controlType: cur.text, componentId: componentId, layer: activeLayer,
              children: [
                icon,
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

      //       var showMapInspector = selectionInfo.elements.every(function(cur) {
      //         return cur[4] === "map";
      //       });
      //       if(showMapInspector) {
      //         var mapInfo = getMapGroupInfo(selectionInfo.elements, true)
      //         inspectors.push(mapInspector(selectionInfo, mapInfo, binding));
      //       }
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
    if(adjusterInfo.elem.finalizer) {
      adjusterInfo.elem.finalizer(e, renderer.tree[adjusterInfo.elem.id]);
    }
    adjusterInfo = false;
    document.body.removeChild(adjustableShade);
  })

  var adjusterInfo;
  function startAdjusting(e, elem) {
    if(elem.initializer) {
      elem.initializer(e, elem);
    }
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
    widthAdjuster.initializer = startResizeSelection;
    widthAdjuster.finalizer = stopResizeSelection;
    var heightAdjuster = adjustable(height, 1, 1000, 1);
    heightAdjuster.handler = adjustHeight;
    heightAdjuster.componentId = componentId;
    heightAdjuster.bounds = bounds;
    heightAdjuster.initializer = startResizeSelection;
    heightAdjuster.finalizer = stopResizeSelection;
    var topAdjuster = adjustable(bounds.top, 0, 100000, 1);
    topAdjuster.handler = adjustPosition;
    topAdjuster.componentId = componentId;
    topAdjuster.coord = "top";
    topAdjuster.initializer = startMoveSelection;
    topAdjuster.finalizer = stopMoveSelection;
    var leftAdjuster = adjustable(bounds.left, 0, 100000, 1);
    leftAdjuster.handler = adjustPosition;
    leftAdjuster.componentId = componentId;
    leftAdjuster.coord = "left";
    leftAdjuster.initializer = startMoveSelection;
    leftAdjuster.finalizer = stopMoveSelection;
    //pos, size
    return {c: "option-group size-attributes", children: [
      {c: "size-outline"},
      {c: "width-outline"},
      {c: "height-outline"},
      {c: "top-left-point", children :[
        leftAdjuster,
        {text: ","},
        topAdjuster,
      ]},
      {c: "width-adjuster", children: [widthAdjuster]},
      {c: "height-adjuster", children: [heightAdjuster]},
    ]};
  }

  uiProperties.appearance = ["backgroundColor", "backgroundImage", "borderColor", "borderWidth", "borderRadius", "opacity"];
  function appearanceInspector(selectionInfo, binding) {
    var attrs = selectionInfo.attributes;
    var componentId = selectionInfo.componentId;
    var styleName;
    if(selectionInfo.styles.appearance && selectionInfo.styles.appearance[4]) {
      styleName = {value:selectionInfo.styles.appearance[1], text: code.name(selectionInfo.styles.appearance[1])};
    } else {
      styleName = {text: "No visual style", value: "none"};
    }

    var borderColorPicker = colorSelector(componentId, "borderColor", attrs["borderColor"]);
    borderColorPicker.backgroundColor = undefined;

    var opacity = attrs["opacity"] == undefined ? 100 : attrs["opacity"] * 100;
    var opacityAdjuster = adjustable(opacity, 0, 100, 1);
    opacityAdjuster.text = Math.floor(opacity) + "%";
    opacityAdjuster.handler = adjustOpacity;
    opacityAdjuster.componentId = componentId;
    opacityAdjuster.initializer = startAdjustAttr;
    opacityAdjuster.finalizer = stopAdjustAttr;
    opacityAdjuster.attr = "opacity";

    var borderWidth = attrs["borderWidth"] === undefined ? 0 : attrs["borderWidth"];
    var borderWidthAdjuster = adjustable(borderWidth, 0, 20, 1);
    borderWidthAdjuster.text = borderWidth;
    borderWidthAdjuster.handler = adjustAttr;
    borderWidthAdjuster.attr = "borderWidth";
    borderWidthAdjuster.componentId = componentId;
    borderWidthAdjuster.initializer = startAdjustAttr;
    borderWidthAdjuster.finalizer = stopAdjustAttr;

    var borderRadius = attrs["borderRadius"] === undefined ? 0 : attrs["borderRadius"];
    var borderRadiusAdjuster = adjustable(borderRadius, 0, 100, 1);
    borderRadiusAdjuster.text = borderRadius;
    borderRadiusAdjuster.handler = adjustAttr;
    borderRadiusAdjuster.attr = "borderRadius";
    borderRadiusAdjuster.componentId = componentId;
    borderRadiusAdjuster.initializer = startAdjustAttr;
    borderRadiusAdjuster.finalizer = stopAdjustAttr;

    if(!localState.addingAppearanceStyle) {
      var sharedAppearance = (ixer.index("stylesBySharedAndType")[true] || {})["appearance"] || [];
      var styles = sharedAppearance.map(function(cur) {
        return {value: cur[1], text: code.name(cur[1])};
      });
      styles.unshift({text: "No text style", value: "none"});
      styles.push({text: "Add a new style", value: "addStyle"});
      var visualStyle = selectable(styleName, styles);
      visualStyle.c += " styleSelector";
      visualStyle.handler = function(elem, value) {
        if(value === "none") {
          dispatch("setSelectionStyle", {type: "appearance", id: uuid(), shared: false});
        } else if(value === "addStyle") {
          localState.addingAppearanceStyle = uuid();
          dispatch("setSelectionStyle", {type: "appearance", id: localState.addingAppearanceStyle, shared: true});
        } else {
          dispatch("setSelectionStyle", {type: "appearance", id: value, shared: true});
        }
        render();
      }
    } else {
      visualStyle = input("", localState.addingAppearanceStyle, rename, doneAddingStyle);
      visualStyle.postRender = focusOnce;
    }
    return {c: "option-group visual-attributes", children: [
      visualStyle,
      {c: "layout-box-filled", backgroundColor: attrs["backgroundColor"], borderRadius: attrs["borderRadius"], children: [
        colorSelector(componentId, "backgroundColor", attrs["backgroundColor"])
      ]},
      opacityAdjuster,
      {c: "border-options", children: [
        {c: "layout-box-outline", borderRadius: attrs["borderRadius"], borderWidth: (borderWidth > 10 ? 10 : borderWidth || 1), borderColor: attrs["borderColor"], children: [borderColorPicker]},
        {c: "border-radius-outline"},
        {c: "border-radius-adjuster", children: [borderRadiusAdjuster]},
      ]},
      borderWidthAdjuster,
    ]};
  }

  function selectable(activeItem, items, setFont) {
    var options = items.map(function(cur) {
      var value, text;
      if(typeof cur === "string") {
        value = cur;
        text = cur;
      } else {
        value = cur.value;
        text = cur.text;
      }
      var item = {t: "option", value: value, text: text};
      if(setFont) {
        item.fontFamily = cur;
      }
      if((activeItem.value || activeItem) === value) {
        item.selected = "selected";
      }
      return item;
    })
    var value = typeof activeItem === "string" ? activeItem : activeItem.text;
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
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "verticalAlign", value: final, storeEvent: true});
  }

  function selectAlign(elem, value) {
    var final = "center";
    if(value === "Left") {
      final = "flex-start";
    } else if(value === "Right") {
      final = "flex-end";
    }
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "textAlign", value: final, storeEvent: true});
  }

  uiProperties.typography = ["fontFamily", "fontSize", "color", "textAlign", "verticalAlign"];
  uiProperties.content = ["text"];
  function textInspector(selectionInfo, binding) {
    var componentId = selectionInfo.componentId;
    var attrs = selectionInfo.attributes;
    var styleName;
    if(selectionInfo.styles.typography && selectionInfo.styles.typography[4]) {
      styleName = {value:selectionInfo.styles.typography[1], text: code.name(selectionInfo.styles.typography[1])};
    } else {
      styleName = {text: "No text style", value: "none"};
    }

    var font = attrs["fontFamily"] || "Helvetica Neue";
    var fontPicker = selectable(font, ["Times New Roman", "Verdana", "Arial", "Georgia", "Avenir", "Helvetica Neue"], true);
    fontPicker.componentId = componentId;
    fontPicker.handler = adjustAttr;
    fontPicker.attr = "fontFamily";
    fontPicker.storeEvent = true;

    var fontSize = attrs["fontSize"] === undefined ? 16 : attrs["fontSize"];
    var fontSizeAdjuster = adjustable(fontSize, 0, 300, 1);
    fontSizeAdjuster.handler = adjustAttr;
    fontSizeAdjuster.attr = "fontSize";
    fontSizeAdjuster.componentId = componentId;
    fontSizeAdjuster.initializer = startAdjustAttr;
    fontSizeAdjuster.finalizer = stopAdjustAttr;

    var fontColor = colorSelector(componentId, "color", attrs["color"]);
    fontColor.backgroundColor = undefined;
    fontColor.color = attrs["color"];
    fontColor.c += " font-color";
    fontColor.text = "Text";
    fontColor.fontFamily = attrs["fontFamily"];

    var verticalAlign = vAlignMapping[attrs["verticalAlign"]] || "Top";
    var valign = selectable(verticalAlign, ["Top", "Center", "Bottom"]);
    valign.componentId = componentId;
    valign.handler = selectVerticalAlign;

    var textAlign = alignMapping[attrs["textAlign"]] || "Left";
    var align = selectable(textAlign, ["Left", "Center", "Right"]);
    align.componentId = componentId;
    align.handler = selectAlign;

    if(!localState.addingTypographyStyle) {
      var sharedTypography = (ixer.index("stylesBySharedAndType")[true] || {})["typography"] || [];
      var styles = sharedTypography.map(function(cur) {
        return {value: cur[1], text: code.name(cur[1])};
      });
      styles.unshift({text: "No text style", value: "none"});
      styles.push({text: "Add a new style", value: "addStyle"});
      var typographyStyle = selectable(styleName, styles);
      typographyStyle.c += " styleSelector";
      typographyStyle.handler = function(elem, value) {
        if(value === "none") {
          dispatch("setSelectionStyle", {type: "typography", id: uuid(), shared: false});
        } else if(value === "addStyle") {
          localState.addingTypographyStyle = uuid();
          dispatch("setSelectionStyle", {type: "typography", id: localState.addingTypographyStyle, shared: true});
        } else {
          dispatch("setSelectionStyle", {type: "typography", id: value, shared: true});
        }
        render();
      }
    } else {
      typographyStyle = input("", localState.addingTypographyStyle, rename, doneAddingStyle);
      typographyStyle.postRender = focusOnce;
    }

    return {c: "option-group text-attributes", children: [
      typographyStyle,
      {c: "font-color-size", children: [
        fontColor,
        {c: "font-size"},
        fontSizeAdjuster,
      ]},
      {c: "font-family", children: [fontPicker]},
      {c: "font-align", children: [
        valign,
        align,
      ]},
    ]};
  }

  function doneAddingStyle(e, elem) {
    localState.addingTypographyStyle = null;
    localState.addingAppearanceStyle = null;
    render();
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
//       {t: "input", type: "color", key: [componentId, attr],
//        value: value, input: setAttribute}
    return {c: "color-picker", backgroundColor: value || "#999999", mousedown: startSelectingColor, attr: attr, key: [componentId, attr],
            change: setAttribute, commit: stopSelectingColor};
  }

  function startSelectingColor(e, elem) {
    startAdjustAttr(e, elem);
    e.stopPropagation();
  }

  function stopSelectingColor(e, elem) {
    stopAdjustAttr(e, elem);
  }

  function setupColorPickers(div, elem) {
    jQuery(".color-picker").colorPicker({
      doRender: false,
      opacity: false,
      onCommit: function($elm) {
        var div = $elm.get(0);
        var eveElem = renderer.tree[div._id] || renderer.prevTree[div._id];
        if(eveElem && eveElem.commit) {
          eveElem.commit({currentTarget: div}, eveElem);
        }
      },
      renderCallback: function($elm, toggled) {
        var div = $elm.get(0);
        var eveElem = renderer.tree[div._id];
        if(eveElem && eveElem.change) {
          div.type = "color";
          div.value = this.color.colors.HEX;
          eveElem.change({currentTarget: div}, eveElem);
        }
      }
    });
  }

  setupColorPickers();

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
    elem.bounds = neue;
  }

  function adjustHeight(elem, value) {
    var componentId = elem.componentId;
    var old = elem.bounds;
    var neue = {left: old.left, right: old.right, top: old.top,  bottom: (old.top + value)};
    var heightRatio = value / (old.bottom - old.top);
    if(heightRatio === 1) return;
    dispatch("resizeSelection", {widthRatio: 1, heightRatio: heightRatio, oldBounds: old, neueBounds: neue, componentId: componentId});
    elem.bounds = neue;
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
    dispatch("offsetSelection", {diffX: diffX, diffY: diffY, componentId: componentId});
    elem.value = value;
  }

  function startAdjustAttr(e, elem) {
    var attrs = []
    var style = getUiPropertyType(elem.attr);
    if(!style) { throw new Error("Unknown attribute type for property:", elem.attr, "known types:", uiProperties); }
    var sel = localState.uiSelection;
    sel.forEach(function(cur) {
      var id = cur;
      var styleId = ixer.index("uiElementToStyle")[id][style][1];
      var oldProps = ixer.index("uiStyleToAttr")[styleId];
      if(oldProps && oldProps[elem.attr]) {
        attrs.push(oldProps[elem.attr]);
      }
    });
    localState.initialAttrs.push(attrs);
  }

  function stopAdjustAttr(e, elem) {
    var initial = localState.initialAttrs.shift();
    dispatch("stopSetAttributeForSelection", {oldAttrs: initial, property: elem.attr});
  }

  function adjustOpacity(elem, value) {
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: "opacity", value: value / 100, storeEvent: false});
  }
  function adjustAttr(elem, value) {
    dispatch("setAttributeForSelection", {componentId: elem.componentId, property: elem.attr, value: value, storeEvent: elem.storeEvent});
  }

  // Generic attribute handler
  function setAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.value;
    var storeEvent = false;
    if(target.type === "color") {
      value = target.value;
    } else if(target.type === "checkbox") {
      value = target.checked;
    } else if(target.type === undefined) {
      value = target.textContent;
    }

    dispatch("setAttributeForSelection", {componentId: componentId, property: property, value: value, storeEvent: storeEvent});
  }

  // Map attribute handler
  function setMapAttribute(e, elem) {
    var componentId = elem.key[0];
    var property = elem.key[1];
    var target = e.currentTarget;
    var value = target.checked !== undefined ? target.checked : target.value !== undefined ? target.value : target.textContent;
    dispatch("setMapAttributeForSelection", {componentId: componentId, property: property, value: value});
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
    if(uiProperties.content.indexOf(prop) !== -1) {
      return "content";
    }
    return undefined;
  }

  //---------------------------------------------------------
  // Query workspace
  //---------------------------------------------------------

  function queryWorkspace(queryId) {
    var primitiveItems = (ixer.facts("primitive") || []).map(function(primitive) {
      var id = primitive[0];
      return {c: "primitive", dragData: {value: id, type: "view"}, itemId: id, draggable: true, dragstart: dragItem, text: code.name(id)};
    });
    return genericWorkspace("query", queryId,
                            {c: "query-editor",
                             children: [
                               editor(queryId),
                               {c: "primitive-cursor", children: primitiveItems},
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

      rows.sort(function(a, b) {
        var aIx = order[viewId + JSON.stringify(a)];
        var bIx = order[viewId + JSON.stringify(b)];
        return aIx - bIx;
      });

      var editorPane;
      var inspectorPane = {c: "inspector-pane", children: [virtualizedTable(viewId, fields, rows, false)]};
      if(viewKind === "join") {
        editorPane = viewBlock(viewId, ix);
        inspectorPane.viewId = viewId;
        inspectorPane.drop = viewSelectionsDrop;
        inspectorPane.dragOver = preventDefault;
      }
      if(viewKind === "union") { editorPane = unionBlock(viewId, ix);  }
      if(viewKind === "aggregate") { editorPane = aggregateBlock(viewId, ix); }
      var controls;
      if(localState.queryEditorActive === viewId) {
        controls = querySuggestionBar(queryId, viewId);
      }

      items.push({c: "block " + viewKind, editorIx: ix, viewId: viewId, drop: viewBlockDrop, dragover: preventDefault, handler: blockSuggestionHandler, click: setQueryEditorActive, children: [
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
    items.push({c: "block new-block", children: [
      {c: "block unused", children: [
        {c: "controls", children: [
          {c: "control join", text: "join"},
          {c: "control union", click: newUnionBlock, text: "merge"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "sort+limit", text: "sort and limit"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "count", text: "count"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "sum", text: "sum"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "min", text: "min"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "max", text: "max"},
          {c: "control aggregate", click: newAggregateBlock, queryId: queryId, kind: "empty", text: "is empty?"},
        ]}
      ]},
    ]});

    return {c: "query-workspace", queryId: queryId, drop: editorDrop, dragover: preventDefault, children: items.length ? items : [
      {c: "feed", text: "Feed me sources"}
    ]};
  }

  function exportView(evt, elem) {
    dispatch("exportView", {viewId: elem.viewId});
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
    var isLocal = code.hasTag(viewId, "local");
    items.push(
      {c: "suggestion-bar-item ion-log-out export-view-btn" + (isLocal ? "" : " exported"), viewId: viewId, click: exportView},
      {c: "suggestion-bar-item ion-android-close close-btn", viewId: viewId, click: removeSelectedItem}
    );
    return {c: "suggestion-bar", children: items};
  }

  function removeSelectedItem(evt, elem) {
    var info = localState.queryEditorInfo;
    console.log(info);
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

    var lines = viewSources(viewId).concat(viewConstraints(viewId)).concat(viewPrimitives(viewId));
    return {c: "block view-block", viewId: viewId, drop: viewBlockDrop, dragover: preventDefault,
            dragData: {value: viewId, type: "view"}, itemId: viewId, draggable: true, dragstart: dragItem,
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
    var calculatedId = ixer.index("field to calculated field")[fieldId];
    if(calculatedId) {
      return code.name(calculatedId);
    } else {
      return code.name(sourceId) + "." + code.name(fieldId);
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
    return queryToken(type, side, constraintId, text, {viewId: viewId, handler: updateViewConstraint});
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
    var token = info ? info.token || {} : {};
    if(token.expression === expression && token.key === key) {
      klass += " active";
    }
    var token = {c: klass, key: key, expression: expression, text: text, click: handler};
    for(var prop in opts) {
      token[prop] = opts[prop];
    }
    if(opts.drop && ! token.dragover) {
      token.dragover = preventDefault;
    }
    return token;
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
        var item = selectoritem({c: "operation", key: params.key, name: rel, value: rel}, onchange);
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
      memo.push.apply(memo, ixer.index("view to fields")[sourceViewId].map(function(field) {
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

    return {c: "block union-block", viewId: viewId, dragover: preventDefault, drop: viewBlockDrop,
            dragData: {value: viewId, type: "view"}, itemId: viewId, draggable: true, dragstart: dragItem, children: [
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

    var fields = ixer.index("view and source to block fields")[viewId] || {};
    fields = fields["selection"] || [];

    var blockFieldIdIx = code.ix("block field", "block field");
    var fieldIdIx = code.ix("block field", "field");
    var selectionItems = fields.map(function(field) {
      var id = field[blockFieldIdIx];
      var fieldId = field[fieldIdIx];
      return fieldItem(code.name(fieldId) || "Untitled", id, {c: "pill field"});
    });
    if(!selectionItems.length) {
      selectionItems.push({text: "Drag local fields into me to make them available in the query."});
    }

    var content;
    if(aggregateKind === "sort+limit") {
      content = sortLimitAggregate(viewId, outerSource, innerSource);
    } else {
      content = primitiveAggregate(viewId, outerSource, innerSource, aggregateKind);
    }

    return {c: "block aggregate-block", children: [
      {text: "With"},
      {c: "block-section view-sources", viewId: viewId, children: viewSources(viewId, aggregateSourceDrop).concat(viewPrimitives(viewId))},
      {c: "block-section aggregate-grouping spaced-row", children: [
        {text: "Group by"},
        queryToken("field", "outer", viewId, getLocalFieldName(outerField) || "<outer field>", {handler: updateAggregateGrouping, drop: dropAggregateGroupingField, viewId: viewId, sourceId: "outer"}),
        //token.blockField({key: "outer", parentId: viewId, source: "outer", field: outerField}, updateAggregateGrouping, dropAggregateGroupingField),
        {text: "="},
        queryToken("field", "inner", viewId, getLocalFieldName(innerField) || "<inner field>", {handler: updateAggregateGrouping, drop: dropAggregateGroupingField, viewId: viewId, sourceId: "inner"})
        //token.blockField({key: "inner", parentId: viewId, source: "inner", field: innerField}, updateAggregateGrouping, dropAggregateGroupingField),
      ]},
      content,
      {c: "block-section view-selections tree bar", viewId: viewId, drop: viewSelectionsDrop, dragover: preventDefault, children: selectionItems},
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

    console.log(viewId, type, value, sourceId, elem.key);

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

    var fromLimitInput = input(limitFromValue, "from", updateAggregateLimit, updateAggregateLimit);
    fromLimitInput.parentId = viewId;
    var toLimitInput = input(limitToValue, "to", updateAggregateLimit, updateAggregateLimit);
    toLimitInput.parentId = viewId;
    return {c: "sort-limit-aggregate", viewId: viewId, children: [
      {c: "block-section aggregate-sort", children: [
        {text: "Sort by"},
        token.blockField({key: "field", parentId: viewId, source: sortSource, field: sortField}, updateAggregateSort, dropAggregateField),
        selectInput(sortDir || "ascending", "direction", {ascending: "▲", descending: "▼"}, updateAggregateSort)
      ]},
      {c: "block-section aggregate-limit", children: [
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

  function updateAggregateSort(evt, elem) {
    var info = {viewId: elem.parentId, key: elem.key, value: evt.target.value || evt.currentTarget.textContent};
    dispatch("updateAggregateSort", info);
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

  function primitiveAggregate(viewId, outerSource, innerSource) {
    return {c: "primitive-aggregate", viewId: viewId, children: [
      {text: "Where"},
      viewConstraints(viewId),
      viewPrimitives(viewId)
    ]};
  }

  function aggregateSourceDrop(evt, elem) {
    var viewId = elem.viewId;
    var sourceId = elem.sourceId;
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      if(viewId === value) { return console.error("Cannot join view with parent."); }
      var kind;
      if(sourceId === "inner" || sourceId === "outer") {
        kind = sourceId;
      }
      dispatch("addViewSource", {viewId: viewId, sourceId: value, kind: kind});
      evt.stopPropagation();
      return;
    }

  }


  function selector(options, opts, onBlur) {
    return {t: "ul", c: "selector " + opts.c, tabindex: opts.tabindex, key: opts.key,
            postRender: (opts.focus ? focusOnce : undefined), blur: onBlur, children: options};
  }

  function selectorItem(opts, onChange) {
    return {t: "li", c: "selector-item field " + opts.c, key: opts.key, text: opts.name, value: opts.value, click: onChange};
  }

  //---------------------------------------------------------
  // Global key handling
  //---------------------------------------------------------

  document.addEventListener("keydown", function(e) {
    //Don't capture keys if they are
    if(e.defaultPrevented
       || e.target.nodeName === "INPUT"
       || e.target.getAttribute("contentEditable")) {
      return;
    }

    //undo + redo
    if((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === KEYS.Z) {
      dispatch("redo");
    } else if((e.metaKey || e.ctrlKey) && e.keyCode === KEYS.Z) {
      dispatch("undo");
    }

  });

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  if(window.queryEditor) { render(); }

  return { container: renderer.content, localState: localState, renderer: renderer, render: render, eventStack: eventStack };
})(window, microReact, api);
