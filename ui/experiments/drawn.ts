/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/tableEditor.ts" />
module eveEditor {
  var localState = api.localState;
  var ixer = api.ixer;
  var code = api.code;
  var DEBUG = window["DEBUG"];
  
  export function executeDispatch(diffs, storeEvent, sendToServer) {
    if(diffs && diffs.length) {
      if(storeEvent) {
        var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack, localState: api.clone(localState), root: false};
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

    } else {
      //       console.warn("No diffs to index, skipping.");
    }
    
    //@TODO: since we don't have a way to determine if localState has changed, we have
    //to render anytime dispatch is called
    drawn.render();
  }
}

module drawn {

  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;
  
  //---------------------------------------------------------
  // Constants
  //---------------------------------------------------------

  const nodeWidthMultiplier = 8;
  const nodeSmallWidthMultiplier = 8;
  const nodeWidthPadding = 10;
  const nodeHeight = 18;
  const nodeHeightPadding = 3;
  const nodeWidthMin = 50;
  
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
        if (!elem.__focused) {
            setTimeout(function () { node.focus(); }, 5);
            elem.__focused = true;
        }
    }

	//---------------------------------------------------------
  // Renderer
  //---------------------------------------------------------

  export var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  renderer.queued = false;
  export function render() {
   if(renderer.queued === false) {
      renderer.queued = true;
      // @FIXME: why does using request animation frame cause events to stack up and the renderer to get behind?
      setTimeout(function() {
      // requestAnimationFrame(function() {
        var start = performance.now();
        var tree = root();
        var total = performance.now() - start;
        if(total > 10) {
          console.log("Slow root: " + total);
        }
        renderer.render(tree);
        renderer.queued = false;
      }, 16);
    }
  }

  window.addEventListener("resize", render);

  //---------------------------------------------------------
  // localState
  //---------------------------------------------------------

  localState.selectedNodes = {};
  localState.overlappingNodes = {};

  var fieldToEntity = {
    "source: source": "source",
    "source: view": "view",
    "source: source view": "view",
    "field: field": "field",
    "field: view": "view",
    "place: place": "place",
    "place to image: place": "place",
    "place to address: place": "place",
  }

  export var entities = [];
  for(var field in fieldToEntity) {
    var ent = fieldToEntity[field];
    if (entities.indexOf(ent) === -1) {
      entities.push(ent);
    }
  }

  export var positions = {}

  function loadPositions() {
    var loadedPositions = ixer.select("editor node position", {});
    for(var pos of loadedPositions) {
      positions[pos["editor node position: node"]] = {top: pos["editor node position: y"], left: pos["editor node position: x"]};
    }
  }

