declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
/// <reference path="codemirror/codemirror.d.ts" />
import * as CodeMirror from "codemirror";
import {Diff} from "./runtime";
import {createEditor} from "./richTextEditor";
import {Element, Handler, RenderHandler} from "./microReact";
import {eve, handle as appHandle, dispatch, activeSearches} from "./app";
import {StepType, queryToExecutable} from "./queryParser";
import {copy, uuid, coerceInput} from "./utils";

enum PANE { FULL, WINDOW, POPOUT };
enum BLOCK { TEXT, PROJECTION };

export let uiState:{
  widget: {
    search: {[paneId:string]: {value:string, plan?:boolean, focused?:boolean}}
  }
} = {
  widget: {
    search: {}
  }
};

//---------------------------------------------------------
// Utils
//---------------------------------------------------------
var markedEntityRenderer = new MarkedRenderer();
markedEntityRenderer.heading = function(text:string, level: number) {
  return `<h${level}>${text}</h${level}>`; // override auto-setting an id based on content.
};
function entityToHTML(paneId:string, content:string, passthrough?: string[]):string {
  let md = marked(content, {breaks: true, renderer: markedEntityRenderer});
  let ix = md.indexOf("{");
  let queryCount = 0;
  let stack = [];
  while(ix !== -1) {
    if(md[ix - 1] === "\\") {
      md = md.slice(0, ix - 1) + md.slice(ix);
      ix--;

    } else if(md[ix] === "{") stack.push(ix);
    else if(md[ix] === "}") {
      let startIx = stack.pop();
      let content = md.slice(startIx + 1, ix);
      let colonIx = content.indexOf(":");

      let value = (colonIx !== -1 ? content.slice(colonIx + 1) : content).trim();
      let replacement;
      let type = "attribute";
      if(passthrough && passthrough.indexOf(value) !== -1) type = "passthrough";
      else if(eve.findOne("collection", {collection: value.toLowerCase()})) type = "collection";
      else if(eve.findOne("entity", {entity: value.toLowerCase()})) type = "entity";
      else if(colonIx === -1) type = "query";

      if(type === "attribute") {
        let attr = content.slice(0, colonIx).trim();
        replacement = `<span class="attribute" data-attribute="${attr}">${value}</span>`;

      } else if(type === "entity") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('ui set search', {value: '${value}', paneId: '${paneId}'}).commit();`;
        replacement = `<a class="link attribute entity" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "collection") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('ui set search', {value: '${value}', paneId: '${paneId}'}).commit();`;
        replacement = `<a class="link attribute collection" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "query") {
        let containerId = `${paneId}|${content}|${queryCount++}`;
        replacement = `<span class="embedded-query search-results" id="${containerId}" data-embedded-search="${content}"></span>`;
      }

      if(type !== "passthrough") {
        md = md.slice(0, startIx) + replacement + md.slice(ix + 1);
        ix += replacement.length - content.length - 2;
      }

    } else {
      throw new Error(`Unexpected character '${md[ix]}' at index ${ix}`);
    }

    // @NOTE: There has got to be a more elegant solution for (min if > 0) here.
    let nextCloseIx = md.indexOf("}", ix + 1);
    let nextOpenIx = md.indexOf("{", ix + 1);
    if(nextCloseIx === -1) ix = nextOpenIx;
    else if(nextOpenIx === -1) ix = nextCloseIx;
    else if(nextCloseIx < nextOpenIx) ix = nextCloseIx;
    else ix = nextOpenIx;
  }

  return md;
}

