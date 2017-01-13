"use strict"

import {Renderer} from "microReact";
import {clone} from "./util";
import {client, indexes} from "./client";

//type RecordElementCollection = HTMLCollection | SVGColl
interface RecordElement extends Element { entity?: string, sort?: any, _parent?: RecordElement|null, style?: CSSStyleDeclaration };
interface RDocument extends Document { activeElement: RecordElement };
declare var document: RDocument;

function isInputElem<T extends Element>(elem:T): elem is T&HTMLInputElement {
  return elem && elem.tagName === "INPUT";
}
function isSelectElem<T extends Element>(elem:T): elem is T&HTMLSelectElement {
  return elem && elem.tagName === "SELECT";
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
renderer.content.classList.add("application-root");

// These will get maintained by the client as diffs roll in
export var sentInputValues = {};
export var activeIds = {};

// root will get added to the dom by the program microReact element in renderEditor
export var activeElements:{[id : string]: RecordElement|null, root: RecordElement} = {"root": document.createElement("div")};
activeElements.root.className = "program";

// Obtained from http://w3c.github.io/html-reference/elements.html
var supportedTagsArr = [
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "command",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "keygen",
  "label",
  "legend",
  "li",
  "link",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr"
];

// Obtained from https://www.w3.org/TR/SVG/eltindex.html
var svgsArr = [
  // we can't have tags in both the html set and the svg set
  // "a",
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animate",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "color-profile",
  "cursor",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "font",
  "font-face",
  "font-face-format",
  "font-face-name",
  "font-face-src",
  "font-face-uri",
  "foreignObject",
  "g",
  "glyph",
  "glyphRef",
  "hkern",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "missing-glyph",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "script",
  "set",
  "stop",
  "style",
  "svg",
  "switch",
  "symbol",
  "text",
  "textPath",
  "title",
  "tref",
  "tspan",
  "use",
  //"view",
  "vkern"
];

supportedTagsArr.push.apply(supportedTagsArr, svgsArr);

function toKeys(arr) {
  var obj = {};
  for (var el of arr) {
    obj[el] = true;
  }
  return obj
}

var supportedTags = toKeys(supportedTagsArr);
var svgs = toKeys(svgsArr);

// Map of input entities to a queue of their values which originated from the client and have not been received from the server yet.
var lastFocusPath:string[]|null = null;
var selectableTypes = {"": true, undefined: true, text: true, search: true, password: true, tel: true, url: true};

var previousCheckedRadios = {};

function insertSorted(parent:Node, child:RecordElement) {
  let current;
  for(let curIx = 0; curIx < parent.childNodes.length; curIx++) {
    let cur = parent.childNodes[curIx] as RecordElement;
    if(cur.sort !== undefined && cur.sort > child.sort) {
      current = cur;
      break;
    }
  }
  if(current) {
    parent.insertBefore(child, current);
  } else  {
    parent.appendChild(child);
  }
}

let _suppressBlur = false; // This global is set when the records are being re-rendered, to prevent false blurs from mucking up focus tracking.

export function renderRecords() {
  _suppressBlur = true;
  let lastActiveElement:RecordElement|null = null;
  if(document.activeElement && document.activeElement.entity) {
    lastActiveElement = document.activeElement;
  }

  let records = indexes.records.index;
  let dirty = indexes.dirty.index;
  let activeClasses = indexes.byClass.index || {};
  let activeStyles = indexes.byStyle.index || {};
  let activeChildren = indexes.byChild.index || {};

  let regenClassesFor:string[] = [];
  let regenStylesFor:string[] = [];

  for(let entityId in dirty) {
    let entity = records[entityId];
    let elem:RecordElement|null = activeElements[entityId];

    if(dirty[entityId].indexOf("tag") !== -1) {
      let values = entity.tag || []
      let tag;
      for(let val of values) {
        if(supportedTags[val]) {
          if(tag) console.error("Unable to set 'tag' multiple times on entity", entity, entity.tag);
          tag = val;
        }
      }

      if(!tag && elem && elem !== activeElements.root) { // Nuke the element if it no longer has a supported tag
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
        if(entity.sort && entity.sort.length > 1) console.error("Unable to set 'sort' multiple times on entity", entity, entity.sort);
        if(entity.sort !== undefined && entity.sort[0] !== undefined) {
          elem.sort = entity.sort[0];
        } else if(entity["eve-auto-index"] !== undefined && entity["eve-auto-index"][0] !== undefined) {
          elem.sort = entity["eve-auto-index"][0];
        } else {
          elem.sort = "";
        }
        if(parent) insertSorted(parent, elem)


      } else if(tag && !elem) { // Create a new element and mark all its attributes dirty to restore it.
        if(svgs[tag]) {
          elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        } else {
          elem = document.createElement(tag || "div")
        }
        elem.entity = entityId;
        activeElements[entityId] = elem;
        if(entity.sort && entity.sort.length > 1) console.error("Unable to set 'sort' multiple times on entity", entity, entity.sort);
        if(entity.sort !== undefined && entity.sort[0] !== undefined) {
          elem.sort = entity.sort[0];
        } else if(entity["eve-auto-index"] !== undefined && entity["eve-auto-index"][0] !== undefined) {
          elem.sort = entity["eve-auto-index"][0];
        } else {
          elem.sort = "";
        }
        let parent = activeElements[activeChildren[entityId] || "root"];
        if(parent) insertSorted(parent, elem);
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
          let children = (value && clone(value)) || [];
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
        elem.textContent = (value && value.join(", ")) || "";

      } else if(attribute === "value") {
        let input = elem as (RecordElement & HTMLInputElement);
        if(!value) {
          input.value = "";
        } else if(value.length > 1) {
          console.error("Unable to set 'value' multiple times on entity", entity, JSON.stringify(value));
        } else {
          input.setAttribute('value', value[0]);
        }

      } else if(attribute === "checked") {
        if(value && value.length > 1) {
          console.error("Unable to set 'checked' multiple times on entity", entity, value);
        } else if(value && value[0]) {
          elem.setAttribute("checked", "true");
          if (elem.getAttribute("type") == "radio") {
            var name = elem.getAttribute("name") || "";
            previousCheckedRadios[name] = entityId;
          }
        } else {
          elem.removeAttribute("checked");
        }

      } else {
        value = value && value.join(", ");
        if(value === undefined) {
          elem.removeAttribute(attribute);
        } else {
          elem.setAttribute(attribute, value);
        }
      }
    }

    let attrs = Object.keys(entity);
  }

  for(let entityId of regenClassesFor) {
    let elem = activeElements[entityId];
    if(!elem) continue;
    let entity = records[entityId];
    let value = entity["class"];
    if(!value) {
      elem.className = "";
    } else {
      let neue:string[] = [];
      for(let klassId of value) {
        if(activeClasses[klassId] !== undefined && records[klassId] !== undefined) {
          let klass = records[klassId];
          for(let name in klass) {
            if(!klass[name]) continue;
            if(klass[name].length > 1) {
              console.error("Unable to set class attribute to multiple values on entity", entity, name, klass[name]);
              continue;
            }
            if(klass[name][0] && neue.indexOf(name) === -1) {
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
    let entity = records[entityId];
    let value = entity["style"];
    elem.removeAttribute("style"); // @FIXME: This could be optimized to care about the diff rather than blowing it all away
    if(value) {
      let neue:string[] = [];
      for(let styleId of value) {
        if(activeStyles[styleId]) {
          let style = records[styleId];
          for(let attr in style) {
            (elem as any).style[attr] = style[attr] && style[attr].join(", ");
          }
        } else {
          neue.push(styleId);
        }
      }
      if(neue.length) {
        let s = elem.getAttribute("style");
        elem.setAttribute("style",  (s ? (s + "; ") : "") + neue.join("; "));
      }
    }
  }

  if(lastFocusPath && lastActiveElement && isInputElem(lastActiveElement)) {
    let current = activeElements.root;
    let ix = 0;
    for(let segment of lastFocusPath) {
      current = current.childNodes[segment] as RecordElement;
      if(!current) {
        lastActiveElement.blur();
        lastFocusPath = null;
        break;
      }
      ix++;
    }
    if(current && current.entity !== lastActiveElement.entity) {
      let curElem = current as HTMLElement;
      curElem.focus();
      if(isInputElem(lastActiveElement) && isInputElem(current) && selectableTypes[lastActiveElement.type] && selectableTypes[current.type]) {
        current.setSelectionRange(lastActiveElement.selectionStart, lastActiveElement.selectionEnd);
      }
    }
  }
  _suppressBlur = false
}

//---------------------------------------------------------
// Event bindings to forward events to the server
//---------------------------------------------------------

function addSVGCoods(elem, event, eveEvent) {
  if(elem.tagName != "svg") return;

  var pt = elem.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  let coords = pt.matrixTransform(elem.getScreenCTM().inverse());
  eveEvent.x = coords.x;
  eveEvent.y = coords.y;
}

function addRootEvent(elem, event, objs, eventName) {
  if(elem !== activeElements["root"]) return;

  let eveEvent = {
    tag: objs.length === 0 ? [eventName] : [eventName, "direct-target"],
    root: true,
    x: event.clientX,
    y: event.clientY
  };
  objs.push(eveEvent);
}

window.addEventListener("click", function(event) {
  let {target} = event;
  let current = target as RecordElement;
  let objs:any[] = [];
  while(current) {
    if(current.entity) {
      let tag = ["click"];
      if(current == target) {
        tag.push("direct-target");
      }
      let eveEvent = {tag, element: current.entity};
      addSVGCoods(current, event, eveEvent)
      objs.push(eveEvent);
    }
    addRootEvent(current, event, objs, "click");
    current = current.parentElement;
  }
  client.sendEvent(objs);

  if((target as Element).tagName === "A") {
    let elem = target as HTMLAnchorElement;
    // Target location is internal, so we need to rewrite it to respect the IDE's hash segment structure.
    if(elem.href.indexOf(location.origin) === 0) {
      let relative = elem.href.slice(location.origin.length + 1);
      if(relative[0] === "#") relative = relative.slice(1);


      let currentHashChunks = location.hash.split("#").slice(1);
      let ideHash = currentHashChunks[0];
      if(ideHash[ideHash.length - 1] === "/") ideHash = ideHash.slice(0, -1);

      let modified = "#" + ideHash + "/#" + relative;
      location.hash = modified;
      event.preventDefault();
    }
  }
});

window.addEventListener("dblclick", handleBasicEventWithTarget("dblclick"));
window.addEventListener("mousedown", handleBasicEventWithTarget("mousedown"));
window.addEventListener("mouseup", handleBasicEventWithTarget("mouseup"));
window.addEventListener("drop", handleBasicEventWithTarget("drop"));

window.addEventListener("drop", function(event) {
  let {target} = event;
  let current = target as RecordElement;
  let objs: any[] = [];
  while (current) {
    if (current.entity) {
      let tag = ["drop"];
      if (current === target) {
        tag.push("direct-target");
      }
      let eveEvent = {tag, element: current.entity};
      addSVGCoods(current, event, eveEvent);
      objs.push(eveEvent);
    }
    addRootEvent(current, event, objs, "drop");
    current = current.parentElement;
  }
  for(let potentialLeave of dragEnterSet) {
    objs.push({tag: ["dragleave"], element: potentialLeave.entity});
  }
  client.sendEvent(objs);
});

window.addEventListener("dragstart", function(event) {
  event.dataTransfer.setData("text", "foo");
  let target = event.target as (RecordElement);
  if(target.entity) {
    client.sendEvent([{tag: ["dragstart"], element: target.entity}]);
  }
});

window.addEventListener("dragend", function(event) {
  let target = event.target as (RecordElement);
  if(target.entity) {
    client.sendEvent([{tag: ["dragend"], element: target.entity}]);
  }
});

let dragEnterSet = [];

window.addEventListener("dragenter", function(event) {
  let objects = [];
  event.preventDefault();
  let target = event.target as (RecordElement);
  if(target.entity && dragEnterSet.indexOf(target) === -1) {
    console.log("enter", target.entity, target);
    dragEnterSet.push(target);
    objects.push({tag: ["dragenter"], element: target.entity})
  }
  if(target.entity) {
    // collect all the parents of the element currently being dragged over
    let validEntities = {};
    let current = target;
    while(current && current.entity) {
      validEntities[current.entity] = true;
      current = current.parentNode as RecordElement;
    }
    let updated = [];
    for(let potentialLeave of dragEnterSet) {
      if(!validEntities[potentialLeave.entity]) {
        console.log("leave", potentialLeave.entity, potentialLeave);
        objects.push({tag: ["dragleave"], element: potentialLeave.entity});
      } else {
        updated.push(potentialLeave);
      }
    }
    dragEnterSet = updated;
  }
  if(objects.length) {
    client.sendEvent(objects);
  }
});

window.addEventListener("input", function(event) {
  let target = event.target as (RecordElement & HTMLInputElement);
  if(target.entity) {
    if(!sentInputValues[target.entity]) {
      sentInputValues[target.entity] = [];
    }
    sentInputValues[target.entity].push(target.value);
    client.sendEvent([{tag: ["change"], element: target.entity, value: target.value}]);
  }
});
window.addEventListener("change", function(event) {
  let target = event.target as (RecordElement & (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement));
  if(target.tagName == "TEXTAREA") return;
  if(target.tagName == "INPUT") {
    let type = target.getAttribute("type");
    if(type != "checkbox" && type != "radio") return;
    let tickbox = target as (RecordElement & HTMLInputElement);
    if(!tickbox.entity) return;
    client.sendEvent([{tag: ["change", "direct-target"], element: tickbox.entity, checked: tickbox.checked}]);
    if(type == "radio") {
      var name = target.getAttribute("name") || "";
      if(name in previousCheckedRadios) {
        var previousEntity = previousCheckedRadios[name];
        client.sendEvent([{tag: ["change"], element: previousEntity, checked: false}]);
      }
    }
  } else if(target.entity) {
    if(!sentInputValues[target.entity]) {
      sentInputValues[target.entity] = [];
    }
    let value = target.value;

    if(isSelectElem(target)) {
      value = target.options[target.selectedIndex].value;
    }

    sentInputValues[target.entity!].push(value);
    let tag = ["change"];
    if(target == target) {
      tag.push("direct-target");
    }
    client.sendEvent([{tag, element: target.entity, value: target.value}]);
  }
});

function getFocusPath(target) {
  let root = activeElements.root;
  let current = target;
  let path:string[] = [];
  while(current !== root && current && current.parentElement) {
    let parent = current.parentElement;
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path;
}

function handleBasicEventWithTarget(name) {
  return (event) => {
    let {target} = event;
    let current = target as RecordElement;
    let objs: any[] = [];
    while (current) {
      if (current.entity) {
        let tag = [name];
        if (current == target) {
          tag.push("direct-target");
        }
        let eveEvent = {tag, element: current.entity};
        addSVGCoods(current, event, eveEvent);
        objs.push(eveEvent);
      }
      addRootEvent(current, event, objs, name);
      current = current.parentElement;
    }
    client.sendEvent(objs);
  };
}

window.addEventListener("focus", function(event) {
  let target = event.target as RecordElement;
  if(target.entity) {
    let objs = [{tag: ["focus"], element: target.entity}];
    client.sendEvent(objs);
    lastFocusPath = getFocusPath(target);
  }
}, true);

window.addEventListener("blur", function(event) {
  if(_suppressBlur) {
    event.preventDefault();
    return;
  }
  let target = event.target as RecordElement;
  if(target.entity) {
    let objs = [{tag: ["blur"], element: target.entity}];
    client.sendEvent(objs);

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
  let objs:any[] = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      let tag = ["keydown"];
      if (current == target) {
        tag.push("direct-target");
      }
      objs.push({tag, element: current.entity, key: keyMap[key] || key});
    }
    current = current.parentElement;
  }
  objs.push({tag: ["keydown"], element: "window", key});
  client.sendEvent(objs);
});

window.addEventListener("keyup", function(event) {
  let {target} = event;
  let current = target as RecordElement;
  let objs:any[] = [];
  let key = event.keyCode;
  while(current) {
    if(current.entity) {
      let tag = ["keyup"];
      if (current == target) {
        tag.push("direct-target");
      }
      objs.push({tag, element: current.entity, key: keyMap[key] || key});
    }
    current = current.parentElement;
  }
  objs.push({tag: ["keyup"], element: "window", key});
  client.sendEvent(objs);
});


//---------------------------------------------------------
// Editor Renderer
//---------------------------------------------------------
let activeLayers = {};
let editorParse = {};
let allNodeGraphs = {};
let showGraphs = false;

function injectProgram(node, elem) {
  node.appendChild(activeElements.root);
}

export function renderEve() {
  renderer.render([{c: "application-container", postRender: injectProgram}]);
}
