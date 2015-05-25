var queryEditor = (function(window, microReact, api) {
  var document = window.document;
  var ixer = api.ixer;
  var code = api.code;
  var diff = api.diff;
  var localState = api.localState;
  var clone = api.clone;

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
                   ["display order", "inserted", [fieldId, ix]]);
        break;
      case "addRow":
        var ix = ixer.facts(info.table).length;
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
                   [info.table, "removed", info.old],
                   ["display order", "removed", [oldString, ix]],
                   ["display order", "inserted", [neueString, ix]]);
        break;
      case "addViewBlock":
        var queryId = (info.queryId !== undefined) ? info.queryId: code.activeItemId();
        diffs = diff.addViewBlock(queryId, info.sourceId, info.kind);
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
        var view = ixer.index("view")[info.viewId];
        var blockId = ixer.index("view to block")[info.viewId];
        var block = ixer.index("block")[blockId];
        var sources = ixer.index("view to sources")[info.viewId] || [];
        diffs = [["view", "removed", view],
                 ["block", "removed", block]];
        for(var ix = 0; ix < sources.length; ix++) {
          var sourceId = sources[ix][code.ix("source", "source")];
          diffs = diffs.concat(diff.removeViewSource(info.viewId, sourceId));
        }
        if(view[code.ix("view", "kind")] === "aggregate") {
          console.warn("@FIXME: Remove aggregate entries for view on removal.");
        }
        break;
      case "addViewSelection":
        diffs = diff.addViewSelection(info.viewId, info.sourceId, info.sourceFieldId, info.fieldId);
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
          opts.leftField = info.value;
          opts.leftSource = info.source;
        } else if(info.type === "right") {
          opts.rightField = info.value;
          opts.rightSource = info.source;
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

        } else {
          sendToServer = false;
          console.log("incomplete", diffs);
        }

        break;
      case "removeViewConstraint":
        diffs = diff.removeViewConstraint(info.constraintId);
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
        console.log(info);
        diffs = diff.updateAggregateGrouping(info.aggregate, info.source, info.field);
        if(diffs.length) {
          var neue = diffs[0][2];//@FIXME: Hacky.
          sendToServer = neue[code.ix("aggregate grouping", "inner field")] && neue[code.ix("aggregate grouping", "outer field")];
        }
        break;
      case "groupView":
        var old = ixer.index("grouped by")[info.inner];
        if(old) { throw new Error("Cannot group by multiple views."); }
        var left = ixer.index("constraint left")[info.constraintId] || [];
        var innerField = left[code.ix("constraint left", "left field")];
        diffs = [["grouped by", "inserted", [info.inner, innerField, info.outer, info.outerField]]];
        diffs = diffs.concat(diff.removeViewConstraint(info.constraintId));
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
          diffs.push(["uiComponentElement", "inserted", elem],
                     ["uiComponentElement", "removed", old]);
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
          diffs.push(["uiComponentAttribute", "inserted", [0, styleId, info.property, info.value, false]]);
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
    return {id: "root", c: "root", children: [
      editorItemList(itemId),
      workspace,
    ]};
  }

  function editorItemList(itemId) {
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
    var order = ixer.index("display order");
    var fields = (ixer.index("view to fields")[tableId] || []).map(function(field) {
      var id = field[code.ix("field", "field")];
      return {name: code.name(id), id: id, priority: order[id] || 0};
    });
    fields.sort(function(a, b) {
      var delta = b.priority - a.priority;
      if(delta) { return delta; }
      else { return a.id < b.id; }
    });

    var rows = ixer.facts(tableId);
    rows.sort(function(a, b) {
      var aIx = order[tableId + JSON.stringify(a)];
      var bIx = order[tableId + JSON.stringify(b)];
      return aIx - bIx;
    });
    return genericWorkspace("",
                            [],
                            [input(code.name(tableId), tableId, rename, rename)],
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
      var tds = [];
      for(var tdIx = 0, len = fields.length; tdIx < len; tdIx++) {
        tds[tdIx] = {c: "field"};

        // @NOTE: We can hoist this if perf is an issue.
        if(isEditable) {
          tds[tdIx].children = [input(cur[tdIx], {rowIx: rowIx, row: cur, ix: tdIx, view: id}, updateRow, submitRow)];
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
                            [uiControls(componentId, activeLayer)],
                            uiInspectors(componentId, selectionInfo, layers, activeLayer),
                            {c: "ui-editor",
                             children: [
                               {c: "ui-canvas", componentId: componentId, children: canvasLayers, mousedown: startBoxSelection, mouseup: stopBoxSelection, mousemove: adjustBoxSelection},
                               layersBox(componentId, layers, activeLayer),
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
    if(!e.shiftKey) { clearSelection(e, elem); }
    var x = e.clientX;
    var y = e.clientY;
    var canvasRect = e.currentTarget.getBoundingClientRect();
    x -= Math.floor(canvasRect.left);
    y -= Math.floor(canvasRect.top);
    localState.boxSelectStart = [x, y];
    localState.boxSelectStop = [x, y];
    render();
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
    dispatch("stopSetAttributeForSelection", {oldAttrs: localState.initialAttrs, property: elem.attr});
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
    localState.initialElements = selectionToElements();
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
    var elems = localState.initialElements;
    localState.initialElements = null;
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


  var uiControlInfo = [{text: "text", icon: ""},
                       {text: "image", icon: ""},
                       {text: "box", icon: ""},
                       {text: "button", icon: ""},
                       {text: "input", icon: ""},
                       {text: "map", icon: ""}
                      ];

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
    borderWidthAdjuster.text = borderWidth + "px";
    borderWidthAdjuster.handler = adjustAttr;
    borderWidthAdjuster.attr = "borderWidth";
    borderWidthAdjuster.componentId = componentId;
    borderWidthAdjuster.initializer = startAdjustAttr;
    borderWidthAdjuster.finalizer = stopAdjustAttr;

    var borderRadius = attrs["borderRadius"] === undefined ? 0 : attrs["borderRadius"];
    var borderRadiusAdjuster = adjustable(borderRadius, 0, 100, 1);
    borderRadiusAdjuster.text = borderRadius + "px";
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

    return {c: "option-group", children: [
      visualStyle,
      {c: "layout-box-filled", borderRadius: attrs["borderRadius"], children: [
        colorSelector(componentId, "backgroundColor", attrs["backgroundColor"])
      ]},
      {c: "layout-box-outline", borderRadius: attrs["borderRadius"], borderWidth: (borderWidth > 10 ? 10 : borderWidth || 1), borderColor: attrs["borderColor"], children: [borderColorPicker]},
      {c: "label", text: "w:"},
      borderWidthAdjuster,
      {c: "label", text: "r:"},
      borderRadiusAdjuster,
      {c: "label", text: "opacity:"},
      opacityAdjuster
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
      if(oldProps) {
        attrs.push(oldProps[elem.attr]);
      }
    });
    localState.initialAttrs = attrs;
  }

  function stopAdjustAttr(e, elem) {
    var initial = localState.initialAttrs;
    localState.initialAttrs = null;
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
    return genericWorkspace("query", [queryControls(queryId)], [],
                            {c: "query-editor",
                             children: [
                               {c: "query-workspace", children: [
                                 editor(queryId)
                               ]},
                               {c: "primitive-cursor", children: primitiveItems},
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

  var queryTools = {
    union: ["merge"],
    aggregate: ["sort+limit", "sum", "count", "min", "max", "empty"]
  };
  function queryControls(queryId) {
    var items = [];
    var toolTypes = Object.keys(queryTools);
    for(var typeIx = 0; typeIx < toolTypes.length; typeIx++) {
      var type = toolTypes[typeIx];
      var tools = queryTools[type];
      for(var toolIx = 0; toolIx < tools.length; toolIx++) {
        var tool = tools[toolIx];
        items.push(treeItem(tool, tool, type, {c: "control tool query-tool"}));
      }
    }
    return controlGroup(items);
  }

  //---------------------------------------------------------
  // Editor
  //---------------------------------------------------------
  function editor(queryId) {
    var blocks = ixer.index("query to blocks")[queryId] || [];
    var items = [];
    for(var ix = 0; ix < blocks.length; ix++) {
      var viewId = blocks[ix][code.ix("block", "view")];
      var viewKind = ixer.index("view to kind")[viewId];
      var editorPane;
      if(viewKind === "join") { editorPane = viewBlock(viewId); }
      if(viewKind === "union") { editorPane = unionBlock(viewId);  }
      if(viewKind === "aggregate") { editorPane = aggregateBlock(viewId); }

      var order = ixer.index("display order");
      var rows = ixer.facts(viewId) || [];
      var fields = (ixer.index("view to fields")[viewId] || []).map(function(field) {
        var id = field[code.ix("field", "field")];
        return {name: code.name(id), id: id, priority: order[id] || 0};
      });
      fields.sort(function(a, b) {
        var delta = b.priority - a.priority;
        if(delta) { return delta; }
        else { return a.id < b.id; }
      });

      rows.sort(function(a, b) {
        var aIx = order[viewId + JSON.stringify(a)];
        var bIx = order[viewId + JSON.stringify(b)];
        return aIx - bIx;
      });

      var inspectorPane = {c: "inspector-pane", children: [virtualizedTable(viewId, fields, rows, false)]};

      items.push({c: "block " + viewKind, children: [
        editorPane,
        inspectorPane
      ]});
    }
    if(items.length) {
      items.push({c: "add-aggregate-btn", text: "Add an aggregate by dragging it here...", queryId: queryId});
    }

    return {c: "workspace", queryId: queryId, drop: editorDrop, dragover: preventDefault, children: items.length ? items : [
      {c: "feed", text: "Feed me sources"}
    ]};
  }

  function editorDrop(evt, elem) {
    var type = evt.dataTransfer.getData("type");
    var value = evt.dataTransfer.getData("value");
    if(type === "view") {
      return dispatch("addViewBlock", {queryId: elem.queryId, sourceId: value, kind: "join"});
    }
    if(type === "aggregate") {
      return dispatch("addAggregateBlock", {queryId: elem.queryId, kind: value});
    }
    if(type === "union") {
      return dispatch("addUnionBlock", {queryId: elem.queryId});
    }
  }

  /**
   * View Block
   */
  function viewBlock(viewId) {
    var fields = ixer.index("view and source to block fields")[viewId] || {};

    fields = fields["selection"] || [];
    var selectionItems = fields.map(function(field) {
      var id = field[code.ix("block field", "block field")];
      return fieldItem(code.name(id) || "Untitled", id, {c: "pill field"});
    });
    if(!selectionItems.length) {
      selectionItems.push({text: "Drag local fields into me to make them available in the query."});
    }
    var groupedBy = ixer.index("grouped by")[viewId];

    return {c: "block view-block", viewId: viewId, drop: viewBlockDrop, dragover: preventDefault,
            dragData: {value: viewId, type: "view"}, itemId: viewId, draggable: true, dragstart: dragItem, children: [
      {c: "block-title", children: [
        {t: "h3", text: "Untitled Block"},
        {c: "hover-reveal close-btn ion-android-close", viewId: viewId, click: removeViewBlock}
      ]},
      viewSources(viewId),
      viewConstraints(viewId),
      (groupedBy ? {c: "block-section view-grouping", children: [
        {text: "Grouped by"},
        {text: code.name(groupedBy[code.ix("grouped by", "inner field")])},
        {text: "="},
        {text: code.name(groupedBy[code.ix("grouped by", "outer field")])},
      ]} : undefined),
      {c: "block-section view-selections tree bar", viewId: viewId, drop: viewSelectionsDrop, dragover: preventDefault, children: selectionItems}
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
    if(blockField[code.ix("block field", "view")] !== elem.viewId) { return; }
    var fieldId = blockField[code.ix("block field", "field")];
    var sourceId = blockField[code.ix("block field", "source")];
    dispatch("addViewSelection", {viewId: elem.viewId, sourceFieldId: fieldId, sourceId: sourceId});
    evt.stopPropagation();
  }

  // Sources
  function viewSources(viewId, drop) {
    var sourceIdIx = code.ix("source", "source");
    var sources = ixer.index("view to sources")[viewId] || [];
    var sourceIds = sources.map(function(source) {
      return source[sourceIdIx];
    });

    sources.sort(function(a, b) {
      var idA = a[sourceIdIx];
      var idB = b[sourceIdIx];
      var orderA = ixer.index("display order")[idA];
      var orderB = ixer.index("display order")[idB];
      if(orderB - orderA) { return orderB - orderA; }
      else { return idA.localeCompare(idB) }
    });
    var sourceItems = sourceIds.map(function(sourceId) {
      return viewSource(viewId, sourceId, drop);
    });

    return {c: "block-section view-sources", children: sourceItems};
  }

  function viewSource(viewId, sourceId, drop) {
    var fields = ixer.index("view and source to block fields")[viewId] || {};
    fields = fields[sourceId] || [];
    var fieldItems = fields.map(function(field) {
      var id = field[code.ix("block field", "block field")];
      var fieldId = field[code.ix("block field", "field")];
      return fieldItem(code.name(fieldId) || "Untitled", id, {c: "pill field"});
    });

    var sourceName;

    if(sourceId == "inner" || sourceId === "outer" || sourceId === "insert" || sourceId === "remove") {
      sourceName = code.name(viewId + "-" + sourceId) + " (" + sourceId + ")";
    } else {
      sourceName = code.name(sourceId);
    }


    var children = [
      {c: "view-source-title", children: [
        {t: "h4", text: sourceName || "Untitled"},
        {c: "hover-reveal close-btn ion-android-close", viewId: viewId, sourceId: sourceId, click: removeSource}
      ]}
    ].concat(fieldItems);
    return {c: "tree bar view-source", viewId: viewId, sourceId: sourceId,
            dragover: (drop ? preventDefault : undefined), drop: drop, children: children};
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
        token.blockField({key: "left", parentId: id, source: leftSource, field: leftField}, updateViewConstraint, dropConstraintField),
        token.operation({key: "operation", parentId: id, operation: operation}, updateViewConstraint),
        token.blockField({key: "right", parentId: id, source: rightSource, field: rightField}, updateViewConstraint, dropConstraintField),
        {c: "hover-reveal close-btn ion-android-close", constraintId: id, click: removeConstraint}
      ]};
    });
    return {c: "block-section view-constraints", viewId: viewId, drop: viewConstraintsDrop, dragover: preventDefault, children: constraintItems};
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
    var id = elem.parentId;
    dispatch("updateViewConstraint", {constraintId: id, type: elem.key, value: elem.value});
    stopEditToken(evt, elem);
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
        var item = selectorItem({c: "operation", key: params.key, name: rel, value: rel}, onChange);
        item.parentId = params.parentId;
        return item;
      });
      var select = selector(items, {c: "operation", key: params.key, tabindex: -1, focus: true}, stopEditToken);
      select.parentId = params.parentId;
      return select;
    },
    blockField: function(params, onChange) {
      var viewId = ixer.index("constraint to view")[params.parentId];
      var fields = getBlockFields(viewId);
      var items = fields.map(function(field) {
        var fieldId = field[code.ix("field", "field")];
        var item = selectorItem({c: "field", key: params.key, name: code.name(fieldId) || "Untitled", value: fieldId}, onChange);
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

  /**
   * Union Block
   */
  function unionBlock(viewId) {
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
      var sourceFields = ixer.index("view and source to block fields")[viewId] || {};
      sourceFields = sourceFields[sourceId] || [];
      var fieldItems = [];
      for(var fieldIx = 0; fieldIx < sourceFields.length; fieldIx++) {
        var field = sourceFields[fieldIx];
        var blockFieldId = field[code.ix("block field", "block field")];
        var fieldId = field[code.ix("block field", "field")];
        fieldItems.push(fieldItem(code.name(fieldId) || "Untitled", blockFieldId, {c: "pill field"}));
      }
      sourceItems.push({c: "union-source", children: [
        {text: code.name(sourceId)},
        {c: "tree bar union-source-fields", children: fieldItems}
      ]});

      if(!fields.length) { continue; }
      var selectFields = selectSources[sourceId] || [];

      var mappingPairs = [];
      for(var fieldIx = 0; fieldIx < fields.length; fieldIx++) {
        var field = fields[fieldIx];
        var fieldId = field[code.ix("block field", "field")];
        var selectField = selectFields[fieldId] || [];
        var mappedFieldId = selectField[code.ix("select", "source field")];
        mappingPairs.push({c: "mapping-pair", viewId: viewId, sourceId: sourceId, fieldId: fieldId, dragover: preventDefault, drop: unionSourceMappingDrop, children: [
          {c: "mapping-header", text: code.name(fieldId) || "Untitled"}, // @FIXME: code.name(fieldId) not set?
          (mappedFieldId ? {c: "mapping-row", text: code.name(mappedFieldId) || "Untitled"}
           : {c: "mapping-row", text: "---"})
        ]});
      }
      fieldMappingItems.push({c: "field-mapping", children: mappingPairs});
    }

    if(!fields.length) {
      fieldMappingItems.push({c: "field-mapping", children: [{text: "drag fields to begin mapping; or"},
                                                             {text: "drag an existing union to begin merging"}]});
    }

    return {c: "block union-block", viewId: viewId, dragover: preventDefault, drop: viewBlockDrop,
            dragData: {value: viewId, type: "view"}, itemId: viewId, draggable: true, dragstart: dragItem, children: [
      {c: "block-title", children: [
        {t: "h3", text: "Untitled Union Block"},
        {c: "hover-reveal close-btn ion-android-close", viewId: viewId, click: removeViewBlock}
      ]},
      {c: "content", children: [
        {c: "block-pane", children: sourceItems},
        {c: "block-pane mapping", viewId: viewId, dragover: preventDefault, drop: unionSourceMappingDrop, children: fieldMappingItems},
      ]}
    ]};
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
    var selectionItems = fields.map(function(field) {
      var id = field[code.ix("block field", "block field")];
      return fieldItem(code.name(id) || "Untitled", id, {c: "pill field"});
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
      {c: "block-title", children: [
        {t: "h3", text: "Untitled Agg. Block"},
        {c: "hover-reveal close-btn ion-android-close", viewId: viewId, click: removeViewBlock}
      ]},
      {text: "With"},
      viewSources(viewId, aggregateSourceDrop),
//       {c: "block-section view-sources", viewId: viewId, children: [
//         innerSource ? viewSource(viewId, "inner") : undefined
//       ]},

      {c: "block-section aggregate-grouping", children: [
        {text: "Group by"},
        token.blockField({key: "outer", parentId: viewId, source: "outer", field: outerField}, updateAggregateGrouping, dropAggregateGroupingField),
        {text: "="},
        token.blockField({key: "inner", parentId: viewId, source: "inner", field: innerField}, updateAggregateGrouping, dropAggregateGroupingField),
      ]},
      content,
      {c: "block-section view-selections tree bar", viewId: viewId, drop: viewSelectionsDrop, dragover: preventDefault, children: selectionItems},
    ]};
  }

  function updateAggregateGrouping(evt, elem) {

  }

  function dropAggregateGroupingField(evt, elem) {
    var viewId = elem.parentId;
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
    var aggregateSorting = ixer.index("view to aggregate sorting")[viewId];
    if(aggregateSorting) {
      sortField = aggregateSorting[code.ix("aggregate sorting", "inner field")];
      sortDir = aggregateSorting[code.ix("aggregate sorting", "direction")];
    }

    // @FIXME: hard coded to work with constants only.
    var limitFrom = ixer.index("view to aggregate limit from")[viewId] || [];
    var limitFromValue = ixer.index("constant to value")[limitFrom[code.ix("aggregate limit from", "from field")]];
    var limitTo = ixer.index("view to aggregate limit to")[viewId] || [];
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
