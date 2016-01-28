declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
/// <reference path="codemirror/codemirror.d.ts" />
import * as CodeMirror from "codemirror";
import {Diff} from "./runtime";
import {createEditor} from "./richTextEditor";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";
import {eve, handle as appHandle, dispatch, activeSearches} from "./app";
import {StepType, queryToExecutable} from "./queryParser";
import {parseDSL} from "./parser";
import {copy, uuid, coerceInput, builtinId, autoFocus, KEYS, mergeObject, setEndOfContentEditable} from "./utils";

enum PANE { FULL, WINDOW, POPOUT };
enum BLOCK { TEXT, PROJECTION };

export let uiState:{
  widget: {
    search: {[paneId:string]: {value:string, plan?:boolean, focused?:boolean, submitted?:string}}
  }
} = {
  widget: {
    search: {}
  }
};

//---------------------------------------------------------
// Utils
//---------------------------------------------------------

function preventDefault(event) {
  console.log("DEFAULT PREVENTED");
  event.preventDefault();
}

export function setURL(paneId:string, contains:string, replace?:boolean) {
  let {name = undefined} = eve.findOne("display name", {id: contains}) || {};
  if(!name) {
    let maybeId = eve.findOne("display name", {name: contains});
    if(maybeId) {
      name = contains;
      contains = maybeId.id;
    }
  }
  let url;
  if(contains.length === 0) url = "/";
  else if(name === undefined) url = `/search/${contains.replace(/ /g, "_")}`;
  else url = `/${name.replace(/ /g, "_")}/${contains.replace(/ /g, "_")}`;
  let state = {paneId, contains};
  if(replace)window.history.replaceState(state, null, url);
  else window.history.pushState(state, null, url);
}

