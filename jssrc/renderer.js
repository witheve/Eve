"use strict"

//---------------------------------------------------------
// MicroReact renderer
//---------------------------------------------------------
let renderer = new Renderer();
document.body.appendChild(renderer.content);

//---------------------------------------------------------
// handle dom updates
//---------------------------------------------------------

// root will get added to the dom by the program microReact element in
// drawNodeGraph
var activeElements = {"root": document.createElement("div")};
activeElements["root"].className = "program";
var activeStyles = {};
var activeClasses = {};
var activeChildren = {};
var supportedTags = {
  "div": true, "span": true, "input": true, "ul": true, "li": true, "label": true, "button": true, "header": true, "footer": true, "a": true, "strong": true,
  "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
  "ol": true, "p": true, "pre": true, "em": true, "img": true, "canvas": true, "script": true, "style": true, "video": true,
  "table": true, "tbody": true, "thead": true, "tr": true, "th": true, "td": true,
  "form": true, "optgroup": true, "option": true, "select": true, "textarea": true,
  "title": true, "meta": true, "link": true,
  "svg": true, "circle": true, "line": true, "rect": true, "polygon":true, "text": true, "image": true, "defs": true, "pattern": true, "linearGradient": true, "g": true, "path": true
};
var svgs = {"svg": true, "circle": true, "line": true, "rect": true, "polygon":true, "text": true, "image": true, "defs": true, "pattern": true, "linearGradient": true, "g": true, "path": true};
// Map of input entities to a queue of their values which originated from the client and have not been received from the server yet.
var sentInputValues = {};
var lastFocusPath = null;
var updatingDOM = null;
var selectableTypes = {"": true, undefined: true, text: true, search: true, password: true, tel: true, url: true};

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

function doRender() {
  handleDOMUpdates(state);
  frameRequested = false;
}

