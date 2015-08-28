/// <reference path="microReact.ts" />
/// <reference path="ui.ts" />
/// <reference path="api.ts" />
/// <reference path="client.ts" />
/// <reference path="tableEditor.ts" />
/// <reference path="glossary.ts" />
/// <reference path="layout.ts" />
module eveEditor {
  var localState = api.localState;
  var ixer = api.ixer;
  var code = api.code;
  var DEBUG = window["DEBUG"];
  // we'll keep separate stacks for each workspace
  var eventStacks = {};

  export function storeEvent(workspace, event, diffs) {
    if(!eventStacks[workspace]) {
        eventStacks[workspace] = {root: true, children: [], parent: null, diffs: null};
    }
    var eventItem = {event, diffs, children: [], parent: eventStacks[workspace], root: false};
    eventStacks[workspace].children.push(eventItem);
    eventStacks[workspace] = eventItem;
  }

  export function scaryUndoEvent(workspace): any[] {
    let eventStack = eventStacks[workspace];
    if(!eventStack || !eventStack.parent || !eventStack.diffs) return [];
    var old = eventStack;
    eventStacks[workspace] = old.parent;
    return api.reverseDiff(old.diffs);
  }

  export function scaryRedoEvent(workspace): any[] {
    let eventStack = eventStacks[workspace];
    if(!eventStack || !eventStack.children.length) return [];
    eventStacks[workspace] = eventStack.children[eventStack.children.length - 1];
    return eventStacks[workspace].diffs;
  }

  export function executeDispatch(diffs, storeEvent, sendToServer) {
    if(diffs && diffs.length) {
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

    } else {
      //       console.warn("No diffs to index, skipping.");
    }

    //@TODO: since we don't have a way to determine if localState has changed, we have
    //to render anytime dispatch is called
    drawn.render();
  }
}

module drawn {
  declare var Papa;
  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;

  //---------------------------------------------------------
  // Constants
  //---------------------------------------------------------

  const nodeWidthMultiplier = 9;
  const nodeSmallWidthMultiplier = 8;
  const nodeWidthPadding = 10;
  const nodeHeight = 18;
  const nodeHeightPadding = 3;
  const nodeWidthMin = 50;
  const nodeFilterWidthMin = 30;
  const previewWidth = 250;
  const previewHeight = 225;

  //---------------------------------------------------------
  // Utils
  //---------------------------------------------------------

