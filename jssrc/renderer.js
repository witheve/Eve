"use strict"

//---------------------------------------------------------
// MicroReact renderer
//---------------------------------------------------------

let renderer = new Renderer();
document.body.appendChild(renderer.content);

//---------------------------------------------------------
// handle dom updates
//---------------------------------------------------------

// TODO: queue updates to be applied during requestAnimationFrame

var activeElements = {"root": document.createElement("div")};
activeElements["root"].className = "program";
var activeStyles = {};
var supportedTags = {"div": true, "span": true, "input": true};

function insertSorted(parent, child) {
  let current;
  for(let curIx = 0; curIx < parent.children.length; curIx++) {
    current = parent.children[curIx];
    if(current.sort && current.sort > child.sort) {
      break;
    } else {
      current = null;
    }
  }
  if(current) {
    parent.insertBefore(child, current);
  } else  {
    parent.appendChild(child);
  }
}

function safeEav(eav) {
  if(eav[0].type == "uuid")  {
    eav[0] = `⦑${eav[0].value}⦒`
  }
  if(eav[1].type == "uuid")  {
    eav[1] = `⦑${eav[1].value}⦒`
  }
  if(eav[2].type == "uuid")  {
    eav[2] = `⦑${eav[2].value}⦒`
  }
  return eav;
}

function handleDOMUpdates(result) {
  let {insert, remove} = result;
  let additions = {};
  // build up a representation of the additions
  if(insert.length) {
    for(let ins of insert) {
      let [entity, attribute, value] = safeEav(ins);
      if(!additions[entity]) additions[entity] = {}
      switch(attribute) {
        case "tag":
          // we don't care about tags on this guy unless they relate
          // to dom tags
          if(!supportedTags[value]) {
            continue;
          }
          break;
        case "children":
          let children = additions[entity][attribute];
          if(!children) {
            children = [];
            additions[entity][attribute] = children;
          }
          children.push(value);
          continue;
        case "text":
          attribute = "textContent"
          break;
      }
      additions[entity][attribute] = value
    }
  }
  // do removes that aren't just going to be overwritten by
  // the adds
  if(remove && remove.length) {
    // we clean up styles after the fact so that in the case where
    // the style object is being removed, but the element is sticking
    // around, we remove any styles that may have been applied
    let stylesToGC = [];
    for(let rem of remove) {
      let [entity, attribute, value] = safeEav(rem);
      if(activeStyles[entity]) {
        // do style stuff
        let style = activeStyles[entity].style;
        if(!additions[entity] || !additions[entity][attribute]) {
          style[attribute] = "";
        }
      } else if(activeElements[entity]) {
        let elem = activeElements[entity];
        switch(attribute) {
          case "tag":
            if(supportedTags[value]) {
              //nuke the whole element
              elem.parentNode.removeChild(elem);
              activeElements[entity] = null;
            }
            break;
          case "style":
            stylesToGC.push(value);
            break;
          case "children":
            let child = activeElements[value];
            if(child) {
              elem.removeChild(child);
              activeElements[value] = null;
            }
            break;
          case "text":
            if(!additions[entity] || !additions[entity]["text"]) {
              elem.textContent = "";
            }
            break;
          default:
            if(!additions[entity] || !additions[entity][attribute]) {
              //FIXME: some attributes don't like getting set to undefined...
              elem[attribute] = undefined;
            }
            break;
        }
      }
    }
    // clean up any styles that need to go
    for(let styleId of stylesToGC) {
      activeStyles[styleId] = null;
    }
  }

  let styles = [];
  let entities = Object.keys(additions)
  for(let entId of entities) {
    let ent = additions[entId];
    let elem = activeElements[entId]
    // if we don't have an element already and this one doesn't
    // have a tag, then we just skip it (e.g. a style)
    if(!elem && !ent.tag)  continue;
    if(!elem) {
      //TODO: support finding the correct tag
      elem = document.createElement(ent.tag || "div")
      elem.entity = entId;
      activeElements[entId] = elem;
      elem.sort = ent.sort || "";
      insertSorted(activeElements.root, elem)
    }
    let attributes = Object.keys(ent);
    for(let attr of attributes) {
      let value = ent[attr];
      if(attr == "children") {
        for(let child of value) {
          let childElem = activeElements[child];
          if(childElem) {
            insertSorted(elem, childElem)
          } else {
            let childAddition = additions[child];
            // FIXME: if somehow you get a child id, but that child
            // has no facts provided, we'll just lose that information
            // here..
            if(childAddition) {
              childAddition._parent = entId;
            }
          }
        }
      } else if(attr == "style") {
        styles.push(value);
        activeStyles[value] = elem;
      } else if(attr == "textContent") {
        elem.textContent = value;
      } else if(attr == "tag" || attr == "ix") {
        //ignore
      } else if(attr == "_parent") {
        let parent = activeElements[value];
        insertSorted(parent, elem);
      } else {
        elem.setAttribute(attr, value);
      }
    }
  }

  for(let styleId of styles) {
    let style = additions[styleId];
    if(!style) continue;
    let elem = activeStyles[styleId];
    if(!elem) {
      console.error("Got a style for an element that doesn't exist.");
      continue;
    }
    let elemStyle = elem.style;
    let styleAttributes = Object.keys(style);
    for(let attr of styleAttributes) {
      elemStyle[attr] = style[attr];
    }
  }
}