function handleDOMUpdates(state) {
  let diffEntities = 0;

  if(document.activeElement && document.activeElement.entity) {
    updatingDOM = document.activeElement;
  }
  if(!updatingDOM) {
    updatingDOM = true;
  }

  let regenClassesFor = [];
  let regenStylesFor = [];
  let {dirty, entities, parents} = state;
  for(let entityId in dirty) {
    let entity = entities[entityId];
    let elem = activeElements[entityId];

    if(dirty[entityId].indexOf("tag") !== -1) {
      let value = entity.tag;
      let tag;
      if(value && value.constructor == Array) {
        for(let t of value) {
          if(supportedTags[t]) {
            if(tag) console.error(`Received multiple supported tags for entity: ${entityId} (tags: ${tag}, ${t})`)
            tag = t;
          }
        }
      } else if(supportedTags[value]) {
        tag = value;
      }

      if(!tag && elem) { // Nuke the element if it no longer has a supported tag
        let parent = elem.parentNode;
        if(parent) parent.removeChild(elem);
        elem = activeElements[entityId] = null;

      } else if(tag && elem && elem.tagName !== tag.toUpperCase()) { // Nuke and restore the element if its tag has changed
        let parent = elem.parentNode;
        if(parent) parent.removeChild(elem);
        if(svgs[tag]) {
          elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        } else {
          elem = document.createElement(tag || "div")
        }
        elem.entity = entityId;
        activeElements[entityId] = elem;
        elem.sort = entity.sort || entity["eve-auto-index"] || "";
        if(parent) insertSorted(parent, elem)


      } else if(tag && !elem) { // Create a new element and mark all its attributes dirty to restore it.
        if(svgs[tag]) {
          elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        } else {
          elem = document.createElement(tag || "div")
        }
        elem.entity = entityId;
        activeElements[entityId] = elem;
        elem.sort = entity.sort || entity["eve-auto-index"] || "";
        let parent = activeElements[activeChildren[entityId] || "root"];
        if(parent) {
          insertSorted(parent, elem)
        }
      }
    }

    if(activeClasses[entityId]) {
      for(let entId of activeClasses[entityId]) {
        regenClassesFor.push(entId);
      }
    } else if(activeStyles[entityId]) {
      for(let entId of activeStyles[entityId]) {
        regenStylesFor.push(entId);
      }
    }

    if(!elem) continue;

    for(let attribute of dirty[entityId]) {
      let value = entity[attribute];

      if(attribute === "children") {
        if(!value) { // Remove all children
          while(elem.lastElementChild) {
            elem.removeChild(elem.lastElementChild);
          }
        } else {
          let children = (value.constructor === Array) ? clone(value) : [value];
          // Remove any children that no longer belong
          for(let ix = elem.children.length - 1; ix >= 0; ix--) {
            let child = elem.children[ix];
            let childIx = children.indexOf(child.entity);
            if(childIx == -1) {
              elem.removeChild(child);
              child._parent = null;
            } else {
              children.splice(childIx, 1);
            }
          }
          // Add any new children which already exist
          for(let childId of children) {
            let child = activeElements[childId];
            if(child) {
              insertSorted(elem, child);
            }
          }
        }
      } else if(attribute === "class") {
        regenClassesFor.push(entityId);

      } else if(attribute === "style") {
        regenStylesFor.push(entityId);

      } else if(attribute === "text") {
        let text = (value && value.constructor === Array) ? value.join(", ") : value;
        elem.textContent = (value !== undefined) ? value : "";

      } else if(attribute === "value") {
        if(!value) {
          elem.value = "";
        } else if(value.constructor === Array) {
          console.error("Unable to set 'value' multiple times on entity", entity, value);
        } else {
          elem.value = value; // @FIXME: Should this really be setAttribute?
        }

      } else if(attribute === "checked") {
        if(value && value.constructor === Array) {
          console.error("Unable to set 'checked' multiple times on entity", entity, value);
        } else {
          if(value) elem.setAttribute("checked", true);
          else elem.removeAttribute("checked");
        }

      } else {
        value = (value && value.constructor === Array) ? value.join(", ") : value;
        if(value === undefined) {
          elem.removeAttribute(attribute);
        } else {
          elem.setAttribute(attribute, value);
        }
      }
    }

    let attrs = Object.keys(entity);
    if(attrs.length == 0) {
      diffEntities--;
      delete entities[entityId];
    }
  }

  for(let entityId of regenClassesFor) {
    let elem = activeElements[entityId];
    if(!elem) continue;
    let entity = entities[entityId];
    let value = entity["class"];
    if(!value) {
      elem.className = "";
    } else {
      value = (value.constructor === Array) ? value : [value];
      let neue = [];
      for(let klassId of value) {
        if(klassId[0] == "⦑" && klassId[klassId.length - 1] == "⦒" && activeClasses[klassId]) {
          let klass = entities[klassId];
          for(let name in klass) {
            if(klass[name] && neue.indexOf(name) === -1) {
              neue.push(name);
            }
          }
        } else {
          neue.push(klassId);
        }
      }
      elem.className = neue.join(" ");
    }
  }

  for(let entityId of regenStylesFor) {
    let elem = activeElements[entityId];
    if(!elem) continue;
    let entity = entities[entityId];
    let value = entity["style"];
    elem.removeAttribute("style"); // @FIXME: This could be optimized to care about the diff rather than blowing it all away
    if(value) {
      value = (value.constructor === Array) ? value : [value];
      let neue = [];
      for(let styleId of value) {
        if(styleId[0] == "⦑" && styleId[styleId.length - 1] == "⦒" && activeStyles[styleId]) {
          let style = entities[styleId];
          for(let attr in style) {
            elem.style[attr] = style[attr];
          }
        } else {
          neue.push(styleId);
        }
      }
      if(neue.length) {
        elem.setAttribute("style", elem.getAttribute("style") + "; " + neue.join("; "));
      }
    }
  }

  //////

  if(lastFocusPath) {
    let current = activeElements.root;
    let ix = 0;
    for(let segment of lastFocusPath) {
      current = current.children[segment];
      if(!current) {
        updatingDOM.blur();
        lastFocusPath = null;
        break;
      }
      ix++;
    }
    if(current && current.entity !== updatingDOM.entity) {
      current.focus();
      if(updatingDOM.tagName === current.tagName && current.tagName === "INPUT" && selectableTypes[updatingDOM.type] && selectableTypes[current.type]) {
        current.setSelectionRange(updatingDOM.selectionStart, updatingDOM.selectionEnd);
      }
    }
  }
  updatingDOM = false;
  state.dirty = {};
}

//---------------------------------------------------------
// Helpers to send event update queries
//---------------------------------------------------------

