declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
/// <reference path="codemirror/codemirror.d.ts" />
import * as CodeMirror from "codemirror";
import {Diff} from "./runtime";
import {createEditor} from "./richTextEditor";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";
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

  if(!eve.findOne("display name", {name: value})) activeSearches[value] = queryToExecutable(value);
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
  let display = eve.findOne("display name", {name: contains}) || eve.findOne("display name", {id: contains});
  if(display) content = entity(display.id, paneId);
  else if(activeSearches[contains] && activeSearches[contains].plan.length > 1) content = search(contains, paneId);
  else content = {text: "No results found..."}; // @ TODO: Editor to create new entity

  return {c: `wiki-pane ${klass || ""}`, children: [header, content, footer]};
}

export function search(search:string, paneId:string):Element {
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
      let item = {id: `${paneId} ${ix} ${stepIx}`, c: "field " + kind, text, data: {paneId}, link, click: link ? navigate : undefined};
      if(!group.children[stepIx]) group.children[stepIx] = {c: "column", value: step.name, children: [item]};
      else if(!groupedFields[step.name]) group.children[stepIx].children.push(item);

      if(planLength === 1) group.c = "list-row"; // @FIXME: Is this still needed?
    }
  }
  // @TODO: Without this ID, a bug occurs when reusing elements that injects a text node containing "undefined" after certain scenarios.
  groups.unshift({t: "header", id: `${paneId}|header`, c: "flex-row", children: headers});
  return {t: "content", c: "wiki-search", key: JSON.stringify(results.unprojected), children: [{id: `${paneId}|table`, c: "results table", children: groups}], /*postRender: sizeColumns*/ };
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
// CHRIS
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

function getEmbed(meta:{entity: string, page: string, paneId:string}, query:string):HTMLElement {
  let [content, rawParams] = query.split("|");
  let node = document.createElement("span");
  let embedType;
  node.textContent = content;
  let params = parseParams(rawParams);
  params["paneId"] = params["paneId"] || meta.paneId;
  let contentDisplay = eve.findOne("display name", {id: content});

  // @TODO: Figure out what to do for {age: {current year - birth year}}
  if(params["eav source"]) {
    // Attribute reference
    embedType = "attribute";
    let eav = eve.findOne("sourced eav", { source: params["eav source"] });
    if (!eav) {
      node.classList.add("invalid");
    } else {
      let {attribute, value} = eav;
      content = node.textContent = value;
      if(eve.findOne("entity", {entity: value})) params["rep"] = params["rep"] || "name";
    }

  } else if(contentDisplay) {
    // Entity reference
    embedType = "entity";
    params["rep"] = params["rep"] || "name";
    node.textContent = contentDisplay.name;
  } else {
    // Embedded queries
    embedType = "query";
    // @FIXME: Horrible kludge, need a microReact.compile(...)
    let subRenderer = new Renderer();
    subRenderer.render([{id: "root", children: [search(content, meta.paneId)]}]);
    node = subRenderer.content;
  }

  if(params["rep"]) {
    let subRenderer = new Renderer();    
    let results;
    if(embedType === "query") {
      let {executable} = activeSearches[content];
      results = executable.exec();
    } else {
      results = {unprojected: [{entity: content}], results: [{entity: content}], provenance: [], groupInfo: []};
    }
    subRenderer.render([{id: "root", children: [represent(params["rep"], results, params)]}]);
    node = subRenderer.content;
  }
  node.classList.add(embedType);
  return node;
}