// add our root to the body so that we update appropriately
document.body.appendChild(activeElements["root"])

//---------------------------------------------------------
// Helpers to send event update queries
//---------------------------------------------------------

function formatObjects(objs) {
  let rows = [];
  for(let obj of objs) {
    let fields = []
    for(let key in obj) {
      let value = obj[key];
      if(key == "tags") {
        for(let tag of value) {
          fields.push("#" + tag)
        }
      } else {
        let stringValue;
        if(typeof value == "string" && value[0] == "⦑") {
          stringValue = value
        } else {
          stringValue = JSON.stringify(value);
        }
        fields.push(key + ": " + stringValue);
      }
    }
    rows.push("[" + fields.join(", ") + "]")
  }
  return rows;
}

function sendEvent(objs) {
  if(!objs.length) return;
  let query = `handle some event
  update
    ${formatObjects(objs).join("\n    ")}
  `
  console.log("QUERY", query);
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "event", type: "query", query}))
  }
  return query;
}

//---------------------------------------------------------
// Event bindings to forward events to the server
//---------------------------------------------------------

window.addEventListener("click", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  while(current) {
    if(current.entity) {
      objs.push({tags: ["click"], element: current.entity});
    }
    current = current.parentNode
  }
  // objs.push({tags: ["click"], element: "window"});
  sendEvent(objs);
});

window.addEventListener("input", function(event) {
  let {target} = event;
  if(target.entity) {
    let objs = [{tags: ["input"], element: target.entity, value: target.value}];
    sendEvent(objs);
  }
});

window.addEventListener("focus", function(event) {
  let {target} = event;
  if(target.entity) {
    let objs = [{tags: ["focus"], element: target.entity}];
    console.log(sendEvent(objs));
  }
}, true);

window.addEventListener("blur", function(event) {
  let {target} = event;
  if(target.entity) {
    let objs = [{tags: ["blur"], element: target.entity}];
    console.log(sendEvent(objs));
  }
}, true);

window.addEventListener("keydown", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      objs.push({tags: ["keydown"], element: current.entity, key});
    }
    current = current.parentNode
  }
  objs.push({tags: ["keydown"], element: "window", key});
  // sendEvent(objs);
});

window.addEventListener("keyup", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      objs.push({tags: ["keyup"], element: current.entity, key});
    }
    current = current.parentNode
  }
  objs.push({tags: ["keyup"], element: "window", key});
  // sendEvent(objs);
});

//---------------------------------------------------------
// Draw node graph
//---------------------------------------------------------

let activeIds = {};
let allNodeGraphs = {};

function drawNode(nodeId, graph, state, seen) {
  let node = graph[nodeId];
  if(seen[nodeId]) {
    return {text: `seen ${node.type}`};
  } else if(node.type == "terminal" || node.type == "subtail") {
    return undefined;
  }
  seen[nodeId] = true;
  let active = activeClass(node, state);
  let children = [];
  let childrenContainer = {c: "node-children", children};
  let me = {c: `node`, children: [
    {c: `${node.type} node-text ${active}`, text: `${node.type} ${node.scan_type || ""} (${node.count || 0})`},
    childrenContainer
  ]};
  if((node.type == "fork") || (node.type == "choose")) {
    childrenContainer.c += ` fork-node-children`;
    for(let child of node.arms) {
      children.push({style: "margin-right: 20px;", children: [drawNode(child, graph, state, seen)]});
    }
  } else if(node.type == "sub") {
    childrenContainer.c += ` sub-node-children`;
    children.push({style: "margin-left: 30px;", children: [drawNode(node.arms[1], graph, state, seen)]});
    children.push(drawNode(node.arms[0], graph, state, seen));
  } else {
    for(let child of node.arms) {
      children.push(drawNode(child, graph, state, seen));
    }
  }
  return me;
}

function posToToken(pos, lines) {
  let tokens = lines[pos.line + 1] || [];
  for(let token of tokens) {
    console.log(pos, token);
    if(token.offset <= pos.ch && token.offset + token.value.length >= pos.ch) {
      return token;
    }
  }
  return false;
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    let editor = new CodeMirror(node);
    editor.setValue(elem.value);
    editor.on("cursorActivity", function() {
      let pos = editor.getCursor();
      activeIds = nodeToRelated(posToToken(pos, elem.parse.lines), elem.parse);
      console.log(activeIds);
      drawNodeGraph();
    });
    node.editor = editor;
  }
}

function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

