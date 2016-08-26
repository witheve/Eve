"use strict"

import {Renderer} from "microReact";
import {clone} from "./util";
import {CodeMirrorNode, applyFix, setKeyMap, doSave, compileAndRun} from "./editor";
import {sendEvent, sendEventObjs} from "./client";

//type RecordElementCollection = HTMLCollection | SVGColl
interface RecordElement extends Element { entity?: string, sort?: any, _parent?: RecordElement, style?: CSSStyleDeclaration };
interface RDocument extends Document { activeElement: RecordElement };
declare var document: RDocument;

function isInputElem(elem:Element): elem is HTMLInputElement {
  return elem.tagName === "INPUT";
}
function isSelectElem(elem:Element): elem is HTMLSelectElement {
  return elem.tagName === "SELECT";
}

export function setActiveIds(ids) {
  for(let k in activeIds) {
    activeIds[k] = undefined;
  }
  for(let k in ids) {
    activeIds[k] = ids[k];
  }
}


//---------------------------------------------------------
// MicroReact-based record renderer
//---------------------------------------------------------
export var renderer = new Renderer();
document.body.appendChild(renderer.content);

// These will get maintained by the client as diffs roll in
export var sentInputValues = {};
export var activeIds = {};
export var activeStyles = {};
export var activeClasses = {};
export var activeChildren = {};

// root will get added to the dom by the program microReact element in renderEditor
var activeElements:{[id : string]: RecordElement, root: RecordElement} = {"root": document.createElement("div")};
activeElements.root.className = "program";

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

export function renderRecords(state) {
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
          elem = document.createElementNS("http://www.w3.org/2000/svg", tag) as RecordElement;
        } else {
          elem = document.createElement(tag || "div")
        }
        // Mark all attributes of the entity dirty to rerender them into the new element
        for(let attribute in entity) {
          if(dirty[entityId].indexOf(attribute) == -1) {
            dirty[entityId].push(attribute);
          }
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
          for(let ix = elem.childNodes.length - 1; ix >= 0; ix--) {
            if(!(elem.childNodes[ix] instanceof Element)) continue;
            let child = elem.childNodes[ix] as RecordElement;
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
        let input = elem as (RecordElement & HTMLInputElement);
        if(!value) {
          input.value = "";
        } else if(value.constructor === Array) {
          console.error("Unable to set 'value' multiple times on entity", entity, value);
        } else {
          input.value = value; // @FIXME: Should this really be setAttribute?
        }

      } else if(attribute === "checked") {
        if(value && value.constructor === Array) {
          console.error("Unable to set 'checked' multiple times on entity", entity, value);
        } else {
          if(value) elem.setAttribute("checked", "true");
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

  if(lastFocusPath) {
    let current = activeElements.root;
    let ix = 0;
    for(let segment of lastFocusPath) {
      current = current.childNodes[segment] as RecordElement;
      if(!current) {
        updatingDOM.blur();
        lastFocusPath = null;
        break;
      }
      ix++;
    }
    if(current && current.entity !== updatingDOM.entity) {
      let curElem = current as HTMLElement;
      curElem.focus();
      if(updatingDOM.tagName === current.tagName && isInputElem(current) && selectableTypes[updatingDOM.type] && selectableTypes[current.type]) {
        current.setSelectionRange(updatingDOM.selectionStart, updatingDOM.selectionEnd);
      }
    }
  }
  updatingDOM = false;
  state.dirty = {};
}

//---------------------------------------------------------
// Event bindings to forward events to the server
//---------------------------------------------------------

window.addEventListener("click", function(event) {
  let {target} = event;
  let current = target as RecordElement;
  let objs = [];
  while(current) {
    if(current.entity) {
      let tags = ["click"];
      if(current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity});
    }
    current = current.parentElement;
  }
  // objs.push({tags: ["click"], element: "window"});
  sendEventObjs(objs);
});
window.addEventListener("dblclick", function(event) {
  let {target} = event;
  let current = target as RecordElement;
  let objs = [];
  while(current) {
    if(current.entity) {
      let tags = ["double-click"];
      if(current == target) {
        tags.push("direct-target");
      }
      objs.push({tags, element: current.entity});
    }
    current = current.parentElement;
  }
  // objs.push({tags: ["click"], element: "window"});
  sendEventObjs(objs);
});

window.addEventListener("input", function(event) {
  let target = event.target as (RecordElement & HTMLInputElement);
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
      commit @browser
        input.value := "${target.value.replace("\"", "\\\"")}"
      \`\`\``;
    sendEvent(query);
    sendEventObjs([{tags: ["change"], element: target.entity}]);
  }
});
window.addEventListener("change", function(event) {
  let target = event.target as (RecordElement & (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement));
  if(target.tagName == "INPUT" || target.tagName == "TEXTAREA") return;
  if(target.entity) {
    if(!sentInputValues[target.entity]) {
      sentInputValues[target.entity] = [];
    }
    let value = target.value;

    if(isSelectElem(target)) {
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
  let target = event.target as RecordElement;
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
  let target = event.target as RecordElement;
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
  let current = target as RecordElement;
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
    current = current.parentElement;
  }
  sendEventObjs(objs);
});

window.addEventListener("keyup", function(event) {
  let {target} = event;
  let current = target as RecordElement;
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
    current = current.parentElement;
  }
  objs.push({tags: ["keyup"], element: "window", key});
  sendEventObjs(objs);
});

//---------------------------------------------------------
// Editor Renderer
//---------------------------------------------------------
let activeLayers = {};
let editorParse = {};
let allNodeGraphs = {};
let showGraphs = false;

let editorRoot:{context: any, ast:any} = {context: {errors: [], code: ""}, ast: {}};

function injectProgram(node, elem) {
  node.appendChild(activeElements.root);
}

export function renderEditor() {
  let state = {activeIds};

  let root = editorRoot;
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
    // @TODO: Update to use EAVs
    // for(let childId of root.ast.children) {
    //   let child = activeParse[childId];
    //   for(let line of child.doc.split("\n")) {
    //     outline.push({text: line});
    //   }
    // }
  }

  // @TODO: Update to use EAVs
  let activeParse = {};

  let rootUi = {c: "parse-info", children: [
    // {c: "outline", children: outline},
    {c: "run-info", children: [
      CodeMirrorNode({value: root.context.code, parse: activeParse}),
      {c: "toolbar", children: [
        {c: "stats"},
        {t: "select", c: "show-graphs", change: setKeyMap, children: [
          {t: "option", value: "default", text: "default"},
          {t: "option", value: "vim", text: "vim"},
          {t: "option", value: "emacs", text: "emacs"},
        ]},
        {c: "show-graphs", text: "save", click: doSave},
        {c: "show-graphs", text: "compile and run", click: compileAndRun}
      ]},
    ]},
    errors,
    program,
  ]};
  renderer.render([{c: "graph-root", children: [rootUi]}]);
}