function getInline(meta, query) {
  let [content, rawParams = ""] = query.slice(1, -1).split("|");
  content = content.trim();
  let display = eve.findOne("display name", {name: content});
  let params = parseParams(rawParams);
  if (content.indexOf(":") > -1) {
    let sourceId = uuid();
    let entity = meta.entity;
    let [attribute, value] = content.split(":");
    value = coerceInput(value.trim());
    let display = eve.findOne("display name", {name: value});
    if(display) value = display.id;
    dispatch("add sourced eav", { entity, attribute, value, source: sourceId }).commit();
    return `{${entity}'s ${attribute}|eav source = ${sourceId}; ${rawParams || ""}}`;
    
  } else if(eve.findOne("entity", {entity: content})) {
    if(!params["rep"]) params["rep"] = "name";
    return `{${content}|${stringifyParams(params)}}`;
    
  } else if(display) {
    if(!params["rep"]) params["rep"] = "name";
    return `{${display.id}|${stringifyParams(params)}}`;
    
  } else if(!params["eav source"] && !params["rep"]) {
    activeSearches[content] = queryToExecutable(content);
    // @TODO: eventually the information about the requested subjects should come from
    // the NLP side or projection. But for now..
    let plan = activeSearches[content].plan;
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
    // if there's a lookup without a collection then we're just looking up a single attribute
    } else if(!info[StepType.GATHER] && info[StepType.LOOKUP] === 1) {
      let lookup = plan.filter((step) => step.type === StepType.LOOKUP)[0];
      rep = "value";
      field = lookup.name;
    // if there's a calculation without a collection we just want the result
    } else if(!info[StepType.GATHER] && info[StepType.CALCULATE] === 1) {
      let calculation = plan.filter((step) => step.type === StepType.CALCULATE)[0];
      rep = "value";
      field = calculation.name;
    }
    if(rep) {
      params["rep"] = rep;
      params["field"] = field;
      return `{${content}|${stringifyParams(params)}}`;
    }
  }

  return query;
}

function removeInline(meta, query) {
  let [search, rawParams] = query.substring(1, query.length - 1).split("|");
  let params = parseParams(rawParams);
  let source = params["eav source"];
  if (source && eve.findOne("sourced eav", { source })) {
    dispatch("remove sourced eav", { entity: meta.entity, source }).commit();
  } else {
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

let _reps:{[rep:string]: {embed: (results:{}[], params:{paneId?:string}) => any, represent: (params:any) => Element}} = {
  name: {
    embed(results, params:{field?:string}) {
      let entityId = results[0][params.field || "entity"];
      return {id: entityId, data: params};
    },
    represent({id, data, t = undefined}) {
      let {name = id} = eve.findOne("display name", {id});
      let isEntity = eve.findOne("entity", {entity: id});
      return {t: t || "span", c: "entity link inline", text: name, data, link: isEntity? id : undefined, click: navigate};
    }
  },
  value: {
    embed(results, params:{field:string}) {
      if(!params.field) throw new Error("Value representation requires a 'field' param indicating which field to represent");
      return {results, field: params.field};
    },
    represent({results, field}:{results:{}[], field:string}) {
      let vals = [];
      for(let row of results) vals.push(row[field]);
      return {t: "span", c: "value inline", text: vals.join(", ")};
    }
  },
    related: {
      embed(results, params:{}) {
        let entityId = results[0]["entity"];
        return {entityId, data: params};
      },
      represent({entityId, data}) {
        let {name = entityId} = eve.findOne("display name", {id: entityId});
        let facts = eve.find("directionless links", {entity: entityId});
        let elem:Element = {c: "flex-row flex-wrap csv"};
        if(facts.length) {
          return {c: "flex-row flex-wrap csv", children: [
            {t: "h2", text: `${name} is related to:`},
          ].concat(facts.map((fact) => _reps["name"].represent({id: fact.link, data})))};
        }
        return {text: `${name} is not related to any other entities.`};
      }
  },
  index: {
    embed(results, params:{}) {
      let entityId = results[0]["entity"];
      return {entityId, data: params};
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
};

// @TODO: Include translation layer instead of passing results directly into rep, to make rep reuse easier.
function represent(rep:string, results, params:{}):Element {
  //console.log("repping:", results, " as", rep, " with params ", params);
  if(rep in _reps) {
    let embedParams = _reps[rep].embed(results.results, <any>params);
    return _reps[rep].represent(embedParams);
  }
}

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;
