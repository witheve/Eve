/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
module drawn {

  declare var uuid;
  var localState = api.localState;
  var ixer = api.ixer;
  var code = api.code;

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

	//---------------------------------------------------------
  // Renderer
  //---------------------------------------------------------

  export var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  renderer.queued = false;
  export function render() {
   if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        var start = performance.now();
        var tree = root();
        var total = performance.now() - start;
        if(total > 10) {
          console.log("Slow root: " + total);
        }
        renderer.render(tree);
        renderer.queued = false;
      });
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

  localState.drawnUiActiveId = "da7f9321-a4c9-4292-8cf6-5174f3ed2f11";
// localState.drawnUiActiveId = "block field";
localState.drawnUiActiveId = "e10b9868-b2e8-4942-9ead-1e2830046d4d";

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

  //---------------------------------------------------------
  // AST helpers
  //---------------------------------------------------------

  function removeSource(sourceId) {
    return [
      api.remove("source", {source: sourceId}),
      api.remove("constraint", {"left source": sourceId}),
      api.remove("constraint", {"right source": sourceId})
    ]
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
          localState.selectedNodes = {};
        }
        localState.selectedNodes[node.id] = node;
      break;
      case "clearSelection":
        localState.selectedNodes = {};
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
            dispatch(action.action, action, true);
          }
        }
      break;
      //---------------------------------------------------------
      // Navigation
      //---------------------------------------------------------
      case "openRelationship":
        localState.drawnUiActiveId = info.node.source["source: source view"];
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
          api.insert("view", {view: newId, kind: "join", dependents: {"display name": {name: "New query!"}}})
        ];
      break;
      case "addViewToQuery":
        let sourceId = uuid();
        let queryId = localState.drawnUiActiveId;
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
        //we may also have information about where we should position it.
        if(info.top !== undefined) {
          diffs.push(api.insert("editor node position", {node: sourceId, x: info.left, y: info.top}));
          positions[sourceId] = {left: info.left, top: info.top};
          console.log("set position", sourceId, info);
        }
      break;
      case "joinNodes":
        var {target, node} = info;
        if(!node || !target) throw new Error("Trying to join at least one non-existent node");
        let constraintId = uuid();
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
            console.log("bind prim", {
              constraint: uuid(),
              view: localState.drawnUiActiveId,
              "left source": sourceId,
              "left field": fieldId,
              "right source": "constant",
              "right field": api.primitiveDefaults[source["source: source view"]][fieldId],
              operation: "="});
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
      case "setQueryName":
        diffs.push(api.insert("display name", {id: info.viewId, name: info.value}),
                   api.remove("display name", {id: info.viewId}));
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

    if(diffs.length) {
        var formatted = api.toDiffs(diffs);
        ixer.handleDiffs(formatted);
        client.sendToServer(formatted, false);
    }
    if(!rentrant) {
      render();
    }
  }

  //---------------------------------------------------------
  // root
  //---------------------------------------------------------

  function root() {
    var page:any;
    if(localState.drawnUiActiveId) {
      page = queryUi(localState.drawnUiActiveId);
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

  function queryUi(viewId) {
    var view = ixer.select("view", {view: viewId});
    if(!view || !view.length) return;
    return {c: "query", children: [
      {c: "query-name", contentEditable: true, blur: setQueryName, viewId: viewId, text: code.name(viewId)},
      queryMenu(view[0]),
      queryCanvas(view[0]),
      localState.drawnUiActiveId ? {c: "button", text: "back", click: gotoQuerySelector} : undefined,
      //queryTools(view[0]),
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

  function queryTools(query) {
    return {c: "toolbox", children: [
      {c: "tool entity", text: "entity", click: addEntity},
      {c: "tool attribute", text: "attribute"},
    ]};
  }

  function addEntity(e, elem) {
    dispatch("addEntity", {queryId: elem.queryId});
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
        }

      } else {
        for(var constraint of sourceConstraints) {
          constraints.push(constraint);
        }
        var curPrim: any = {type: "primitive", sourceId: sourceId, primitive: source["source: source view"]};
        curPrim.id = `${curPrim.source}|${curPrim.primitive}`;
        let fields = ixer.select("field", {view: sourceViewId});
        for(var field of fields) {
          // if(field["field: kind"] === "output") {
            var attribute: any = {type: "attribute", field: field["field: field"], source, isInput: field["field: kind"] !== "output", id: `${sourceId}|${field["field: field"]}`};
            sourceAttributeLookup[attribute.id] = attribute;
            nodes.push(attribute);
            nodeLookup[attribute.id] = attribute;
            var link: any = {left: attribute, right: curPrim};
            link.name = code.name(attribute.field);
            links.push(link);
          // } else {
          //   //if it's not an output field then it's an input which we represent as links
          //   sourceAttributeLookup[`${sourceId}|${field["field: field"]}`] = {type: "primitive-input", primitive: curPrim, input: true, field: field["field: field"], source, id: `${sourceId}|${field["field: field"]}`};
          // }

        }

        nodes.push(curPrim);
        nodeLookup[curPrim.id] = curPrim;
      }
    }
    //look through the constraints, and dedupe overlapping attributes
    var mappedEntities = {};
    for(var constraint of constraints) {
      var constraintId = constraint["constraint: constraint"];
      var op = ixer.select("constraint operation", {constraint: constraintId})[0]["constraint operation: operation"];
      var leftSide = ixer.select("constraint left", {constraint: constraintId})[0];
      var rightSide = ixer.select("constraint right", {constraint: constraintId})[0];
      var rightId = `${rightSide["constraint right: right source"]}|${rightSide["constraint right: right field"]}`;
      var leftId = `${leftSide["constraint left: left source"]}|${leftSide["constraint left: left field"]}`;
        //this constraint represents an attribute relationship
        var leftAttr = sourceAttributeLookup[leftId];
        var rightAttr = sourceAttributeLookup[rightId];

        //We need to handle constant relationships differently
        if(!leftAttr || !rightAttr) {
          var constant, attr;
          if(leftAttr) {
            attr = leftAttr;
            constant = ixer.select("constant", {constant: rightSide["constraint right: right field"]})[0];
          } else {
            attr = rightAttr;
            constant = ixer.select("constant", {constant: leftSide["constraint left: left field"]})[0];
          }
          if(constant !== undefined) {
            attr.filter = {operation: op, value: constant["constant: value"]};
          }
          continue;
        }

        if(leftAttr.input || rightAttr.input) {
          var left, right, name;
          if(leftAttr.input) {
            left = rightAttr;
            right = leftAttr.primitive;
            name = code.name(leftAttr.field);
          } else {
            left = leftAttr;
            right = rightAttr.primitive;
            name = code.name(rightAttr.field);
          }
          var primLink = {left, right, name};
          links.push(primLink);
        //If this is an equality then these nodes are the "same" and we need to remove the right-side.
        } else if(op === "=") {
          var rightIx = nodes.indexOf(rightAttr);
          if(rightIx > -1) {
            nodes.splice(rightIx, 1);
            delete nodeLookup[rightAttr.id];
          }
          //fix links as well
          var neueLeftId = leftId;
          //check if left has already been remapped too
          while(mappedEntities[neueLeftId]) {
            neueLeftId = mappedEntities[neueLeftId];
          }
          if(rightId !== neueLeftId) {
            mappedEntities[rightId] = neueLeftId;
          }
          var neueLeft = sourceAttributeLookup[neueLeftId];
          if(neueLeft.mergedAttributes === undefined) {
            neueLeft.mergedAttributes = [];
          }
          neueLeft.mergedAttributes.push(rightAttr);
          if(rightAttr.entity && neueLeft.entity === undefined) {
            neueLeft.entity = rightAttr.entity;
          }

          //if they have different names then we need to name the link
          var newName = undefined;
          if(code.name(neueLeft.field) !== code.name(rightAttr.field)) {
            newName = code.name(rightAttr.field);
          }
          for(var link of links) {
            if(link.left === rightAttr) {
              link.left = neueLeft;
              if(newName) link.name = newName;
            } else if(link.right === rightAttr) {
              link.right = neueLeft;
              if(newName) link.name = newName;
            }
          }
        } else {
          //otherwise we create a relationship between the two attributes
          var attrRelationship = {type: "attribute-relationship", operation: op, id: constraintId};
          links.push({left: leftAttr, right: attrRelationship});
          links.push({left: rightAttr, right: attrRelationship});
          nodes.push(attrRelationship);
          nodeLookup[attrRelationship.id] = attrRelationship;
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
    var {nodes, links} = viewToEntityInfo(view);
    var items = [];
    for(var node of nodes) {
      items.push(nodeItem(node));
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
        var fromLeft = leftItem.left + 30;
        var fromTop = leftItem.top + 13;
        var toLeft = rightItem.left + 30;
        var toTop = rightItem.top + 13;
      } else {
        var fromLeft = rightItem.left + 30;
        var fromTop = rightItem.top + 13;
        var toLeft = leftItem.left + 30;
        var toTop = leftItem.top + 13;
      }
      var color = "#bbb";
      var d = `M ${fromLeft} ${fromTop} L ${toLeft} ${toTop}`;

      var pathId = `${link.right.id} ${link.left.id} path`;
      linkItems.push({svg: true, id: pathId, t: "path", d: d, c: "link", stroke: color, strokeWidth: 1});
      linkItems.push({svg: true, t: "text", children: [
        {svg: true, t: "textPath", startOffset: "50%", xlinkhref: `#${pathId}`, text: link.name}
      ]});
    }
    return {c: "canvas", contextmenu: showCanvasMenu, mousedown: clearCanvasSelection, dragover: preventDefault, children: [
      {c: "links", svg: true, width:"100%", height:"100%", t: "svg", children: linkItems},
      {c: "nodes", children: items}
    ]};
  }

  function showCanvasMenu(e, elem) {
    e.preventDefault();
    dispatch("showMenu", {x: e.clientX, y: e.clientY, contentFunction: canvasMenu});
  }

  function canvasMenu() {
    var views = ixer.select("view", {}).filter((view) => {
      return !api.code.hasTag(view["view: view"], "hidden"); // && view["view: kind"] !== "primitive";
    }).map((view) => {
      return {c: "item relationship", text: code.name(view["view: view"]), click: addViewToQuery, viewId: view["view: view"]};
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

  function nodeItem(curNode): any {
    var content = [];
    var selected = localState.selectedNodes[curNode.id];
    var overlapped = localState.overlappingNodes[curNode.id];
    var klass = "";
    if(selected) {
      klass += " selected";
      if(curNode.mergedAttributes) {
        content.push({node: curNode, click: unjoinNodes, text: "unmerge"});
      }
    }
    if(overlapped) {
      klass += " overlapped";
    }
    var text;
    klass += ` ${curNode.type}`;
    if (curNode.entity !== undefined) {
      text = curNode.entity;
      klass += " entity";
    } else if (curNode.type === "relationship") {
      text = code.name(curNode.source["source: source view"]);
    } else if (curNode.type === "primitive") {
      text = code.name(curNode.primitive);
    } else if (curNode.type === "attribute") {
      text = code.name(curNode.field);
      if (curNode.filter) {
        var op = curNode.filter.operation;
        content.push({c: "attribute-filter", children: [
          op !== "=" ? {c: "operation", text: curNode.filter.operation} : undefined,
          {c: "value", text: curNode.filter.value}
        ]});
      }
    } else if (curNode.type === "attribute-relationship") {
      text = curNode.operation;
    }
    var {left, top} = toPosition(curNode);
    var elem = {c: "item " + klass, selected: selected,
                mousedown: selectNode, dblclick: openNode, draggable: true, dragstart: storeDragOffset,
                drag: setNodePosition, dragend: finalNodePosition, node: curNode, text: text}
    content.unshift(elem);
    return {c: "item-wrapper", top: top, left: left, node: curNode, selected: selected, children: content};
  }

  function unjoinNodes(e, elem) {
    dispatch("unjoinNodes", {fromNode: elem.node});
  }

  function selectNode(e, elem) {
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
    dispatch("setNodePosition", {
      node: elem.node,
      pos: {left: e.clientX - api.localState.dragOffsetX, top: e.clientY - api.localState.dragOffsetY}
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