function formatObjects(objs) {
  let rows = [];
  for(let obj of objs) {
    let id;
    let kvs = {};
    let fields = [];
    for(let key in obj) {
      let value = obj[key];
      if(key == "tags") {
        for(let tag of value) {
          fields.push("#" + tag);
        }
        kvs["tag"] = value
      } else if(key == "id") {
        id = obj[key];
      } else {
        let stringValue;
        if(typeof value == "string" && value[0] == "⦑") {
          stringValue = value;
        } else {
          stringValue = JSON.stringify(value);
        }
        fields.push(key + ": " + stringValue);
        kvs[key] = stringValue;
      }
    }
    if(id) {
        console.log(kvs);
      for(let key in kvs) {
        let value = kvs[key];
        if(value.prototype !== Array) {
          rows.push(`[#eav entity: ${id}, attribute: "${key}", value: ${value}]`);
        } else {
          for(let elem of value) {
            rows.push(`[#eav entity: ${id}, attribute: "${key}", value: ${elem}]`);
          }
        }
      }
    } else {
      let final = "[" + fields.join(", ") + "]";
      rows.push(final)
    }
  }
  return rows;
}

function sendEventObjs(objs) {
  if(!objs.length) return;
  let query = `handle some event
  \`\`\`
  bind
    ${formatObjects(objs).join("\n    ")}
  \`\`\``
  return sendEvent(query);
}

function sendEvent(query) {
  //console.log("QUERY", query);
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "event", type: "query", query}))
  }
  return query;
}

function sendSwap(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "swap", query}))
  }
}

function sendSave(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "save", query}))
  }
}

function sendParse(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "parse", query}))
  }
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
      let tags = ["click"];
      if(current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity});
    }
    current = current.parentNode
  }
  // objs.push({tags: ["click"], element: "window"});
  sendEventObjs(objs);
});
window.addEventListener("dblclick", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  while(current) {
    if(current.entity) {
      let tags = ["double-click"];
      if(current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity});
    }
    current = current.parentNode
  }
  // objs.push({tags: ["click"], element: "window"});
  sendEventObjs(objs);
});

window.addEventListener("input", function(event) {
  let {target} = event;
  if(target.entity) {
    if(!sentInputValues[target.entity]) {
      sentInputValues[target.entity] = [];
    }
    sentInputValues[target.entity].push(target.value);
    let query =
    `input value updated
      \`\`\`
      match
        input = ${target.entity}
      commit
        input.value := "${target.value.replace("\"", "\\\"")}"
      \`\`\``;
    sendEvent(query);
    sendEventObjs([{tags: ["change"], element: target.entity}]);
  }
});
window.addEventListener("change", function(event) {
  let {target} = event;
  if(target.tagName == "INPUT" || target.tagName == "TEXTAREA") return;
  if(target.entity) {
    if(!sentInputValues[target.entity]) {
      sentInputValues[target.entity] = [];
    }
    let value = target.value;
    if(target.tagName == "SELECT") {
      value = target.options[target.selectedIndex].value;
    }
    sentInputValues[target.entity].push(value);
    let query =
      `input value updated
      \`\`\`
      match
        input = ${target.entity}
      commit
        input.value := "${value.replace("\"", "\\\"")}"
      \`\`\``;
    sendEvent(query);
    let tags = ["change"];
    if(target == target) {
      tags.push("direct-target");
    }
    sendEventObjs([{tags, element: target.entity}]);
  }
});

function getFocusPath(target) {
  let root = activeElements.root;
  let current = target;
  let path = [];
  while(current !== root && current) {
    let parent = current.parentElement;
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path;
}

window.addEventListener("focus", function(event) {
  let {target} = event;
  if(target.entity) {
    let objs = [{tags: ["focus"], element: target.entity}];
    sendEventObjs(objs);
    lastFocusPath = getFocusPath(target);
  }
}, true);

window.addEventListener("blur", function(event) {
  if(updatingDOM) {
    event.preventDefault();
    return;
  }
  let {target} = event;
  if(target.entity) {
    let objs = [{tags: ["blur"], element: target.entity}];
    sendEventObjs(objs);

    if(lastFocusPath) {
      let curFocusPath = getFocusPath(target);
      if(curFocusPath.length === lastFocusPath.length) {
        let match = true;
        for(let ix = 0; ix < curFocusPath.length; ix++) {
          if(curFocusPath[ix] !== lastFocusPath[ix]) {
            match = false;
            break;
          }
        }
        if(match) {
          lastFocusPath = null;
        }
      }
    }
  }
}, true);


let keyMap = {13: "enter", 27: "escape"}
window.addEventListener("keydown", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      let tags = ["keydown"];
      if (current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity, key: keyMap[key] || key});
    }
    current = current.parentNode;
  }
  sendEventObjs(objs);
});

