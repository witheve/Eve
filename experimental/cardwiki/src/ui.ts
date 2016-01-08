declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
/// <reference path="codemirror/codemirror.d.ts" />
import * as CodeMirror from "codemirror";
import {Diff} from "./runtime";
import {Element, Handler, RenderHandler} from "./microReact";
import {eve, handle as appHandle, dispatch} from "./app";
import {copy} from "./utils";

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
});
appHandle("ui toggle search plan", (changes:Diff, {paneId}:{paneId:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value: ""};
  state.plan = !state.plan;
});

//---------------------------------------------------------
// Wiki Containers
//---------------------------------------------------------
export function root():Element {
  let panes = [];
  for(let {pane:paneId} of eve.find("ui pane")) {
    panes.push(pane(paneId));
  }
  return {c: "wiki-root test", children: panes};
}

// @TODO: Add search functionality + Pane Chrome
let paneChrome:{[kind:number]: (paneId:string, entityId:string) => {c?: string, header?:Element, footer?:Element}} = {
  [PANE.FULL]: (paneId, entityId) => ({
    c: "fullscreen",
    header: {t: "header", c: "flex-row", children: [{c: "logo eve-logo"}, search(paneId, entityId)]}
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
  let {contains:entityId = undefined, kind = PANE.FULL} = eve.findOne("ui pane", {pane: paneId}) || {};
  let makeChrome = paneChrome[kind];
  if(!makeChrome) throw new Error(`Unknown pane kind: '${kind}' (${PANE[kind]})`);
  let {c:klass, header, footer} = makeChrome(paneId, entityId);
  return {c: `wiki-pane ${klass || ""}`, children: [
    header,
    entity(entityId, paneId),
    footer
  ]};
}

export function entity(entityId:string, paneId:string):Element {
  // @TODO: This is where the new editor gets injected
  let blocks = [];
  for(let {block:blockId} of eve.find("content blocks", {entity: entityId})) blocks.push(block(blockId, paneId));
  if(eve.findOne("collection", {collection: entityId})) blocks.push({c: "wiki-block", children: [index({collectionId: entityId, data: {paneId}, click: navigate})]});
  blocks.push({c: "wiki-block", children: [related({entityId, data: {paneId}, click: navigate})]});
  return {t: "content", c: "wiki-entity", children: blocks};
}

function navigate(event, elem) {
  let {paneId} = elem.data;
  dispatch("ui set search", {paneId, value: elem.entity}).commit();
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
export function search(paneId:string, value:string):Element {
  let state = uiState.widget.search[paneId] || {focused: false, plan: false};
  return {
    c: "flex-grow wiki-search-wrapper",
    children: [
      codeMirrorElement({
        c: `flex-grow wiki-search-input ${state.focused ? "selected": ""}`,
        paneId,
        placeholder: "search...",
        focus: focusSearch,
        blur: setSearch,
        change: updateSearch,
        shortcuts: {"Enter": setSearch}
      }),
      //
      {c: "controls", children: [
        {c: `ion-ios-arrow-${state.plan ? 'up' : 'down'} plan`, click: toggleSearchPlan, paneId},
        {c: "ion-android-search", paneId, click: setSearch}
      ]},
    ]
  };
}

function focusSearch(event, elem) {
  dispatch("ui focus search", elem).commit();
}
function setSearch(event, elem) {
  dispatch("ui set search", elem).commit();
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
    {t: "ul", children: facts.map((fact) => ({t: "li", c: "entity link", text: fact.entity, data: elem.data, entity: fact.entity, click}))}
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
  ].concat(facts.map((fact) => ({c: "entity link", text: fact.link, data: elem.data, entity: fact.link, click})));
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
  editor:CodeMirror.Editor
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

    if(cm.getValue() !== elem.value) cm.setValue(elem.value || "");
    if(postRender) postRender(node, elem);
  }
}

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;