//---------------------------------------------------------
// Dispatches
//---------------------------------------------------------
appHandle("ui focus search", (changes:Diff, {paneId, value}:{paneId:string, value:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
  state.focused = true;
});
appHandle("ui set search", (changes:Diff, {paneId, value}:{paneId:string, value:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
  state.value = value;
  state.focused = false;
  let fact = copy(eve.findOne("ui pane", {pane: paneId}));
  fact.__id = undefined;
  fact.contains = value;
  changes.remove("ui pane", {pane: paneId})
    .add("ui pane", fact);

  if(!eve.findOne("entity", {entity: value})) activeSearches[value] = queryToExecutable(value);
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
let paneChrome:{[kind:number]: (paneId:string, entityId:string) => {c?: string, header?:Element, footer?:Element}} = {
  [PANE.FULL]: (paneId, entityId) => ({
    c: "fullscreen",
    header: {t: "header", c: "flex-row", children: [{c: "logo eve-logo"}, searchInput(paneId, entityId)]}
  }),
  [PANE.POPOUT]: (paneId, entityId) => ({
    c: "window",
    header: {t: "header", c: "flex-row", children: [
      {c: "flex-grow title", text: entityId},
      {c: "flex-row controls", children: [{c: "ion-close-round"}]}
    ]}
  }),
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

export function pane(paneId:string):Element {
  // @FIXME: Add kind to ui panes
  let {contains = undefined, kind = PANE.FULL} = eve.findOne("ui pane", {pane: paneId}) || {};
  let makeChrome = paneChrome[kind];
  if(!makeChrome) throw new Error(`Unknown pane kind: '${kind}' (${PANE[kind]})`);
  let {c:klass, header, footer} = makeChrome(paneId, contains);
  let content;
  if(eve.findOne("entity", {entity: contains}) || eve.findOne("collection", {collection: contains})) content = entity(contains, paneId);
  else if(activeSearches[contains] && activeSearches[contains].plan.length > 1) content = search(contains, paneId);
  else content = {text: "No results found..."}; // @ TODO: Editor to create new entity

  return {c: `wiki-pane ${klass || ""}`, children: [header, content, footer]};
}

export function search(search:string, paneId:string):Element {
  let {tokens, plan, executable} = activeSearches[search];
  // figure out what the headers are
  let headers = [];
  for(let step of plan) {
    if(step.size === 0 || step.type === StepType.FILTERBYENTITY || step.type === StepType.INTERSECT) continue;
    headers.push({c: "column field", value: step.name, text: step.name});
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
        text = link = chunk["entity"];
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
      let item = {id: `${paneId} ${ix} ${stepIx}`, c: "field " + kind, text, data: {paneId}, link, click: link ? navigate : undefined};
      if(!group.children[stepIx]) group.children[stepIx] = {c: "column", value: step.name, children: [item]};
      else if(!groupedFields[step.name]) group.children[stepIx].children.push(item);

      if(planLength === 1) group.c = "list-row"; // @FIXME: Is this still needed?
    }
  }
  // @TODO: Without this ID, a bug occurs when reusing elements that injects a text node containing "undefined" after certain scenarios.
  groups.unshift({t: "header", id: `${paneId}|header`, c: "flex-row", children: headers});
  return {t: "content", c: "wiki-search", key: JSON.stringify(results.unprojected), children: [{id: `${paneId}|table`, c: "results table", children: groups}], postRender: sizeColumns };
}
function sizeColumns(node:HTMLElement, elem:Element) {
  // @FIXME: Horrible hack to get around randomly added "undefined" text node that's coming from in microreact.
  let child:Node, ix = 0;
  let header = node.querySelector("header");
  let widths = {};
  let columns = <HTMLElement[]><any>node.querySelectorAll(".column");
  for(let column of columns) {
    column.style.width = "auto";
    widths[column["value"]] = widths[column["value"]] || 0;
    if(column.offsetWidth > widths[column["value"]]) widths[column["value"]] = column.offsetWidth;
  }
  for(let column of columns) column.style.width = widths[column["value"]] + 1;
}

//---------------------------------------------------------
// CHRIS
//---------------------------------------------------------

function getEmbed(meta, query) {
  var [content, rawParams] = query.split("|");
  var span = document.createElement("span");
  let link = span.textContent = content.toString();
  span.classList.add("link")
  span.classList.add("found");
  if(!eve.findOne("entity", {entity: link})) link = undefined;
  if (rawParams) {
    let params = {};
    for(let kv of rawParams.split(";")) {
      let [key, value] = kv.split("=");
      params[key.trim()] = coerceInput(value.trim());
    }
    if(params["eav source"]) {
      let eav = eve.findOne("sourced eav", { source: params["eav source"] });
      if (eav) {
        let {attribute, value} = eav;
        if (attribute === "is a" || eve.findOne("entity", { entity: value })) {
          link = value;
        }
        span.textContent = value;
      }
    }
  }
  if (link) {
    span.onclick = () => {
      dispatch("ui set search", { paneId: meta.paneId, value: link }).commit();
    }
  }
  return span;
}

function getInline(meta, query) {
  if (query.indexOf(":") > -1) {
    let sourceId = uuid();
    let entity = meta.entity;
    let [attribute, value] = query.substring(1, query.length - 1).split(":");
    value = coerceInput(value.trim());
    dispatch("add sourced eav", { entity, attribute, value, source: sourceId }).commit();
    return `{${entity}'s ${attribute}|eav source = ${sourceId}}`;
  }
  return query;
}

function removeInline(meta, query) {
  let [search, source] = query.substring(1, query.length - 1).split("|");
  if (eve.findOne("sourced eav", { source })) {
    dispatch("remove sourced eav", { entity: meta.entity, source }).commit();
  }
}

var wikiEditor = createEditor(getEmbed, getInline, removeInline);

//---------------------------------------------------------


export function entity(entityId:string, paneId:string):Element {
  let content = eve.findOne("entity", {entity: entityId})["content"];
  let page = eve.findOne("entity page", {entity: entityId})["page"];
  // @TODO: Move these into blocks
//   if(eve.findOne("collection", {collection: entityId})) blocks.push({id: `${paneId}|index`, c: "wiki-block", children: [index({collectionId: entityId, data: {paneId}, click: navigate})]});
//   blocks.push({id: `${paneId}|related`, c: "wiki-block", children: [related({entityId, data: {paneId}, click: navigate})]});
  return {t: "content", c: "wiki-entity", children: [
      {c: "wiki-editor", postRender: wikiEditor, change: updatePage, meta: {entity: entityId, page, paneId}, value: content}
  ]};
}

function updatePage(meta, content) {
    dispatch("update page", {page: meta.page, content}).commit();
}

function navigate(event, elem) {
  let {paneId} = elem.data;
  dispatch("ui set search", {paneId, value: elem.link}).commit();
}

export function block(blockId:string, paneId:string):Element {
  // @FIXME: Add kind to content blocks
  let {content = "", kind = BLOCK.TEXT} = eve.findOne("content blocks", {block: blockId}) || {};
  let html = "";
  if(kind === BLOCK.TEXT) {
    html = entityToHTML(paneId, content);
  } else throw new Error(`Unknown block kind: '${kind}' (${BLOCK[kind]})`);

  return {c: "wiki-block", dangerouslySetInnerHTML: html};
}

//---------------------------------------------------------
// Wiki Widgets
//---------------------------------------------------------
export function searchInput(paneId:string, value:string):Element {
  let state = uiState.widget.search[paneId] || {focused: false, plan: false};
  return {
    c: "flex-grow wiki-search-wrapper",
    children: [
      codeMirrorElement({
        c: `flex-grow wiki-search-input ${state.focused ? "selected": ""}`,
        paneId,
        value,
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

interface IndexElement extends Element {collectionId:string, data?:{}}
export function index(elem:IndexElement):IndexElement {
  let facts = eve.find("is a attributes", {collection: elem.collectionId});
  let click = elem.click;
  delete elem.click;
  elem.t = "p";
  elem.children = [
    {t: "h2", text: `There ${pluralize("are", facts.length)} ${facts.length} ${pluralize(elem.collectionId, facts.length)}:`},
    {t: "ul", children: facts.map((fact) => ({t: "li", c: "entity link", text: fact.entity, data: elem.data, link: fact.entity, click}))}
  ];
  return elem;
}

interface RelatedElement extends Element {entityId:string, data?:{}}
export function related(elem:RelatedElement):RelatedElement {
  let facts = eve.find("directionless links", {entity: elem.entityId});
  elem.t = "p";
  elem.c = "flex-row flex-wrap csv" + (elem.c || "");
  let click = elem.click;
  delete elem.click;

  if(facts.length) elem.children = [
    {t: "h2", text: `${elem.entityId} is related to:`},
  ].concat(facts.map((fact) => ({c: "entity link", text: fact.link, data: elem.data, link: fact.link, click})));
  else elem.text = `${elem.entityId} is not related to any other entities.`;
  return elem;
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

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;