function indexParse(parse) {
  let lines = {};
  for(let token of parse.context.tokens) {
    if(!lines[token.line]) {
      lines[token.line] = [];
    }
    lines[token.line].push(token)
  }
  parse.lines = lines;
  let down = {};
  let up = {};
  for(let edge of parse.context.downEdges) {
    if(!down[edge[0]]) down[edge[0]] = [];
    if(!up[edge[1]]) up[edge[1]] = [];
    down[edge[0]].push(edge[1]);
    up[edge[1]].push(edge[0]);
  }
  parse.edges = {down, up};
}

function nodeToRelated(node, parse) {
  if(!node.id) return {};
  let {up, down} = parse.edges;
  let active = {};
  active[node.id] = true;
  let nodesUp = up[node.id] ? up[node.id].slice() : [];
  for(let ix = 0; ix < nodesUp.length; ix++) {
    let cur = nodesUp[ix];
    active[cur] = true;
    for(let next of up[cur] || []) nodesUp.push(next);
  }
  let nodesDown = down[node.id] ? down[node.id].slice() : [];
  for(let ix = 0; ix < nodesDown.length; ix++) {
    let cur = nodesDown[ix];
    active[cur] = true;
    for(let next of down[cur] || []) nodesDown.push(next);
  }
  return active;
}

function activeClass(node, state) {
  return state.activeIds[node.id] ? "active" : "";
}

function drawNodeGraph() {
  let graphs = [];
  for(let headId in allNodeGraphs) {
    let cur = allNodeGraphs[headId];
    let tree = drawNode(headId, cur.nodes, {activeIds}, {});
    // let ast = drawAST(cur.parse.ast, {activeIds});
    // let parse = drawParse(cur.parse, {activeIds});
    let ordered = drawOrdered(cur.parse.children, {activeIds});
    graphs.push({c: "parse-info", children: [
      {c: "run-info", children: [
        CodeMirrorNode({value: cur.parse.context.code, parse: cur.parse}),
        {text: `total time: ${cur.total_time}s`},
        {text: `iterations: ${cur.iterations}`},
      ]},
      // ast,
      // parse,
      ordered,
      tree,
    ]});
  }
  renderer.render([{c: "graph-root", children: graphs}]);
}

//---------------------------------------------------------
// Draw AST
//---------------------------------------------------------

function drawAST(root, state) {
  let children = [];
  let node = {c: "ast-node", children: [
    {c: "ast-type", text: root.type},
    {c: "ast-children", children}
  ]}
  if(root.children) {
    for(let child of root.children) {
      children.push(drawAST(child, state));
    }
  }
  return node;
}

//---------------------------------------------------------
// Draw parse
//---------------------------------------------------------

function drawParse(root, state) {
  let children = [];
  let node = {c: "parse-node", children: [
    {c: "parse-type", text: root.type},
    {c: "parse-children", children}
  ]}
  if(root.type == "code") {
    for(let child of root.children) {
      children.push(drawParse(child, state));
    }
  } else if(root.type == "query") {
    for(let object of root.objects) {
      children.push(drawParse(object, state));
    }
  }
  return node;
}

//---------------------------------------------------------
// Draw ordered
//---------------------------------------------------------

function orderedNode(node, state) {
  let active = activeClass(node, state);
  if(node.type == "object" || node.type == "mutate") {
    return {c: `ordered-object ${active}`, children: [
      {text: node.type},
      {c: "eav", children: [orderedNode(node.entity, state), orderedNode(node.attribute, state), orderedNode(node.value, state)]}
    ]};
  } else if(node.type == "subproject") {
    let projections = [{text: "["}]
    for(let proj of node.projection) {
      projections.push(orderedNode(proj, state));
    }
    projections.push({text: "]"});
    return {c: `subproject ${active}`, children: [
      {c: "row", children: [
        {text: node.type},
        {c: "subproject-projection", children: projections},
      ]},
      {c: "subproject-children", children: node.nodes.map(function(cur) { return orderedNode(cur, state); })}
    ]};
  } else if(node.type == "variable") {
    return {text: `variable<${node.name}>`};
  } else if(node.type == "constant") {
    return {text: node.constant};
  } else if(typeof node == "string") {
    return {text: node};
  }
}

function drawOrdered(ordered, state) {
  let queries = [];
  for(let query of ordered) {
    var items = [];
    for(let node of query.unpacked) {
      items.push(orderedNode(node, state));
    }
    queries.push({c: "ordered-query", children: [
      {text: query.name},
      {c: "ordered-query-children", children: items},
    ]});
  }
  return {c: "ordered", children: [
    {children: queries},
  ]}
}

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------

var socket = new WebSocket("ws://" + window.location.host +"/ws");
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  console.log(data)
  if(data.type == "result") {
    handleDOMUpdates(data);
  } else if(data.type == "node_graph") {
    allNodeGraphs[data.head] = data;
    indexParse(data.parse);
    drawNodeGraph();
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
}