   function coerceInput(input) {
        if (input.match(/^-?[\d]+$/gim)) {
            return parseInt(input);
        }
        else if (input.match(/^-?[\d]+\.[\d]+$/gim)) {
            return parseFloat(input);
        }
        else if (input === "true") {
            return true;
        }
        else if (input === "false") {
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

    function focusOnce(node, elem) {
        if (!node.__focused) {
            node.focus();
            node.__focused = true;
            if(elem.contentEditable && node.firstChild) {
              let range = document.createRange();
              range.setStart(node.firstChild, node.textContent.length);
              range.setEnd(node.firstChild, node.textContent.length);
              let sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
        }
    }

	//---------------------------------------------------------
  // Renderer
  //---------------------------------------------------------

  export var renderer;
  function initRenderer() {
    renderer = new microReact.Renderer();
    document.body.appendChild(renderer.content);
    renderer.queued = false;
    window.addEventListener("resize", render);
  }

  export function render() {
   if(renderer.queued === false) {
      renderer.queued = true;
      // @FIXME: why does using request animation frame cause events to stack up and the renderer to get behind?
      setTimeout(function() {
      // requestAnimationFrame(function() {
        var start = performance.now();
        var tree = window["drawn"].root();
        var total = performance.now() - start;
        if(total > 10) {
          console.log("Slow root: " + total);
        }
        renderer.render(tree);
        renderer.queued = false;
      }, 16);
    }
  }

  //---------------------------------------------------------
  // localState
  //---------------------------------------------------------

  function initLocalstate() {
    localState.selectedNodes = {};
    localState.overlappingNodes = {};
    localState.drawnUiActiveId = "itemSelector";
    localState.errors = {};
    localState.notices = {};
    localState.selectedItems = {};
    localState.tableEntry = {};
    localState.saves = JSON.parse(localStorage.getItem("saves") || "[]");
    localState.navigationHistory = [];
    positions = {};
  }

  export var positions;

  function loadPositions() {
    var loadedPositions = ixer.select("editor node position", {});
    for(var pos of loadedPositions) {
      positions[pos["editor node position: node"]] = {top: pos["editor node position: y"], left: pos["editor node position: x"]};
    }
  }

  //---------------------------------------------------------
  // Node helpers
  //---------------------------------------------------------

  function findNodesIntersecting(currentNode, nodes, nodeLookup) {
    let currentNodePosition = nodeDisplayInfo(currentNode);
    let overlaps = [];
    if (currentNodePosition.left === undefined || currentNodePosition.top === undefined) { return overlaps; }
    for (let node of nodes) {
      if (node.id === currentNode.id) continue;
      let nodePosition = nodeDisplayInfo(nodeLookup[node.id]);

      if (nodePosition.left !== undefined && nodePosition.top !== undefined &&
        currentNodePosition.right > nodePosition.left &&
        currentNodePosition.left < nodePosition.right &&
        currentNodePosition.bottom > nodePosition.top &&
        currentNodePosition.top < nodePosition.bottom) {
        overlaps.push(node.id);
      }
    }
    return overlaps;
  }

  function intersectionAction(nodeA, nodeB): any {
    //given two nodes, we check to see if their intersection should cause something to happen
    //e.g. two attributes intersecting would signal joining them
    if(nodeA.type === "attribute" && nodeB.type === "attribute"
      && !(nodeA.error || nodeB.error)) {
      return "joinNodes";
    }
    return false;
  }

  function actionableIntersections(viewId, currentNodeId, radius = 30) {
    let {nodeLookup, nodes} = viewToEntityInfo(ixer.selectOne("view", {view: viewId}));
    let overlaps = findNodesIntersecting(nodeLookup[currentNodeId], nodes, nodeLookup);
    let curNode = nodeLookup[currentNodeId];
    let actions = [];
    let lookup = {};
    for(let overlappingId of overlaps) {
      let overlappingNode = nodeLookup[overlappingId];
      let action = intersectionAction(curNode, overlappingNode);
      if(action) {
        let info = {node: curNode, target: overlappingNode, action};
        actions.push(info);
        lookup[overlappingId] = info;
      }
    }
    return {actions, lookup};
  }

  function getNodesInRectangle(viewId, box) {
    let {nodes} = viewToEntityInfo(ixer.selectOne("view", {view: viewId}));
    let boxLeft = Math.min(box.start.x, box.end.x);
    let boxRight = Math.max(box.start.x, box.end.x)
    let boxTop = Math.min(box.start.y, box.end.y);
    let boxBottom = Math.max(box.start.y, box.end.y);
    return nodes.map((node) => {
      return {node, displayInfo: nodeDisplayInfo(node)};
    }).filter((info) => {
      let {node, displayInfo} = info;
      if(displayInfo.left === undefined || displayInfo.top === undefined) { return false; }
      let overlapLeft = Math.max(boxLeft, displayInfo.left);
      let overlapRight = Math.min(boxRight, displayInfo.right);
      let overlapTop = Math.max(boxTop, displayInfo.top);
      let overlapBottom = Math.min(boxBottom, displayInfo.bottom);
      return overlapLeft < overlapRight && overlapTop < overlapBottom;
    });
  }

  function nodesToRectangle(nodes) {
    let top = Infinity;
    let left = Infinity;
    let bottom = -Infinity;
    let right = -Infinity;
    for(var node of nodes) {
      let info = nodeDisplayInfo(node);
      if(info.left === undefined || info.top === undefined) { continue; }
      if(info.left < left) left = info.left;
      if(info.right > right) right = info.right;
      if(info.top < top) top = info.top;
      if(info.bottom > bottom) bottom = info.bottom;
    }
    return {top, left, right, bottom, width: right - left, height: bottom - top};
  }

  //---------------------------------------------------------
  // AST helpers
  //---------------------------------------------------------

  function isVariableUsed(variableId) {
    // a variable is unused if it is unselected, unjoined, without constants,
    // and without an ordinal.
    if(ixer.selectOne("select", {variable: variableId})
       || ixer.select("binding", {variable: variableId}).length > 1
       || ixer.select("ordinal binding", {variable: variableId}).length
       || ixer.select("constant binding", {variable: variableId}).length) {
      return true;
    }
    return false;
  }

  function removeDownstreamFieldUses(fieldId) {
    let diffs = [];
    // check if there are any downstream views that have this field unused and remove them
    for(let downstreamBinding of ixer.select("binding", {field: fieldId})) {
      let variableId = downstreamBinding["binding: variable"];
      if(!isVariableUsed(variableId)) {
        diffs.push.apply(diffs, removeVariable(variableId));
      }
    }
    return diffs;
  }

  function joinedBindingsFromSource(sourceId) {
    let joined = [];
    let bindings = ixer.select("binding", {source: sourceId});
    for(let binding of bindings) {
      let variableId = binding["binding: variable"];
      if(ixer.select("binding", {variable: variableId}).length > 1
         || ixer.select("ordinal binding", {variable: variableId}).length
         || ixer.select("constant binding", {variable: variableId}).length) {
        joined.push(binding);
      }
    }
    return joined;
  }

  function getDescription(viewId) {
    let description = "No description :(";
    let viewDescription = ixer.selectOne("view description", {view: viewId});
    if(viewDescription) {
      description = viewDescription["view description: description"];
    }
    return description;
  }

  function removeVariable(variableId) {
    let diffs = [];
    diffs.push(api.remove("variable", {variable: variableId}));
    diffs.push(api.remove("constant binding", {variable: variableId}));
    // we need to remove any bindings to this variable
    diffs.push(api.remove("binding", {variable: variableId}));
    diffs.push(api.remove("ordinal binding", {variable: variableId}));
    // we also need to remove any fields and selects that pull from the variable
    let selects = ixer.select("select", { variable: variableId });
    for(let select of selects) {
      let fieldId = select["select: field"];
      diffs.push(api.remove("field", { field: fieldId}));
      diffs.push(api.remove("select", { variable: variableId }));
      // remove any downstream uses of this field if it's safe
      diffs.push.apply(diffs, removeDownstreamFieldUses(fieldId));
    }
    return diffs;
  }

  function addField(viewId, name?, offset:number = 0) {
    var diffs = [];
    var fields = ixer.select("field", {view: viewId}) || [];

    // Find an unused name in the range "Field A..Field ZZ".
    let skip = offset;
    if(!name) {
      let names = fields.map((field) => code.name(field["field: field"]));
      name = "Field A";
      for(var ix = 1; (names.indexOf(name) !== -1 || skip-- > 0) && ix < 27 * 26; ix++) {
        name = "Field ";
        let leading = Math.floor(ix / 26);
        if(leading > 0) {
          name += api.alphabet[leading - 1];
        }
        name += api.alphabet[ix % 26];
      }
    }

    // We need to find the lowest priority to make sure that we come before it. We can't use
    // length here because fields can be added and removed out of order.
    let minFieldPriority = Infinity;
    for(let field of fields) {
      var order = ixer.selectOne("display order", {id: field["field: field"]});
      if(!order) continue;
      minFieldPriority = Math.min(order["display order: priority"], minFieldPriority);
    }
    // if we didn't find one, we default to -1, otherwise we take one less than the min
    let fieldPriority = minFieldPriority === Infinity ? -1 : minFieldPriority - 1;

    var neueField = api.insert("field", {view: viewId, kind: "output", dependents: {
      "display name": {name: name},
      "display order": {priority: fieldPriority - offset}
    }});
    var fieldId = neueField.content.field;
    diffs.push(neueField);
    // find all the sources that have this view and add variables/bindings for them
    for(let source of ixer.select("source", {"source view": viewId})) {
      let sourceId = source["source: source"];
      let sourceViewId = source["source: view"];
      let variableId = uuid();
      diffs.push(api.insert("variable", {view: sourceViewId, variable: variableId}));
      diffs.push(api.insert("binding", {variable: variableId, source: sourceId, field: fieldId}));
    }

    let viewKind = (ixer.selectOne("view", {view: viewId}) || {})["view: kind"];
    if(viewKind === "table") {
      //@HACK: We have to delay this until after the field has been processed and added to the index, or it will be ignored when converting to diffs.
      setTimeout(function() {
        dispatch("refreshTableRows", {tableId: viewId, fieldId: neueField.context["field"]});
      }, 0);

    }
    return {fieldId, diffs};
  }

  function removeBinding(binding) {
    let diffs = [];
    let variableId = binding["binding: variable"];
    // determine if this is the only binding for this variable
    let allVariableBindings = ixer.select("binding", {variable: variableId});
    let singleBinding = allVariableBindings.length === 1;
    // if this variable is only bound to this field, then we need to remove it
    if(singleBinding) {
      diffs.push.apply(diffs, removeVariable(variableId));
    } else {
      // we need to check if the remaining bindings are all inputs, if so we
      // bind it to a constant to ensure the code remains valid
      let needsConstant = true;
      let input;
      for(let variableBinding of allVariableBindings) {
         if(variableBinding === binding) continue;
         let fieldId = variableBinding["binding: field"];
         let field = ixer.selectOne("field", {field: fieldId});
         if(!field || field["field: kind"] === "output") {
           needsConstant = false;
           break;
         } else {
           input = variableBinding;
         }
      }
      if(needsConstant) {
         let fieldId = input["binding: field"];
         let sourceViewId = ixer.selectOne("source", {source: input["binding: source"]})["source: source view"];
         diffs.push(api.insert("constant binding", {variable: variableId, value: api.newPrimitiveDefaults[sourceViewId][fieldId]}));
      }
    }
    diffs.push(api.remove("binding", binding, undefined, true));
    return diffs;
  }

  function removeSource(sourceId) {
    var diffs = [
      api.remove("source", {source: sourceId}),
      api.remove("chunked source", {source: sourceId}),
      api.remove("sorted field", {source: sourceId}),
      api.remove("grouped field", {source: sourceId}),
      api.remove("binding", {source: sourceId})
    ]
    let bindings = ixer.select("binding", {source: sourceId});
    for(let binding of bindings) {
      diffs.push.apply(diffs, removeBinding(binding));
    }
    let ordinal = ixer.selectOne("ordinal binding", {source: sourceId});
    if(ordinal) {
       diffs.push.apply(diffs, removeVariable(ordinal["ordinal binding: variable"]));
    }
    return diffs;
  }

  function addSourceFieldVariable(itemId, sourceViewId, sourceId, fieldId) {
    let diffs = [];
    let kind;
    // check if we're adding an ordinal
    if(fieldId === "ordinal") {
      kind = "ordinal";
    } else {
      kind = ixer.selectOne("field", {field: fieldId})["field: kind"];
    }
    // add a variable
    let variableId = uuid();
    diffs.push(api.insert("variable", {view: itemId, variable: variableId}));
    if(kind === "ordinal") {
      // create an ordinal binding
      diffs.push(api.insert("ordinal binding", {variable: variableId, source: sourceId}));
    } else {
      // bind the field to it
      diffs.push(api.insert("binding", {variable: variableId, source: sourceId, field: fieldId}));
    }
    if(kind === "output" || kind === "ordinal") {
      // select the field
      diffs.push.apply(diffs, dispatch("addSelectToQuery", {viewId: itemId, variableId: variableId, name: code.name(fieldId) || fieldId}, true));
    } else {
      // otherwise we're an input field and we need to add a default constant value
      diffs.push(api.insert("constant binding", {variable: variableId, value: api.newPrimitiveDefaults[sourceViewId][fieldId]}));
    }
    return diffs;
  }

  function removeView(viewId) {
    let diffs = [
      // removing the view will automatically remove the fields
      api.remove("view", {view: viewId})
    ];
    for(let source of ixer.select("source", {view: viewId})) {
      let sourceId = source["source: source"];
      diffs.push.apply(diffs, removeSource(sourceId));
    }
    // go through and remove everything associated to variables
    for(let variable of ixer.select("variable", {view: viewId})) {
      diffs.push.apply(diffs, removeVariable(variable["variable: variable"]));
    }
    return diffs;
  }

  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------

  export function dispatch(event, info, rentrant?) {
    //console.log("dispatch[" + event + "]", info);
    var diffs = [];
    var commands = [];
    var storeEvent = true;
    switch(event) {
      //---------------------------------------------------------
      // Node selection
      //---------------------------------------------------------
      case "selectNode":
        var node = info.node;
        //if this node is already in the selection, we should ignore this
        if(localState.selectedNodes[node.id]) return;
        //if shift isn't pressed, then we need to clear the current selection
        if(!info.shiftKey) {
          dispatch("clearSelection", {}, true);
        }
        localState.selectedNodes[node.id] = node;
        //build a query with the selected things in it
      break;
      case "clearSelection":
        // diffs.push(api.remove("view", api.retrieve("view", {view: localState.selectedViewId})));
        localState.selectedNodes = {};
        localState.selectedViewId = uuid();
      break;
      case "removeSelection":
        var removedSources = {};
        for(let nodeId in info.nodes) {
          let node = info.nodes[nodeId];
          if(node.type === "relationship") {
            removedSources[node.id] = true;
            diffs.push.apply(diffs, removeSource(node.id));
          } else if (node.type === "primitive") {
            removedSources[node.sourceId] = true;
            diffs.push.apply(diffs, removeSource(node.sourceId));
          }
        }
        // we need to check for any variables that got orphaned by removing all the given sources
        for(let variable of ixer.select("variable", {view: localState.drawnUiActiveId})) {
          let variableId = variable["variable: variable"];
          let bindings = ixer.select("binding", {variable: variableId});

          // check if this is an ordinal field, if so it's in use or has been removed already
          let ordinal = ixer.selectOne("ordinal binding", {variable: variableId});
          if(ordinal) continue;

          let shouldRemove = true;
          for(let binding of bindings) {
            if(!removedSources[binding["binding: source"]]) {
              shouldRemove = false;
              break;
            }
          }
          if(shouldRemove) {
            diffs.push.apply(diffs, removeVariable(variableId));
          }
        }
        dispatch("clearSelection", {}, true);
      break;
      case "startBoxSelection":
        //if shift isn't pressed, then we need to clear the current selection
        if(!info.shiftKey) {
          dispatch("clearSelection", {}, true);
        }
        localState.selecting = true;
        localState.boxSelection = {start: info.coords};
      break;
      case "continueBoxSelection":
        if(!localState.selecting) return;
        localState.boxSelection.end = info;
      break;
      case "endBoxSelection":
        if(localState.boxSelection && localState.boxSelection.end) {
          var boxSelectedNodes = getNodesInRectangle(localState.drawnUiActiveId, localState.boxSelection);
          boxSelectedNodes.forEach((info) => {
            let {node} = info;
            localState.selectedNodes[node.id] = node;
          });
        }
        localState.selecting = false;
        localState.boxSelection = false;
      break;
      //---------------------------------------------------------
      // Node positioning
      //---------------------------------------------------------
      case "setDragOffset":
        localState.dragOffsetX = info.x;
        localState.dragOffsetY = info.y;
      break;
      case "setNodePosition":
        var originalPosition = positions[info.node.id];
        var offsetLeft = info.pos.left - originalPosition.left;
        var offsetTop = info.pos.top - originalPosition.top;
        var selectionSize = 0;
        for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          let prevPosition = positions[node.id];
          positions[node.id] = {left: prevPosition.left + offsetLeft, top: prevPosition.top + offsetTop};
          selectionSize++;
        }
        // if we have only one thing selected we need to check for overlaps to show potential actions that
        // could take place
        if(selectionSize === 1) {
          localState.overlappingNodes = actionableIntersections(localState.drawnUiActiveId, info.node.id).lookup;
        } else {
          localState.overlappingNodes = {};
        }
      break;
      case "finalNodePosition":
       var selectionSize = 0;
       for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          let currentPos = positions[node.id];
          diffs.push(api.insert("editor node position", {node: nodeId, x: currentPos.left, y: currentPos.top}),
                     api.remove("editor node position", {node: nodeId}));
          selectionSize++;
        }
        // @TODO: Check for potential overlap with other nodes
        if(selectionSize === 1) {
          let {lookup, actions} = actionableIntersections(localState.drawnUiActiveId, info.node.id);
          for(let action of actions) {
            diffs.push.apply(diffs, dispatch(action.action, action, true));
          }
        }
      break;
      case "initializeNodePositions":
        var nodes = info.nodes;
        for(let node of nodes) {
          var currentPos = positions[node.id];
          diffs.push(api.insert("editor node position", {node: node.id, x: currentPos.left, y: currentPos.top}),
                     api.remove("editor node position", {node: node.id}));
        }
      break;
      //---------------------------------------------------------
      // Navigation
      //---------------------------------------------------------
      case "openItem":
        var currentItem = localState.drawnUiActiveId;
        var kind = ixer.selectOne("view", {view: info.itemId})["view: kind"];
        // if we try to go to a primitive view, bail out
        if(kind === "primitive") {
          break;
        }
        // if we're already there, just clear the selection.
        if(currentItem === info.itemId) {
          diffs = dispatch("clearSelection", {}, true);
          break;
        }
        // push the current location onto the history stack
        localState.navigationHistory.push(currentItem);
        localState.drawnUiActiveId = info.itemId;
        // make sure selection doesn't persist
        diffs = dispatch("clearSelection", {}, true);
        // if we are leaving the itemSelector, then we want to store the search
        if(currentItem === "itemSelector") {
          // store the current search information so that when we return to the selector
          // we can make sure it's how you left it even if you do searches in the editor
          localState.selectorSearchingFor = localState.searchingFor;
          localState.selectorSearchResults = localState.searchResults;
        }
        // if this item is a table, we should setup the initial table entry
        if(kind === "table") {
          diffs.push.apply(diffs, dispatch("newTableEntry", {}, true));
        }
      break;
      case "navigateBack":
        // clear selection when leaving a workspace to ensure it doesn't end up taking effect in the
        // next one you go to.
        diffs = dispatch("clearSelection", {}, true);
        // look at the history stack to see where we're headed next
        var nextView = localState.navigationHistory.pop();
        localState.drawnUiActiveId = nextView;
        // if we're headed back to the item selector, restore our search
        if(nextView === "itemSelector") {
          // restore the previous search state so that the selector is how you left it
          localState.searchingFor = localState.selectorSearchingFor;
          localState.searchResults = localState.selectorSearchResults;
        }
      break;
      case "selectItem":
        if(!info.shiftKey) {
          localState.selectedItems = {};
        } else if(info.shiftKey && localState.selectedItems[info.itemId]) {
          // if this item is already selected and we click it again with the shiftKey
          // then we need to deselect it
          delete localState.selectedItems[info.itemId];
          break;
        }
        localState.selectedItems[info.itemId] = true;
      break;
      case "clearSelectedItems":
        localState.selectedItems = {};
      break;
      case "removeSelectedItems":
        for(let selectedItem in localState.selectedItems) {
          diffs.push.apply(diffs, removeView(selectedItem));
          delete localState.selectedItems[selectedItem];
        }
      break;
      //---------------------------------------------------------
      // Query building
      //---------------------------------------------------------
      case "createNewItem":
        // push the current location onto the history stack
        localState.navigationHistory.push(localState.drawnUiActiveId);

        var newId = uuid();
        localState.drawnUiActiveId = newId;
        var tag;
        if(info.kind === "table") {
          tag = [{tag: "editor"}];
          if(!info.empty) {
            diffs.push.apply(diffs, dispatch("addFieldToTable", {tableId: newId}, true));
          }
          diffs.push.apply(diffs, dispatch("newTableEntry", {}, true))
        }
        diffs.push(api.insert("view", {view: newId, kind: info.kind, dependents: {"display name": {name: info.name}, tag}}));
        diffs.push.apply(diffs, dispatch("hideTooltip", {}, true));

      break;
      case "addViewAndMaybeJoin":
        var sourceId = uuid();
        var itemId = localState.drawnUiActiveId;
        diffs = [
          api.insert("source", {view: itemId, source: sourceId, "source view": info.viewId})
        ];
        // if there's a selection, we want to try and join on those nodes if possible
        // so that we don't produce product joins all the time
        var potentialJoinNodes = {};
        for(let selectedId in localState.selectedNodes) {
          let node = localState.selectedNodes[selectedId];
          // we can only join on attributes
          if(node.type === "attribute") {
            potentialJoinNodes[node.name] = node;
          }
        }
        // add variables for all the fields of this view
        var sourceView = ixer.selectOne("view", {view: info.viewId});
        ixer.select("field", {view: info.viewId}).forEach(function(field) {
            let fieldId = field["field: field"];
            let name = code.name(fieldId);
            // check if we should try to join this field to one of the potential join nodes
            if(potentialJoinNodes[name]) {
              // if we're going to join, we just need a binding to this node
              diffs.push(api.insert("binding", {source: sourceId, field: fieldId, variable: potentialJoinNodes[name].variable}));
            } else {
              // otherwise we need to create a variable for this field
              diffs.push.apply(diffs, addSourceFieldVariable(itemId, info.viewId, sourceId, fieldId));
            }
        });
      break;
      case "joinNodes":
        var {target, node} = info;
        if(!node || !target) throw new Error("Trying to join at least one non-existent node");
        var variableId = node.variable;
        var variableIdToRemove = target.variable;

        // check if we need to transfer the name
        if(code.name(variableIdToRemove) && !code.name(variableId)) {
          diffs.push.apply(diffs, dispatch("rename", {renameId: variableId, value: code.name(variableIdToRemove)}, true));
        }

        // transfer all the bindings to the new variable
        var oldBindings = ixer.select("binding", {variable: variableIdToRemove});
        for(let binding of oldBindings) {
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          diffs.push(api.insert("binding", {variable: variableId, source: sourceId, field: fieldId}));
        }
        // check for an ordinal binding and move it over if it exists
        var ordinalBindings = ixer.select("ordinal binding", {variable: variableIdToRemove});
        if(ordinalBindings.length) {
          for(let ordinalBinding of ordinalBindings) {
            diffs.push(api.insert("ordinal binding", {variable: variableId, source: ordinalBinding["ordinal binding: source"]}));
          }
        }

        // remove the old variable
        diffs.push.apply(diffs, removeVariable(variableIdToRemove));

        //if either of these nodes are a primitive input, then we should remove any constant
        //constraint that was on there.
        var primitiveNode;
        var nonPrimitiveNode;
        if(target.isInput) {
          primitiveNode = target;
          nonPrimitiveNode = node;
        } else if(node.isInput) {
          primitiveNode = node;
          nonPrimitiveNode = target;
        }
        if(primitiveNode) {
          // ensure that these nodes can act as inputs:
          // if it's a vector input this has to be a non-grouped, sourceChunked attribute
          // if it's a scalar input this has to be either grouped or a non-sourceChunked attribute
          if(primitiveNode.inputKind === "vector input" && (nonPrimitiveNode.grouped || !nonPrimitiveNode.sourceChunked)) {
            //we do this as a normal dispatch as we want to bail out in the error case.
            return dispatch("setError", {errorText: "Aggregates require columns as input, try selecting the source and chunking it."});
          } else if(primitiveNode.inputKind === "scalar input" && !nonPrimitiveNode.grouped && nonPrimitiveNode.sourceChunked) {
            //we do this as a normal dispatch as we want to bail out in the error case.
            return dispatch("setError", {errorText: "Normal functions can't take columns as input, you could try unchunking the source or grouping this field."});
          }
          diffs.push(api.remove("constant binding", {variable: primitiveNode.variable}));
        }
        diffs.push.apply(diffs, dispatch("clearSelection", info, true));
      break;
      case "joinSelection":
        let ids = Object.keys(localState.selectedNodes);
        let root = localState.selectedNodes[ids[0]];
        for(let nodeId of ids.slice(1)) {
          let node = localState.selectedNodes[nodeId];
          diffs.push.apply(diffs, dispatch("joinNodes", {node, target: root}, true));
        }
      break;
      case "unjoinNodes":
        var itemId = localState.drawnUiActiveId;
        var variableIdToRemove = info.variableId;
        var oldBindings = ixer.select("binding", {variable: variableIdToRemove});
         // push all the bindings onto their own variables, skipping the first as that one can reuse
         // the current variable
        for(let binding of oldBindings.slice(1)) {
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          let sourceViewId = ixer.selectOne("source", {source: sourceId})["source: source view"];
          diffs.push.apply(diffs, addSourceFieldVariable(itemId, sourceViewId, sourceId, fieldId));
          diffs.push(api.remove("binding", {variable: variableIdToRemove, source: sourceId, field: fieldId}));
        }
        // check for an ordinal binding and create a new variable for it if it exists
        var ordinalBindings = ixer.select("ordinal binding", {variable: variableIdToRemove});
        if(ordinalBindings.length) {
          for(let ordinalBinding of ordinalBindings) {
            diffs.push.apply(diffs, addSourceFieldVariable(itemId, null, ordinalBinding["ordinal binding: source"], "ordinal"));
            diffs.push(api.remove("ordinal binding", {variable: variableIdToRemove}));
          }
        }
        // we have to check to make sure that if the original binding represents an input it gets a default
        // added to it to prevent the server from crashing
        if(oldBindings[0]) {
          var fieldId = oldBindings[0]["binding: field"];
          var kind = ixer.selectOne("field", {field: fieldId})["field: kind"];
          if(kind !== "output") {
            let sourceViewId = ixer.selectOne("source", {source: oldBindings[0]["binding: source"]})["source: source view"];
            diffs.push(api.insert("constant binding", {variable: variableIdToRemove, value: api.newPrimitiveDefaults[sourceViewId][fieldId]}));
          }
        } else {
          // if there aren't any bindings, then this variable is unused, which can happen
          // if the only things that were joined here were ordinals.
          diffs.push.apply(diffs, removeVariable(variableIdToRemove));
        }
        diffs.push.apply(diffs, dispatch("clearSelection", {}, true));
      break;
      case "removeSelectFromQuery":
        var selects = ixer.select("select", {variable: info.variableId}) || [];
        for(let select of selects) {
          let fieldId = select["select: field"];
          diffs.push(api.remove("field", {field: fieldId}));
          // remove any downstream uses of this field if it's safe
          diffs.push.apply(diffs, removeDownstreamFieldUses(fieldId));
        }
        diffs.push(api.remove("select", {variable: info.variableId}));
      break;
      case "addSelectToQuery":
        var {fieldId, diffs} = addField(info.viewId, info.name);

        // check to make sure this isn't only a negated attribute
        var onlyNegated = !info.allowNegated;
        var bindings = ixer.select("binding", {variable: info.variableId});
        for(let binding of bindings) {
          let sourceId = binding["binding: source"];
          if(!ixer.selectOne("negated source", {source: sourceId})) {
            onlyNegated = false;
          }
        }
        if(bindings.length && onlyNegated) {
          return dispatch("setError", {errorText: "Attributes that belong to a negated source that aren't joined with something else, can't be selected since they represent the absence of a value."});
        }

        diffs.push(api.insert("select", {field: fieldId, variable: info.variableId}));
      break;
      case "selectSelection":
        for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          diffs.push.apply(diffs, dispatch("addSelectToQuery", {variableId: node.variable, name: node.name, viewId: localState.drawnUiActiveId}, true));
        }
      break;
      case "unselectSelection":
        for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          diffs.push.apply(diffs, dispatch("removeSelectFromQuery", {variableId: node.variable, viewId: localState.drawnUiActiveId}, true));
        }
      break;
      case "rename":
        var prevName = ixer.selectOne("display name", {id: info.renameId});
        if(prevName && info.value === prevName["display name: name"]) return;
        diffs.push(api.insert("display name", {id: info.renameId, name: info.value}),
                   api.remove("display name", {id: info.renameId}));
      break;
      case "renameField":
        // check if there's a variable this field is being selected from, if so name it as well.
        var select = ixer.selectOne("select", {field: info.renameId});
        if(select) {
          diffs.push.apply(diffs, dispatch("rename", {renameId: select["select: variable"], value: info.value}, true));
        }
        diffs.push.apply(diffs, dispatch("rename", info, true));
      break;
      case "startRenamingNode":
        localState.renamingNodeId = info.nodeId;
      break;
      case "stopRenamingNode":
        localState.renamingNodeId = false;
        var select = ixer.selectOne("select", {variable: info.nodeId});
        if(select) {
          diffs.push.apply(diffs, dispatch("rename", {renameId: select["select: field"], value: info.value}, true));
        }
        diffs.push.apply(diffs, dispatch("rename", info, true));
      break;
      case "setQueryDescription":
        var prevDescription = ixer.selectOne("view description", {view: info.viewId});
        if(prevDescription && info.value === prevDescription["view description: description"]) return;
        diffs.push(api.insert("view description", {view: info.viewId, description: info.value}),
                   api.remove("view description", {view: info.viewId}));
      break;
      case "addFilter":
        var variableId = info.node.variable;
        diffs.push(api.insert("constant binding", {variable: variableId, value: ""}));
        dispatch("modifyFilter", info, true);
      break;
      case "modifyFilter":
        localState.modifyingFilterNodeId = info.node.id;
      break;
      case "removeFilter":
        var variableId = info.node.variable;
        diffs.push(api.remove("constant binding", {variable: variableId}));
      break;
      case "stopModifyingFilter":
        //insert a constant
        var variableId = info.node.variable;
        diffs.push(api.remove("constant binding", {variable: variableId}));
        diffs.push(api.insert("constant binding", {variable: variableId, value: info.value}));
        localState.modifyingFilterNodeId = undefined;
      break;
      case "chunkSource":
        var sourceId = info.node.source["source: source"];
        diffs.push(api.insert("chunked source", {source: sourceId}));
        // we need to group any fields that are joined to ensure the join continues to do what you'd expect
        for(let binding of joinedBindingsFromSource(sourceId)) {
          let variableId = binding["binding: variable"];
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          diffs.push.apply(diffs, dispatch("groupAttribute", {variableId, sourceId, fieldId}));
        }
      break;
      case "unchunkSource":
        var sourceId = info.node.source["source: source"];
        diffs.push(api.remove("chunked source", {source: sourceId}));
        // when you unchunk, we should ungroup the fields that we grouped when chunking.
        for(let binding of joinedBindingsFromSource(sourceId)) {
          let fieldId = binding["binding: field"];
          let variableId = binding["binding: variable"];
          let sourceId = binding["binding: source"];
          // We have to check for an aggregate binding, as unchunking will cause the
          // vector binding to error out. If there is an aggregate binding, then we have to bail
          // out of unchunking.
          for(let variableBinding of ixer.select("binding", {variable: variableId})) {
            let fieldKind = ixer.selectOne("field", {field: variableBinding["binding: field"]})["field: kind"];
            if(fieldKind === "vector input") {
              return dispatch("setError", {errorText: "Cannot unchunk this source because it's bound to an aggregate, which requires a column."});
            }
          }
          diffs.push.apply(diffs, dispatch("ungroupAttribute", {variableId, sourceId, fieldId}));
        }
      break;
      case "addOrdinal":
        var sourceId = info.node.source["source: source"];
        var {fieldId, diffs} = addField(info.viewId, "ordinal");
        var variableId = uuid();
        diffs.push(
          // create a variable
          api.insert("variable", {view: info.viewId, variable: variableId}),
          // bind the ordinal to it
          api.insert("ordinal binding", {source: sourceId, variable: variableId}),
          // select the variable into the created field
          api.insert("select", {variable: variableId, field: fieldId})
        );
      break;
      case "removeOrdinal":
        var variableId, sourceId;
        if(info.node.source) {
          sourceId = info.node.source["source: source"];
          variableId = ixer.selectOne("ordinal binding", {source: sourceId})["ordinal binding: variable"];
        } else if(info.node.variable) {
          variableId = info.node.variable;
          // if we're doing this by a variable, it must be selected, so we have to clear the selection
          diffs.push.apply(diffs, dispatch("clearSelection", {}, true));
        }
        // at the very least remove the ordinal binding
        diffs.push(api.remove("ordinal binding", {variable: variableId, source: sourceId}));
        // if there are no other bindings to this variable, go ahead and remove it
        var bindings = ixer.select("binding", {variable: variableId});
        if(!bindings.length) {
          diffs = removeVariable(variableId);
        } else {
          // otherwise we have to check if there's now a loose input field that needs a constant
          let needsConstant = true;
          let inputBinding;
          for(let binding of bindings) {
            var fieldId = bindings[0]["binding: field"];
            var kind = ixer.selectOne("field", {field: fieldId})["field: kind"];
            if(kind == "output") {
              needsConstant = false;
              break;
            } else {
              inputBinding = binding;
            }
          }
          if(needsConstant) {
            let fieldId = inputBinding["binding: field"];
            let sourceViewId = ixer.selectOne("source", {source: inputBinding["binding: source"]})["source: source view"];
            diffs.push(api.insert("constant binding", {variable: variableId, value: api.newPrimitiveDefaults[sourceViewId][fieldId]}));
          }
        }
      break;
      case "groupAttribute":
        var variableId = info.variableId;
        var bindings = ixer.select("binding", {variable: variableId});
        var sourceId, fieldId;
        if(info.sourceId) {
          sourceId = info.sourceId;
          fieldId = info.fieldId;
        } else if(bindings.length > 1) {
          //we do this as a normal dispatch as we want to bail out in the error case.
          return dispatch("setError", {errorText: "Cannot group an attribute that has multiple bindings, not sure what to do."});
        } else {
          sourceId = bindings[0]["binding: source"];
          fieldId = bindings[0]["binding: field"];
        }

        diffs.push(api.insert("grouped field", {source: sourceId, field: fieldId}));
        // when grouping, we have to remove the sorted field for this if there is one, which requires
        // re-indexing all the other sorted fields
        var sortedFields = ixer.select("sorted field", {source: sourceId});
        var ix = 0;
        diffs.push(api.remove("sorted field", {source: sourceId}));
        sortedFields.sort((a, b) => a["sorted field: ix"] - b["sorted field: ix"]);
        for(let sortedField of sortedFields) {
          let sortedFieldId = sortedField["sorted field: field"];
          if(sortedFieldId === fieldId) continue;
          diffs.push(api.insert("sorted field", {source: sourceId, field: sortedFieldId, ix, direction: sortedField["sorted field: direction"]}));
          ix++;
        }
      break;
      case "ungroupAttribute":
        var variableId = info.variableId;
        var bindings = ixer.select("binding", {variable: variableId});
        var sourceId, fieldId;
        if(info.sourceId) {
          sourceId = info.sourceId;
          fieldId = info.fieldId;
        } else if(bindings.length > 1) {
          //we do this as a normal dispatch as we want to bail out in the error case.
          return dispatch("setError", {errorText: "Cannot group an attribute that has multiple bindings, not sure what to do."});
        } else {
          sourceId = bindings[0]["binding: source"];
          fieldId = bindings[0]["binding: field"];
        }
        diffs.push(api.remove("grouped field", {source: sourceId, field: fieldId}));
        // add a sorted field back in for this attribute, which requires removing all the old sorts
        // and shifting this one on to the front
        var sortedFields = ixer.select("sorted field", {source: sourceId});
        var ix = 0;
        diffs.push(api.insert("sorted field", {source: sourceId, field: fieldId, ix, direction: "ascending"}));
        diffs.push(api.remove("sorted field", {source: sourceId}));
        sortedFields.sort((a, b) => a["sorted field: ix"] - b["sorted field: ix"]);
        for(let sortedField of sortedFields) {
          ix++;
          diffs.push(api.insert("sorted field", {source: sourceId, field: sortedField["sorted field: field"], ix, direction: sortedField["sorted field: direction"]}));
        }
      break;
      case "negateSource":
        diffs.push(api.insert("negated source", {source: info.sourceId}));
        // you can't select anything from a negated source, so if there are no joins on a variable this
        // source uses we need to deselect it
        for(let binding of ixer.select("binding", {source: info.sourceId})) {
          let variableId = binding["binding: variable"];
          if(ixer.select("binding", {variable: variableId}).length === 1) {
            diffs.push.apply(diffs, dispatch("removeSelectFromQuery", {variableId: variableId, viewId: localState.drawnUiActiveId}, true));
          }
        }
      break;
      case "unnegateSource":
        diffs.push(api.remove("negated source", {source: info.sourceId}));
        // since we removed all your selects when you negated the source, let's re-select them
        var sourceViewId = ixer.selectOne("source", {source: info.sourceId})["source: source view"];
        ixer.select("field", {view: sourceViewId}).forEach(function(field) {
            let fieldId = field["field: field"];
            let binding = ixer.selectOne("binding", {source: info.sourceId, field: fieldId});
            let bindingVariableId = binding["binding: variable"];
            if(!ixer.selectOne("select", {variable: bindingVariableId})) {
              diffs.push.apply(diffs, dispatch("addSelectToQuery", {variableId: bindingVariableId, name: code.name(fieldId), viewId: localState.drawnUiActiveId, allowNegated: true}, true));
            }
        });
      break;
      case "removeErrorSelection":
        // run through the given nodes and determine if they're error'd sources or error'd variables
        for(let nodeId in info.nodes) {
          let node = info.nodes[nodeId];
          if(!node.error) continue;
          if(node.type === "relationship") {
            diffs.push.apply(diffs, dispatch("removeErrorSource", {sourceId: node.id}, true));
          } else {
            diffs.push.apply(diffs, dispatch("removeErrorBinding", {variableId: info.variableId}, true));
          }
        }
        // when we remove a selection, we should clear the selection for it otherwise you end up with
        // a stale selection rect
        diffs.push.apply(diffs, dispatch("clearSelection", {}, true));
      break;
      case "removeErrorBinding":
        var totalRemoved = 0
        var bindings = ixer.select("binding", {variable: info.variableId});
        for(let binding of bindings) {
          let fieldId = binding["binding: field"];
          let sourceId = binding["binding: source"];
          if(!ixer.selectOne("field", {field: fieldId})) {
            totalRemoved++;
            diffs.push.apply(diffs, removeBinding(binding));
          }
        }
        // if we removed all the bindings, then we need to remove the variable
        if(totalRemoved === bindings.length) {
          diffs.push.apply(diffs, removeVariable(info.variableId));
        }
      break;
      case "removeErrorSource":
        diffs.push(removeSource(info.sourceId));
      break;
      //---------------------------------------------------------
      // sorting
      //---------------------------------------------------------
      case "startSort":
        var {sourceId} = info;
        localState.sorting = info;
        // if we haven't created sort fields for this before, then we create them in the
        // order that the fields of the source view are displayed in
        if(!ixer.selectOne("sorted field", {source: sourceId})) {
          let sourceViewId = ixer.selectOne("source", {source: sourceId})["source: source view"];
          let fieldIds = ixer.getFields(sourceViewId);
          let viewId = localState.drawnUiActiveId;
          let ix = 0;
          fieldIds.forEach((fieldId) => {
            if(ixer.selectOne("grouped field", {source: sourceId, field: fieldId})) { return; }
            diffs.push(api.insert("sorted field", {source: sourceId, ix, field: fieldId, direction: "ascending"}));
            ix++;
          })
        }
        var tooltip:any = {
          x: info.x,
          y: info.y,
          content: sorter,
          persistent: true,
          stopPersisting: stopSort,
        };
        dispatch("showTooltip", tooltip, true);
      break;
      case "stopSort":
        localState.sorting = false;
        dispatch("hideTooltip", {}, true);
      break;
      case "moveSortField":
        var {from, to, sourceId} = info;
        // if we haven't actually moved, then we just ignore the drop.
        if(from === to) break;
        // grab all the fields and get them in their current order
        var sorted = ixer.select("sorted field", {source: sourceId});
        sorted.sort((a, b) => {
          return a["sorted field: ix"] - b["sorted field: ix"];
        });
        // now update the orders based on inserting the moved item in its new location
        var viewId = localState.drawnUiActiveId;
        var updatedIx = 0;
        sorted.forEach((sort, ix) => {
          // we have to keep track of how far ahead we need to move, which depends on if
          // we insert to the left or right of the index we're moving to.
          let advanceBy = 1;
          // if this is the item we're moving, skip it
          if(ix === from) return;
          // if this is the item we're moving to, then we need to place it here
          if(ix === to) {
            let movedIx;
            // if we're moving from a greater location to a lesser on, we want to insert
            // to the left, which means we take the current updatedIndex, and the item that's
            // currently there will get bumped up one.
            if(from > to) {
              movedIx = updatedIx;
              updatedIx++;
            // if we're move from a lesser location to a greater one, we want to insert to the
            // right of it, which means we leave the current updatedIx alone and we take the index
            // after that. That means we need to advance the updatedIx by two, once for the moved item
            // and once for the item already at this index.
            } else {
              // go to the right
              movedIx = updatedIx + 1;
              advanceBy = 2;
            }
            let moved = sorted[from];
            // replace this field
            diffs.push(api.remove("sorted field", {source: sourceId, ix: moved["sorted field: ix"], field: moved["sorted field: field"], direction: moved["sorted field: direction"]}))
            diffs.push(api.insert("sorted field", {source: sourceId, ix: movedIx, field: moved["sorted field: field"], direction: moved["sorted field: direction"]}))
          }
          // we only replace this field if its index has actually changed
          if(sort["sorted field: ix"] !== updatedIx) {
            diffs.push(api.remove("sorted field", {source: sourceId, ix: sort["sorted field: ix"], field: sort["sorted field: field"], direction: sort["sorted field: direction"]}))
            diffs.push(api.insert("sorted field", {source: sourceId, ix: updatedIx, field: sort["sorted field: field"], direction: sort["sorted field: direction"]}))
          }
          updatedIx += advanceBy;
        });
      break;
      case "toggleSortDirection":
        var sortedField = ixer.selectOne("sorted field", {source: info.sourceId, field: info.fieldId});
        diffs.push(api.remove("sorted field", {source: info.sourceId, field: info.fieldId}));
        var direction = sortedField["sorted field: direction"] === "ascending" ? "descending" : "ascending";
        diffs.push(api.insert("sorted field", {source: info.sourceId, field: info.fieldId, ix: sortedField["sorted field: ix"], direction}))
      break;
      //---------------------------------------------------------
      // Errors
      //---------------------------------------------------------
      case "setError":
        var errorId = info.id || uuid();
        var newError: any = {text: info.errorText, time: api.now(), id: errorId};
        newError.errorTimeout = setTimeout(() => dispatch("fadeError", {errorId}), 5000);
        localState.errors[errorId] = newError;
      break;
      case "fadeError":
        var errorId = info.errorId;
        var currentError = localState.errors[errorId];
        if(!currentError) { break; }
        currentError.fading = true;
        currentError.errorTimeout = setTimeout(() => dispatch("clearError", {errorId: info.errorId}), 200);
      break;
      case "clearError":
        delete localState.errors[info.errorId];
      break;
      case "setNotice":
        var noticeId = info.id || uuid();
        var notice: any = {content: info.content, time: api.now(), id: noticeId, type: info.type || "info", duration: info.duration !== undefined ? info.duration : 2000};
        if(notice.duration !== 0) {
          notice.timeout = setTimeout(() => dispatch("fadeNotice", {noticeId}), notice.duration);
        }
        localState.notices[noticeId] = notice;
      break;
      case "fadeNotice":
        var noticeId = info.noticeId;
        var notice = localState.notices[noticeId];
        if(!notice) { break; }
        notice.fading = true;
        notice.timeout = setTimeout(() => dispatch("clearNotice", {noticeId}), info.duration || 1000);
      break;
      case "clearNotice":
        delete localState.notices[info.noticeId];
      break;
      case "gotoErrorSite":
        // open the view that contains the source of the error
        var viewForSource = ixer.selectOne("source", {source: info.sourceId})["source: view"];
        diffs.push.apply(diffs, dispatch("openItem", {itemId: viewForSource}, true));
        // select the source that is producing the error
        var {nodeLookup} = viewToEntityInfo(ixer.selectOne("view", {view: viewForSource}));
        localState.selectedNodes[info.sourceId] = nodeLookup[info.sourceId];
      break;
      case "gotoWarningSite":
        var warning = info.warning;
        var row = warning["warning: row"];
        if(warning["warning: view"] === "binding") {
          let variableId = row[0];
          // open the view that contains the variable with the error
          var viewForVariable = ixer.selectOne("variable", {variable: variableId})["variable: view"];
          diffs.push.apply(diffs, dispatch("openItem", {itemId: viewForVariable}, true));
          // select the source that is producing the error
          var {nodeLookup} = viewToEntityInfo(ixer.selectOne("view", {view: viewForVariable}));
          localState.selectedNodes[variableId] = nodeLookup[variableId];
        } else if(warning["warning: view"] === "source") {
          let [viewId, sourceId] = row;
          // open the view that contains the variable with the error
          diffs.push.apply(diffs, dispatch("openItem", {itemId: viewId}, true));
          // select the source that is producing the error
          var {nodeLookup} = viewToEntityInfo(ixer.selectOne("view", {view: viewId}));
          localState.selectedNodes[sourceId] = nodeLookup[sourceId];
        }
      break;

      //---------------------------------------------------------
      // search
      //---------------------------------------------------------
      case "updateSearch":
        localState.searchingFor = info.value;
        localState.searchResults = searchResultsFor(info.value);
      break;
      case "startSearching":
        localState.searching = true;
        var searchValue = info.value || "";
        // when we start searching, lets check if there are attributes selected and if there
        // are, go ahead and add filters to our search for them. This makes it really easy to
        // figure out what you can join those attributes on
        for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          if(node.type === "attribute") {
            searchValue += `[field: ${node.name}] `;
          }
        }
        diffs.push.apply(diffs, dispatch("updateSearch", {value: searchValue}, true));
      break;
      case "stopSearching":
        localState.searching = false;
        if(info.clear) {
          localState.searchingFor = "";
          localState.searchResults = false;
        }
      break;
      case "handleSearchKey":
        if(info.keyCode === api.KEYS.ENTER) {
          // execute whatever the first result's action is
          let currentSearchGroup = localState.searchResults[0];
          if(currentSearchGroup && currentSearchGroup.results.length) {
            let results = currentSearchGroup.results;
            currentSearchGroup.onSelect(null, {result: currentSearchGroup.results[results.length - 1]});
          }
          diffs.push.apply(diffs, dispatch("stopSearching", {}, true));
        } else if(info.keyCode === api.KEYS.ESC) {
          diffs.push.apply(diffs, dispatch("stopSearching", {clear: true}, true));
        } else if(info.keyCode === api.KEYS.F && (info.ctrlKey || info.metaKey)) {
          diffs.push.apply(diffs, dispatch("stopSearching", {}, true));
          info.e.preventDefault();
        }
      break;
      //---------------------------------------------------------
      // Tables
      //---------------------------------------------------------
      case "newTableEntry":
        var entry = {};
        var fields:any[] = ixer.getFields(localState.drawnUiActiveId);
        for(let fieldId of fields) {
          entry[fieldId] = "";
        }
        localState.tableEntry = entry;
        localState.selectedTableEntry = false;
        localState.focusedTableEntryField = fields[0];
      break;
      case "deleteTableEntry":
        var row = localState.tableEntry;
        var tableId = localState.drawnUiActiveId;
        // if the row is not empty, remove it. Otherwise we'd remove every
        // value in the table and be sad :(
        if(Object.keys(row).length) {
          diffs.push(api.remove(tableId, row, undefined, true));
        }
        diffs.push.apply(diffs, dispatch("newTableEntry", {}, true));
      break;
      case "selectTableEntry":
        localState.tableEntry = api.clone(info.row);
        localState.selectedTableEntry = info.row;
        localState.focusedTableEntryField = info.fieldId;
      break;
      case "addFieldToTable":
        var tableId = info.tableId || localState.drawnUiActiveId;
        var {fieldId, diffs} = addField(tableId);
      break;
      case "removeFieldFromTable":
        var tableId = info.tableId || localState.drawnUiActiveId;
        var fieldId = localState.activeTableEntryField;
        // we remove whatever field is currently active in the form
        if(fieldId) {
          diffs.push(api.remove("field", {field: fieldId}));
          // remove any downstream uses of this field if it's safe
          diffs.push.apply(diffs, removeDownstreamFieldUses(fieldId));
          //@HACK: We have to delay this until after the field has been processed and removed from the index, or it will be expected when converting to diffs.
          setTimeout(function() {
            dispatch("refreshTableRows", {tableId});
          }, 0);
        }
      break;
      case "refreshTableRows":
        if(info.fieldId) {
          // If we have a new field to initialize, do so.
          let changes = {};
          changes[info.fieldId] = "";
          diffs.push(api.change(info.tableId, {}, changes, false, undefined, true));
          if(localState.drawnUiActiveId === info.tableId) {
            // If we're currently editing this table, add the new field to the current tableEntry as well.
            localState.tableEntry[info.fieldId] = "";
          }
        } else if(ixer.getFields(info.tableId).length === 0) {
          // If the view has no fields, the user cannot interact with its contents, which have been collapsed into a single empty row, so remove it.
          diffs.push(api.remove(info.tableId, {}));
        }
      break;
      case "activeTableEntryField":
        // this tracks the focus state of form fields for removal
        localState.activeTableEntryField = info.fieldId;
      break;
      case "forceClearActiveTableEntryField":
        localState.activeTableEntryField = false;
      break;
      case "focusTableEntryField":
        localState.focusedTableEntryField = false;
      break;
      case "submitTableEntry":
        if(info.fieldId) {
          diffs.push.apply(diffs, dispatch("setTableEntryField", info, true));
        }
        var tableId = localState.drawnUiActiveId;
        var row = localState.tableEntry;
        if(!row || Object.keys(row).length !== ixer.getFields(tableId, true).length) { return; }
        diffs.push(api.insert(tableId, row, undefined, true));
        // if there's a selectedTableEntry then this is an edit and we should
        // remove the old row
        if(localState.selectedTableEntry) {
          diffs.push(api.remove(tableId, localState.selectedTableEntry, undefined, true));
        }
        diffs.push.apply(diffs, dispatch("newTableEntry", {}, true));
      break;
      case "setTableEntryField":
        localState.tableEntry[info.fieldId] = info.value;
        if(info.clear) {
          dispatch("forceClearActiveTableEntryField", info, true);
        }
      break;