//---------------------------------------------------------
// Dispatches
//---------------------------------------------------------
appHandle("ui focus search", (changes:Diff, {paneId, value}:{paneId:string, value:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
  state.focused = true;
});
appHandle("ui set search", (changes:Diff, {paneId, value, peek, x, y, popState}:{paneId:string, value:string, peek: boolean, x?: number, y?: number, popState?: boolean}) => {
  let fact;
  if(!peek) {
    let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
    state.value = value;
    state.focused = false;
    fact = copy(eve.findOne("ui pane", {pane: paneId}));
    fact.__id = undefined;
    fact.contains = value;
    changes.remove("ui pane", {pane: paneId});
  } else {
    let popout = eve.findOne("ui pane", {kind: PANE.POPOUT});
    let neuePaneId;
    if(!popout) {
      neuePaneId = uuid();
    } else {
      neuePaneId = popout.pane;
      changes.remove("ui pane", {pane: paneId});
    }
    let state = uiState.widget.search[neuePaneId] = {value};
    fact = {contains: value, pane: neuePaneId, kind: PANE.POPOUT};
    if(!popout || popout.pane !== neuePaneId) {
      changes.remove("ui pane position", {pane: neuePaneId});
      changes.add("ui pane position", {pane: neuePaneId, x, y});
      changes.remove("ui pane parent", {parent: paneId});
      changes.add("ui pane parent", {pane: neuePaneId, parent: paneId});
    }
    paneId = neuePaneId;
  }
  changes.add("ui pane", fact);

  // If this is the primary pane, and we aren't popping a previous state, update the url.
  if(paneId === "p1" && !popState) setURL(paneId, value);

  if(!eve.findOne("display name", {name: value})) activeSearches[value] = queryToExecutable(value);
});

appHandle("remove popup", (changes:Diff, {paneId}:{paneId:string}) => {
  changes.remove("ui pane", {pane: paneId});
  changes.remove("ui pane position", {pane: paneId});
});

appHandle("ui toggle search plan", (changes:Diff, {paneId}:{paneId:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value: ""};
  state.plan = !state.plan;
});

appHandle("add sourced eav", (changes:Diff, eav:{entity:string, attribute:string, value:string|number, source:string}) => {
    changes.add("sourced eav", eav);
});

appHandle("remove sourced eav", (changes:Diff, eav:{entity:string, source:string}) => {
    changes.remove("sourced eav", eav);
});
 
appHandle("update page", (changes:Diff, {page, content}: {page: string, content: string}) => {
    changes.remove("page content", {page});
    changes.add("page content", {page, content});
});
appHandle("create entity", (changes:Diff, {entity, page, name = "Untitled"}) => {
  changes
    .add("entity page", {entity, page})
    .add("display name", {id: entity, name});
});
appHandle("create page", (changes:Diff, {page, content = undefined}: {page: string, content?:string}) => {
  if(content === undefined) content = "This page is empty. Type something to add some content!";
  changes.add("page content", {page, content});
});
appHandle("create query", (changes:Diff, {id, content}) => {
  let page = uuid();
  changes
    .add("page content", {page, content: `# ${content} query`})
    .add("entity page", {id, page})
    .add("display name", {id, content})
    .add("sourced eav", {entity: id, attribute: "is a", value: builtinId("query")})
    .add("sourced eav", {entity: id, attribute: "content", value: content});
  let artifacts = parseDSL(content);
  if(artifacts.changeset) changes.merge(artifacts.changeset);
  for(let viewId in artifacts.views) {
    changes.add("sourced eav", {entity: id, attribute: "artifact", value: viewId});
    let name = artifacts.views[viewId]["displayName"];
    if(!eve.findOne("display name", {id: viewId}) && name) changes.add("display name", {id: viewId, name});
    changes.merge(artifacts.views[viewId].changeset(eve));
  }
});

//---------------------------------------------------------
// Wiki Containers
//---------------------------------------------------------
export function root():Element {
  let panes = [];
  for(let {pane:paneId} of eve.find("ui pane")) {
    panes.push(pane(paneId));
  }
  return {c: "wiki-root", id: "root", children: panes};
}

// @TODO: Add search functionality + Pane Chrome
let paneChrome:{[kind:number]: (paneId:string, entityId:string) => {c?: string, header?:Element, footer?:Element, shade?:Element}} = {
  [PANE.FULL]: (paneId, entityId) => ({
    c: "fullscreen",
    header: {t: "header", c: "flex-row", children: [{c: "logo eve-logo", data: {paneId}, link: "", click: navigate}, searchInput(paneId, entityId)]}
  }),
  [PANE.POPOUT]: (paneId, entityId) => {
    let parent = eve.findOne("ui pane parent", {pane: paneId})["parent"];
    return {
      c: "window",
      shade: {c: "pane-shade", paneId, click: removePopup, children: []},
      header: {t: "header", c: "flex-row", children: [
        {t: "button", c: "ion-android-open", click: navigateParent, link: entityId, paneId: paneId, parentId: parent, text:""},
        {c: "labeled-input flex-grow", children: [
          {t: "input", c: "flex-grow", type: "text", placeholder: "Search to embed", value: "", postRender: autoFocus},
          {t: "label", text: "as a link"},
        ]},
      ]},
    };
  },
  [PANE.WINDOW]: (paneId, entityId) => ({
    c: "window",
    header: {t: "header", c: "flex-row", children: [
      {c: "flex-grow title", text: entityId},
      {c: "flex-row controls", children: [
        {c: "ion-android-search"},
        {c: "ion-minus-round"},
        {c: "ion-close-round"}
      ]}
    ]}
  })
};

function navigateParent(event, elem) {
  dispatch("remove popup", {paneId: elem.paneId})
  .dispatch("ui set search", {paneId: elem.parentId, value: elem.link})
  .commit();
}

function removePopup(event, elem) {
  if(!event.defaultPrevented) {
    dispatch("remove popup", {paneId: elem.paneId}).commit();
  }
}

export function pane(paneId:string):Element {
  // @FIXME: Add kind to ui panes
  let {contains = undefined, kind = PANE.FULL} = eve.findOne("ui pane", {pane: paneId}) || {};
  let makeChrome = paneChrome[kind];
  if(!makeChrome) throw new Error(`Unknown pane kind: '${kind}' (${PANE[kind]})`);
  let {c:klass, header, footer, shade} = makeChrome(paneId, contains);
  let content;
  let display = eve.findOne("display name", {name: contains}) || eve.findOne("display name", {id: contains});

  let contentType = "entity";;
  if(contains.length === 0) {
    content = entity(builtinId("home"), paneId);
    
  } else if(contains.indexOf("search: ") === 0) {
    contentType = "search";
    content = search(contains.substring("search: ".length), paneId);
  } else if(display) {
    let options:any = {};
    content = entity(display.id, paneId, options);
  } else if(activeSearches[contains] && activeSearches[contains].plan.length > 1) {
    contentType = "search";
    content = search(contains, paneId);
  } else if(contains !== "") {
    content = {c: "flex-row spaced-row", children: [
      {t: "span", text: `The page ${contains} does not exist. Would you like to`},
      {t: "a", c: "link btn add-btn", text: "create it?", href: "#", name: contains, paneId, click: createPage }
    ]};
  }

  if(contentType === "search") {
    var disambiguation = {id: "search-disambiguation", c: "flex-row spaced-row disambiguation", children: [
      {text: "Did you mean to"},
      {t: "a", c: "link btn add-btn", text: "create a new page", href: "#", name: contains, paneId, click: createPage},
      {text: "with this name?"}
    ]};
  }

  let pane:Element = {c: `wiki-pane ${klass || ""}`, paneId, children: [header, disambiguation, content, footer]};
  let pos = eve.findOne("ui pane position", {pane: paneId});
  if(pos) {
    pane.style = `left: ${pos.x}px; top: ${pos.y + 20}px;`;
  }
  if(shade) {
    shade.children.push(pane);
    pane.click = preventDefault;
    pane = shade;
  }
  return pane;
}
function createPage(evt:Event, elem:Element) {
  let name = elem["name"];
  let entity = uuid();
  let page = uuid();
  dispatch("create page", {page, content: `# ${name}\n`})
    .dispatch("create entity", {entity, page, name})
    .dispatch("ui set search", {paneId: elem["paneId"], value: name}).commit();
}

export function search(search:string, paneId:string):Element {
  if(!activeSearches[search]) activeSearches[search] = queryToExecutable(search);
  let {tokens, plan, executable} = activeSearches[search];
  // figure out what the headers are
  let headers = [];
  for(let step of plan) {
    let name = step.name;
    if(step.size === 0 || step.type === StepType.FILTERBYENTITY || step.type === StepType.INTERSECT) continue;
    if(step.type === StepType.GATHER) name = eve.findOne("display name", {id: name}).name;
    headers.push({c: "column field", value: step.name, text: name});
  }

  // figure out what fields are grouped, if any
  let groupedFields = {};
  for(let step of plan) {
    if(step.type === StepType.GROUP) groupedFields[step.subjectNode.name] = true;

    else if(step.type === StepType.AGGREGATE) groupedFields[step.name] = true;
  }

  let results = executable.exec();
  let groupInfo = results.groupInfo;
  let planLength = plan.length;
  let isBit = planLength > 1;
  let groups = [];
  nextResult: for(let ix = 0, len = results.unprojected.length; ix < len; ix += executable.unprojectedSize) {
    if(groupInfo && ix > groupInfo.length) break;
    if(groupInfo && groupInfo[ix] === undefined) continue;

    let group;
    if(!groupInfo) groups.push(group = {c: "group", children: []});
    else if(!groups[groupInfo[ix]]) groups[groupInfo[ix]] = group = {c: "group", children: []};
    else group = groups[groupInfo[ix]];

    let offset = 0;
    for(let stepIx = 0; stepIx < planLength; stepIx++) {
      let step = plan[stepIx];
      if(!step.size) continue;
      let chunk = results.unprojected[ix + offset + step.size - 1];
      if(!chunk) continue nextResult;
      offset += step.size;

      let text, link, kind, click;
      if(step.type === StepType.GATHER) {
        text = eve.findOne("display name", {id: chunk["entity"]}).name;
        link = chunk["entity"];
        kind = "entity";
      } else if(step.type === StepType.LOOKUP) {
        text = chunk["value"];
        kind = "attribute";
      } else if(step.type === StepType.AGGREGATE) {
        text = chunk[step.subject];
        kind = "value";
      } else if(step.type = StepType.CALCULATE) {
        text = JSON.stringify(chunk.result);
        kind = "value";
      } else if(step.type === StepType.FILTERBYENTITY || step.type === StepType.INTERSECT) {
      } else text = JSON.stringify(chunk);

      if(text === undefined) continue;
      let item = {id: `${paneId} ${ix} ${stepIx}`, c: "field " + kind, text, data: {paneId}, link, click: link ? navigate : undefined, peek: true};
      if(!group.children[stepIx]) group.children[stepIx] = {c: "column", value: step.name, children: [item]};
      else if(!groupedFields[step.name]) group.children[stepIx].children.push(item);

      if(planLength === 1) group.c = "list-row"; // @FIXME: Is this still needed?
    }
  }
  // @TODO: Without this ID, a bug occurs when reusing elements that injects a text node containing "undefined" after certain scenarios.
  groups.unshift({t: "header", id: `${paneId}|header`, c: "flex-row", children: headers});
  return {t: "content", c: "wiki-search", key: JSON.stringify(results.unprojected), children: [
    {id: `${paneId}|table`, c: "results table", children: groups}
  ], /*postRender: sizeColumns*/ };
}
function sizeColumns(node:HTMLElement, elem:Element) {
  // @FIXME: Horrible hack to get around randomly added "undefined" text node that's coming from in microreact.
  let cur = node;
  while(cur.parentElement) cur = cur.parentElement;
  if(cur.tagName !== "HTML") document.body.appendChild(cur);

  let child:Node, ix = 0;
  let widths = {};
  let columns = <HTMLElement[]><any>node.querySelectorAll(".column");
  for(let column of columns) {
    column.style.width = "auto";
    widths[column["value"]] = widths[column["value"]] || 0;
    if(column.offsetWidth > widths[column["value"]]) widths[column["value"]] = column.offsetWidth;
  }
  for(let column of columns) column.style.width = widths[column["value"]] + 1;

  if(cur.tagName !== "HTML") document.body.removeChild(cur);
}

//---------------------------------------------------------
// Wiki editor functions
//---------------------------------------------------------
function parseParams(rawParams:string) {
  let params = {};
  if(!rawParams) return params;
  for(let kv of rawParams.split(";")) {
    let [key, value] = kv.split("=");
    if(!key || !key.trim()) continue;
    if(!value || !value.trim()) throw new Error("Must specify value for key '" + key + "'");
    params[key.trim()] = coerceInput(value.trim());
  }
  return params;
}
function stringifyParams(params:{}):string {
  let rawParams = "";
  if(!params) return rawParams;
  for(let key in params) rawParams += `${rawParams.length ? "; " : ""}${key} = ${params[key]}`;
  return rawParams;
}

function cellUI(paneId, query):Element {
  let [content, rawParams] = query.split("|");
  let embedType;
  let params = getCellParams(content, rawParams);
  params["paneId"] = params["paneId"] || paneId;

  let subRenderer = new Renderer();
  let results;
  if(params["noResults"]) {
    results = {unprojected: [{entity: content}], results: [{entity: content}], provenance: [], groupInfo: []};
  } else {
    let {executable} = activeSearches[content];
    results = executable.exec();
  }
  return {c: `cell`, children: [represent(params["rep"], results, params)]};
}

function getCellParams(content, rawParams) {
  content = content.trim();
  let display = eve.findOne("display name", {name: content});
  let params = parseParams(rawParams);
  let contentDisplay = eve.findOne("display name", {id: content});
  if(contentDisplay) {
    params["rep"] = params["rep"] || "name";
    params["noResults"] = true;
  } else {
    // @TODO: this shouldn't be here
    if(!activeSearches[content]) {
      activeSearches[content] = queryToExecutable(content);
    }
    if(params["rep"]) return params;

    // @TODO: eventually the information about the requested subjects should come from
    // the NLP side or projection. But for now..
    let plan = activeSearches[content].plan;
    console.log(plan);
    let info = {};
    for(let step of plan) {
      if(!info[step.type]) info[step.type] = 0;
      info[step.type] += 1;
    }
    let field;
    let rep;
    // if there is an aggregate without grouping then we just return the aggregate value
    if(info[StepType.AGGREGATE] === 1 && !info[StepType.GROUP]) {
      let aggregate = plan.filter((step) => step.type === StepType.AGGREGATE)[0];
      rep = "value";
      field = aggregate.name;
    // if there's a calculation without a collection we just want the result
    } else if(!info[StepType.GATHER] && info[StepType.CALCULATE] === 1) {
      let calculation = plan.filter((step) => step.type === StepType.CALCULATE)[0];
      rep = "value";
      field = calculation.name;
    // if there's a lookup without a collection then we're just looking up a single attribute
    } else if(!info[StepType.GATHER] && info[StepType.LOOKUP] === 1) {
      let lookup = plan.filter((step) => step.type === StepType.LOOKUP)[0];
      rep = "value";
      field = lookup.name;
    } else {
      rep = "table";
    }
    if(rep) {
      params["rep"] = rep;
      params["field"] = field;
    }
  }
  return params;
}

var paneEditors = {};
function wikiEditor(node, elem) {
  createEditor(node, elem);
  paneEditors[elem.meta.paneId] = node.editor;
}

function reparentCell(node, elem) {
  if(node.parentNode.id !== elem.containerId) {
    document.getElementById(elem.containerId).appendChild(node);
  }
  node.parentNode["mark"].changed();
}

//---------------------------------------------------------

export function entity(entityId:string, paneId:string, options:any = {}):Element {
  let content = eve.findOne("entity", {entity: entityId})["content"];
  let page = eve.findOne("entity page", {entity: entityId})["page"];
  let {name} = eve.findOne("display name", {id: entityId});
  let cells = getCells(content);
  let finalOptions = mergeObject({keys: {
    "=": (cm) => createEmbedPopout(cm, paneId)
  }}, options);
  let cellItems = cells.map((cell) => {
    let ui = cellUI(paneId, cell.query);
    ui.id = `${paneId}|${cell.id}`;
    ui.postRender = reparentCell;
    ui["containerId"] = `${paneId}|${cell.id}|container`;
    return ui;
  });
  return {t: "content", c: "wiki-entity", children: [
    /* This is disabled because searching for just the name of a single entity resolves to a single find step which blows up on query compilation
       {c: "flex-row spaced-row disambiguation", children: [
       {text: "Did you mean to"},
       {t: "a", c: "link btn add-btn", text: `search for '${name}'`, href: "#", name: search, data: {paneId}, link: `search: ${name}`, click: navigate},
       {text: "instead?"}
       ]},
     */
    {c: "wiki-editor", postRender: wikiEditor, change: updatePage, meta: {entity: entityId, page, paneId}, value: content, options: finalOptions, cells, children: cellItems}
  ]};
}

function createEmbedPopout(cm, paneId) {
  let coords = cm.cursorCoords("head", "page");
  // dispatch("createEmbedPopout", {paneId, x: coords.left, y: coords.top - 20}).commit();
  cm.operation(() => {
    let from = cm.getCursor("from");
    cm.replaceRange("=", from, cm.getCursor("to"));
    let widget = document.createElement("span");
    widget.textContent = "= ";
    widget.contentEditable = "true";
    widget.classList.add("embedded-cell");
    let to = copy(from);
    to.ch++;
    var mark = cm.markText(from, to, {replacedWith: widget});
    widget.onkeydown = (event) => embeddedCellKeys(event, paneId, mark);
    setTimeout(() => {
      widget.focus()
      setEndOfContentEditable(widget);
    }, 0);
  });
}

function embeddedCellKeys(event, paneId, mark) {
  let value = event.currentTarget.textContent;
  let parent = paneId;
  if(event.keyCode === KEYS.ESC || (event.keyCode === KEYS.ENTER && value.trim() === "=")) {
    mark.clear();
    paneEditors[parent].cmInstance.focus();
    event.preventDefault();
  } else if(event.keyCode === KEYS.ENTER) {
    if(value[0] === "=") {
      value = value.substring(1);
    }
    value = value.trim();
    console.log("DO THE EMBED");
    let cm = paneEditors[parent].cmInstance;
    let from = cm.getCursor("from");
    let to = cm.getCursor("to");
    from.ch--;
    cm.replaceRange(`{${value}}`, from, to);
    paneEditors[parent].cmInstance.focus();
    mark.clear();
    event.preventDefault();
  }
}

function updatePage(meta, content) {
    dispatch("update page", {page: meta.page, content}).commit();
}

function navigate(event, elem) {
  let {paneId} = elem.data;
  let info:any = {paneId, value: elem.link, peek: elem.peek};
  if(event.clientX) {
    info.x = event.clientX;
    info.y = event.clientY;
  }
  dispatch("ui set search", info).commit();
  event.preventDefault();
}

//---------------------------------------------------------
// Page parsing
//---------------------------------------------------------

function getCells(content: string) {
  let cells = [];
  let ix = 0;
  let ids = {};
  for(let part of content.split(/({[^]*?})/gm)) {
    if(part[0] === "{") {
      if(!ids[part]) {
        ids[part] = 0;
      }
      cells.push({start: ix, length: part.length, value: part, query: part.substring(1, part.length - 1), id: part + ids[part]++});
    }
    ix += part.length;
  }
  return cells;
}

//---------------------------------------------------------
// Wiki Widgets
//---------------------------------------------------------
export function searchInput(paneId:string, value:string):Element {
  let display = eve.findOne("display name", {id: value});
  let name = value;
  if(display) {
    name = display.name;
  }
  let state = uiState.widget.search[paneId] || {focused: false, plan: false};
  return {
    c: "flex-grow wiki-search-wrapper",
    children: [
      codeMirrorElement({
        c: `flex-grow wiki-search-input ${state.focused ? "selected": ""}`,
        paneId,
        value: name,
        focus: focusSearch,
        blur: setSearch,
        // change: updateSearch,
        shortcuts: {"Enter": setSearch}
      }),
      {c: "controls", children: [
        {c: `ion-ios-arrow-${state.plan ? 'up' : 'down'} plan`, click: toggleSearchPlan, paneId},
        // while technically a button, we don't need to do anything as clicking it will blur the editor
        // which will execute the search
        {c: "ion-android-search visible", paneId}
      ]},
    ]
  };
};

function focusSearch(event, elem) {
  dispatch("ui focus search", elem).commit();
}
function setSearch(event, elem) {
  dispatch("ui set search", {paneId: elem.paneId, value: event.value}).commit();
}
function updateSearch(event, elem) {
  dispatch("ui update search", elem).commit();
}
function toggleSearchPlan(event, elem) {
  console.log("toggle search plan", elem);
  dispatch("ui toggle search plan", elem).commit();
}

//---------------------------------------------------------
// UITK
//---------------------------------------------------------
interface CMNode extends HTMLElement { cm: any }
interface CMElement extends Element {
  autofocus?: boolean
  lineNumbers?: boolean,
  lineWrapping?: boolean,
  mode?: string,
  shortcuts?: {[shortcut:string]: Handler<any>}
};
interface CMEvent extends Event {
  editor: CodeMirror.Editor
  value: string
}
export function codeMirrorElement(elem:CMElement):CMElement {
  elem.postRender = codeMirrorPostRender(elem.postRender);
  return elem;
}

let _codeMirrorPostRenderMemo = {};
function handleCMEvent(handler:Handler<Event>, elem:CMElement):(cm:CodeMirror.Editor) => void {
  return (cm:CodeMirror.Editor) => {
    let evt = <CMEvent><any>(new CustomEvent("CMEvent"));
    evt.editor = cm;
    evt.value = cm.getDoc().getValue();
    handler(evt, elem);
  }
}
function codeMirrorPostRender(postRender?:RenderHandler):RenderHandler {
  let key = postRender ? postRender.toString() : "";
  if(_codeMirrorPostRenderMemo[key]) return _codeMirrorPostRenderMemo[key];
  return _codeMirrorPostRenderMemo[key] = (node:CMNode, elem:CMElement) => {
    let cm = node.cm;
    if(!cm) {
      let extraKeys = {};
      if(elem.shortcuts) {
        for(let shortcut in elem.shortcuts)
          extraKeys[shortcut] = handleCMEvent(elem.shortcuts[shortcut], elem);
      }
      cm = node.cm = CodeMirror(node, {
        lineWrapping: elem.lineWrapping !== false ? true : false,
        lineNumbers: elem.lineNumbers,
        mode: elem.mode || "gfm",
        extraKeys
      });
      if(elem.change) cm.on("change", handleCMEvent(elem.change, elem));
      if(elem.blur) cm.on("blur", handleCMEvent(elem.blur, elem));
      if(elem.focus) cm.on("focus", handleCMEvent(elem.focus, elem));
      if(elem.autofocus) cm.focus();
    }

    if(cm.getDoc().getValue() !== elem.value) cm.setValue(elem.value || "");
    if(postRender) postRender(node, elem);
  }
}

function getEntitiesFromResults(results:{[field:string]: any}[], {fields = ["entity"]} = {}):string[] {
  let entities = [];
  if(!results.length) return entities;
  
  for(let field of fields) {
    if(results[0][field] === undefined) field = builtinId(field);
    for(let fact of results) entities.push(fact[field]);
  }
  return entities;
}

let _reps:{[rep:string]: {embed: (results:{}[], params:{paneId?:string, [p:string]: any}) => any, represent: (params:any) => Element}} = {
  attributes: {
    embed(results, params:{field?:string, data?:{}}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      if(entities.length > 1) return entities.map((entity) => ({id: entity, data: params.data}));
      else return {entityId: entities[0], data: params.data};
    },
    represent({entityId, data}) {
      let attributes = [];
      for(let eav of eve.find("entity eavs", {entity: entityId})) attributes.push({attribute: eav.attribute, value: eav.value});
      return _reps["table"].represent({results: attributes, data});
    }
  },
  name: {
    embed(results, params:{field?:string, data?:{}}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      if(entities.length > 1) return entities.map((entity) => ({id: entity, data: params.data}));
      else return {id: entities[0], data: params.data};
    },
    represent({id, data, t = undefined}) {
      let {name = id} = eve.findOne("display name", {id}) || {};
      let isEntity = eve.findOne("entity", {entity: id});
      return {t: t || "span", c: "entity link inline", text: name, data, link: isEntity? id : undefined, click: navigate, peek: true};
    }
  },
  value: {
    embed(results, params:{field:string, type?:string, data?:{}}) {
      if(!params.field) throw new Error("Value representation requires a 'field' param indicating which field to represent");
      let field = params.field;
      // If field isn't in results, try to resolve it as a field name, otherwise error out
      if(results.length && results[0][field] === undefined) {
        let potentialIds = eve.find("display name", {name: field});
        let neueField;
        for(let display of potentialIds) {
          if(results[0][display.id] !== undefined) {
            if(neueField === undefined) neueField = display.id;
            else {
              neueField = undefined;
              break
            }
          }
        }
        if(!neueField) throw new Error(`Unable to uniquely resolve field name ${field} in result fields ${Object.keys(results[0])}`);
        else field = neueField;
      }

      let values = [];
      for(let row of results) values.push(row[field]);
      return {values, type: params.type || "inline", data: params.data};
    },
    represent({values, type = "inline", data}:{values:any[], type:string, data:{}}) {
      let children = [];
      for(let val of values) {
        if(eve.findOne("entity", {entity: val})) children.push(_reps["name"].represent({id: val, data, t: type === "list" ? "li" : undefined}));
        else children.push({t: type === "list" ? "li" : "span", text: val});
      }
      if(type === "inline") return {t: "span", c: "flex-row flex-wrap csv value inline", children};
      if(type === "list") return {t: "ul", c: "value", children};
    }
  },
  related: {
    embed(results, params:{data?:{}, field?:string}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      if(entities.length > 1) return entities.map((entity) => ({entityId: entity, data: params.data}));
      else return {entityId: entities[0], data: params.data};
    },
    represent({entityId, data}) {
      let {name = entityId} = eve.findOne("display name", {id: entityId}) || {};
      let relations = [];
      for(let link of eve.find("directionless links", {entity: entityId})) relations.push(link.link);
      let elem:Element = {c: "flex-row flex-wrap csv"};
      if(relations.length) {
        return {c: "flex-row flex-wrap csv", children: [
          {t: "h2", text: `${name} is related to:`},
          _reps["value"].represent({values: relations, data})
        ]};
      }
      return {text: `${name} is not related to any other entities.`};
    }
  },
  index: {
    embed(results, params:{data?:{}, field?:string}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      if(entities.length > 1) return entities.map((entity) => ({entityId: entity, data: params.data}));
      else return {entityId: entities[0], data: params.data};
    },
    represent({entityId, data}) {
      let {name = entityId} = eve.findOne("display name", {id: entityId}) || {};

      let facts = eve.find("is a attributes", {collection: entityId});
      return {children: [
        {t: "h2", text: `There ${pluralize("are", facts.length)} ${facts.length} ${pluralize(name, facts.length)}:`},
        {t: "ul", children: facts.map((fact) => _reps["name"].represent({t: "li", id: fact.entity, data}))}
      ]};
    }
  },
  table: {
    embed(results, params:{data?: {}}) {
      return {results, data: params.data};
    },
    represent({results, data}) {
      if(!results.length) return {text: "<Empty Table>"};
      let fields = Object.keys(results[0]);
      let fieldIx = 0;
      while(fieldIx < fields.length) {
        if(fields[fieldIx] === "__id") fields.splice(fieldIx, 1);
        else if(fields[fieldIx].indexOf("$$temp") === 0) fields.splice(fieldIx, 1);
        else fieldIx++;
      }
      return {c: "table", children: [
        {t: "header", children: fields.map((field) => ({c: "column field", children: [_reps["value"].represent({values: [field], data})]}))},
        {c: "body", children: results.map((row) => ({
          c: "group",
          children: fields.map((field) => {
            let value = _reps["value"].represent({values: [row[field]], data});
            value.c = (value.c || "") + "column field";
            return value;
          })
        }))}
      ]};
    }
  },
  results: {
    embed(results, params:{data?: {}, field?: string}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      let opts = entities.map((query) => {
        let artifacts = eve.find("entity eavs", {entity: query, attribute: "artifact"}).map((fact) => fact.value)
        return {query, artifacts, data: params.data};
      });
      
      if(opts.length > 1) return opts;
      else return opts[0];
    },
    represent({query, artifacts, data}) {
      return {children: [
        //{t: "h3", text: eve.findOne("entity eavs", {entity: query, attribute: "content"}).value},
        {c: "artifacts", children: artifacts.map((view) => ({c: "artifact", children: [
          {t: "h4", text: `${(eve.findOne("display name", {id: view}) || {name: ""}).name} (${view})`},
          _reps["table"].represent({results: eve.find(view), data})
        ]}))}
      ]};
    }
  },
  directory: {
    embed(results, params:{data?:{}, field?:string}) {
      let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
      if(entities.length === 1) {
        let collection = entities[0];
        entities.length = 0;
        for (let fact of eve.find("is a attributes", {collection})) entities.push(fact.entity);
      }
      return {entities, data: params.data};
    },
    represent({entities:rawEntities, data}:{entities:string[], data:{}}) {
      let {systems, collections, entities, relatedness, collectionSize} = classifyEntities(rawEntities);
      collections.sort((a, b) =>
                    (collectionSize[a] === collectionSize[b]) ? 0 :
                    (collectionSize[a] === undefined) ? 1 :
                    (collectionSize[b] === undefined) ? -1 :
                    (collectionSize[a] > collectionSize[b]) ? -1 : 1);


      // @TODO: Highlight important system entities (e.g., entities, collections, orphans, etc.)
      // @TODO: Include dropdown pane of all other system entities
      // @TODO: Highlight the X largest user collections. Ghost in examples if not enough (?)
      // @TODO: Include dropdown pane of all other user collections (sorted alphh or # ?, inc. sorter?)
      // @TODO: Highlight the X (largest? most related?) entities (ghost examples if not enough (?)
      // @TODO: Include dropdown pane of other entities
      
      
      return {c: "flex-column", children: [
        {c: "flex-column", children: collections.map(
          (entity) => ({c: "spaced-row flex-row", children: [_reps["name"].represent({id: entity, data}), {c: "flex-grow"}, {text: ""+collectionSize[entity]}]})
        )},
        {t: "hr"},
        {c: "flex-column", children: entities.map(
          (entity) => _reps["name"].represent({id: entity, data})
        )},
        {t: "hr"},
        {c: "flex-column", children: systems.map(
          (entity) => _reps["name"].represent({id: entity, data})
        )}
      ]};
    }
  }
};

function classifyEntities(rawEntities:string[]) {
  let entities = rawEntities.slice();
  let collections:string[] = [];
  let systems:string[] = [];

  // Measure relatedness of entities
  let relatedness:{[entity:string]: number} = {};
  for(let entity of entities) relatedness[entity] = eve.find("directionless links", {entity}).length;
  
  // Separate system entities
  let ix = 0;
  while(ix < entities.length) {
    if(eve.findOne("is a attributes", {collection: builtinId("system"), entity: entities[ix]})) {
      systems.push(entities[ix]);
      entities.splice(ix, 1);
    } else ix++;
  }
  
  // Separate user collections from other entities
  ix = 0;
  let collectionSize:{[collection:string]: number} = {};
  while(ix < entities.length) {
    let fact = eve.findOne("collection", {collection: entities[ix]});
    if(fact) {
      collectionSize[entities[ix]] = fact.count;
      collections.push(entities[ix]);
      entities.splice(ix, 1);
    } else ix++;
  }

  return {systems, collections, entities, relatedness, collectionSize};
}

function represent(rep:string, results, params:{}):Element {
  //console.log("repping:", results, " as", rep, " with params ", params);
  if(rep in _reps) {
    let embedParamSets = _reps[rep].embed(results.results, <any>params);
    if(embedParamSets.constructor === Array) {
      let wrapper = {c: "flex-column", children: []};
      for(let embedParams of embedParamSets) {
        embedParams["data"] = embedParams["data"] = params;
        wrapper.children.push(_reps[rep].represent(embedParams));
      }
      return wrapper;
    } else {
      let embedParams = embedParamSets;
      embedParams["data"] = embedParams["data"] = params;
      return _reps[rep].represent(embedParams);
    }
  }
}

window.addEventListener("popstate", function(evt) {
  let {paneId = undefined, contains = undefined} = evt.state || {};
  if(paneId === undefined || contains === undefined) return;
  dispatch("ui set search", {paneId, value: contains, popState: true}).commit();
});

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;
