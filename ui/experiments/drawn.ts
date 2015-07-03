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
  
  localState.selectedEntities = [];
  
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
  
  //---------------------------------------------------------
  // Dispatch
  //---------------------------------------------------------
  
  function dispatch(event, info, rentrant?) {
    //console.log("dispatch[" + event + "]", info);
    var diffs = [];
    switch(event) {
      case "setDragOffset":
        localState.dragOffsetX = info.x;
        localState.dragOffsetY = info.y;
      break;
      case "setNodePosition":
        var id = info.node.id;
        positions[id] = info.pos;
      break;
      case "finalNodePosition":
        var id = info.node.id;
        var currentPos = positions[id];
        diffs = [
          api.insert("editor node position", {node: id, x: currentPos.left, y: currentPos.top}),
          api.remove("editor node position", {node: id})
        ]
      break;
      case "openRelationship":
        localState.drawnUiActiveId = info.node.source["source: source view"];
      break;
      case "openQuery":
        localState.drawnUiActiveId = info.queryId;
      break;
      case "gotoQuerySelector":
        localState.drawnUiActiveId = false;
      break;
      case "createNewQuery":
        var newId = uuid();
        localState.drawnUiActiveId = newId;
        diffs = [
          api.insert("view", {view: newId, kind: "join", dependents: {"display name": {name: "New query!"}}})  
        ];
      break;
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
        var formatted = api.toDiffs(diffs);
        ixer.handleDiffs(formatted);
        client.sendToServer(formatted, false);
      }
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
      queryMenu(view[0]),
      queryCanvas(view[0]),
      localState.drawnUiActiveId ? {c: "button", text: "back", click: gotoQuerySelector} : undefined,
      //queryTools(view[0]),
    ]};
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
    var entLookup = {};
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
          var link: any = {left: attribute, right: attribute.relationship};
          if(attribute.entity && code.name(attribute.field) !== attribute.entity) {
            link.name = code.name(attribute.field);
          }
          links.push(link);
        }
        
      } else {
        //@TODO: draw calculations somehow
        for(var constraint of sourceConstraints) {
          constraints.push(constraint);
        }
        var curPrim: any = {type: "primitive", source: sourceId, primitive: source["source: source view"]};
        curPrim.id = `${curPrim.source}|${curPrim.primitive}`;
        
        for(var field of ixer.select("field", {view: sourceViewId})) {
          if(field.kind === "output") {
            var attribute: any = {type: "attribute", field: field["field: field"], source, id: `${sourceId}|${field["field: field"]}`};
            sourceAttributeLookup[attribute.id] = attribute;
            nodes.push(attribute);
            var link: any = {left: attribute, right: curPrim};
            link.name = code.name(attribute.field);
            links.push(link);
          } else {
            //if it's not an output field then it's an input which we represent as links
            sourceAttributeLookup[`${sourceId}|${field["field: field"]}`] = {type: "primitive-input", primitive: curPrim, input: true, field: field["field: field"], source, id: `${sourceId}|${field["field: field"]}`};  
          }
          
        }
        
        nodes.push(curPrim);
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
          if(rightAttr.entity && neueLeft.entity === undefined) {
            neueLeft.entity = rightAttr.entity;
          }
          for(var link of links) {
            if(link.left === rightAttr) {
              link.left = neueLeft;
            } else if(link.right === rightAttr) {
              link.right = neueLeft;
            }
          }
        } else {
          //otherwise we create a relationship between the two attributes
          var attrRelationship = {type: "attribute-relationship", operation: op, id: constraintId};
          links.push({left: leftAttr, right: attrRelationship});
          links.push({left: rightAttr, right: attrRelationship});
          nodes.push(attrRelationship);
        }
    }
    return {nodes, links};
  }
  
  function tableToEntityInfo(view) {
    var nodes = [];
    var links = [];
    return {nodes, links};
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
      var d = `M ${fromLeft} ${fromTop} L ${toLeft} ${toTop}`;
      var color = "#bbb";
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
    return {text: "menu here!"};
  }
  
  function clearCanvasSelection(e, elem) {
    if(e.target === e.currentTarget && !e.shiftKey) {
      dispatch("clearSelection", {});
    }
  }
  
  function nodeItem(curNode): any {
    var editable = localState.editingEntity === curNode.id;
    var selected = localState.selectedEntities.indexOf(curNode.id) > -1;
    var klass = "";
    if(editable) {
      klass += " editing";
    }
    if(selected) {
      klass += " selected";
    }
    var text, adornment;
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
        adornment = {c: "attribute-filter", children: [
          op !== "=" ? {c: "operation", text: curNode.filter.operation} : undefined,
          {c: "value", text: curNode.filter.value} 
        ]}
      }
    } else if (curNode.type === "attribute-relationship") {
      text = curNode.operation;
    }
    var {left, top} = toPosition(curNode);
    var elem = {c: "item " + klass, contentEditable: editable, input: updateEntityName, blur: stopEditingEntity, 
                mousedown: selectEntity, dblclick: openNode, draggable: true, dragstart: storeDragOffset, 
                drag: setNodePosition, dragend: finalNodePosition, node: curNode, top: top, left: left, text: text}
    if(adornment) {
      elem.top = undefined;
      elem.left = undefined;
      return {c: "item-wrapper", top: top, left: left, node: curNode, children: [
        elem,
        adornment
      ]};
    }
    return elem;
  }
  
  function selectEntity(e, elem) {
    dispatch("selectEntity", {queryEntityId: elem.queryEntityId, shiftKey: e.shiftKey});
  }
  
  function openNode(e, elem) {
    if(elem.node.type === "relationship") {
      dispatch("openRelationship", {node: elem.node});
    }
  }
  
  function editEntityName(e, elem) {
    dispatch("editEntityName", {queryEntityId: elem.queryEntityId});
  }
  
  function updateEntityName(e, elem) {
    dispatch("updateEntityName", {queryEntityId: elem.queryEntityId, value: e.currentTarget.textContent});
  }
  
  function stopEditingEntity(e, elem) {
    dispatch("stopEditingEntity", {});
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
      dispatch("remove", null);
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