      //---------------------------------------------------------
      // File/CSV handling
      //---------------------------------------------------------

      case "importFiles":
        for(let file of info.files) {
          diffs.push.apply(diffs, dispatch("importCsv", {file: file, hasHeader: true}));
        }
      break;
      case "updateCsv":
        if(info.file) { localState.csvFile = info.file; }
        if(info.hasHeader) { localState.csvHasHeader = info.hasHeader; }
      break;
      case "importCsv":
        var file = info.file;
        if(!file) {
          diffs = dispatch("setNotice", {content: "Must select a valid CSV file to import."}, true);
          break;
        }
        var name = file.name;
        localState.importing = true;
        // @NOTE: In order to load from a file, we *have* to parse asynchronously.
        Papa.parse(file, {
          dynamicTyping: true,
          complete: (result) => dispatch("importCsvContents", {name, result, hasHeader: info.hasHeader}),
          error: (err) => dispatch("setError", {errorText: err.message})
        });
      break;
      case "importCsvContents":
        var hasHeader = info.hasHeader;
        var result = info.result;
        var name = info.name || "Untitled import";
        for(var error of result.errors) {
          diffs.push.apply(diffs, dispatch("setError", {errorText: error.message}, true));
        }

        if(!result.data.length) { break; }
        diffs.push.apply(diffs, dispatch("createNewItem", {name, kind: "table", empty: true}));
        var tableId = localState.drawnUiActiveId;