window.addEventListener("keyup", function(event) {
  let {target} = event;
  let current = target;
  let objs = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      let tags = ["keyup"];
      if (current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity, key: keyMap[key] || key});
    }
    current = current.parentNode;
  }
  objs.push({tags: ["keyup"], element: "window", key});
  sendEventObjs(objs);
});

function onHashChange(event) {
  let hash = window.location.hash.substr(1);
  if(hash[0] == "/") hash = hash.substr(1);
  let segments = hash.split("/").map(function(seg, ix) {
    return `[index: ${ix + 1}, value: "${seg}"]`;
  });
  let query =
  `hash changed remove any current url segments
    \`\`\`
    match
      url = [#url hash-segment]
    commit
      url.hash-segment -= hash-segment
    \`\`\`\n\n`;
  if(hash !== "") {
    query +=
    `hash changed if there isn't already a url, make one
      \`\`\`
      match
        not([#url])
      commit
        [#url hash-segment: ${segments.join(" ")}]
      \`\`\`
        \n\n` +
    `add the new hash-segments if there is
      \`\`\`
      match
        url = [#url]
      commit
        url <- [hash-segment: ${segments.join(" ")}]
      \`\`\`
    `;
  }
  sendEvent(query);
}

window.addEventListener("hashchange", onHashChange);

//---------------------------------------------------------
// Draw node graph
//---------------------------------------------------------
let activeLayers = {ids: true, registers: true};
let activeIds = {};
let activeParse = {};
let editorParse = {};
let allNodeGraphs = {};
let showGraphs = false;
let codeEditor;

