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

// root will get added to the dom by the program microReact element in
// drawNodeGraph
var activeElements = {"root": document.createElement("div")};
activeElements["root"].className = "program";
var activeStyles = {};
var activeClasses = {};
var supportedTags = {
  "div": true, "span": true, "input": true, "ul": true, "li": true, "label": true, "button": true, "header": true, "footer": true, "a": true, "strong": true,
  "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
  "ol": true, "p": true, "pre": true, "em": true, "img": true, "canvas": true, "script": true, "style": true, "video": true,
  "table": true, "tbody": true, "thead": true, "tr": true, "th": true, "td": true,
  "form": true, "optgroup": true, "option": true, "select": true, "textarea": true,
  "title": true, "meta": true, "link": true,
  "svg": true, "circle": true, "line": true, "rect": true, "text": true, "image": true
};
var svgs = {"svg": true, "circle": true, "line": true, "rect": true, "text": true, "image": true};
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

function handleDOMUpdates(result) {

  if(document.activeElement && document.activeElement.entity) {
    updatingDOM = document.activeElement;
  }
  if(!updatingDOM) {
    updatingDOM = true;
  }
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
    let stylesToMaybeGC = [];
    let classesToMaybeGC = [];
    for(let rem of remove) {
      let [entity, attribute, value] = safeEav(rem);
      if(activeStyles[entity]) {
        // do style stuff
        for(let elem of activeStyles[entity]) {
          let style = elem.style;
          if(!additions[entity] || !additions[entity][attribute]) {
            style[attribute] = "";
          }
        }
      } else if(activeClasses[entity]) {
        if(!additions[entity]  || !additions[entity][attribute]) {
          for(let elem of activeClasses[entity]) {
            elem.className = "";
            elem.classId = undefined;
          }
        }
      } else if(activeElements[entity]) {
        let elem = activeElements[entity];
        switch(attribute) {
          case "tag":
            if(supportedTags[value]) {
              //nuke the whole element
              elem.parentNode.removeChild(elem);
              activeElements[entity] = null;
              if(elem.styleId) {
                let ix = activeStyles[elem.styleId].indexOf(elem);
                activeStyles[elem.styleId].splice(ix, 1);
                stylesToMaybeGC.push(value);
              }
            }
            break;
          case "style":
            stylesToMaybeGC.push(value);
            let ix = activeStyles[value].indexOf(elem);
            if(ix > -1) {
              activeStyles[value].splice(ix, 1);
            }
            break;
          case "class":
            if(value[0] == "⦑" && value[value.length - 1] == "⦒" && activeClasses[value]) {
              classesToMaybeGC.push(value);
              let classIx = activeClasses[value].indexOf(elem);
              if(classIx > -1) {
                activeClasses[value].splice(classIx, 1);
              }
            }
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
          case "value":
          if(!additions[entity] || !additions[entity][attribute]) {
              sentInputValues[entity] = [];
              elem.removeAttribute(attribute);
            }
            break;

          default:
            if(!additions[entity] || !additions[entity][attribute]) {
              elem.removeAttribute(attribute);
            }
            break;
        }
      }
    }
    // clean up any styles that need to go
    for(let styleId of stylesToMaybeGC) {
      if(activeStyles[styleId] && activeStyles[styleId].length === 0) {
        activeStyles[styleId] = null;
      }
    }
    for(let classId of classesToMaybeGC) {
      if(activeClasses[classId] && activeClasses[classId].length === 0) {
        activeClasses[classId] = null;
      }
    }
  }

  let styles = [];
  let classes = [];
  let entities = Object.keys(additions)
  for(let entId of entities) {
    let ent = additions[entId];
    let elem = activeElements[entId]
    // if we don't have an element already and this one doesn't
    // have a tag, then we just skip it (e.g. a style)
    if(!elem && !ent.tag)  continue;
    if(!elem) {
      //TODO: support finding the correct tag
      if(svgs[ent.tag]) {
        elem = document.createElementNS("http://www.w3.org/2000/svg", ent.tag);
      } else {
        elem = document.createElement(ent.tag || "div")
      }
      elem.entity = entId;
      activeElements[entId] = elem;
      elem.sort = ent.sort || ent["eve-auto-index"] || "";
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
        if(!activeStyles[value]) {
          activeStyles[value] = [];
        }
        if(activeStyles[value].indexOf(elem) == -1) {
          elem.styleId = value;
          activeStyles[value].push(elem);
        }
      } else if(attr == "class" && value[0] == "⦑" && value[value.length - 1] == "⦒") {
        classes.push(value);
        if(!activeClasses[value]) {
          activeClasses[value] = [];
        }
        if(activeClasses[value].indexOf(elem) == -1) {
          elem.classId = value;
          activeClasses[value].push(elem);
        }
      } else if(attr == "textContent") {
        elem.textContent = value;
      } else if(attr == "tag" || attr == "ix") {
        //ignore
      } else if(attr == "_parent") {
        let parent = activeElements[value];
        insertSorted(parent, elem);
      } else if(attr == "checked") {
        if(value) elem.setAttribute("checked", true);
        else elem.removeAttribute("checked");
      } else if(attr == "value") {
        if(sentInputValues[entId] && sentInputValues[entId][0] === value) {
          sentInputValues[entId].shift();
        } else {
          sentInputValues[entId] = [];
          // @FIXME: handle select both here and when something tagged option is added.
          elem.value = value;
        }
      } else {
        elem.setAttribute(attr, value);
      }
    }
  }

  for(let styleId of styles) {
    let style = additions[styleId];
    if(!style) continue;
    let elems = activeStyles[styleId];
    for(let elem of elems || []) {
      if(!elem) {
        console.error("Got a style for an element that doesn't exist.");
        continue;
      }
      let elemStyle = elem.style;
      let styleAttributes = Object.keys(style);
      for(let attr of styleAttributes) {
        if(attr === "display" && typeof style[attr] === "boolean") {
          elemStyle[attr] = style[attr] ? undefined : "none";
        } else {
          elemStyle[attr] = style[attr];
        }
      }
    }
  }

  for(let classId of classes) {
    let classSet = additions[classId];
    if(!classSet) continue;
    let elems = activeClasses[classId];
    for(let elem of elems || []) {
      if(!elem) {
        console.error("Got a class for an element that doesn't exist.");
        continue;
      }
      let elemClasses = elem.className.split(" ");
      let classNames = Object.keys(classSet);
      for(let klass of classNames) {
        let existingIx = elemClasses.indexOf(klass)
        if(classSet[klass] && existingIx == -1) {
          elemClasses.push(klass);
        } else if(!classSet[klass] && existingIx != -1) {
          elemClasses.splice(existingIx, 1);
        }
      }
      elem.className = elemClasses.join(" ");
    }
  }

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
  maintain
    ${formatObjects(objs).join("\n    ")}
  `
  return sendEvent(query);
}

function sendEvent(query) {
  console.log("QUERY", query);
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
      input = ${target.entity}
      freeze
        input.value := "${target.value.replace("\"", "\\\"")}"`;
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
      input = ${target.entity}
      freeze
        input.value := "${value.replace("\"", "\\\"")}"`;
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
    url = [#url hash-segment]
    freeze
      url -= [hash-segment]\n\n`;
  if(hash !== "") {
    query +=
    `hash changed if there isn't already a url, make one
      not([#url])
      freeze
        [#url hash-segment: ${segments.join(" ")}]\n\n` +
    `add the new hash-segments if there is
      url = [#url]
      freeze
        url := [hash-segment: ${segments.join(" ")}]
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

function handleEditorParse(parse) {
  let parseLines = parse.lines;
  let from = {};
  let to = {};
  codeEditor.operation(function() {
    console.time("highlight");
    for(let line of codeEditor.dirtyLines) {
      // clear all the marks on that line?
      for(let mark of codeEditor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
        mark.clear();
      }
      from.line = line;
      to.line = line;
      let tokens = parseLines[line + 1];
      if(tokens) {
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
    console.timeEnd("highlight");
  });
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    let editor = new CodeMirror(node, {
      extraKeys: {
        "Cmd-Enter": doSwap,
        "Ctrl-Enter": doSwap,
      }
    });
    editor.setValue(elem.value);
    let dirty = [];
    for(let line = 0, count = editor.lineCount(); line < count; line++) {
      dirty.push(line);
    }
    editor.dirtyLines = dirty;
    editor.on("cursorActivity", function() {
      let pos = editor.getCursor();
      activeIds = nodeToRelated(pos, posToToken(pos, renderer.tree[elem.id].parse.lines), renderer.tree[elem.id].parse);
      drawNodeGraph();
    });
    editor.on("changes", function(cm, changes) {
      let value = cm.getValue();
      sendParse(value);
      for(let change of changes) {
        let {from, to, text} = change;
        let end = to.line > from.line + text.length ? to.line : from.line + text.length;
        for(let start = from.line; start <= end; start++) {
          cm.dirtyLines.push(start);
        }
      }
    });
    codeEditor = editor;
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
  active["graph"] = prev.id;

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
  let rootUi = {c: "parse-info", children: [
    {c: "run-info", children: [
      CodeMirrorNode({value: root.context.code, parse: activeParse}),
      {c: "toolbar", children: [
        {c: "stats", text: `${activeParse.iterations || 0} iterations took ${activeParse.total_time || 0}s`},
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
let __entities = {}; // DEBUG

var socket = new WebSocket("ws://" + window.location.host +"/ws");
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    handleDOMUpdates(data);

    let diffEntities = 0;
    if(DEBUG && __entities) {
      for(let [e, a, v] of data.remove) {
        if(!__entities[e]) continue;
        let entity = __entities[e];
        let set = entity[a];
        if(!set) continue;
        if(set.constructor !== Array || set.length <= 1) {
          delete entity[a];
        } else {
          let ix = entity[a].indexOf(v);
          if(ix === -1) continue;
          entity[a].splice(ix, 1);
        }

        if(Object.keys(entity).length === 0) {
          delete __entities[e];
          diffEntities--;
        }
      }

      for(let [e, a, v] of data.insert) {
        if(!__entities[e]) {
          __entities[e] = {};
          diffEntities++;
        }
        let entity = __entities[e];
        if(!entity[a]) {
          entity[a] = v;
        } else if(entity[a].constructor !== Array) {
          entity[a] = [entity[a], v];
        } else {
          entity[a].push(v);
        }
      }
    }
    if(DEBUG) {
      console.groupCollapsed(`Received Result +${data.insert.length}/-${data.remove.length} (∂Entities: ${diffEntities})`);
      console.table(data.insert);
      console.table(data.remove);
      if(__entities) console.log(clone(__entities));
      console.groupEnd();
    }
    drawNodeGraph();

  } else if(data.type == "node_graph") {
    allNodeGraphs[data.head] = data.nodes;
  } else if(data.type == "full_parse") {
    activeParse = indexParse(data.parse);
    drawNodeGraph();
    handleEditorParse(activeParse);
  } else if(data.type == "parse") {
    handleEditorParse(indexParse(data.parse));

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
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
  onHashChange({});
}
socket.onclose = function() {
  console.log("Disconnected from eve server!");
}