        // Find number of columns in the CSV.
        // If the CSV has a header, use that as the canonical field count, otherwise find the maximum number of fields.
        var columns = 0;
        var names = [];
        var data = result.data;
        if(hasHeader) {
          columns = result.data[0].length;
          names = result.data[0];
          data = result.data.slice(1);
        } else {
          for(var row of result.data) {
            if(row.length > columns) {
              columns = row.length;
            }
          }
        }

        // Map record index to fieldId and create new CSV fields.
        var mapping = [];
        for(var ix = 0; ix < columns; ix++) {
          var {fieldId, diffs: fieldDiffs} = addField(tableId, names[ix], ix);
          mapping[ix] = fieldId;
          diffs.push.apply(diffs, fieldDiffs);
        }

        // @HACK: We need to wait until the new fields have been processed and old fields removed to add the data.
        setTimeout(function() {
          dispatch("importCsvData", {tableId, data, mapping});
        }, 0);
      break;
      case "importCsvData":
        localState.importing = false;
        var facts = [];
        for(var rowIx = 0; rowIx < info.data.length; rowIx++) {
          var row = info.data[rowIx];
          if(row.length > info.mapping.length) {
            diffs.push.apply(diffs, dispatch("setError", {errorText: `Row ${JSON.stringify(row)} has too many fields: ${row.length} (expected ${info.mapping.length})`}, true));
          }
          var factMap = {};
          for(var fieldIx = 0; fieldIx < info.mapping.length; fieldIx++) {
            factMap[info.mapping[fieldIx]] = (row[fieldIx] === undefined) ? "" : row[fieldIx];
          }
          facts.push(factMap);
        }
        diffs.push(api.insert(info.tableId, facts, undefined, true));
      break;

      //---------------------------------------------------------
      // Create menu
      //---------------------------------------------------------
      case "startCreating":
        localState.creating = info;
        // make sure that the tooltip isn't obstructing the creator
        var tooltip:any = {
          x: info.x,
          y: info.y,
          content: creator,
          persistent: true,
          stopPersisting: stopCreating,
        }
        dispatch("showTooltip", tooltip, true);
      break;
      case "stopCreating":
        localState.creating = false;
        dispatch("hideTooltip", {}, true);
      break;
      //---------------------------------------------------------
      // Tooltip
      //---------------------------------------------------------
      case "showButtonTooltip":
        localState.maybeShowingTooltip = true;
        var tooltip:any = {
          content: {c: "button-info", children: [
            {c: "header", text: info.header},
            {c: "description", text: info.description},
            info.disabledMessage ? {c: "disabled-message", text: "Disabled because " + info.disabledMessage} : undefined,
          ]},
          x: info.x + 5,
          y: info.y
        };
        if(!localState.tooltip) {
          localState.tooltipTimeout = setTimeout(function() {
            dispatch("showTooltip", tooltip);
          }, 500);
        } else {
          diffs = dispatch("showTooltip", tooltip, true);
        }
      break;
      case "hideButtonTooltip":
        if(localState.tooltip && localState.tooltip.persistent) return;
        clearTimeout(localState.tooltipTimeout);
        localState.maybeShowingTooltip = false;
        localState.tooltipTimeout = setTimeout(function() {
          if(!localState.maybeShowingTooltip) {
            dispatch("hideTooltip", {});
          }
        }, 10);
      break;
      case "showTooltip":
        localState.tooltip = info;
        clearTimeout(localState.tooltipTimeout);
      break;
      case "hideTooltip":
        localState.tooltip = false;
        clearTimeout(localState.tooltipTimeout);
      break;
      //---------------------------------------------------------
      // Settings
      //---------------------------------------------------------
      case "switchTab":
        localState.currentTab = info.tab;
      break;
      case "selectSave":
        localState.selectedSave = info.save;
        localState.saveFile = info.file;
      break;
      case "loadSave":
        var saveFile:File = info.file;
        if(!saveFile) {
          diffs = dispatch("setNotice", {content: "Must select an eve file to load.", type: "warn"}, true);
          break;
        }
        var reader = new FileReader();
        reader.onload = (evt) => dispatch("writeEvents", {events: evt.target["result"]});
        reader.readAsText(saveFile);
        localState.loading = "local";
      break;
      case "overwriteSave":
        var save:string = info.save;
        if(!save) {
          diffs = dispatch("setNotice", {content: "Must specify save file name.", type: "warn"}, true);
          break;
        }
        if(save.substr(-4) !== ".eve") {
          save += ".eve";
        }
        if(localState.saves.indexOf(save) === -1) {
          localState.saves.push(save);
          localStorage.setItem("saves", JSON.stringify(localState.saves));
        }
        localStorage.setItem("lastSave", save);
        commands.push(["save", save]);
        diffs = dispatch("hideTooltip", {}, true);
      break;
      case "saveToGist":
        var save:string = info.save || "unnamed.eve";
        commands.push(["get events", save]);
        localState.saving = "gist";
      break;
      case "gotEvents":
        if(localState.saving === "gist") {
          api.writeToGist(info.save, info.events, (err, url) => err ?
            dispatch("setNotice", {content: `Failed to save ${info.save} due to ${err.toString()}`, type: "error", duration: 0})
            : dispatch("remoteSaveComplete", {save: info.save, url}));
        }
      break;
      case "remoteSaveComplete":
        diffs = dispatch("setNotice", {
          content: () => {return {c: "spaced-row flex-row", children: [{text: info.save}, {text: "saved to"}, {t: "a", href: info.url, text: info.url}]}},
          duration: 0}, true);
        diffs.push.apply(diffs, dispatch("hideTooltip", {}, true));
        localState.saving = false;
      break;
      case "loadFromGist":
        let url:string = info.url;
        if(!url) break;
        url = url.replace("gist.github.com/", "gist.githubusercontent.com/");
        if(url.indexOf("gist.githubusercontent.com/") === -1) {
          diffs = dispatch("setNotice", {content: "Load from gist requires a valid gist URL.", type: "warn"});
          break;
        }
        if(url.indexOf("/raw/") === -1) {
          url += "/raw/";
        }

        api.readFromGist(url, (err, events) => err ?
          dispatch("setNotice", {content: `Failed to load ${info.url} due to ${err.toString()}`, type: "error", duration: 0})
          : dispatch("writeEvents", {events}));