function drawNode(nodeId, graph, state, seen) {
  let node = graph[nodeId];

  if(seen[nodeId]) {
    return {text: `seen ${node.type}`};
  } else if(node.type == "terminal" || node.type == "subtail") {
    return undefined;
  }
  seen[nodeId] = true;

  let overlays = [];
  let overlay = {c: "node-overlay", children: overlays};
  if(activeLayers.ids) {
    let idOverlay = {c: "id-overlay", style: "flex: 0 0 auto", text: `id: ${nodeId}`};
    overlays.push(idOverlay);
  }

  let myTime = ((node.time * 100) / state.rootTime).toFixed(1);

  let active = currentClass(node, state);
  let children = [];
  let childrenContainer = {c: "node-children", children};
  let me = {c: `node`, children: [
    {c: `${node.type} node-text ${active}`, text: `${node.type} ${node.scan_type || ""} (${node.count || 0} | ${myTime}%)`},
    overlay,
    {t:"pre", text: JSON.stringify(node.display, undefined, 2)},
    childrenContainer
  ]};
  if((node.type == "fork") || (node.type == "choose")) {
    childrenContainer.c += ` fork-node-children`;
    for(let child of node.arms) {
      children.push({style: "margin-right: 20px;", children: [drawNode(child, graph, state, seen)]});
    }
  } else if((node.type == "sub") || (node.type == "not")) {
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
  if(!lines) return false;
  let tokens = lines[pos.line + 1] || [];
  for(let token of tokens) {
    if(token.offset <= pos.ch && token.offset + token.value.length >= pos.ch) {
      return token;
    }
  }
  return false;
}

function doSwap(editor) {
  sendSwap(editor.getValue());
}

function doSave() {
  sendSave(codeEditor.getValue());
}

function handleEditorParse(parse) {
  let parseLines = parse.lines;
  let from = {};
  let to = {};
  codeEditor.operation(function() {
    for(let line of codeEditor.dirtyLines) {
      // clear all the marks on that line?
      for(let mark of codeEditor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
        mark.clear();
      }
      from.line = line;
      to.line = line;
      let tokens = parseLines[line + 1];
      if(tokens) {
        let firstToken = tokens[0];
        // figure out what type of line this is and set the appropriate
        // line classes
        let state;
        for(let token of tokens) {
          from.ch = token.surrogateOffset;
          to.ch = token.surrogateOffset + token.surrogateLength;
          let className = token.type;
          if(state == "TAG" || state == "NAME") {
            className += " " + state;
          }
          codeEditor.markText(from, to, {className, inclusiveRight: true});
          state = token.type
        }
      }
    }
    codeEditor.dirtyLines = [];
  });
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    let editor = new CodeMirror(node, {
      tabSize: 2,
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": doSwap,
        "Ctrl-Enter": doSwap,
      }
    });
    editor.dirtyLines = [];
    editor.on("cursorActivity", function() {
      let pos = editor.getCursor();
      activeIds = nodeToRelated(pos, posToToken(pos, renderer.tree[elem.id].parse.lines), renderer.tree[elem.id].parse);
      drawNodeGraph();
    });
    editor.on("change", function(cm, change) {
      let {from, to, text} = change;
      let end = to.line > from.line + text.length ? to.line : from.line + text.length;
      for(let start = from.line; start <= end; start++) {
        cm.dirtyLines.push(start);
        let lineInfo = cm.lineInfo(start);
        if(lineInfo) {
          let prevInfo = cm.lineInfo(start - 1);
          let codeAbove = prevInfo && prevInfo.bgClass && prevInfo.bgClass.indexOf("CODE") > -1;
          if(lineInfo.text.match(/^\s*```/)) {
            cm.addLineClass(start, "background", "CODE");
            // there are two possible cases, eight this line is the beginning
            // of a code block, or it's the end of one we can determine that
            // by checking if the line above us is marked CODE
            if(codeAbove) {
              cm.addLineClass(start, "background", "BLOCK_END");
            } else {
              cm.removeLineClass(start, "background", "BLOCK_END");
            }
          } else if(codeAbove && prevInfo.bgClass.indexOf("BLOCK_END") == -1) {
            // if the thing above us is code and it's not the end of a block, then
            // this is also code.
            cm.addLineClass(start, "background", "CODE");
            cm.removeLineClass(start, "background", "BLOCK_END");
          } else {
            cm.removeLineClass(start, "background", "CODE");
            cm.removeLineClass(start, "background", "BLOCK_END");
          }
        }
      }
    });
    editor.on("changes", function(cm, changes) {
      let value = cm.getValue();
      sendParse(value);
    });
    editor.setValue(elem.value);
    codeEditor = editor;
    node.editor = editor;
  }
}

function setKeyMap(event) {
  codeEditor.setOption("keyMap", event.currentTarget.value);
}

function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

function indexParse(parse) {
  let lines = [];
  let tokens = parse.root.context.tokens
  for(let tokenId of tokens) {
    let token = parse[tokenId];
    if(!lines[token.line]) {
      lines[token.line] = [];
    }
    lines[token.line].push(token)
  }
  parse.lines = lines;
  let down = {};
  let up = {};
  for(let edge of parse.root.context.downEdges) {
    if(!down[edge[0]]) down[edge[0]] = [];
    if(!up[edge[1]]) up[edge[1]] = [];
    down[edge[0]].push(edge[1]);
    up[edge[1]].push(edge[0]);
  }
  parse.edges = {down, up};

  // if there isn't an active graph, then make the first query
  // active
  if(!activeIds["graph"]) {
    activeIds["graph"] = parse.root.children[0];
  }
  return parse;
}

function nodeToRelated(pos, node, parse) {
  let active = {};
  if(!parse.root) return active;
  // search for which query we're looking at
  let prev;
  for(let queryId of parse.root.children) {
    let query = parse[queryId];
    if(query.line == pos.line + 1) {
      prev = query;
      break;
    } else if (query.line > pos.line + 1) {
      break;
    }
    prev = query;
  }
  if(prev) active["graph"] = prev.id;

  if(!node.id) return active;
  let {up, down} = parse.edges;
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

function currentClass(node, state) {
  return state.activeIds[node.id] ? "active" : "";
}

function toggleGraphs() {
  showGraphs = !showGraphs;
  drawNodeGraph();
}

function compileAndRun() {
  doSwap(codeEditor);
}

function injectProgram(node, elem) {
  node.appendChild(activeElements["root"]);
}

function applyFix(event, elem) {
  //we need to do the changes in reverse order to ensure
  //the positions remain the same?
  let changes = elem.fix.changes.slice();
  changes.sort((a, b) => {
    let line = b.to.line - a.to.line;
    if(line == 0) {
      return b.to.offset - a.to.offset;
    }
    return line;
  });
  for(let change of changes) {
    codeEditor.replaceRange(change.value, {line: change.from.line - 1, ch: change.from.offset}, {line: change.to.line - 1, ch: change.to.offset});
  }
  doSwap(codeEditor);
}

function drawNodeGraph() {
  let graphs;
  let state = {activeIds};
  for(let headId in allNodeGraphs) {
    if(!activeParse.edges.up[headId] || activeParse.edges.up[headId].indexOf(activeIds["graph"]) == -1) continue;
    let cur = allNodeGraphs[headId];
    state.rootTime = activeParse.cycle_time;
    let tree = drawNode(headId, cur, state, {});
    let ordered = drawOrdered(activeParse.root.children, state);
    if(showGraphs) {
      graphs = {c: "graphs", children: [
        ordered,
        tree,
      ]}
    }
  }
  let root = activeParse.root || {context: {errors: [], code: ""}};
  let program;
  let errors;
  if(root && root.context.errors.length) {
    root.context.errors.sort((a, b) => { return a.pos.line - b.pos.line; })
    let items = root.context.errors.map(function(errorInfo) {
      let fix;
      if(errorInfo.fixes) {
        fix = {c: "fix-it", text: "Fix it for me", fix: errorInfo.fixes, click: applyFix}
      }
      return {c: "error", children: [
        {c: "error-title", text: errorInfo.type},
        {c: "error-context", text: errorInfo.pos.file || "(passed string)"},
        {t: "pre", dangerouslySetInnerHTML: errorInfo.final.trim().replace(/\n /gi, "\n")},
        fix,
      ]};
    });
    errors = {c: "errors", children: items};
  } else {
    program = {c: "program-container", postRender: injectProgram}
  }
  let outline = [];
  if(root.ast) {
    for(let childId of root.ast.children) {
      let child = activeParse[childId];
      for(let line of child.doc.split("\n")) {
        outline.push({text: line});
      }
    }
  }
  let rootUi = {c: "parse-info", children: [
    // {c: "outline", children: outline},
    {c: "run-info", children: [
      CodeMirrorNode({value: root.context.code, parse: activeParse}),
      {c: "toolbar", children: [
        {c: "stats", text: `total time: ${activeParse.total_time || 0}s`},
        {t: "select", c: "show-graphs", change: setKeyMap, children: [
          {t: "option", value: "default", text: "default"},
          {t: "option", value: "vim", text: "vim"},
          {t: "option", value: "emacs", text: "emacs"},
        ]},
        {c: "show-graphs", text: "save", click: doSave},
        {c: "show-graphs", text: "compile and run", click: compileAndRun},
        {c: "show-graphs", text: "show compile", click: toggleGraphs}
      ]},
    ]},
    graphs,
    errors,
    program,
  ]};
  renderer.render([{c: "graph-root", children: [rootUi]}]);
}

//---------------------------------------------------------
// Draw ordered
//---------------------------------------------------------

let positionals = {"a": 0, "b": 1, "c": 2, "d": 3, "e": 4, "f": 5, "g": 6, "h": 7, "i": 8, "j": 9, "k": 10};
let infix = {"+": true, "-": true, "*": true, "/": true, "=": true, ">": true, "<": true, ">=": true, "<=": true, "!=": true};

function orderedNode(nodeId, state) {
  let node = activeParse[nodeId]
  if(!node && typeof nodeId == "string") {
    return {c: "value", text: `"${nodeId}"`};
  }
  let active = currentClass(node, state);

  let overlays = [];
  let overlay = {c: "node-overlay", children: overlays};
  if(activeLayers.registers && node.registers) {
    let registers = {c: "registers-overlay row", children: [{t: "label", text: "Registers"}]};
    overlays.push(registers);
    for(let variable in node.registers) {
      registers.children.push({c: "register-pair row", children: [orderedNode(variable, state), {text: `: ${node.registers[variable]}`}]});
    }
  }
  if(activeLayers.ids) {
    let idOverlay = {c: "id-overlay", text: `id: ${nodeId}`};
    overlays.push(idOverlay);
  }

  if(node.type == "object" || node.type == "mutate") {
    return {c: `ordered-node ordered-object ${active}`, children: [
      {c: "row", children: [
        {c: "node-type", text: node.type},
        {c: "eav", children: [orderedNode(node.entity, state), orderedNode(node.attribute, state), orderedNode(node.value, state)]},
      ]},
      overlay
    ]};
  } else if(node.type == "subproject") {
    let projections = [{text: "["}]
    for(let proj of node.projection) {
      projections.push(orderedNode(proj, state));
    }
    projections.push({text: "]"});
    return {c: `ordered-node subproject ${active}`, children: [
      {c: "row sub-node", children: [
        {c: "node-type", text: node.type},
        {c: "subproject-projection", children: projections},
      ]},
      overlay,
      {c: "subproject-children", children: node.nodes.map(function(cur) { return orderedNode(cur, state); })}
    ]};
  } else if(node.type == "expression") {
    let bindings = []
    let startIx = 0;
    let isInfix = infix[node.operator];
    if(!isInfix) {
      bindings.push({text: `${node.operator}(`})
      startIx++;
    }
    for(let bindingId of node.bindings) {
      let binding = activeParse[bindingId];
      if(binding.field !== "return" && positionals[binding.field] !== undefined) {
        bindings[startIx + positionals[binding.field]] = orderedNode(binding.variable || binding.constant, state);
      } else {
        bindings.unshift({text: `=`})
        bindings.unshift(orderedNode(binding.variable || binding.constant, state));
        startIx += 2;
      }
    }
    if(isInfix) {
      bindings.splice(bindings.length - 1, 0, {text: node.operator});
    }
    if(node.projection && node.projection.length) {
      bindings.push({text: `given`})
      for(let proj of node.projection) {
        bindings.push(orderedNode(proj, state));
      }
    }
    if(node.groupings && node.groupings.length) {
      bindings.push({text: `per`})
      for(let group of node.groupings) {
        bindings.push(orderedNode(group, state));
      }
    }
    if(!isInfix) {
      bindings.push({text: ")"});
    }
    return {c: `ordered-node expression ${active}`, children: [
      {c: "row", children: [
        {c: "node-type", text: node.type},
        {c: "expression-bindings", children: bindings},
      ]},
    ]};
  } else if(node.type == "variable") {
    return {c: "value", text: `${node.name}`};
  } else if(node.type == "constant") {
    if(node.constantType == "string") {
      return {c: "value", text: `"${node.constant}"`};
    } else {
      return {c: "value", text: node.constant};
    }
  }
}

function drawOrdered(ordered, state) {
  let queries = [];
  for(let queryId of ordered) {
    let query = activeParse[queryId];
    if(state.activeIds["graph"] != query.id) continue;
    var items = [];
    for(let nodeId of query.unpacked) {
      items.push(orderedNode(nodeId, state));
    }
    queries.push({c: "ordered-node ordered-query", children: [
      {c: "ordered-query-children", children: items},
    ]});
  }
  return {c: "ordered", children: [
    {children: queries},
  ]}
}

function clone(obj) {
  if(typeof obj !== "object") return obj;
  if(obj.constructor === Array) {
    let neue = [];
    for(let ix = 0; ix < obj.length; ix++) {
      neue[ix] = clone(obj[ix]);
    }
    return neue;
  } else {
    let neue = {};
    for(let key in obj) {
      neue[key] = clone(obj[key]);
    }
    return neue;
  }
}

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
let DEBUG = false;

let state = {entities: {}, dirty: {}};
function handleDiff(state, diff) {
  let diffEntities = 0;
  let entitiesWithUpdatedValues = {};
  let {entities, dirty} = state;

  for(let remove of diff.remove) {
    let [e, a, v] = safeEav(remove);
    if(!entities[e]) {
      console.error(`Attempting to remove an attribute of an entity that doesn't exist: ${e}`);
      continue;
    }
    if(!dirty[e]) dirty[e] = [];
    let entity = entities[e];
    let values = entity[a];
    if(!values) continue;
    dirty[e].push(a);
    if(values.constructor !== Array || values.length <= 1) {
      delete entity[a];
    } else {
      let ix = values.indexOf(v);
      if(ix === -1) continue;
      values.splice(ix, 1);
    }

    // Update active*
    if(a === "children" && activeChildren[v] === e) {
      delete activeChildren[v];
    }

    if(a === "class" && activeClasses[v]) {
      let classIx = activeClasses[v].indexOf(e);
      if(classIx !== -1) {
        activeClasses[v].splice(classIx, 1);
      }
    }

    if(a === "style" && activeStyles[v]) {
      let styleIx = activeStyles[v].indexOf(e);
      if(styleIx !== -1) {
        activeStyles[v].splice(styleIx, 1);
      }
    }

    if(a === "value") {
      entitiesWithUpdatedValues[e] = true;
    }
  }

  for(let insert of diff.insert) {
    let [e, a, v] = safeEav(insert);
    if(!entities[e]) {
      entities[e] = {};
      diffEntities++;
    }
    if(!dirty[e]) dirty[e] = [];
    dirty[e].push(a);
    let entity = entities[e];
    if(!entity[a]) {
      entity[a] = v;
    } else if(entity[a] == v) {
      // do nothing (this really shouldn't happen, our diff is weird then)
      console.error(`Received a diff setting ${entity}["${a}"] = ${v} (the existing value)`);
      continue;
    } else if(entity[a].constructor !== Array) {
      entity[a] = [entity[a], v];
    } else {
      entity[a].push(v);
    }

    // Update active*
    if(a === "children") {
      if(activeChildren[v]) console.error(`Unable to handle child element ${v} parented to two parents (${activeChildren[v]}, ${e}). Overwriting.`);
      activeChildren[v] = e;
    }

    if(a === "class") {
      if(!activeClasses[v]) activeClasses[v] = [e];
      else activeClasses[v].push(e);
    }

    if(a === "style") {
      if(!activeStyles[v]) activeStyles[v] = [e];
      else activeStyles[v].push(e);
    }

    if(a === "value") {
      entitiesWithUpdatedValues[e] = true;
    }
  }

  // Update value syncing
  for(let e in entitiesWithUpdatedValues) {
    let a = "value";
    let entity = entities[e];
    if(!entity[a]) {
      sentInputValues[e] = [];
    } else {
      if(entity[a].constructor === Array) console.error("Unable to set 'value' multiple times on entity", e, entity[a]);
      let sent = sentInputValues[e];
      if(sent && sent[0] === entity[a]) {
        let ix;
        while((ix = dirty[e].indexOf(a)) !== -1) {
          dirty[e].splice(ix, 1);
        }
        sent.shift();
      } else {
        sentInputValues[e] = [];
      }
    }
  }
}


var socket = new WebSocket("ws://" + window.location.host +"/ws");
  var frameRequested = false;
  var prerendering = false;
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    handleDiff(state, data);
    handleDOMUpdates(state); // Don't use requestAnimationFrame for now -- the batching plays hell with text input sync.
    // if(!frameRequested) {
    //   window.requestAnimationFrame(doRender);
    //   frameRequested = true;
    // }

    let diffEntities = 0;
    if(DEBUG) {
      console.groupCollapsed(`Received Result +${data.insert.length}/-${data.remove.length} (∂Entities: ${diffEntities})`);
      console.table(data.insert);
      console.table(data.remove);
      if(state.entities) {
        let copy = clone(state.entities);
        console.log(copy);
        let byName = {};
        for(let entity in copy) {
          if(copy[entity].name) {
            copy[entity].entity = entity;
            byName[copy[entity].name] = copy[entity];
          }
        }
        console.log(byName);
      }
      console.groupEnd();
    }

    if(document.readyState === "complete") {
      drawNodeGraph();
    } else if(!prerenderering) {
      prerenderering = true;
      document.addEventListener("DOMContentLoaded", function() {
        drawNodeGraph();
      });
    }

  } else if(data.type == "node_graph") {
    allNodeGraphs[data.head] = data.nodes;
  } else if(data.type == "full_parse") {
    activeParse = indexParse(data.parse);
    drawNodeGraph();
    handleEditorParse(activeParse);
  } else if(data.type == "parse") {
    editorParse = indexParse(data.parse);
    handleEditorParse(editorParse);

  } else if(data.type == "node_times") {
    activeParse.iterations = data.iterations;
    activeParse.total_time = data.total_time;
    activeParse.cycle_time = data.cycle_time;
    let graph = allNodeGraphs[data.head];
    if(!graph) return;
    for(let nodeId in data.nodes) {
      let cur = graph[nodeId];
      let info = data.nodes[nodeId];
      cur.time = info.time;
      cur.count = info.count;
    }
  } else if(data.type == "error") {
    console.error(data.message, data);
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
  onHashChange({});
}
socket.onclose = function() {
  console.log("Disconnected from eve server!");
}