// localState.drawnUiActiveId = "da7f9321-a4c9-4292-8cf6-5174f3ed2f11";
localState.drawnUiActiveId = "block field";
// localState.drawnUiActiveId = "b43aad08-ab56-4cef-80f9-98f79a12b0ef";
// localState.drawnUiActiveId = false;

  //---------------------------------------------------------
  // Node helpers
  //---------------------------------------------------------

  function findNodesIntersecting(currentNodeId, nodes, radius = 30) {
    let currentNodePosition = positions[currentNodeId];
    let overlaps = [];
    for (let node of nodes) {
      if (node.id === currentNodeId) continue;
      let nodePosition = positions[node.id];
      if (currentNodePosition.left > nodePosition.left - radius &&
        currentNodePosition.left < nodePosition.left + radius &&
        currentNodePosition.top > nodePosition.top - radius &&
        currentNodePosition.top < nodePosition.top + radius) {
        overlaps.push(node.id);
      }
    }
    return overlaps;
  }

  function intersectionAction(nodeA, nodeB): any {
    //given two nodes, we check to see if their intersection should cause something to happen
    //e.g. two attributes intersecting would signal joining them
    if(nodeA.type === "attribute" && nodeB.type === "attribute") {
      return "joinNodes";
    }
    return false;
  }

  function actionableIntersections(viewId, currentNodeId, radius = 30) {
    let {nodeLookup, nodes} = viewToEntityInfo(ixer.selectOne("view", {view: viewId}));
    let overlaps = findNodesIntersecting(currentNodeId, nodes, radius);
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
      let overlapLeft = Math.max(boxLeft, displayInfo.left);
      let overlapRight = Math.min(boxRight, displayInfo.left + displayInfo.width);
      let overlapTop = Math.max(boxTop, displayInfo.top);
      let overlapBottom = Math.min(boxBottom, displayInfo.top + displayInfo.height);
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
      if(info.left < left) left = info.left;
      if(info.left + info.width > right) right = info.left + info.width;
      if(info.top < top) top = info.top;
      if(info.top + info.height > bottom) bottom = info.top + info.height;
    }
    return {top, left, width: right - left, height: bottom - top};
  }

  //---------------------------------------------------------
  // AST helpers
  //---------------------------------------------------------

  function removeSource(sourceId) {
    var diffs = [
      api.remove("source", {source: sourceId}),
      api.remove("constraint", {"left source": sourceId}),
      api.remove("constraint", {"right source": sourceId}),
      api.remove("select", {source: sourceId})
    ]
    let selects = ixer.select("select", {source: sourceId});
    for(let select of selects) {
      diffs.push(api.remove("field", {field: select["select: view field"]}));
    }
    return diffs;
  }

  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------

  function dispatch(event, info, rentrant?) {
    //console.log("dispatch[" + event + "]", info);
    var diffs = [];
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
        for(let nodeId in localState.selectedNodes) {
          let node = localState.selectedNodes[nodeId];
          if(node.type === "relationship") {
            diffs = removeSource(node.id);
          } else if (node.type === "primitive") {
            diffs = removeSource(node.sourceId);
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
      //---------------------------------------------------------
      // Navigation
      //---------------------------------------------------------
      case "openRelationship":
        localState.drawnUiActiveId = info.node.source["source: source view"];
        diffs = dispatch("clearSelection", {}, true);
      break;
      case "openQuery":
        localState.drawnUiActiveId = info.queryId;
      break;
      case "gotoQuerySelector":
        localState.drawnUiActiveId = false;
      break;
      //---------------------------------------------------------
      // Query building
      //---------------------------------------------------------
      case "createNewQuery":
        let newId = uuid();
        localState.drawnUiActiveId = newId;
        diffs = [
          api.insert("view", {view: newId, kind: "join", dependents: {"display name": {name: "New query!"}, "tag": [{tag: "remote"}]}})
        ];
      break;
      case "addViewToQuery":
        var sourceId = uuid();
        var queryId = localState.drawnUiActiveId;
        diffs = [
          api.insert("source", {view: queryId, source: sourceId, "source view": info.viewId})
        ];
        // @FIXME: if the source view is a primitive, we need to bind its fields to constants or we blow up the server
        // this will no longer be necessary once we have validation in.
        var sourceView = ixer.selectOne("view", {view: info.viewId});
        if(sourceView["view: kind"] === "primitive") {
          ixer.select("field", {view: info.viewId}).forEach(function(field) {
            let fieldId = field["field: field"];
            if(field["field: kind"] === "scalar input") {
              diffs.push(api.insert("constraint", {
              constraint: uuid(),
              view: localState.drawnUiActiveId,
              "left source": sourceId,
              "left field": fieldId,
              "right source": "constant",
              "right field": api.primitiveDefaults[info.viewId][fieldId],
              operation: "="}));
            }
          });

        }
        ixer.select("field", {view: info.viewId, kind: "output"}).forEach(function(field) {
            let fieldId = field["field: field"];
            // select all those fields
            diffs.push.apply(diffs, dispatch("addSelectToQuery", {viewId: queryId, sourceId: sourceId, sourceFieldId: fieldId}, true));
          });
        //we may also have information about where we should position it.
        if(info.top !== undefined) {
          diffs.push(api.insert("editor node position", {node: sourceId, x: info.left, y: info.top}));
          positions[sourceId] = {left: info.left, top: info.top};
        }
      break;
      case "joinNodes":
        var {target, node} = info;
        if(!node || !target) throw new Error("Trying to join at least one non-existent node");
        var constraintId = uuid();
        diffs = [
          api.insert("constraint", {
            constraint: constraintId,
            view: localState.drawnUiActiveId,
            "left source": node.source["source: source"],
            "left field": node.field,
            "right source": target.source["source: source"],
            "right field": target.field,
            operation: "="}),
        ];

        //if either of these nodes are a primitive input, then we need should remove any constant
        //constraint that was on there.
        var primitiveNode;
        if(target.isInput) {
          primitiveNode = target;
        } else if(node.isInput) {
          primitiveNode = node;
        }
        if(primitiveNode) {
          diffs.push(api.remove("constraint", {
            view: localState.drawnUiActiveId,
            "left source": primitiveNode.source["source: source"],
            "left field": primitiveNode.field,
            "right source": "constant"
          }));
        }

      break;
      case "unjoinNodes":
        var {fromNode} = info;
        //remove all the constraints related to this node
        diffs = [
          api.remove("constraint", {"left source": fromNode.source["source: source"], "left field": fromNode.field}),
          api.remove("constraint", {"right source": fromNode.source["source: source"], "right field": fromNode.field}),
        ]

        //if one of the unjoined nodes is a primitive input, then we need to rebind it to a default value
        function bindPrimitiveField(sourceId, fieldId) {
          var source = ixer.selectOne("source", {source: sourceId});
          var field = ixer.selectOne("field", {field: fieldId});
          if(field["field: kind"] === "scalar input") {
            diffs.push(api.insert("constraint", {
              constraint: uuid(),
              view: localState.drawnUiActiveId,
              "left source": sourceId,
              "left field": fieldId,
              "right source": "constant",
              "right field": api.primitiveDefaults[source["source: source view"]][fieldId],
              operation: "="}));
          }
        }

        bindPrimitiveField(fromNode.source["source: source"], fromNode.field);
        (api.retrieve("constraint", {"left source": fromNode.source["source: source"], "left field": fromNode.field}) || []).forEach((constraint) => {
          var sourceId = constraint["right source"];
          var fieldId = constraint["right field"];
          bindPrimitiveField(sourceId, fieldId);
        });
        (api.retrieve("constraint", {"right source": fromNode.source["source: source"], "right field": fromNode.field}) || []).forEach((constraint) => {
          var sourceId = constraint["left source"];
          var fieldId = constraint["left field"];
          bindPrimitiveField(sourceId, fieldId);
        });

      break;
      case "removeSelectFromQuery":
        var selects = ixer.select("select", {view: info.viewId, source: info.sourceId, "source field": info.sourceFieldId}) || [];
        for(let select of selects) {
          let fieldId = select["select: view field"];
          diffs.push(api.remove("field", {field: fieldId}));
        }
        diffs.push(api.remove("select", {view: info.viewId, source: info.sourceId, "source field": info.sourceFieldId}));
      break;
      case "addSelectToQuery":
        var name = code.name(info.sourceFieldId);
        var fields = ixer.select("field", {view: info.viewId}) || [];
        var neueField = api.insert("field", {view: info.viewId, field: info.fieldId, kind: "output", dependents: {
          "display name": {name: name},
          "display order": {priority: -fields.length}
        }});
        var fieldId = neueField.content.field;
      
        diffs = [
          neueField,
          api.insert("select", {view: info.viewId, "view field": fieldId, source: info.sourceId, "source field": info.sourceFieldId})
        ]; 
      break;
      case "setQueryName":
        if(info.value === ixer.selectOne("display name", {id: info.viewId})["display name: name"]) return;
        diffs.push(api.insert("display name", {id: info.viewId, name: info.value}),
                   api.remove("display name", {id: info.viewId}));
      break;
      case "addFilter":
        var fieldId = info.node.field;
        var sourceId = info.node.source["source: source"];
        diffs.push(api.insert("constraint", {
          view: info.viewId, 
          operation: "=", 
          "left source": sourceId, 
          "left field": fieldId, 
          "right source": "constant", 
          "right field": "default empty"
        }));
        dispatch("modifyFilter", info, true);
      break;
      case "modifyFilter":
        localState.modifyingFilterNodeId = info.node.id;
      break;
      case "removeFilter":
        var fieldId = info.node.field;
        var sourceId = info.node.source["source: source"];
        console.log(sourceId, fieldId);
        diffs.push(api.remove("constraint", {view: info.viewId, "left source": sourceId, "left field": fieldId, "right source": "constant"}));
      break;
      case "stopModifyingFilter":
        //insert a constant
        var fieldId = info.node.field;
        var sourceId = info.node.source["source: source"];
        var constantId = uuid();
        diffs.push(api.insert("constant", {constant: constantId, value: info.value}));
        //change the constraint to reference that new constant
        diffs.push(api.remove("constraint", {view: info.viewId, "left source": sourceId, "left field": fieldId, "right source": "constant"}));
        diffs.push(api.insert("constraint", {view: info.viewId, operation: "=", "left source": sourceId, "left field": fieldId, "right source": "constant", "right field": constantId}));
        localState.modifyingFilterNodeId = undefined;
      break;
      //---------------------------------------------------------
      // Menu
      //---------------------------------------------------------
      case "showMenu":
        localState.menu = {top: info.y, left: info.x, contentFunction: info.contentFunction};
      break;
      case "clearMenu":
        localState.menu = false;
      break;
      default:
        console.error("Unknown dispatch:", event, info);
        break;
    }

    if(!rentrant) {
      if(diffs.length) {
        let formatted = api.toDiffs(diffs);
        ixer.handleDiffs(formatted);
        client.sendToServer(formatted, false);
      }
      render();
    }
    return diffs;
  }

  //---------------------------------------------------------
  // root
  //---------------------------------------------------------

  function root() {
    var page:any;
    if(localState.drawnUiActiveId) {
      page = queryUi(localState.drawnUiActiveId, true);
    } else {
      page = querySelector();
    }
    return {id: "root", children: [page]};
  }

  function querySelector() {
    var queries = api.ixer.select("view", {kind: "join"}).map((view) => {
      var viewId = view["view: view"];
      return {c: "query-item", queryId: viewId, click: openQuery, children:[
        {c: "query-name", text: code.name(viewId)},
        queryUi(viewId)
      ]};
    });
    return {c: "query-selector-wrapper", children: [
      {c: "button", text: "add query", click: createNewQuery},
      {c: "query-selector", children: queries}
    ]};
  }

  function createNewQuery(e, elem) {
    dispatch("createNewQuery", {});
  }

  function openQuery(e, elem) {
    dispatch("openQuery", {queryId: elem.queryId});
  }

  function queryUi(viewId, showResults = false) {
    var view = ixer.selectOne("view", {view: viewId});
    if(!view) return;
    return {c: "query", children: [
      localState.drawnUiActiveId ? queryTools(view) : undefined,
      {c: "container", children: [
        {c: "surface", children: [
          {c: "query-name-input", contentEditable: true, blur: setQueryName, viewId: viewId, text: code.name(viewId)},
          queryMenu(view),
          queryCanvas(view),
        ]},
        showResults ? queryResults(viewId) : undefined
      ]}
      
    ]};
  }
  
  function queryTools(view) {
    // What tools are available depends on what is selected.
    // no matter what though you should be able to go back to the
    // query selector.
    let tools:any = [
       {c: "tool", text: "back", click: gotoQuerySelector},
    ];
    
    // @FIXME: what is the correct way to divy this up? The criteria for
    // what tools show up can be pretty complicated.
    
    let viewId = view["view: view"];
    
    // @FIXME: we ask for the entity info multiple times to draw the editor
    // we should probably find a way to do it in just one.
    let {nodeLookup} = viewToEntityInfo(view);
    
    let selectedNodes = Object.keys(localState.selectedNodes).map(function(nodeId) {
      // we can't rely on the actual nodes of the uiSelection because they don't get updated
      // so we have to look them up again.
      return nodeLookup[nodeId];
    });
    
    // no selection
    if(!selectedNodes.length) {
      tools.push.apply(tools, [
        {c: "tool", text: "Entity"},
        {c: "tool", text: "Attribute"},
        {c: "tool", text: "Relationship", click: showCanvasMenu},  
      ]);
      
    // single selection  
    } else if(selectedNodes.length === 1) {
      let node = selectedNodes[0];
      if(node.type === "attribute") {
        if(node.mergedAttributes) {
          tools.push({c: "tool", text: "unmerge", click: unjoinNodes, node: node});
        }
        if(ixer.selectOne("select", {view: viewId, "source field": node.field})) {
          tools.push({c: "tool", text: "unselect", click: unselectAttribute, node, viewId});  
        } else {
          tools.push({c: "tool", text: "select", click: selectAttribute, node, viewId});
        }
        if(!node.filter) {
          tools.push({c: "tool", text: "add filter", click: addFilter, node, viewId});
        } else {
          tools.push({c: "tool", text: "change filter", click: modifyFilter, node, viewId});
          tools.push({c: "tool", text: "remove filter", click: removeFilter, node, viewId});
        }
      }
      
    //multi-selection  
    } else {
      
    }
    return {c: "query-tools", children: tools};
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
    dispatch("removeSelectFromQuery", {viewId: elem.viewId, sourceId: elem.node.source["source: source"], sourceFieldId: elem.node.field});
  }
  function selectAttribute(e, elem) {
    dispatch("addSelectToQuery", {viewId: elem.viewId, sourceId: elem.node.source["source: source"], sourceFieldId: elem.node.field});
  }
  
  function queryResults(viewId) {
    let resultViewId = viewId;
    let selectedNodeIds = Object.keys(localState.selectedNodes);
    if(selectedNodeIds.length === 1 && localState.selectedNodes[selectedNodeIds[0]].type === "relationship") {
      resultViewId = localState.selectedNodes[selectedNodeIds[0]].source["source: source view"];
    }
    return {c: "query-results", children: [
      tableEditor.tableForView(resultViewId, false, 100)
    ]};
  }

  function setQueryName(e, elem) {
    dispatch("setQueryName", {viewId: elem.viewId, value: e.currentTarget.textContent});
  }

  function gotoQuerySelector(e, elem) {
    dispatch("gotoQuerySelector", {});
  }

  function queryMenu(query) {
    var menu = localState.menu;
    if(!menu) return {};
    return {c: "menu-shade", mousedown: clearMenuOnClick, children: [
      {c: "menu", top: menu.top, left: menu.left, children: [
        menu.contentFunction()
      ]}
    ]};
  }

  function clearMenuOnClick(e, elem) {
    if(e.target === e.currentTarget) {
      dispatch("clearMenu", {});
    }
  }

  function toPosition(node) {
    var random = {left: 100 + Math.random() * 300, top: 100 + Math.random() * 300};
    var key = node.id;
    if(!positions[key]) {
      positions[key] = random;
    }
    return positions[key];
  }

  function joinToEntityInfo(view) {
    var nodes = [];
    var nodeLookup = {};
    var sourceAttributeLookup = {};
    var constraints = [];
    var links = [];
    for(var source of ixer.select("source", {view: view["view: view"]})) {
      var sourceConstraints = ixer.select("constraint", {view: view["view: view"]});
      var sourceViewId = source["source: source view"];
      var sourceView = api.ixer.select("view", {view: sourceViewId})[0];
      var sourceId = source["source: source"];
      if(sourceView["view: kind"] !== "primitive") {
        for(var constraint of sourceConstraints) {
          constraints.push(constraint);
        }
        var isRel = true;
        var curRel;
        if(isRel) {
          curRel = {type: "relationship", source: source, id: sourceId};
          nodes.push(curRel);
          nodeLookup[curRel.id] = curRel;
        }
        for(var field of ixer.select("field", {view: sourceViewId})) {
          var attribute: any = {type: "attribute", field: field["field: field"], source};
          //check if this attribute is an entity
          attribute.entity = fieldToEntity[attribute.field];
          if(isRel) {
            attribute.relationship = curRel;
            attribute.id = `${curRel.id}|${attribute.field}`;
          }
          sourceAttributeLookup[`${sourceId}|${attribute.field}`] = attribute;
          nodes.push(attribute);
          nodeLookup[attribute.id] = attribute;
          var link: any = {left: attribute, right: attribute.relationship};
          if(attribute.entity && code.name(attribute.field) !== attribute.entity) {
            link.name = code.name(attribute.field);
          }
          links.push(link);
          let select = ixer.selectOne("select", {source: sourceId, "source field": attribute.field});
          if(select) {
            attribute.select = select; 
          }
        }

      } else {
        for(var constraint of sourceConstraints) {
          constraints.push(constraint);
        }
        var curPrim: any = {type: "primitive", sourceId: sourceId, primitive: source["source: source view"]};
        curPrim.id = `${curPrim.sourceId}|${curPrim.primitive}`;
        let fields = ixer.select("field", {view: sourceViewId});
        for(var field of fields) {
            var attribute: any = {type: "attribute", field: field["field: field"], source, isInput: field["field: kind"] !== "output", id: `${sourceId}|${field["field: field"]}`};
            sourceAttributeLookup[attribute.id] = attribute;
            nodes.push(attribute);
            nodeLookup[attribute.id] = attribute;
            var link: any = {left: attribute, right: curPrim};
            link.name = code.name(attribute.field);
            links.push(link);
            let select = ixer.selectOne("select", {source: sourceId, "source field": attribute.field});
            if(select) {
              attribute.select = select; 
            }
        }

        nodes.push(curPrim);
        nodeLookup[curPrim.id] = curPrim;
      }
    }
    
    //look through the variables and dedupe attributes
    let variables = ixer.select("variable", {view: view["view: view"]});
    for(let variable of variables) {
      let variableId = variable["variable: variable"];
      let bindings = ixer.select("binding", {variable: variableId});
      if(!bindings.length) continue;
      let entity = undefined;
      let mergedAttributes = [];
      let bindingNodes = bindings.map((binding) => {
        return nodeLookup[`${binding["binding: source"]}|${binding["binding: field"]}`];
      });
      // console.log(nodes);
      let attribute = bindingNodes.filter(node => node && !node.isInput)[0] || bindingNodes[0];
      // @HACK: when removing query parts we need to remove variables as well.
      if(!attribute) continue;
      for(let curNode of bindingNodes) {
        // @TODO: which attribute should we choose to show?
        if(!curNode) continue;
        if(curNode.entity) entity = curNode.entity;
        if(curNode !== attribute) {
          let ix = nodes.indexOf(curNode);
          mergedAttributes.push(curNode);
          if(ix > -1) {
            nodes.splice(ix, 1);
            delete nodeLookup[curNode.id];
          }
          let newName;
          if(code.name(curNode.field) !== code.name(attribute.field)) {
            newName = code.name(curNode.field);
          }
          for(let link of links) {
            if(link.left === curNode) {
              link.left = attribute;
              if(newName) link.name = newName;
            } else if(link.right === curNode) {
              link.right = attribute;
              if(newName) link.name = newName;
            }
          }
        }
      }
      attribute.mergedAttributes = mergedAttributes.length ? mergedAttributes : undefined;
      attribute.entity = entity;
      let constants = ixer.select("constant*", {variable: variableId}) 
      for(var constant of constants) {
        attribute.filter = {operation: "=", value: constant["constant*: value"]};
      }
    }
    
    return {nodes, links, nodeLookup};
  }

  function tableToEntityInfo(view) {
    var nodes = [];
    var links = [];
    let nodeLookup = {};
    return {nodes, links, nodeLookup};
  }

  function viewToEntityInfo(view) {
    if(view["view: kind"] === "join") {
      return joinToEntityInfo(view);
    } else if(view["view: kind"] === "table") {
      return tableToEntityInfo(view);
    }
  }

  function queryCanvas(view) {
    let viewId = view["view: view"];
    var {nodes, links} = viewToEntityInfo(view);
    var items = [];
    for(var node of nodes) {
      items.push(nodeItem(node, viewId));
    }
    var linkItems = [];
    for(var link of links) {
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
      var d = `M ${fromLeft} ${fromTop} L ${toLeft} ${toTop}`;

      var pathId = `${link.right.id} ${link.left.id} path`;
      linkItems.push({svg: true, id: pathId, t: "path", d: d, c: "link", stroke: color, strokeWidth: 1});
      linkItems.push({svg: true, t: "text", children: [
        {svg: true, t: "textPath", startOffset: "50%", xlinkhref: `#${pathId}`, text: link.name}
      ]});
    }
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
        let {top, left, width, height} = nodesToRectangle(selectedNodeIds.map((nodeId) => localState.selectedNodes[nodeId]));
        selection = {svg: true, c: "selection-rectangle", t: "rect", x: left - 10, y: top - 10, width: width + 20, height: height + 20};
      }
    }
    return {c: "canvas", contextmenu: showCanvasMenu, mousedown: startBoxSelection, mousemove: continueBoxSelection, mouseup: endBoxSelection, dragover: preventDefault, children: [
      {c: "selection", svg: true, width: "100%", height: "100%", t: "svg", children: [selection]},
      {c: "links", svg: true, width:"100%", height:"100%", t: "svg", children: linkItems},
      {c: "nodes", children: items}
    ]};
  }
  
  function surfaceRelativeCoords(e) {
    let surface:any = document.getElementsByClassName("surface")[0];
    let surfaceRect = surface.getBoundingClientRect();
    let x = e.clientX - surfaceRect.left;
    let y = e.clientY - surfaceRect.top;
    return {x, y};
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
  function showCanvasMenu(e, elem) {
    e.preventDefault();
    dispatch("showMenu", {x: e.clientX, y: e.clientY, contentFunction: canvasMenu});
  }

  function canvasMenu() {
    var views = ixer.select("view", {}).filter((view) => {
      return true; //!api.code.hasTag(view["view: view"], "hidden"); // && view["view: kind"] !== "primitive";
    }).map((view) => {
      return {c: "item relationship", text: code.name(view["view: view"]), click: addViewToQuery, viewId: view["view: view"]};
    });
    views.sort(function(a, b) {
      return a.text.localeCompare(b.text);
    });
    return {c: "view-selector", children: views};
  }

  function addViewToQuery(e, elem) {
    var menu = localState.menu;
    dispatch("clearMenu", {}, true);
    dispatch("addViewToQuery", {viewId: elem.viewId, top: menu.top, left: menu.left});
  }

  function clearCanvasSelection(e, elem) {
    if(e.target === e.currentTarget && !e.shiftKey) {
      dispatch("clearSelection", {});
    }
  }
  
  function nodeDisplayInfo(curNode) {
    let text = "";
    let small = false;
    if (curNode.entity !== undefined) {
      text = curNode.entity;
    } else if (curNode.type === "relationship") {
      text = code.name(curNode.source["source: source view"]);
      small = true;
    } else if (curNode.type === "primitive") {
      text = code.name(curNode.primitive);
      small = true;
    } else if (curNode.type === "attribute") {
      text = code.name(curNode.field);
    } else if (curNode.type === "attribute-relationship") {
      text = curNode.operation;
    }
    let {left, top} = toPosition(curNode);
    let height = nodeHeight + 2 * nodeHeightPadding;
    let width = Math.max(text.length * nodeWidthMultiplier + 2 * nodeWidthPadding, nodeWidthMin); 
    if(small) {
      width = Math.max(text.length * nodeSmallWidthMultiplier + nodeWidthPadding, nodeWidthMin);
    }
    return {left, top, width, height, text};
  }

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
    klass += ` ${curNode.type}`;
    if (curNode.entity !== undefined) {
      klass += " entity";
    }
    if (curNode.filter) {
      var op = curNode.filter.operation;
      var filterUi:any = {c: "attribute-filter", dblclick: modifyFilter, node: curNode, children: [
        {c: "operation", text: curNode.filter.operation}
      ]};
      if(localState.modifyingFilterNodeId === curNode.id) {
        filterUi.children.push({c: "value", children: [
          {c: "filter-editor", contentEditable: true, postRender: focusOnce, keydown: submitOnEnter, 
            blur: stopModifyingFilter, viewId, node: curNode, text: curNode.filter.value}
        ]});
      } else {
        filterUi.children.push({c: "value", text: curNode.filter.value});
      }
      content.push(filterUi);
    }
    var {left, top, width, height, text} = nodeDisplayInfo(curNode);
    var elem = {c: "item " + klass, selected: uiSelected, width, height,
                mousedown: selectNode, dblclick: openNode, draggable: true, dragstart: storeDragOffset,
                drag: setNodePosition, dragend: finalNodePosition, node: curNode, text};
    content.unshift(elem);
    return {c: "item-wrapper", top: top, left: left, size: {width, height}, node: curNode, selected: uiSelected, children: content};
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

  function unjoinNodes(e, elem) {
    dispatch("unjoinNodes", {fromNode: elem.node});
  }

  function selectNode(e, elem) {
    e.stopPropagation();
    dispatch("selectNode", {node: elem.node, shiftKey: e.shiftKey});
  }

  function openNode(e, elem) {
    if(elem.node.type === "relationship") {
      dispatch("openRelationship", {node: elem.node});
    }
  }

  function storeDragOffset(e, elem) {
    var rect = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"),0,0);
    dispatch("setDragOffset", {x: e.clientX - rect.left, y: e.clientY - rect.top});
  }

  function finalNodePosition(e, elem) {
    dispatch("finalNodePosition", {node: elem.node});
  }

  function setNodePosition(e, elem) {
    if(e.clientX === 0 && e.clientY === 0) return;
    let surface:any = document.getElementsByClassName("surface")[0];
    let surfaceRect = surface.getBoundingClientRect();
    let x = e.clientX - surfaceRect.left - api.localState.dragOffsetX;
    let y = e.clientY - surfaceRect.top - api.localState.dragOffsetY;
    dispatch("setNodePosition", {
      node: elem.node,
      pos: {left: x, top: y}
    });
  }

  //---------------------------------------------------------
  // auto completer
  //---------------------------------------------------------

  interface completion {
    text: string;
    value: any;
    class?: string;
  }

  function autoCompleter(completions: completion[]) {
    var items = completions.map(completionItem);
  }

  function completionItem(completion: completion) {
    return {c: `completion-item ${completion.class}`, text: completion.text, key: completion.value};
  }

  //---------------------------------------------------------
  // keyboard handling
  //---------------------------------------------------------

  document.addEventListener("keydown", function(e) {
    var KEYS = api.KEYS;
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

    //remove
    if(e.keyCode === KEYS.BACKSPACE) {
      dispatch("removeSelection", null);
      e.preventDefault();
    }


  });

  //---------------------------------------------------------
  // Go!
  //---------------------------------------------------------

  client.afterInit(() => {
    loadPositions();
    render();
  });
  window["dispatcher"] = {render: render};
}