        localState.loading = "gist";
      break;
      case "writeEvents":
        commands.push(["set events", info.save || "unnamed.eve", info.events]);
        diffs = dispatch("hideTooltip", {}, true);
        localState.loading = false;
      break;
      case "toggleHidden":
        var hidden = localStorage["showHidden"];
        if(hidden) {
          localStorage["showHidden"] = "";
        } else {
          localStorage["showHidden"] = "show";
        }
        diffs = dispatch("updateSearch", {value: localState.searchingFor || ""}, true);
      break;
      case "toggleTheme":
        var theme = localStorage["theme"];
        if(theme === "dark") {
          localStorage["theme"] = "light";
        } else if(theme === "light") {
          localStorage["theme"] = "dark";
        } else {
          localStorage["theme"] = "dark";
        }
      break;
      //---------------------------------------------------------
      // undo
      //---------------------------------------------------------
      case "undo":
        diffs = eveEditor.scaryUndoEvent(localState.drawnUiActiveId);
        storeEvent = false;
      break;
      case "redo":
        diffs = eveEditor.scaryRedoEvent(localState.drawnUiActiveId);
        storeEvent = false;
      break;
      default:
        console.error("Unknown dispatch:", event, info);
        break;
    }

    if(!rentrant) {
      if(diffs.length || commands.length) {
        let formatted = api.toDiffs(diffs);
        if(event === "undo" || event === "redo") {
          formatted = diffs;
        }
        if(storeEvent && formatted.length) {
          eveEditor.storeEvent(localState.drawnUiActiveId, event, formatted);
        }
        ixer.handleDiffs(formatted);
        client.sendToServer(formatted, false, commands);
        // @HACK: since we load positions up once and assume we're authorative, we have to handle
        // the case where an undo/redo can change positions without going through the normal
        // dispatch. To deal with this, we'll just reload our positions on undo and redo.
        if(event === "undo" || event === "redo") {
          loadPositions();
        }
      }
      render();
    }
    return diffs;
  }

  //---------------------------------------------------------
  // Search
  //---------------------------------------------------------

  function scoreHaystack(haystack, needle) {
    let score = 0;
    let found = {};
    let lowerHaystack = haystack.toLowerCase();
    if(needle.length === 1 && haystack === needle[0]) {
      score += 2;
    }
    for(let word of needle) {
      let ix = lowerHaystack.indexOf(word);
      if(ix === 0) {
        score += 1;
      }
      if(ix > -1) {
        score += 1;
        found[word] = ix;
      }
    }
    return {score, found};
  }

  function sortByScore(a, b) {
    let aScore = a.score.score;
    let bScore = b.score.score;
    if(aScore === bScore) {
      return b.text.length - a.text.length;
    }
    return aScore - bScore;
  }

  var availableFilters = ["field", "tag"];
  function searchResultsFor(searchValue) {
    let start = api.now();

    // search results should be an ordered set of maps that contain the kind of results
    // being provided, the ordered set of results, and a selection handler
    let searchResults = [];

    // see if there are any filters
    let filters = [];
    let normalizedSearchValue = searchValue.trim().toLowerCase();
    for(let filter of availableFilters) {
      let regex = new RegExp(`\\[${filter}:(.*?)\\]\s*`, "g");
      let origSearch = normalizedSearchValue;
      let match;
      while(match = regex.exec(origSearch)) {
        normalizedSearchValue = normalizedSearchValue.replace(match[0], "");
        filters.push({type: filter, value: match[1].trim()});
      }
    }

    let needle = normalizedSearchValue.trim().split(" ");

    let rels = searchRelations(needle, filters);
    if(rels) searchResults.push(rels);

    let glossary = searchGlossary(needle);
    if(glossary) searchResults.push(glossary);

    let end = api.now();
    if(end - start > 5) {
      console.error("Slow search (>5 ms):", end - start, searchValue);
    }
    return searchResults;
  }

  function arrayIntersect(a, b) {
    let ai = 0;
    let bi = 0;
    let result = [];
    while(ai < a.length && bi < b.length){
       if (a[ai] < b[bi] ){ ai++; }
       else if (a[ai] > b[bi] ){ bi++; }
       else {
         result.push(a[ai]);
         ai++;
         bi++;
       }
    }
    return result;
  }

  function searchRelations(needle, filters) {
    let matchingViews = [];
    let viewIds;
    //handle filters
    for(let filter of filters) {
      if(filter.type === "field") {
        // we need to only look at views with a field with the given name
        var potentialViews = [];
        ixer.select("display name", {name: filter.value}).forEach((name) => {
          let field = ixer.selectOne("field", {field: name["display name: id"]});
          if(field) {
            potentialViews.push(field["field: view"]);
          }
       });
       potentialViews.sort();
       if(!viewIds) {
          viewIds = potentialViews;
        } else {
          viewIds = arrayIntersect(viewIds, potentialViews);
        }
      } else if(filter.type === "tag") {
        // we only look at views with the given tag
        let tagged = ixer.select("tag", {tag: filter.value});
        if(!viewIds) {
          viewIds = [];
          tagged.forEach((tag) => {
            viewIds.push(tag["tag: view"]);
          });
          viewIds.sort();
        } else {
          let taggedIds = tagged.map((tag) => tag["tag: view"]).sort();
          viewIds = arrayIntersect(viewIds, taggedIds);
        }
      }
    }

    if(!filters.length) {
      viewIds = ixer.select("view", {}).map((view) => view["view: view"]);
    }

    for(let viewId of viewIds) {
      if(!localStorage["showHidden"] && ixer.selectOne("tag", {view: viewId, tag: "hidden"})) {
        continue;
      }
      let name = code.name(viewId);
      let score = scoreHaystack(name, needle);
      if(score.score) {
        let description = ixer.selectOne("view description", {view: viewId});
        if(description) {
          description = description["view description: description"];
        } else {
          description = "No description :(";
        }
        matchingViews.push({text: name, viewId, score, description});
      }
    }
    matchingViews.sort(sortByScore);
    let currentView = ixer.selectOne("view", {view: localState.drawnUiActiveId});
    return {kind: "Sources", results: matchingViews, onSelect: (e, elem) => {
      if(localState.drawnUiActiveId !== "itemSelector" && currentView["view: kind"] === "join") {
        dispatch("addViewAndMaybeJoin", {viewId: elem.result.viewId});
      } else {
        dispatch("openItem", {itemId: elem.result.viewId})
      }
    }};
  }

  function searchGlossary(needle) {
    let matchingTerms = [];
    for(let term of glossary.terms) {
      let score = scoreHaystack(term.term, needle);
      if(score.score) {
        matchingTerms.push({text: term.term, description: term.description, score});
      }
    }
    matchingTerms.sort(sortByScore);
    return {kind: "Glossary", results: matchingTerms, onSelect: () => { console.log("selected glossary item")}};
  }

  //---------------------------------------------------------
  // AST to nodes
  //---------------------------------------------------------

  function viewToEntityInfo(view) {
    if(view["view: kind"] === "join") {
      return joinToEntityInfo(view);
    } else if(view["view: kind"] === "table") {
      return tableToEntityInfo(view);
    } else {
      let nodes = [];
      let links = [];
      let nodeLookup = {};
      return {nodeLookup, nodes, links}
    }
  }

  function joinToEntityInfo(view) {
    // This translates our normalized AST into a set of denomralized graphical nodes.
    var nodes = [];
    var nodeLookup = {};
    var constraints = [];
    var links = [];
    let viewId = view["view: view"];
    // first go through each source for this query and determine if it's a primitive
    // or a normal table/query
    for(var source of ixer.select("source", {view: viewId})) {
      var sourceViewId = source["source: source view"];
      var sourceView = api.ixer.selectOne("view", {view: sourceViewId});
      var sourceId = source["source: source"];
      // if this is not a primitive, we have a standard relationship and need to check
      // for chunking, ordinals, and negation
      if(!sourceView || sourceView["view: kind"] !== "primitive") {
        var isRel = true;
        var curRel:any = {type: "relationship", source: source, id: sourceId, name: code.name(sourceViewId)};
        if(!sourceView) {
          curRel.error = "This table no longer exists";
        }
        nodes.push(curRel);
        nodeLookup[curRel.id] = curRel;
        if(ixer.selectOne("chunked source", {source: sourceId})) {
          curRel.chunked = true;
        }
        if(ixer.selectOne("ordinal binding", {source: sourceId})) {
          curRel.hasOrdinal = true;
        }
        if(ixer.selectOne("negated source", {source: sourceId})) {
          curRel.isNegated = true;
        }
      } else {
        // otherwise we have a primitive view, which is basically like a function in Eve
        var curPrim: any = {type: "primitive", sourceId: sourceId, primitive: sourceViewId, name: code.name(sourceViewId)};
        curPrim.id = curPrim.sourceId;
        nodes.push(curPrim);
        nodeLookup[curPrim.id] = curPrim;
      }
    }

    // A variable is the other "node" on the canvas. Variables can have multiple bindings,
    // filters, errors, and grouping. We also have to handle ordinals and constant-only
    // variables specially here.
    let variables = ixer.select("variable", {view: view["view: view"]});
    for(let variable of variables) {
      let variableId = variable["variable: variable"];
      let bindings = ixer.select("binding", {variable: variableId});
      let constants = ixer.select("constant binding", {variable: variableId});
      let ordinals = ixer.select("ordinal binding", {variable: variableId});
      let attribute:any = {type: "attribute", id: variableId, variable: variableId};

       // if we have bindings, this is a normal attribute and we go through to create
       // links to the sources and so on.
      if(bindings.length) {
        let entity = undefined;
        let name = "";
        let singleBinding = bindings.length === 1;

        // create any ordinal links as necessary
        for(let ordinal of ordinals) {
          let sourceNode = nodeLookup[ordinal["ordinal binding: source"]];
          if(sourceNode) {
            let link: any = {left: attribute, right: sourceNode, name: "ordinal"};
            links.push(link);
          }
          name = "ordinal";
        }

        // see if this variable has been selected
        let select = ixer.selectOne("select", {variable: variableId});

        // check if this variable has been given a name
        let variableName = code.name(variableId);

        // run through the bindings once to determine if it's an entity, what it's name is,
        // and all the other properties of this node.
        for(let binding of bindings) {
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          let field = ixer.selectOne("field", {field: fieldId});
          let sourceNode = nodeLookup[sourceId];
          if(!field) {
            name = code.name(fieldId);
            if(sourceNode && sourceNode.error) attribute.sourceError = true;
            attribute.error = `${name} no longer exists.`;
            continue;
          }
          let fieldKind = field["field: kind"];
          // we don't really want to use input field names as they aren't descriptive.
          // so we set the name only if this is an output or there isn't a name yet
          if(fieldKind === "output" || !name) {
            name = code.name(fieldId);
          }
          // if it's a single binding and it's an input then this node is an input
          if(singleBinding && fieldKind !== "output") {
            attribute.isInput = true;
            attribute.inputKind = fieldKind;
          }
          let grouped = ixer.selectOne("grouped field", {source: sourceId, field: fieldId});
          if(grouped) {
            attribute.grouped = true;
          }
          if(sourceNode) {
            attribute.sourceChunked = attribute.sourceChunked || sourceNode.chunked;
            attribute.sourceHasOrdinal = attribute.sourceHasOrdinal || sourceNode.hasOrdinal;
            attribute.sourceNegated = attribute.sourceNegated || sourceNode.isNegated;
          }
        }


        // the final name of the node is either the variable's name, the name of the entity represented,
        // or the first bound name we found
        name = variableName || entity || name;
        // now that it's been named, go through the bindings again and create links to their sources
        for(let binding of bindings) {
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          let sourceNode = nodeLookup[sourceId];
          let link: any = {left: attribute, right: sourceNode};
          let fieldName = code.name(fieldId);
          if(attribute.error) {
            link.isError = true;
          }
          if(fieldName !== name) {
            link.name = fieldName;
          }
          links.push(link);
        }
        attribute.name = name;
        attribute.mergedAttributes = bindings.length + ordinals.length > 1 ? bindings : undefined;
        attribute.entity = entity;
        attribute.select = select;
        for(var constant of constants) {
          attribute.filter = {operation: "=", value: constant["constant binding: value"]};
        }
      } else if(constants.length) {
        // some variables are just a constant
        attribute.name = "constant binding";
        attribute.filter = {operation: "=", value: constants[0]["constant binding: value"]};
      } else if(ordinals.length) {
        // we have to handle ordinals specially since they're a virtual field on a table
        attribute.isOrdinal = true;
        attribute.name = "ordinal";
        attribute.select = ixer.selectOne("select", {variable: variableId});
        attribute.mergedAttributes = ordinals.length > 1 ? ordinals : undefined;
        for(let ordinal of ordinals) {
          let sourceNode = nodeLookup[ordinal["ordinal binding: source"]];
          if(sourceNode) {
            let link: any = {left: attribute, right: sourceNode, name: "ordinal"};
            links.push(link);
          }
        }
      } else {
        attribute.name = "unknown variable";
      }
      nodeLookup[attribute.id] = attribute;
      nodes.push(attribute);
    }

    return {nodes, links, nodeLookup};
  }

  function tableToEntityInfo(view) {
    var nodes = [];
    var links = [];
    let nodeLookup = {};
    return {nodes, links, nodeLookup};
  }

  //---------------------------------------------------------
  // Node display and positioning information
  //---------------------------------------------------------

  function nodeDisplayInfo(curNode) {
    let text = curNode.name.toString();
    let small = false;
    let {left, top} = positions[curNode.id] || {};
    let height = nodeHeight + 2 * nodeHeightPadding;
    let width = Math.max(text.length * nodeWidthMultiplier + 2 * nodeWidthPadding, nodeWidthMin);
    let right = left + width;
    let bottom = top + height;
    let filterWidth = 0;
    if(curNode.filter && curNode.inputKind !== "vector input") {
      filterWidth = Math.max(curNode.filter.value.toString().length * nodeWidthMultiplier + 25, nodeWidthMin);
      // subtract the 15 pixel overlap that occurs between nodes and their filters
      right += filterWidth - 15;
    }
    if(small) {
      width = Math.max(text.length * nodeSmallWidthMultiplier + nodeWidthPadding, nodeWidthMin);
    }
    return {left, top, right, bottom, width, height, text, filterWidth, totalWidth: (curNode.filter ? width + filterWidth - 15 : width), totalHeight: height};
  }

  function refreshNodePositions(nodes, links) {
    let sourceNodes:graphLayout.Node[] = [];
    let attributeNodes:graphLayout.Node[] = [];
    let dirty = false;
    for(let node of nodes) {
      let displayInfo = nodeDisplayInfo(node);
      let width = displayInfo.totalWidth + 10;
      let height = displayInfo.totalHeight + 10;
      let graphNode:graphLayout.Node = {id: node.id, type: node.type, width, height };
      if(displayInfo.left !== undefined && displayInfo.top !== undefined) {
        graphNode.x = displayInfo.left + width / 2;
        graphNode.y = displayInfo.top + height / 2;
      } else {
        dirty = true;
      }
      if(node.type === "relationship" || node.type === "primitive") {
        sourceNodes.push(graphNode);
      } else if(node.type === "attribute") {
        attributeNodes.push(graphNode);
      } else {
        console.warn("unhandled node type:", node.type);
      }
    }

    if(dirty) {
      let edges:graphLayout.Edge[] = [];
      for(let link of links) { // Right is source, left is attribute.
        edges.push({source: link.right.id, target: link.left.id});
      }
      // This placeholder ensures that graph nodes are not placed directly on top of the title/description of the query.
      // @Hack: Height is fixed but width is not, we need some way of sampling it.
      sourceNodes.push({id: "placeholder 1", type: "placeholder", width: 256, height: 64, x: 5, y: 5});

      let graph = new graphLayout.Graph(sourceNodes, attributeNodes, edges, [480, 360]);
      let layout = graph.layout();
      let nodesToInitialize = [];
      for(let node of nodes) {
        let p = layout.positions[node.id];
        let s = layout.sizes[node.id];
        let neue = {left: p[0] - s[0] / 2, top: p[1] - s[1] / 2};
        let old = positions[node.id];
        if(!old || old.left !== neue.left || old.top !== neue.top) {
          positions[node.id] = neue;
          nodesToInitialize.push(node);

        }
      }
      dispatch("initializeNodePositions", {nodes: nodesToInitialize});
    }
  }

  function surfaceRelativeCoords(e) {
    let surface:any = document.getElementsByClassName("query-editor")[0];
    let surfaceRect = surface.getBoundingClientRect();
    let x = e.clientX - surfaceRect.left + surface.scrollLeft;
    let y = e.clientY - surfaceRect.top + surface.scrollTop;
    return {x, y};
  }

  //---------------------------------------------------------
  // root component
  //---------------------------------------------------------

  export function root() {
    var page:any;
    let viewId = localState.drawnUiActiveId;
    if(viewId !== "itemSelector") {
      let viewKind = ixer.selectOne("view", {view: viewId})["view: kind"];
      if(viewKind === "join") {
        page = queryUi(viewId, true);
      } else if(viewKind === "table") {
        page = tableUi(viewId);
      } else if(viewKind === "union") {
        console.error("TODO: implement union view");
        page = itemSelector();
      }

    } else {
      page = itemSelector();
    }
    return {id: "root", c: localStorage["theme"] || "light", children: [tooltipUi(), notice(), page]};
  }

  //---------------------------------------------------------
  // Item selector component
  //---------------------------------------------------------

    function itemSelector() {
    let viewIds;
    let searching = false;
    let totalCount = visibleItemCount();
    if(localState.searchingFor && localState.searchResults && localState.searchResults.length) {
      viewIds = localState.searchResults[0].results.map((searchResult) => searchResult.viewId);
      searching = true;
    } else {
      viewIds = ixer.select("view", {}).map((view) => view["view: view"]);
    }
    let queries = [];
    viewIds.forEach((viewId) : any => {
      let view = ixer.selectOne("view", {view: viewId});
      let kind = view["view: kind"];
      if(!searching && !localStorage["showHidden"] && ixer.selectOne("tag", {view: viewId, tag: "hidden"})) {
        return;
      }
      if(kind === "join") {
        return queries.push(queryItem(view));
      }
      if(kind === "table") {
        return queries.push(tableItem(view["view: view"]));
      }
    });
    let actions = {
      "new": {func: startCreating, text: "New", semantic: "action::addItem", description: "Add a new query or set of data."},
      "import": {func: openImporter, text: "Import", semantic: "action::importItem"},
      "delete": {func: removeSelectedItems, text: "Delete", semantic: "action::removeItem", description: "Delete an item from the database."},
    };
    let disabled = {};
    // if nothing is selected, then remove needs to be disabled
    if(!Object.keys(localState.selectedItems).length) {
      disabled["delete"] = "no items are selected to be removed. Click on one of the cards to select it.";
    }
    return {c: "query-selector-wrapper", semantic: "pane::itemSelector", children: [
      leftToolbar(actions, disabled),
      {c: "query-selector-body", click: clearSelectedItems, children: [
        {c: "query-selector-filter", children: [
          searching ? {c: "searching-for", children: [
            {text: `Searching for`},
            {c: "search-text", text: localState.searchingFor},
          ]} : undefined,
          queries.length === totalCount ? {c: "showing", text: `Showing all ${totalCount} items`} : {c: "showing", text: `found ${queries.length} of ${totalCount} items.`},
          searching ? {c: "clear-search ion-close", clearSearch: true, click: stopSearching} : undefined,
        ]},
        (totalCount > 0) ?
          {c: "query-selector", children: queries}
          : {c: "full-flex flex-center", children: [
            {c: "flex-row spaced-row", children: [
              {text: "Click"}, {t: "button", c: "button", text: "New", click: startCreating}, {text: "or"},
              {t: "button", c: "button", text: "Import", click: openImporter}, {text: "to begin working with Eve"}
            ]}
          ]}
      ]}
    ]};
  }

  function visibleItemCount() {
    let allViews = ixer.select("view", {});
    let totalCount = allViews.length;
    // hidden views don't contribute to the count
    if(!localStorage["showHidden"]) {
      totalCount -= ixer.select("tag", {tag: "hidden"}).length
    }
    // primtive views don't contribute to the count
    totalCount -= ixer.select("view", {kind: "primitive"}).length;
    return totalCount;
  }

  function clearSelectedItems(e, elem) {
    dispatch("clearSelectedItems", {});
  }

  function removeSelectedItems(e, elem) {
    dispatch("removeSelectedItems", {})
  }


  function queryItem(view) {
    let viewId = view["view: view"];
    let entityInfo = viewToEntityInfo(view);
    refreshNodePositions(entityInfo.nodes, entityInfo.links);
    let boundingBox = nodesToRectangle(entityInfo.nodes);
    // translate the canvas so that the top left corner is the top left corner of the
    // bounding box for the nodes
    let xTranslate = -boundingBox.left;
    let yTranslate = -boundingBox.top;
    let scale;
    // scale the canvas so that it matches the size of the preview, preserving the aspect-ratio.
    if(boundingBox.width > previewWidth || boundingBox.height > previewHeight) {
      scale = Math.min(previewWidth / boundingBox.width, previewHeight / boundingBox.height);
    } else {
      scale = 0.7;
    }
    let selected = localState.selectedItems[viewId] ? "selected" : "";
    return {c: `query-item ${selected}`, semantic: "item::query", id: viewId, itemId: viewId, click: selectItem, dblclick: openItem, children:[
      {c: "query-name", text: code.name(viewId)},
      // {c: "query-description", text: getDescription(viewId)},
      {c: "query", children: [
        {c: "container", children: [
          {c: "surface", transform:`scale(${scale}, ${scale}) translate(${xTranslate}px, ${yTranslate}px) `, children: [
            queryPreview(view, entityInfo, boundingBox)
          ]},
        ]}
      ]}
    ]};
  }

  function selectItem(e, elem) {
    e.stopPropagation();
    dispatch("selectItem", {itemId: elem.itemId, shiftKey: e.shiftKey});
  }

  function openItem(e, elem) {
    dispatch("openItem", {itemId: elem.itemId});
  }

  //---------------------------------------------------------
  // Left toolbar component
  //---------------------------------------------------------

  export function leftToolbar(actions, disabled = {}, extraKeys = {}) {
    var tools = [];
    let postSpacer = [];
    for(let actionName in actions) {
      let action = actions[actionName];
      let description = action.description;
      if(glossary.lookup[action.text]) {
        description = glossary.lookup[action.text].description;
      }

      if(!action.semantic) { throw new Error("action:" + JSON.stringify(action) + " needs a semantic attribute."); }
      let tool = {c: "tool", text: action.text, semantic: action.semantic, mouseover: showButtonTooltip, mouseout: hideButtonTooltip, description};
      if(action["icon"]) {
        tool.text = undefined;
        tool["title"] = action.text;
        tool.c = `${tool.c} ${action["icon"]}`;
      }
      for(var extraKey in extraKeys) {
        tool[extraKey] = extraKeys[extraKey];
      }
      if(!disabled[actionName]) {
        // due to event ordering issues, sometimes you need this to take effect on mousedown instead of
        // waiting for the click timeout to happen
        let event = action.useMousedown ? "mousedown" : "click";
        tool[event] = action.func;
      } else {
        tool["c"] += " disabled";
        tool["disabledMessage"] = disabled[actionName];
      }
      if(action["postSpacer"]) {
        postSpacer.push(tool);
      } else {
        tools.push(tool);
      }
    }
    // add a spacer to push the rest of the tools to bottom
    tools.push({c: "flex-spacer"})
    // append all the post spacer tools
    for(let tool of postSpacer) {
      tools.push(tool);
    }

    // add the search button
    tools.push({c: "tool ion-ios-search-strong",
                title: "Search",
                semantic: "action::search",
                mouseover: showButtonTooltip,
                mouseout: hideButtonTooltip,
                click: startSearching,
                description: "Search for items to open by name."})

    // add the settings at the very end
    tools.push({c: "tool ion-gear-b",
                title: "Settings",
                semantic: "action::settings",
                mouseover: showButtonTooltip,
                mouseout: hideButtonTooltip,
                click: openSettings,
                description: "Open Eve's settings panel"})

    return {c: "left-side-container", children: [
      {c: "left-toolbar", children: tools},
      querySearcher()
    ]};
  }

  function showButtonTooltip(e, elem) {
    let rect = e.currentTarget.getBoundingClientRect();
    dispatch("showButtonTooltip", {header: elem.text || elem.title, disabledMessage: elem.disabledMessage, description: elem.description, x: rect.right, y: rect.top} );
  }

  function hideButtonTooltip(e, elem) {
    dispatch("hideButtonTooltip", {});
  }

  //---------------------------------------------------------
  // Settings component
  //---------------------------------------------------------

  function openSettings(evt, elem:Element) {
    let tooltip:any = {
      c: "centered-modal settings-modal tabbed-modal",
      content: settingsPanel,
      persistent: true,
      stopPersisting: closeTooltip
    };
    dispatch("showTooltip", tooltip);
  }

  function closeTooltip(evt, elem) {
    dispatch("hideTooltip", {});
  }

  let settingsPanes:ui.Pane[] = [
    {
      id: "save",
      title: "Save",
      content: function() {
        let saves = localState.saves || [];
        let selected = localState.selectedSave;
        return {semantic: "pane::save", children: [

          (saves.length ? {children: [
            {t: "h3", text: "Recent"},
            {c: "saves", children: saves.map((save) => { return {
              c: (save === selected) ? "selected" : "",
              text: save,
              save: save,
              click: selectSave,
              dblclick: overwriteSave
            }})}
          ]} : undefined),
          {c: "input-row", children: [
            {c: "label", text: "File name"},
            {t: "input", type: "text", input: setSaveLocation, value: localState.selectedSave},
          ]},
          {c: "flex-row", children: [
            {c: "button", text: "Save to gist (remote)", click: saveToGist},
            {c: "button", text: "Save to file (local)", click: overwriteSave},
          ]}
        ]};
      }
    },
    {
      id: "load",
      title: "Load",
      content: function() {
        let saves = localState.saves || [];
        let selected = localState.selectedSave;
        return {semantic: "pane::load", children: [
          {c: "input-row", children: [
            {c: "label", text: "url"},
            {t: "input", type: "text", input: setSaveLocation, value: localState.selectedSave},
            {c: "button", text: "Load from gist (remote)", click: loadFromGist}
          ]},
          {c: "input-row", children: [
            {t: "input", type: "file", change: setSaveFile},
            {c: "button", text: "Load from file (local)", click: loadSave},
          ]}
        ]};
      }
    },
    {
      id: "preferences",
      title: "Preferences",
      content: () => {
        let showHidden;
        if(localStorage["showHidden"]) {
          showHidden = {c: "button", click: toggleHidden, text: "Hide hidden"};
        } else {
          showHidden = {c: "button", click: toggleHidden, text: "Show hidden"};
        }
        let theme;
        let curTheme = localStorage["theme"];
        if(curTheme === "dark") {
          theme = {c: `button ${curTheme}`, click: toggleTheme, text: "Light"};
        } else {
          theme = {c: `button ${curTheme}`, click: toggleTheme, text: "Dark"};
        }
        return {c: "preferences", semantic: "pane::preferences", children: [
          theme,
          showHidden,
        ]};
      }
    }
  ];

  function toggleHidden(e, elem) {
    dispatch("toggleHidden", {});
  }

  function toggleTheme(e, elem) {
    dispatch("toggleTheme", {});
  }

  function settingsPanel() {
    return ui.tabbedBox(
      {id: "settings-pane", semantic: "pane::settings", defaultTab: "preferences", panes: settingsPanes, controls: [{c: "ion-close tab", click: closeTooltip}]}
    );
  }

  function switchTab(evt, elem) {
    dispatch("switchTab", {tab: elem.tab});
  }

  function selectSave(evt, elem) {
    dispatch("selectSave", {save: elem.save});
  }

  function setSaveLocation(evt, elem) {
    dispatch("selectSave", {save: evt.currentTarget.value});
  }

  function setSaveFile(evt, elem) {
    dispatch("selectSave", {file: evt.target.files[0]});
  }

  function overwriteSave(evt, elem) {
    dispatch("overwriteSave", {save: localState.selectedSave});
  }

  function loadSave(evt, elem) {
    dispatch("loadSave", {file: localState.saveFile});
  }

  function saveToGist(evt, elem) {
    dispatch("saveToGist", {save: localState.selectedSave})
  }

  function loadFromGist(evt, elem) {
    dispatch("loadFromGist", {url: localState.selectedSave})
  }

  //---------------------------------------------------------
  // Tooltip component
  //---------------------------------------------------------

  export function tooltipUi(): any {
    let tooltip = localState.tooltip;
    if(tooltip) {
      let viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
       // @FIXME: We need to get the actual element size here.
      let elem:any = {c: "tooltip" + (tooltip.c ? " " + tooltip.c : ""), left: tooltip.x, top: tooltip.y};
      if(typeof tooltip.content === "string") {
        elem["text"] = tooltip.content;
      } else if(typeof tooltip.content === "function") {
        elem["children"] = [tooltip.content()];
      } else {
        elem["children"] = [tooltip.content];
      }
      if(tooltip.persistent) {
        return {id: "tooltip-container", c: "tooltip-container", children: [
          {c: "tooltip-shade", mousedown: tooltip.stopPersisting},
          elem,
        ]};
      }
      return elem;
    }
  }

  //---------------------------------------------------------
  // Notice component
  //---------------------------------------------------------

  export function notice() {
    let noticeItems = [];
    for(let noticeId in localState.notices) {
      let notice = localState.notices[noticeId];
      noticeItems.push({c: `flex-row spaced-row notice ${notice.type} ${notice.fading ? "fade" : ""}`, time: notice.time, children: [
        (typeof notice.content === "function") ? notice.content() :
          {text: notice.content},
          {c: "flex-spacer", height: 0},
          {c: "btn ion-close", noticeId: noticeId, click: closeNotice}
      ]});
    }
    noticeItems.sort((a, b) => b.time - a.time);
    return {c: "notices", children: noticeItems};
  }

  function closeNotice(evt, elem) {
    dispatch("fadeNotice", {noticeId: elem.noticeId, duration: 400});
  }

  //---------------------------------------------------------
  // Creator component
  //---------------------------------------------------------

  function startCreating(e, elem) {
    let rect = e.currentTarget.getBoundingClientRect();
    dispatch("startCreating", {x: rect.right + 10, y: rect.top});
  }

  function stopCreating(e, elem) {
    dispatch("stopCreating", {});
  }

  function creator() {
    return {c: "creator", semantic: "pane::addItem", children: [
      {c: "header", text: "New"},
      {c: "description", text: "Select a kind of item to create."},
      {c: "types", children: [
        {c: "type-container", children: [
          {c: "type", text: "Data", semantic: "action::addDataItem", click: createNewItem, kind: "table", newName: "New table!"},
          {text: glossary.lookup["Data"].description}
        ]},
        {c: "type-container", children: [
          {c: "type", text: "Query", semantic: "action::addQueryItem", click: createNewItem, kind: "join", newName: "New query!"},
          {text: glossary.lookup["Query"].description}
        ]},
        // {c: "type-container", children: [
          // {c: "type", text: "Union", click: createNewItem, kind: "union", newName: "New union!"},
          // {text: "Create a union if you want to merge a bunch of different queries or data sets together."},
        // ]},
      ]}
    ]};
  }

  function createNewItem(e, elem) {
    dispatch("createNewItem", {name: elem.newName, kind: elem.kind});
  }

  function openImporter(evt, elem) {
    let tooltip:any = {
      c: "centered-modal importer-modal tabbed-modal",
      content: importPanel,
      persistent: true,
      stopPersisting: closeTooltip
    };
    dispatch("showTooltip", tooltip);
  }

  let importPanes:ui.Pane[] = [
    {id: "csv", title: "CSV", content: function() {
      return {semantic: "pane::csv", children: [
        {t: "input", type: "file", change: updateCsvFile},
        {c: "flex-row spaced-row", children: [
          {text: "Treat first row as header"},
          {t: "input", type: "checkbox", change: updateCsvHasHeader}
        ]},
        {c: "button", text: "Import", click: importFromCsv}
      ]};
    }}
  ];

  function importPanel() {
    return ui.tabbedBox(
      {id: "import-pane", semantic: "pane::import", defaultTab: "csv", panes: importPanes, controls: [{c: "ion-close tab", click: closeTooltip}]}
    );
  }

  function updateCsvFile(evt, elem) {
    let file = evt.target.files[0];
    dispatch("updateCsv", {file});
  }

  function updateCsvHasHeader(evt, elem) {
    let hasHeader = !!evt.target.checked;
    dispatch("updateCsv", {hasHeader});
  }

  function importFromCsv(evt, elem) {
    evt.stopPropagation();
    dispatch("importCsv", {file: localState.csvFile, hasHeader: localState.csvHasHeader});
  }

  //---------------------------------------------------------
  // Query preview component
  //---------------------------------------------------------

  function queryPreview(view, entityInfo, boundingBox) {
    let viewId = view["view: view"];
    let {nodes, links} = entityInfo;
    var items = [];
    for(var node of nodes) {
      items.push(nodeItem(node, viewId));
    }
    let linkItems = drawLinks(links, items);
    return {c: "canvas", children: [
      {c: "links", svg: true, width: boundingBox.right, height: boundingBox.bottom, t: "svg", children: linkItems},
      {c: "nodes", children: items}
    ]};
  }

  //---------------------------------------------------------
  // Query editor component
  //---------------------------------------------------------

  function queryUi(viewId, showResults = false) {
    var view = ixer.selectOne("view", {view: viewId});
    if(!view) return;
    let entityInfo = viewToEntityInfo(view);
    refreshNodePositions(entityInfo.nodes, entityInfo.links);
    let description = "No description :(";
    let viewDescription = ixer.selectOne("view description", {view: viewId});
    if(viewDescription) {
      description = viewDescription["view description: description"];
    }
    return {c: "workspace query-workspace", semantic: "pane::queryEditor", children: [
      localState.drawnUiActiveId !== "itemSelector" ? queryTools(view, entityInfo) : undefined,
      {c: "container", children: [
        {c: "surface", children: [
          {c: "query-editor", children: [
            {c: "query-name-input", contentEditable: true, blur: rename, renameId: viewId, text: code.name(viewId)},
            {c: "query-description-input", contentEditable: true, blur: setQueryDescription, viewId, text: description},
            queryCanvas(view, entityInfo),
          ]},
          queryErrors(view),
        ]},
        showResults ? queryResults(viewId, entityInfo) : undefined
      ]}
    ]};
  }

  function queryCanvas(view, entityInfo) {
    let viewId = view["view: view"];
    let {nodes, links, nodeLookup} = entityInfo;
    let queryBoundingBox = nodesToRectangle(nodes);

    var items = [];
    for(var node of nodes) {
      items.push(nodeItem(node, viewId));
    }
    let linkItems = drawLinks(links, items);
    let selection;
    if(localState.selecting) {
      let {start, end} = localState.boxSelection;
      if(end) {
        let topLeft = {x: start.x, y: start.y};
        let width = Math.abs(end.x - start.x);
        let height = Math.abs(end.y - start.y);
        if(end.x < start.x) {
          topLeft.x = end.x;
        }
        if(end.y < start.y) {
          topLeft.y = end.y;
        }
        selection = {svg: true, c: "selection-rectangle", t: "rect", x: topLeft.x, y: topLeft.y, width, height};
      }
    } else {
      let selectedNodeIds = Object.keys(localState.selectedNodes);
      if(selectedNodeIds.length) {
        let {top, left, width, height} = nodesToRectangle(selectedNodeIds.map((nodeId) => nodeLookup[nodeId]).filter((node) => node));
        selection = {svg: true, c: "selection-rectangle", t: "rect", x: left - 10, y: top - 10, width: width + 20, height: height + 20};
      }
    }

    // if there are no items to show on the canvas, add a call to action
    if(!items.length) {
      items.push({c: "no-nodes flex-row spaced-row", click: startSearching, children: [
        {c: "icon ion-ios-search-strong"},
        {text: "Search to add a new source"}
      ]})
    }

    // the minimum width and height of the canvas is based on the bottom, right of the
    // bounding box of all the nodes in the query
    let boundingWidth = queryBoundingBox.right + 200;
    let boundingHeight = queryBoundingBox.bottom + 200;
    return {c: "canvas", mousedown: startBoxSelection, mousemove: continueBoxSelection, mouseup: endBoxSelection, dragover: preventDefault, children: [
      {c: "selection", svg: true, width: boundingWidth, height: boundingHeight, t: "svg", children: [selection]},
      {c: "links", svg: true, width: boundingWidth, height: boundingHeight, t: "svg", children: linkItems},
      {c: "nodes", width: boundingWidth, height: boundingHeight, children: items},
      peek(viewId, entityInfo),
    ]};
  }

  function drawLinks(links, items) {
    let collapsedLinks = {};
    for(let link of links) {
      let key = `${link.right.id} ${link.left.id}`;
      if(collapsedLinks[key]) {
        collapsedLinks[key].count++;
        if(link.name) {
          collapsedLinks[key].labels.push(link.name);
        }
      } else {
        let labels = link.name ? [link.name] : [];
        collapsedLinks[key] = {left: link.left, right: link.right, count: 1, labels}
      }
    }
    var linkItems = [];
    for(let key in collapsedLinks) {
      let link = collapsedLinks[key];
      var leftItem, rightItem;
      for(var item of items) {
        if(item.node === link.left) {
          leftItem = item;
          break;
        }
      }
      for(var item of items) {
        if(item.node === link.right) {
          rightItem = item;
          break;
        }
      }

      if(leftItem.left <= rightItem.left) {
      var fromLeft = leftItem.left + (leftItem.size.width / 2);
        var fromTop = leftItem.top + (leftItem.size.height / 2);
        var toLeft = rightItem.left + (rightItem.size.width / 2);
        var toTop = rightItem.top + (rightItem.size.height / 2);
      } else {
        var fromLeft = rightItem.left + (rightItem.size.width / 2);
        var fromTop = rightItem.top + (rightItem.size.height / 2);
        var toLeft = leftItem.left + (leftItem.size.width / 2);
        var toTop = leftItem.top + (leftItem.size.height / 2);
      }
      var color = "#bbb";
      if(link.isError) {
        color = "#bb5555";
      }
      var d = `M ${fromLeft} ${fromTop} L ${toLeft} ${toTop}`;

      var pathId = `${key} path`;
      linkItems.push({svg: true, id: pathId, t: "path", d: d, c: "link", stroke: color, strokeWidth: 1});
      if(link.labels.length) {
        linkItems.push({svg: true, t: "text", children: [
          {svg: true, t: "textPath", startOffset: "50%", xlinkhref: `#${pathId}`, children: link.labels.map((label, ix) => {
            return {svg: true, t: "tspan", dy: ix === 0 ? -2 : 14, x: 0, text: label}; })}
        ]});
      }
    }
    return linkItems;
  }

  function startBoxSelection(e, elem) {
    let coords = surfaceRelativeCoords(e);
    dispatch("startBoxSelection", {coords, shiftKey: e.shiftKey});
  }

  function continueBoxSelection(e, elem) {
    if(!localState.selecting || (e.clientX === 0 && e.clientY === 0)) return;
    dispatch("continueBoxSelection", surfaceRelativeCoords(e));
  }

  function endBoxSelection(e, elem) {
    dispatch("endBoxSelection", {});
  }

  function clearCanvasSelection(e, elem) {
    if(e.target === e.currentTarget && !e.shiftKey) {
      dispatch("clearSelection", {});
    }
  }

  //---------------------------------------------------------
  // Node component
  //---------------------------------------------------------

  function nodeItem(curNode, viewId): any {
    var content = [];
    var uiSelected = localState.selectedNodes[curNode.id];
    var overlapped = localState.overlappingNodes[curNode.id];
    var klass = "";
    if(uiSelected) {
      klass += " uiSelected";
    }
    if(curNode.select) {
      klass += " projected";
    }
    if(overlapped) {
      klass += " overlapped";
    }
    if(curNode.chunked) {
      klass += " chunked";
    }
    if(curNode.isNegated) {
      klass += " negated";
    }
    if(curNode.error) {
      klass += " error";
      // if the whole source is an error, don't bother showing actions to remove individual
      // fields, just show it on the source
      if(!curNode.sourceError) {
        let action = removeErrorBinding;
        if(curNode.type === "relationship") {
          action = removeErrorSource;
        }
        content.push({c: "error-description", children: [
          {text: curNode.error},
          {c: "button", node: curNode, text: "remove", click: action},
        ]});
      }
    }
    if((curNode.sourceChunked && !curNode.grouped) || curNode.inputKind === "vector input") {
      klass += " column";
    }
    klass += ` ${curNode.type}`;
    if (curNode.entity !== undefined) {
      klass += " entity";
    }
    var {left, top, width, height, text, filterWidth} = nodeDisplayInfo(curNode);
    if (curNode.filter && curNode.inputKind !== "vector input" && !curNode.error) {
      var op = curNode.filter.operation;
      let filterIsBeingEdited = localState.modifyingFilterNodeId === curNode.id;
      var filterUi:any = {c: "attribute-filter", dblclick: modifyFilter, node: curNode, children: [
        //{c: "operation", text: curNode.filter.operation}
      ]};

      if(filterIsBeingEdited) {
        filterUi.children.push({c: "value", children: [
          {c: "filter-editor", contentEditable: true, postRender: focusOnce, keydown: submitOnEnter,
            blur: stopModifyingFilter, viewId, node: curNode, text: curNode.filter.value}
        ]});
      } else {
        // we only want an explicit width if the filter isn't changing size to try and fit being edited.
        filterUi.width = filterWidth;
        filterUi.children.push({c: "value", text: curNode.filter.value});
      }
      content.push(filterUi);
    }

    var elem = {c: "item " + klass, selected: uiSelected, width, height,
                mousedown: selectNode, draggable: true, dragstart: storeDragOffset,
                drag: setNodePosition, dragend: finalNodePosition, node: curNode, text};

    // if it's an attribute, it can be renamed by doubleClicking
    if(curNode.type === "attribute") {
      elem["dblclick"] = startRenamingNode;
    }

    // if we are renaming this node, set it to contentEditable
    if(localState.renamingNodeId === curNode.id) {
      elem["c"] += " editing";
      elem["contentEditable"] = true;
      elem["renameId"] = curNode.variable;
      elem["keydown"] = maybeStopRenamingNode;
      elem["blur"] = stopRenamingNode;
      elem["postRender"] = focusOnce;
    }

    // if this is a relationship and not an error, then we can navigate into it
    if(curNode.type === "relationship" && !curNode.error) {
      elem["dblclick"] = openNode;
    }
    content.unshift(elem);
    return {c: "item-wrapper", top: top, left: left, size: {width, height}, node: curNode, selected: uiSelected, children: content};
  }

  function startRenamingNode(e, elem) {
    dispatch("startRenamingNode", {nodeId: elem.node.id});
  }

  function maybeStopRenamingNode(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      stopRenamingNode(e, elem);
      e.preventDefault();
    }
  }

  function stopRenamingNode(e, elem) {
    dispatch("stopRenamingNode", {renameId: elem.renameId, nodeId: elem.node.id, value: e.currentTarget.textContent});
  }

  function selectNode(e, elem) {
    e.stopPropagation();
    dispatch("selectNode", {node: elem.node, shiftKey: e.shiftKey});
  }

  function openNode(e, elem) {
    if(elem.node.type === "relationship") {
      dispatch("openItem", {itemId: elem.node.source["source: source view"]});
    }
  }

  function storeDragOffset(e, elem) {
    var rect = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"),0,0);
    e.dataTransfer.setData("text", "fix for firefox");
    dispatch("setDragOffset", {x: e.clientX - rect.left, y: e.clientY - rect.top});
  }

  function finalNodePosition(e, elem) {
    __firefoxMouseX = __firefoxMouseY = undefined;
    dispatch("finalNodePosition", {node: elem.node});
  }

  function setNodePosition(e, elem) {
    let mx = e.clientX || __firefoxMouseX || 0;
    let my = e.clientY || __firefoxMouseY || 0;
    if(mx === 0 && my === 0) return;
    let surface:any = document.getElementsByClassName("query-editor")[0];
    let surfaceRect = surface.getBoundingClientRect();
    let x = mx - surfaceRect.left - api.localState.dragOffsetX + surface.scrollLeft;
    let y = my - surfaceRect.top - api.localState.dragOffsetY + surface.scrollTop;
    dispatch("setNodePosition", {
      node: elem.node,
      pos: {left: x, top: y}
    });
  }

  function submitOnEnter(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      stopModifyingFilter(e, elem);
      e.preventDefault();
    }
  }

  function stopModifyingFilter(e, elem) {
    dispatch("stopModifyingFilter", {node: elem.node, value: coerceInput(e.currentTarget.textContent), viewId: elem.viewId});
  }

  function removeErrorBinding(e, elem) {
    dispatch("removeErrorBinding", {variableId: elem.node.variable});
  }

  function removeErrorSource(e, elem) {
    dispatch("removeErrorSource", {sourceId: elem.node.source["source: source"]});
  }

  //---------------------------------------------------------
  // Query errors component
  //---------------------------------------------------------

  function queryErrors(view) {
    let editorWarningItems = [];
    for(let errorId in localState.errors) {
      let error = localState.errors[errorId];
      let klass = "error";
      if(error.fading) {
        klass += " fade";
      }
      editorWarningItems.push({c: klass, text: error.text, time: error.time});
    }
    editorWarningItems.sort((a, b) => b.time - a.time);
    let editorWarnings;
    if(editorWarningItems.length) {
      editorWarnings = {c: "editor-warnings error-group", children: [
          {c: "error-heading", text: `editor warnings (${editorWarningItems.length})`},
          {c: "error-items", children: editorWarningItems},
      ]};;
    }
    let warnings = ixer.select("warning", {}).map((warning) => {
      let text = warning["warning: warning"];

      // Special case error message for bindings to help the user figure out what needs changed.
      if(warning["warning: view"] === "binding" && text.indexOf("Foreign key") === 0) {
        let binding = api.factToMap("binding", warning["warning: row"]);
        let fieldId = binding["field"];
        let source = ixer.selectOne("source", {source: binding["source"]});
        if(source) {
          let viewId = source["source: view"];
          let sourceViewId = source["source: source view"];
          text = `Missing field "${code.name(fieldId) || fieldId}" in "${code.name(sourceViewId) || sourceViewId}" for query "${code.name(viewId) || viewId}"`;
        }
      }
      return {c: "warning", warning, click: gotoWarningSite, text};
    });
    let warningGroup;
    if(warnings.length) {
      warningGroup = {c: "error-group", children: [
          {c: "error-heading", text: `code errors (${warnings.length})`},
          {c: "error-items", children: warnings},
      ]};
    }
    let errorItems = ixer.select("error", {}).map((error) => {
      return {error, click: gotoErrorSite, text: error["error: error"]};
    });
    let errorGroup;
    if(errorItems.length) {
      errorGroup = {c: "error-group", children: [
          {c: "error-heading", text: `execution errors (${errorItems.length})`},
          {c: "error-items", children: errorItems},
      ]};
    }
    let totalErrors = warnings.length + errorItems.length;
    return {c: "query-errors", children: [
      totalErrors ? {c: "error-count", text: totalErrors} : undefined,
      editorWarnings,
      totalErrors ? {c: "error-list", children: [
        warningGroup,
        errorGroup,
      ]}: undefined,
    ]};
  }

  function gotoWarningSite(e, elem) {
    dispatch("gotoWarningSite", {warning: elem.warning});
  }

  function gotoErrorSite(e, elem) {
    dispatch("gotoErrorSite", {sourceId: elem.error["error: source"]});
  }

  //---------------------------------------------------------
  // Query toolbar component
  //---------------------------------------------------------

  function queryTools(view, entityInfo) {
    let viewId = view["view: view"];
    let {nodeLookup} = entityInfo;

    let selectedNodes = Object.keys(localState.selectedNodes).map(function(nodeId) {
      // we can't rely on the actual nodes of the uiSelection because they don't get updated
      // so we have to look them up again.
      return nodeLookup[nodeId];
    }).filter((node) => node);

    let disabled = {};
    let actions = {
      // What tools are available depends on what is selected.
      // no matter what though you should be able to go back to the
      // query selector and search.
      "Back": {func: navigateBack, text: "Back", semantic: "action::back", description: "Return to the item selection page"},
      // These may get changed below depending on what's selected and the
      // current state.
      "rename": {func: startRenamingSelection, text: "Rename", semantic: "action::rename"},
      "remove": {func: removeSelection, text: "Remove", semantic: "action::remove"},
      "join": {func: joinSelection, text: "Join", semantic: "action::toggleJoin"},
      "select": {func: selectAttribute, text: "Show", semantic: "action::togleShow"},
      "filter": {func: addFilter, text: "Filter", semantic: "action::toggleFilter"},
      "group": {func: groupAttribute, text: "Group", semantic: "action::toggleGroup"},
      "sort": {func: startSort, text: "Sort", semantic: "action::sort"},
      "chunk": {func: chunkSource, text: "Chunk", semantic: "action::toggleChunk"},
      "ordinal": {func: addOrdinal, text: "Ordinal", semantic: "action::toggleOrdinal"},
      "negate": {func: negateSource, text: "Negate", semantic: "action::toggleNegate"},
    }

    let selectionContainsErrors = false;
    for(var selected of selectedNodes) {
      if(selected.error) {
        selectionContainsErrors = true;
        break;
      }
    }
    // if the selection contains error nodes, we can't do anything
    if(selectionContainsErrors) {
      disabled = {
        "rename": "rename doesn't apply to error nodes",
        "join": "join doesn't apply to error nodes",
        "select": "select doesn't apply to error nodes",
        "filter": "filter doesn't apply to error nodes",
        "group": "group doesn't apply to error nodes",
        "sort": "sort doesn't apply to error nodes",
        "chunk": "chunk doesn't apply to error nodes",
        "ordinal": "ordinal doesn't apply to error nodes",
        "negate": "negate doesn't apply to error nodes",
      }
      actions["remove"].func = removeErrorSelection;

    // no selection
    } else if(!selectedNodes.length) {
      disabled = {
        "rename": "an attribute has to be selected",
        "remove": "remove only applies to sources",
        "join": "join only applies to attributes",
        "select": "select only applies to attributes",
        "filter": "filter only applies to attributes",
        "group": "group only applies to attributes",
        "sort": "sort only applies to sources",
        "chunk": "chunk only applies to sources",
        "ordinal": "ordinal only applies to sources",
        "negate": "negate only applies to sources",
      }

    // single selection
    } else if(selectedNodes.length === 1) {
      let node = selectedNodes[0];
      if(node.type === "attribute") {
        disabled["remove"] = "remove only applies to sources";
        disabled["sort"] = "sort only applies to sources";
        disabled["chunk"] = "chunk only applies to sources";

        disabled["negate"] = "negate only applies to sources";
        if(!node.mergedAttributes) {
          // you can't select a node if the source is negated and it's not joined with anything else
          if(node.sourceNegated) {
            disabled["select"] = "negated sources prove the absence of a row, which means you'd be selecting from nothing."
          }
          disabled["join"] = "multiple attributes aren't joined together on this node.";
        } else {
          actions["join"] = {func: unjoinNodes, text: "Unjoin", semantic: "action::toggleJoin"};
        }

        if(ixer.selectOne("ordinal binding", {variable: node.variable})) {
          actions["ordinal"] = {func: removeOrdinal, text: "Unordinal", semantic: "action::toggleOrdinal"};
        } else {
          disabled["ordinal"] = "ordinal only applies to sources or ordinal nodes";
        }

        if(ixer.selectOne("select", {variable: node.variable})) {
          actions["select"] = {func: unselectAttribute, text: "Hide", semantic: "action::toggleSelect"};
        }
        if(node.filter) {
          actions["filter"] = {func: removeFilter, text: "Unfilter", semantic: "action::toggleFilter"};
        }
        // if this node's source is chunked or there's an ordinal binding, we can group
        if(node.sourceChunked || node.sourceHasOrdinal) {
          if(node.grouped) {
            actions["group"] = {func: ungroupAttribute, text: "Ungroup", semantic: "action::toggleGroup"};
          }
        } else {
          disabled["group"] = "To group an attribute, the source must either have an ordinal or be chunked";
        }
      } else if(node.type === "relationship") {
        disabled["rename"] = "rename only applies to attributes";
        disabled["select"] = "select only applies to attributes.";
        disabled["filter"] = "filter only applies to attributes.";
        disabled["group"] = "group only applies to attributes.";
        disabled["join"] = "join only applies to attributes.";
        if(node.chunked) {
          actions["chunk"] = {func: unchunkSource, text: "Unchunk", semantic: "action::toggleChunk"};
        }
        if(node.isNegated) {
          actions["negate"] = {func: unnegateSource, text: "Unnegate", semantic: "action::toggleNegate"};
        }
        if(node.hasOrdinal) {
          actions["ordinal"] = {func: removeOrdinal, text: "Unordinal", semantic: "action::toggleOrdinal"};
        }

      } else if(node.type === "primitive") {
        disabled = {
          "join": "join only applies to attributes",
          "select": "select only applies to attributes",
          "filter": "filter only applies to attributes",
          "group": "group only applies to attributes",
          "sort": "sort only applies to data sources, not functions",
          "chunk": "chunk only applies to data sources, not functions",
          "ordinal": "ordinal only applies to data sources, not functions",
          "negate": "negate only applies to data sources, not functions",
        }
      }

    //multi-selection
    } else {
      disabled = {
        "rename": "rename only applies to single attributes",
        "filter": "filter only applies to single attributes",
        "group": "group only applies to single attributes",
        "sort": "sort only applies to single sources",
        "chunk": "chunk only applies to single sources",
        "ordinal": "ordinal only applies to single sources or ordinal nodes",
        "negate": "negate only applies to single sources",
      }

      // join and select are only valid if everything is an attribute, so if we
      // find a non-attribute, we have to disable them
      if(selectedNodes.some((node) => node.type !== "attribute")) {
        disabled["join"] = "join only applies to attributes";
        disabled["select"] = "select only applies to attributes";
        if(selectedNodes.some((node) => node.type !== "source")) {
          disabled["remove"] = "remove only applies to sources";
        }
      } else {
        // whether or not we are showing or hiding is based on the state of the first node
        // in the selection
        let root = selectedNodes[0];
        if(ixer.selectOne("select", {variable: root.variable})) {
          actions["select"] = {func: unselectSelection, text: "Hide", semantic: "action::toggleSelect"};
        } else {
          actions["select"] = {func: selectSelection, text: "Show", semantic: "action::toggleSelect"};
        }
      }
    }
    return leftToolbar(actions, disabled, {node: selectedNodes[0], viewId});
  }


  function unjoinNodes(e, elem) {
    dispatch("unjoinNodes", {variableId: elem.node.variable});
  }

  function joinSelection(e, elem) {
    dispatch("joinSelection", {});
  }

  function startRenamingSelection(e, elem) {
    dispatch("startRenamingNode", {nodeId: elem.node.id});
  }

  function selectSelection(e, elem) {
    dispatch("selectSelection", {});
  }

  function unselectSelection(e, elem) {
    dispatch("unselectSelection", {});
  }

  function groupAttribute(e, elem) {
    dispatch("groupAttribute", {variableId: elem.node.variable, viewId: elem.viewId});
  }

  function ungroupAttribute(e,elem) {
    dispatch("ungroupAttribute", {variableId: elem.node.variable, viewId: elem.viewId});
  }

  function negateSource(e, elem) {
    dispatch("negateSource", {sourceId: elem.node.id, viewId: elem.viewId});
  }

  function unnegateSource(e, elem) {
    dispatch("unnegateSource", {sourceId: elem.node.id, viewId: elem.viewId});
  }

  function addOrdinal(e, elem) {
    dispatch("addOrdinal", {node: elem.node, viewId: elem.viewId});
  }

  function removeOrdinal(e, elem) {
    dispatch("removeOrdinal", {node: elem.node, viewId: elem.viewId});
  }


  function chunkSource(e, elem) {
    dispatch("chunkSource", {node: elem.node, viewId: elem.viewId});
  }

  function unchunkSource(e, elem) {
    dispatch("unchunkSource", {node: elem.node, viewId: elem.viewId});
  }

  function addFilter(e, elem) {
    dispatch("addFilter", {node: elem.node, viewId: elem.viewId});
  }

  function removeFilter(e, elem) {
    dispatch("removeFilter", {node: elem.node, viewId: elem.viewId});
  }

  function modifyFilter(e, elem) {
    dispatch("modifyFilter", {node: elem.node});
  }

  function unselectAttribute(e, elem) {
    dispatch("removeSelectFromQuery", {viewId: elem.viewId, variableId: elem.node.variable});
  }
  function selectAttribute(e, elem) {
    dispatch("addSelectToQuery", {viewId: elem.viewId, variableId: elem.node.variable, name: elem.node.name});
  }

  function removeSelection(e, elem) {
    dispatch("removeSelection", {nodes: localState.selectedNodes});
  }

  function removeErrorSelection(e, elem) {
    dispatch("removeErrorSelection", {nodes: localState.selectedNodes});
  }

  //---------------------------------------------------------
  // Sorter component
  //---------------------------------------------------------

  function sorter() {
    let sourceId = localState.sorting.sourceId;
    let sourceViewId = ixer.selectOne("source", {source: sourceId})["source: source view"];
    let fieldItems = ixer.getFields(sourceViewId).map((fieldId, ix) => {
      let sortedField = ixer.selectOne("sorted field", {source: sourceId, field: fieldId});
      let sortIx = sortedField ? sortedField["sorted field: ix"] : ix;
      let fieldItem: any = {c: "field", draggable: true, dragstart: sortDragStart, dragover: sortFieldDragOver, drop: sortFieldDrop, sortIx, sourceId, children: [
        {c: "field-name", text: code.name(fieldId)},
      ]};
      if(!sortedField) {
        fieldItem.c += " grouped";
        fieldItem.sortIx = -1;
        fieldItem.draggable = undefined;
        fieldItem.drop = undefined;
      } else {
        let sortArrow = sortedField["sorted field: direction"] === "ascending" ? "ion-arrow-up-b" : "ion-arrow-down-b";
        fieldItem.children.push({c: `sort-direction ${sortArrow}`, sortedField, click: toggleSortDirection});
      }
      return fieldItem;
    });
    fieldItems.sort((a, b) => {
      return a.sortIx - b.sortIx;
    });
    return {c: "sorter", children: [
        {c: "header", text: "Adjust sorting"},
        {c: "description", text: "Order the fields in the order you want them to be sorted in and click the arrow to adjust whether to sort ascending or descending"},
        {c: "fields", children: fieldItems}
      ]};
  }

  function toggleSortDirection(e, elem) {
    dispatch("toggleSortDirection", {sourceId: elem.sortedField["sorted field: source"], fieldId: elem.sortedField["sorted field: field"]});
  }

  function sortDragStart(e, elem) {
    e.dataTransfer.setData("sortIx", elem.sortIx);
  }

  function sortFieldDragOver(e, elem) {
    e.preventDefault();
  }

  function sortFieldDrop(e, elem) {
    e.preventDefault();
    dispatch("moveSortField", {
      sourceId: elem.sourceId,
      from: parseInt(e.dataTransfer.getData("sortIx")),
      to: elem.sortIx,
    });
  }

  function stopSort(e, elem) {
    dispatch("stopSort", {});
  }

  function startSort(e, elem) {
    let rect = e.currentTarget.getBoundingClientRect();
    dispatch("startSort", {x: rect.right + 10, y: rect.top, sourceId: elem.node.id});
  }

  //---------------------------------------------------------
  // Searcher component
  //---------------------------------------------------------

  function querySearcher() {
    if(!localState.searching) return;
    let results = localState.searchResults;
    let resultGroups = [];
    if(results) {
      resultGroups = results.map((resultGroup) => {
        let onSelect = resultGroup.onSelect;
        let items = resultGroup.results.map((result) => {
          return {c: "search-result-item", result, click: onSelect, children: [
            {c: "result-text", text: result.text},
            result.description ? {c: "result-description", text: result.description} : undefined,
          ]};
        });
        return {c: "search-result-group", children: [
          {c: "search-result-items", key: localState.searchingFor, postRender: scrollToTheBottomOnChange, children: items},
          {c: "group-type", children: [
            {c: "group-name", text: resultGroup.kind},
            {c: "result-size", text: resultGroup.results.length}
          ]},
        ]}
      });
    }
    return {c: "searcher-container", children: [
      {c: "searcher-shade", mousedown: stopSearching},
      {c: "searcher", children: [
        {c: "search-results", children: resultGroups},
        {t: "textarea", c: "search-box", postRender: focusOnce, value: localState.searchingFor, input: updateSearch, keydown: handleSearchKey}
      ]}
    ]};
  }

  function scrollToTheBottomOnChange(node, elem) {
    if(!node.searchValue || node.searchValue !== elem.value) {
      node.scrollTop = 2147483647; // 2^31 - 1, because Number.MAX_VALUE and Number.MAX_SAFE_INTEGER are too large and do nothing in FF...
      node.searchValue = elem.value;
    }
  }

  function handleSearchKey(e, elem) {
    dispatch("handleSearchKey", {keyCode: e.keyCode, metaKey: e.metaKey, ctrlKey: e.ctrlKey, e});
  }

  function startSearching(e, elem) {
    dispatch("startSearching", {value: elem.searchValue});
  }

  function stopSearching(e, elem) {
    dispatch("stopSearching", {clear: elem.clearSearch});
  }

  function updateSearch(e, elem) {
    dispatch("updateSearch", {value: e.currentTarget.value});
  }

  //---------------------------------------------------------
  // Query results component
  //---------------------------------------------------------

  function peek(viewId, entityInfo) {
    let selectedNodeIds = Object.keys(localState.selectedNodes);
    let maxRenderedEntries = 100;
    if(selectedNodeIds.length === 1 && localState.selectedNodes[selectedNodeIds[0]].type === "relationship") {
      let peekViewId = localState.selectedNodes[selectedNodeIds[0]].source["source: source view"];
      let numFields = ixer.select("field", {view: peekViewId}).length;
      let rect = nodesToRectangle(entityInfo.nodes);
      let selectionRect = nodesToRectangle(selectedNodeIds.map((nodeId) => entityInfo.nodeLookup[nodeId]));
      let peekViewSize = ixer.select(peekViewId, {}).length;
      let sizeText = `${peekViewSize} entries`;
      if(peekViewSize > maxRenderedEntries) {
        sizeText = `${maxRenderedEntries} of ` + sizeText;
      }
      return {c: "peek-results", mousedown: stopPropagation, width: numFields * 100, left: rect.right + 50, top: (selectionRect.top + selectionRect.height /2) - 75, children: [
        {c: "result-size", text: sizeText},
        tableEditor.tableForView(peekViewId, maxRenderedEntries),
      ]};
    }
    return undefined;
  }

  function queryResults(viewId, entityInfo) {
    let resultViewId = viewId;
    let maxRenderedEntries = 100;
    let resultViewSize = getViewSize(resultViewId);
    let sizeText = `${resultViewSize} results`;
    if(resultViewSize > maxRenderedEntries) {
      sizeText = `${maxRenderedEntries} of ` + sizeText;
    }
    return {id: `${viewId}-results`, c: "query-results", children: [
      {c: "result-size", text: sizeText},
      tableEditor.tableForView(resultViewId, 100, {onSelect: selectFieldNode, onHeaderSelect: selectFieldNode})
    ]};
  }

  function selectFieldNode(evt, elem) {
    evt.stopPropagation();
    let variableId = (ixer.selectOne("select", {field: elem.fieldId}) || {})["select: variable"];
    let view = ixer.selectOne("view", {view: localState.drawnUiActiveId});
    if(!view || !variableId) return;
    let {nodeLookup} = viewToEntityInfo(view);
    dispatch("selectNode", {node: nodeLookup[variableId]});
  }

  //---------------------------------------------------------
  // Shared dispatch functions
  //---------------------------------------------------------

  export function rename(e, elem) {
    dispatch("rename", {renameId: elem.renameId, value: e.currentTarget.textContent});
  }

  export function renameField(e, elem) {
    dispatch("renameField", {renameId: elem.renameId, value: e.currentTarget.textContent});
  }

  export function maybeSubmitRenameField(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      renameField(e, elem);
      e.preventDefault();
    }
  }

  function setQueryDescription(e, elem) {
    dispatch("setQueryDescription", {viewId: elem.viewId, value: e.currentTarget.textContent});
  }

  function navigateBack(e, elem) {
    dispatch("navigateBack", {});
  }

  //---------------------------------------------------------
  // table selector / editor
  //---------------------------------------------------------

   function getViewSize(viewId) {
     let facts = ixer.facts(viewId) || [];
     return facts.length;
   }

   function tableItem(tableId) {
     let selected = localState.selectedItems[tableId] ? "selected" : "";
    return {c: `table-item ${selected}`, semantic: "item::data", itemId: tableId, click: selectItem, dblclick: openItem, children: [
      tableForm(tableId)
    ]};
  }

  function tableUi(tableId) {
    var view = ixer.selectOne("view", {view: tableId});
    if(!view) return;

    let maxRenderedEntries = 100;
    let disabled = {};
    let actions = {
      "back": {text: "Back", semantic: "action::back", func: navigateBack, description: "Return to the item selection page"},
      "new": {text: "+Entry", semantic: "action::addEntry", func: newTableEntry, description: "Create a new entry"},
      "delete": {text: "-Entry", semantic: "action::removeEntry", func: deleteTableEntry, description: "Remove the current entry"},
      "add field": {text: "+Field", semantic: "action::addField", func: addFieldToTable, description: "Add a field to the card"},
      // remove field needs to set the useMousedown flag because we need to know what field was active when
      // the button is pressed. If we use click, the field will have been blurred by the time the event goes
      // through
      "remove field": {text: "-Field", semantic: "action::removeField", func: removeFieldFromTable, description: "Remove the active field from the card", useMousedown: true}
    };
    if(!localState.selectedTableEntry) {
      disabled["delete"] = " no entry is selected";
    }
    if(!localState.activeTableEntryField) {
      disabled["remove field"] = " the field to remove must be active";
    }
    let resultViewSize = getViewSize(tableId);
    let sizeText = `${resultViewSize} entries`;
    if(resultViewSize > maxRenderedEntries) {
      sizeText = `${maxRenderedEntries} of ` + sizeText;
    }
    return {c: "workspace table-workspace", semantic: "pane::dataEditor", children: [
      leftToolbar(actions, disabled),
      {c: "container", children: [
        {c: "surface", children: [
          tableFormEditor(tableId, localState.tableEntry, 1, 0),
          queryErrors(view),
        ]},
        {id: `${tableId}-results`, c: "query-results", children: [
          {c: "result-size", text: sizeText},
          tableEditor.tableForView(tableId, maxRenderedEntries, {
            onSelect: selectTableEntry,
            activeRow: localState.selectedTableEntry || localState.tableEntry,
          })
        ]},
      ]},
    ]};
  }

  function tableFormEditor(tableId, row = null, rowNum = 0, rowTotal = 0) {
    let fields = ixer.getFields(tableId).map((fieldId, ix) => {
      let value = row ? row[fieldId] : "";
      let entryField = {c: "entry-field", fieldId, postRender: maybeFocusFormField, text: value, contentEditable: true, keydown: keyboardSubmitTableEntry, blur: setTableEntryField, focus: activeTableEntryField, key: JSON.stringify(row) + ix + localState.focusedTableEntryField};
      return {c: "field-item", children: [
        {c: "label", tabindex:-1, contentEditable: true, blur: rename, renameId: fieldId, text: code.name(fieldId)},
        entryField,
      ]};
    });
    let sizeUi = rowTotal > 0 ? {c: "size", text: `${rowNum} of ${rowTotal}`} : undefined;
    return {c: "form-container", children: [
      rowTotal > 2 ? formRepeat(tableId, 2) : undefined,
      rowTotal > 1 ? formRepeat(tableId, 1) : undefined,
      {c: "form", children: [
        {c: "form-name", contentEditable: true, blur: rename, renameId: tableId, text: code.name(tableId)},
        {c: "form-description", contentEditable: true, blur: setQueryDescription, viewId: tableId, text: getDescription(tableId)},
        {c: "form-fields", children: fields},
        sizeUi,
        {c: "button", click: submitTableEntry, text: "Submit"}
      ]},
    ]};
  }

  function tableForm(tableId) {
    let rows = ixer.select(tableId, {});
    let fields = ixer.getFields(tableId).map((fieldId) => {
      let value = rows[0] ? rows[0][fieldId] : "";
      let entryField = {c: "entry-field", text: value};
      return {c: "field-item", children: [
        {c: "label", blur: rename, renameId: fieldId, text: code.name(fieldId)},
        entryField,
      ]};
    });
    let viewSize = getViewSize(tableId);
    let sizeUi = viewSize > 0 ? {c: "size", text: `1 of ${viewSize}`} : {c: "size", text: "No entries"};
    return {c: "form-container", children: [
      rows.length > 2 ? formRepeat(tableId, 2) : undefined,
      rows.length > 1 ? formRepeat(tableId, 1) : undefined,
      {c: "form", children: [
        {c: "form-name", blur: rename, renameId: tableId, text: code.name(tableId)},
        {c: "form-description", blur: setQueryDescription, viewId: tableId, text: getDescription(tableId)},
        {c: "form-fields", children: fields},
        sizeUi,
      ]},
    ]};
  }

  let randomCardPlacements = {};

  function formRepeat(tableId, depth) {
    let offset = 4 * depth;
    let topDir;
    let leftDir;
    if(randomCardPlacements[`${tableId}${depth}top`]) {
      topDir = randomCardPlacements[`${tableId}${depth}top`];
      leftDir = randomCardPlacements[`${tableId}${depth}left`];
    } else {
      topDir = Math.round(Math.random()) === 1 ? 1 : -1;
      leftDir = Math.round(Math.random()) === 1 ? 1 : -1;
      randomCardPlacements[`${tableId}${depth}top`] = topDir;
      randomCardPlacements[`${tableId}${depth}left`] = leftDir;
    }
    return {c: `form-repeat`, transform: `rotate(${Math.random() * 3 * topDir + 1}deg)`, top: offset * topDir, left: offset * leftDir};
  }

  function maybeFocusFormField(node, elem) {
    if(elem.fieldId === localState.focusedTableEntryField) {
      node.focus();
      dispatch("focusTableEntryField", {});
    }
  }

  function selectTableEntry(e, elem) {
    e.stopPropagation();
    dispatch("selectTableEntry", {row: api.clone(elem.row), fieldId: elem.fieldId});
  }

  function keyboardSubmitTableEntry(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      dispatch("submitTableEntry", {fieldId: elem.fieldId, value: coerceInput(e.currentTarget.textContent)});
      // @HACK: because we can't use the input event to track changes on contentEditable (Friefox resets cursor position
      // to the beginning of the line if you do), we won't ever see the value of this element change. When we submit,
      // we intend for the value in this input to be cleared, so we have to clear it manually as microReact just sees an
      // unchanged textContent.
      e.currentTarget.textContent = "";
      e.preventDefault();
    }
  }

  function submitTableEntry(e, elem) {
    dispatch("submitTableEntry", {});
  }

  function activeTableEntryField(e, elem) {
    dispatch("activeTableEntryField", {fieldId: elem.fieldId});
  }

  function setTableEntryField(e, elem) {
    dispatch("setTableEntryField", {fieldId: elem.fieldId, value: coerceInput(e.currentTarget.textContent), clear: true});
  }

  function newTableEntry(e, elem) {
    dispatch("newTableEntry", {});
  }

  function deleteTableEntry(e, elem) {
    dispatch("deleteTableEntry", {});
  }

  function addFieldToTable(e, elem) {
    dispatch("addFieldToTable", {});
  }

  function removeFieldFromTable(e, elem) {
    dispatch("removeFieldFromTable", {});
  }

  //---------------------------------------------------------
  // input handling
  //---------------------------------------------------------

  var __firefoxMouseX, __firefoxMouseY;
  function initInputHandling() {
    document.addEventListener("keydown", function(e) {
      var KEYS = api.KEYS;
      //Don't capture keys if we're focused on an input of some kind
      var target: any = e.target;
      if(e.defaultPrevented
         || target.nodeName === "INPUT"
         || target.getAttribute("contentEditable")
         || target.nodeName === "TEXTAREA") {
        return;
      }

      //undo + redo
      if((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === KEYS.Z) {
        dispatch("redo", null);
        e.preventDefault();
      } else if((e.metaKey || e.ctrlKey) && e.keyCode === KEYS.Z) {
        dispatch("undo", null);
        e.preventDefault();
      }

      //remove
      if(e.keyCode === KEYS.BACKSPACE) {
        dispatch("removeSelection", {nodes: localState.selectedNodes});
        e.preventDefault();
      }

      if((e.ctrlKey || e.metaKey) && e.keyCode === KEYS.F) {
        dispatch("startSearching", {value: ""});
        e.preventDefault();
      }
    });

    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", function(e) {
      let files = e.dataTransfer.files;
      if(files.length) {
        dispatch("importFiles", {files: files});
      }
      e.preventDefault();
    });

    // @HACK: Because FF is a browser full of sadness...
    function firefoxDragMoveHandler(evt) {
      __firefoxMouseX = evt.clientX;
      __firefoxMouseY = evt.clientY;
    }
    if(navigator.userAgent.indexOf("Firefox") !== -1) {
      document.body.addEventListener("dragover", firefoxDragMoveHandler, false);
    }
  }

  //---------------------------------------------------------
  // Update notice
  //---------------------------------------------------------

  function maybeShowUpdate(error, newVersionExists?:boolean) {
    if(error) {
      return dispatch("setNotice", {content: "Could not reach github to check for updates at this time", type: "warn"});
    } else if(newVersionExists) {
      return dispatch("setNotice", {content: () => {return {c: "flex-row spaced-row", children: [{text: "A new version of Eve is available! Check it out on"}, {t: "a", href: "https://github.com/witheve/Eve", text: "Github"}]}}, duration: 0});
    }
  }

  //---------------------------------------------------------
  // Go!
  //---------------------------------------------------------
  client.setDispatch(dispatch);
  client.afterInit(() => {
    initRenderer();
    initLocalstate();
    initInputHandling();
    ui.init(localState, render);
    api.checkVersion(maybeShowUpdate);
    loadPositions();
    render();
  });
  window["dispatcher"] = {render: render};
}
