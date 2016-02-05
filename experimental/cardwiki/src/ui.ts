declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import * as CodeMirror from "codemirror";
import {copy, uuid, coerceInput, builtinId, autoFocus, KEYS, mergeObject, setEndOfContentEditable} from "./utils";
import {Diff} from "./runtime";
import {createEditor} from "./richTextEditor";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";
import * as uitk from "./uitk";
import {eve, handle as appHandle, dispatch, activeSearches, renderer} from "./app";
import {parseDSL} from "./parser";
import {parse as nlparse, StateFlags, FunctionTypes} from "./NLQueryParser";


export enum PANE { FULL, WINDOW, POPOUT };
enum BLOCK { TEXT, PROJECTION };

var ignorePopState = false; // Because html5 is full of broken promises and broken dreams

//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------
export let uiState:{
  widget: {
    search: {[paneId:string]: {value:string, plan?:boolean, focused?:boolean, submitted?:string}},
    table: {[key:string]: {field:string, direction:string}}
  }
} = {
  widget: {
    search: {},
    table: {}
  }
};

//---------------------------------------------------------
// Utils
//---------------------------------------------------------

function preventDefault(event) {
  event.preventDefault();
}

export function setURL(paneId:string, contains:string, replace?:boolean) {
  let name = uitk.resolveName(contains);
  let url;
  let state;
  if(paneId === "p1") { // @TODO: Make this a constant
    if(contains.length === 0) url = "/";
    else if(name === contains) url = `/search/${contains.replace(/ /g, "_")}`;
    else url = `/${name.replace(/ /g, "_")}/${contains.replace(/ /g, "_")}`;
    state = {paneId, contains};
    console.log("setURL", url, state);
    window["states"] = window["states"] || [];
    window["states"].push(state);
  } else {
    return; // @TODO: fixme;
    ignorePopState = true;
    window.history.back();
    url = window.location;
    state = copy(window.history.state);
    window.history.forward();
    state.popout = contains;
    ignorePopState = false;
  }
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
  let displays = eve.find("display name", {name: value});
  if(displays.length === 1) value = displays[0].id;
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
      changes.remove("ui pane", {pane: neuePaneId});
    }
    let state = uiState.widget.search[neuePaneId] = {value};
    fact = {contains: value, pane: neuePaneId, kind: PANE.POPOUT};
    if(!popout || paneId !== neuePaneId) {
      changes.remove("ui pane position", {pane: neuePaneId});
      changes.add("ui pane position", {pane: neuePaneId, x, y});
      changes.remove("ui pane parent", {parent: paneId});
      changes.add("ui pane parent", {pane: neuePaneId, parent: paneId});
    }
    paneId = neuePaneId;
  }
  changes.add("ui pane", fact);
  if(!popState) setURL(paneId, value);
});

appHandle("remove popup", (changes:Diff, {}:{}) => {
  let popup = eve.findOne("ui pane", {kind: PANE.POPOUT});
  if(popup) {
    let paneId = popup.pane;
    changes.remove("ui pane", {pane: paneId});
    changes.remove("ui pane position", {pane: paneId});
  }
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

appHandle("insert query", (changes:Diff, {query}) => {
  let parsed = nlparse(query);
  if(eve.findOne("query to id", {query})) return;
  if(parsed[0].state === StateFlags.COMPLETE) {
    let artifacts = parseDSL(parsed[0].query.toString());
    if(artifacts.changeset) changes.merge(artifacts.changeset);
    var rootId;
    for(let viewId in artifacts.views) {
      if(!rootId) rootId = viewId;
      let name = artifacts.views[viewId]["displayName"];
      if(!eve.findOne("display name", {id: viewId}) && name) changes.add("display name", {id: viewId, name});
      changes.merge(artifacts.views[viewId].changeset(eve));
    }
    changes.add("query to id", {query, id: rootId})
  }
});

appHandle("remove entity attribute", (changes:Diff, {entity, attribute, value}) => {
  changes.remove("sourced eav", {entity, attribute, value});
  // @FIXME: Make embeds auto-gc themselves when invalidated.
});
appHandle("update entity attribute", (changes:Diff, {entity, attribute, prev, value}) => {
  // @FIXME: proper unique source id
  let {source = "<global>"} = eve.findOne("sourced eav", {entity, attribute, value: prev}) || {};
  if(prev !== undefined) changes.remove("sourced eav", {entity, attribute, value: prev});
  changes.add("sourced eav", {entity, attribute, value, source});
});
appHandle("rename entity attribute", (changes:Diff, {entity, attribute, prev, value}) => {
  // @FIXME: proper unique source id
  let {source = "<global>"} = eve.findOne("sourced eav", {entity, attribute: prev, value}) || {};
  if(prev !== undefined) changes.remove("sourced eav", {entity, attribute: prev, value});
  changes.add("sourced eav", {entity, attribute, value, source});
});
appHandle("sort table", (changes:Diff, {key, field, direction}) => {
  let state = uiState.widget.table[key] || {field: undefined, direction: undefined};
  state.field = field;
  state.direction = direction;
  uiState.widget.table[key] = state;
});

//---------------------------------------------------------
// Wiki Containers
//---------------------------------------------------------
export function root():Element {
  let panes = [];
  for(let {pane:paneId} of eve.find("ui pane")) {
    panes.push(pane(paneId));
  }
  return {c: "wiki-root", id: "root", children: panes, click: removePopup};
}

// @TODO: Add search functionality + Pane Chrome
let paneChrome:{[kind:number]: (paneId:string, entityId:string) => {c?: string, header?:Element, footer?:Element, captureClicks?:boolean}} = {
  [PANE.FULL]: (paneId, entityId) => ({
    c: "fullscreen",
    header: {t: "header", c: "flex-row", children: [{c: "logo eve-logo", data: {paneId}, link: "", click: navigate}, searchInput(paneId, entityId)]}
  }),
  [PANE.POPOUT]: (paneId, entityId) => {
    let parent = eve.findOne("ui pane parent", {pane: paneId})["parent"];
    return {
      c: "window",
      captureClicks: true,
      header: {t: "header", c: "", children: [
        {t: "button", c: "ion-android-open", click: navigateParent, link: entityId, paneId: paneId, parentId: parent, text:""},
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
    dispatch("remove popup", {}).commit();
  }
}

export function pane(paneId:string):Element {
  // @FIXME: Add kind to ui panes
  let {contains = undefined, kind = PANE.FULL} = eve.findOne("ui pane", {pane: paneId}) || {};
  let makeChrome = paneChrome[kind];
  if(!makeChrome) throw new Error(`Unknown pane kind: '${kind}' (${PANE[kind]})`);
  let {c:klass, header, footer, captureClicks} = makeChrome(paneId, contains);
  let content;
  let display = eve.findOne("display name", {name: contains}) || eve.findOne("display name", {id: contains});

  let contentType = "entity";;
  if(contains.length === 0) {
    content = entity(builtinId("home"), paneId, kind);

  } else if(contains.indexOf("search: ") === 0) {
    contentType = "search";
    content = search(contains.substring("search: ".length), paneId);
  } else if(display) {
    let options:any = {};
    content = entity(display.id, paneId, kind, options);
  } else if(eve.findOne("query to id", {query: contains})) {
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
  if(captureClicks) {
    pane.click = preventDefault;
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
  let [rawContent, rawParams] = search.split("|");
  let parsedParams = getCellParams(rawContent, rawParams);
  let {results, params, content} = queryUIInfo(search);
  mergeObject(params, parsedParams);
  let rep = represent(content, params["rep"], results, params);
  return {t: "content", c: "wiki-search", children: [
    rep
  ]};
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

function cellUI(paneId, query, cell):Element {
  let {params, results, content} = queryUIInfo(query);
  params["paneId"] = params["paneId"] || paneId;
  params["cell"] = cell;
  params["childRep"] = params["rep"];
  params["rep"] = "embeddedCell";
  return {c: `cell`, children: [represent(content, params["rep"], results, params)]};
}

function queryUIInfo(query) {
  let [content, rawParams] = query.split("|");
  let embedType;
  // let params = getCellParams(content, rawParams);
  let params = parseParams(rawParams);
  let results;
  if(eve.findOne("display name", {id: content}) || eve.findOne("display name", {name: content})) {
    let id = content;
    let display = eve.findOne("display name", {name: content});
    if(display) {
      id = display["id"];
    }
    results = {unprojected: [{entity: id}], results: [{entity: id}]};
  } else {
    let queryId = eve.findOne("query to id", {query: content});
    if(queryId) {
      let queryResults = eve.find(queryId.id);
      let queryUnprojected = eve.table(queryId.id).unprojected;
      results = {unprojected: queryUnprojected, results: queryResults};
    } else {
      params["rep"] = "error";
      params["message"] = "invalid search";
      results = {};
    }
  }
  return {results, params, content};
}

function getCellParams(content, rawParams) {
  content = content.trim();
  let display = eve.findOne("display name", {name: content});
  let params = parseParams(rawParams);
  let contentDisplay = eve.findOne("display name", {id: content}) || eve.findOne("display name", {name: content});
  if(contentDisplay) {
    params["rep"] = params["rep"] || "link";
  } else {
    if(params["rep"]) return params;

    let parsed = nlparse(content);
    let currentParse = parsed[0];
    let context = currentParse.context;
    let hasCollections = context.collections.length;
    let field;
    let rep;
    let aggregates = [];
    for(let fxn of context.fxns) {
      if(fxn.type === FunctionTypes.AGGREGATE) {
        aggregates.push(fxn);
      }
    }
    if(aggregates.length === 1 && !context["groupings"]) {
      rep = "value";
      field = aggregates[0].name;
    } else if(!hasCollections && context.fxns.length === 1) {
      rep = "value";
      field = context.fxns[0].name;
    } else if(!hasCollections && context.attributes.length === 1) {
      rep = "value";
      field = context.attributes[0].displayName;
    } else {
      params["rep"] = "table";
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

function focusCellEditor(node, elem) {
  autoFocus(node, elem);
  if(!node.didFocus) {
    node.didFocus = true;
    setEndOfContentEditable(node);
  }
}

//---------------------------------------------------------

function cellEditor(entityId, paneId, cell):Element {
  let text = activeCells[cell.id].query;
  let {options, selected} = autocompleterOptions(entityId, paneId, cell);
  let autoFocus = true;
  if(text.match(/=.*=/)) {
    text = "";
  }
  let display = eve.findOne("display name", {id: text});
  if(display) {
    text = display["name"];
  }
  return {children: [
    {c: "embedded-cell", children: [
      {c: "adornment", text: "="},
      {t: "span", c:"", contentEditable: true, text, input: updateActiveCell, keydown: embeddedCellKeys, cell, selected, paneId, postRender: autoFocus ? focusCellEditor : undefined},
    ]},
    autocompleter(options, paneId, cell)
  ]};
}

function autocompleter(options, paneId, cell): Element {
  let children = [];
  for(let option of options) {
    let item = {c: "option", text: option.text, selected: option, cell, paneId, click: executeAutocompleterOption};
    if(option.selected) {
      item.c += " selected";
    }
    children.push(item);
  }
  return {c: "autocompleter", key: performance.now().toString(), cell, containerId: `${paneId}|${cell.id}|container`, children, postRender: positionAutocompleter};
}

function executeAutocompleterOption(node, elem) {
  let {paneId, cell} = elem;
  let editor = paneEditors[paneId];
  let cm = editor.cmInstance;
  let mark = editor.marks[cell.id];
  let doEmbed = makeDoEmbedFunction(cm, mark, cell, paneId);
  if(elem.selected && elem.selected.action) {
    console.log("DO ACTION", elem.selected.action);
    if(typeof elem.selected.action === "function") {
      elem.selected.action(elem, cell.query, doEmbed);
    }
  }
}

function autocompleterOptions(entityId, paneId, cell) {
  let [text, rawParams] = cell.query.trim().split("|");
  if(text.match(/=.*=/)) {
    return {options: [], selected: {}};
  }
  let params = {};
  try {
    params = getCellParams(text, rawParams);
  } catch(e) {
    // @TODO: eventually people shouldn't be typing params in here so we should probably be doing
    // something else. But for now, if you're doing this, you're special.
  }
  let display = eve.findOne("display name", {id: text});
  if(display) {
    text = display["name"];
  }
  let isEntity = eve.findOne("display name", {name: text});
  let parsed = [];
  if(text !== "") {
    parsed = nlparse(text); // @TODO: this should come from the NLP parser once it's hooked up.
  }
  // the autocomplete can have multiple states
  let state = cell.state || "query";
  // every option has a score for how pertinent it is
  // things with a score of 0 will be filtered, everything else
  // will be sorted descending.
  let options:{score: number, action: any, text: string}[];
  if(state === "query") {
    options = queryAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "represent") {
    options = representAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "create") {
    options = createAutocompleteOptions(isEntity, parsed, text, params, entityId);
  }
  options = options.sort((a, b) => b.score - a.score);
  let selected;
  if(options.length) {
    let selectedIx = cell.selected % options.length;
    if(selectedIx < 0) selectedIx = options.length + selectedIx;
    selected = options[selectedIx];
    selected.selected = true;
  }
  return {options, selected};
}

function positionAutocompleter(node, elem) {
  let containerId = elem.containerId;
  let container = document.getElementById(containerId);
  let {bottom, left} = container.getBoundingClientRect();
  document.body.appendChild(node);
  node.style.top = bottom;
  node.style.left = left;
}

function queryAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let pageName = eve.findOne("display name", {id: entityId})["name"];
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [];
  let hasValidParse = parsed.some((parse) => parse.state === StateFlags.COMPLETE);
  options.sort((a, b) => b.score - a.score);
  let topOption = options[0];
  let joiner = "a";
  if(text && text[0].match(/[aeiou]/i)) {
    joiner = "an";
  }

  // create
  if(!isEntity && text !== "" && text != "=") {
    options.push({score: 1,  action: setCellState, state: "create", text: `Create ${joiner} "${text}" page`});
  }
  // disambiguations
  if(parsed.length > 1) {
    options.push({score: 3, action: "disambiguate stuff", text: "DISAMBIGUATE!"});
  }
  if(!isEntity && hasValidParse && params["rep"]) {
    options.push({score: 4, action: embedAs, rep: params["rep"], params, text: `embed as a ${params["rep"]}`});
  }
  // repesentation
  // we can only repesent things if we've found them
  if(isEntity || hasValidParse) {
    // @TODO: how do we figure out what representations actually make sense to show?
    options.push({score: 2, action: setCellState, state: "represent", text: `embed as ...`});
  }
  // set attribute
  if(isEntity && eve.findOne("display name", {id: entityId}).name !== text) {
    let isAScore = 2.5;
    if(eve.findOne("collection", {collection: isEntity.id})) {
      isAScore = 3;
    }
    options.push({score: 2.5, action: addAttributeAndEmbed, replace: "is a", entityId, value: isEntity.id, attribute: "related to", text: `${pageName} is related to ${text}`});
    options.push({score: isAScore, action: addAttributeAndEmbed, replace: "related to", entityId, value: isEntity.id, attribute: "is a", text: `${pageName} is ${joiner} ${text}`});
  }
  return options;
}

function addAttributeAndEmbed(elem, strValue, doEmbed) {
  let {entityId, value, attribute, replace} = elem.selected;
  let chain = dispatch("add sourced eav", {entity: entityId, attribute, value, source: uuid()});
  if(replace) {
    chain.dispatch("remove entity attribute", {entity: entityId, attribute: replace, value});
  }
  chain.commit();
  doEmbed(`${value}|rep=link;`);
}

function setCellState(elem, value, doEmbed) {
  dispatch("setCellState", {id: elem.cell.id, state: elem.selected.state}).commit();
}

function createAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [];
  let pageName = eve.findOne("display name", {id: entityId})["name"];
  let isCollection = isEntity ? eve.findOne("collection", {collection: isEntity.id}) : false;
  let joiner = "a";
  if(text && text[0].match(/[aeiou]/i)) {
    joiner = "an";
  }
  let isAScore = 2.5;
  if(isCollection) {
    isAScore = 3;
  }
  options.push({score: 2.5, action: createAndEmbed, replace: "is a", entityId, attribute: "related to", text: `${pageName} is related to ${text}`});
  options.push({score: isAScore, action: createAndEmbed, replace: "related to", entityId, attribute: "is a", text: `${pageName} is ${joiner} ${text}`});
  return options;
}

function createAndEmbed(elem, value, doEmbed) {
  //create the page and embed a link to it
  let entity = uuid();
  let page = uuid();
  let {entityId, attribute, replace} = elem.selected;
  let chain = dispatch("create page", {page, content: `#${value}\n`})
              .dispatch("create entity", {entity, page, name: value})
              .dispatch("add sourced eav", {entity: entityId, attribute, value: entity, source: uuid()});
  if(replace) {
    chain.dispatch("remove entity attribute", {entity: entityId, attribute: replace, value: entity});
  }
  chain.commit();
  doEmbed(`${value}|rep=link;`);
}

function representAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [];
  let isCollection = isEntity ? eve.findOne("collection", {collection: isEntity.id}) : false;
  options.push({score:1, text: "a table", action: embedAs, rep: "table", params});
  // options.push({score:1, text: "embed as a value", action: embedAs, rep: "value"});
  if(isEntity) {
    options.push({score:1, text: "a link", action: embedAs, rep: "link", params});
  }
  if(isCollection) {
    options.push({score:1, text: "an index", action: embedAs, rep: "index", params});
    options.push({score:1, text: "a directory", action: embedAs, rep: "directory", params});
  }
  if(isEntity) {
    options.push({score:1, text: "a list of related pages", action: embedAs, rep: "related", params});
    options.push({score:1, text: "a properties table", action: embedAs, rep: "attributes", params});
  }
  return options;
}

function embedAs(elem, value, doEmbed) {
  let [text] = value.split("|");
  let params = elem.selected.params;
  let rawParams = `rep=${elem.selected.rep}`;
  for(let param in params) {
    if(param !== "rep") {
      rawParams += `; ${param}=${params[param]}`;
    }
  }
  doEmbed(`${text}|${rawParams}`);
}

export function entity(entityId:string, paneId:string, kind: PANE, options:any = {}):Element {
  let content = eve.findOne("entity", {entity: entityId})["content"];
  let page = eve.findOne("entity page", {entity: entityId})["page"];
  let {name} = eve.findOne("display name", {id: entityId});
  let cells = getCells(content);
  let keys = {
    "Backspace": (cm) => maybeActivateCell(cm, paneId),
    "Cmd-Enter": (cm) => maybeNavigate(cm, paneId),
    "=": (cm) => createEmbedPopout(cm, paneId)
  };
  if(kind === PANE.POPOUT) {
    keys["Esc"] = () => {
      dispatch("remove popup", {}).commit();
      let parent = eve.findOne("ui pane parent", {pane: paneId})["parent"];
      paneEditors[parent].cmInstance.focus();
    };
  }
  let finalOptions = mergeObject({keys}, options);
  let cellItems = cells.map((cell, ix) => {
    let ui;
    let active = activeCells[cell.id];
    if(active) {
      ui = cellEditor(entityId, paneId, active || cell);
    } else {
      ui = cellUI(paneId, cell.query, cell);
    }
    ui.id = `${paneId}|${cell.id}`;
    ui.postRender = reparentCell;
    ui["containerId"] = `${paneId}|${cell.id}|container`;
    ui["cell"] = cell;
    return ui;
  });
  return {id: `${paneId}|${entityId}|editor`, t: "content", c: "wiki-entity", children: [
    /* This is disabled because searching for just the name of a single entity resolves to a single find step which blows up on query compilation
       {c: "flex-row spaced-row disambiguation", children: [
       {text: "Did you mean to"},
       {t: "a", c: "link btn add-btn", text: `search for '${name}'`, href: "#", name: search, data: {paneId}, link: `search: ${name}`, click: navigate},
       {text: "instead?"}
       ]},
     */
    {c: "wiki-editor", postRender: wikiEditor, onUpdate: updatePage, meta: {entity: entityId, page, paneId}, value: content, options: finalOptions, cells, children: cellItems}
  ]};
}

function maybeActivateCell(cm, paneId) {
  if(!cm.somethingSelected()) {
    let pos = cm.getCursor("from");
    let marks = cm.findMarksAt(pos);
    let cell;
    for(let mark of marks) {
      let {to} = mark.find();
      if(mark.cell && to.ch === pos.ch) {
        cell = mark.cell;
        break;
      }
    }
    if(cell) {
      let query = cell.query.split("|")[0];
      dispatch("addActiveCell", {id: cell.id, cell, query}).commit();
      return;
    }
  }
  return CodeMirror.Pass;
}

function maybeNavigate(cm, paneId) {
  if(!cm.somethingSelected()) {
    let pos = cm.getCursor("from");
    let marks = cm.findMarksAt(pos);
    let toClick;
    for(let mark of marks) {
      if(mark.cell) {
        toClick = mark;
      }
    }
    if(toClick) {
      // @HACK: there really should be a better way for me to find out
      // if there's a link in this cell and if it is what that link is
      // to.
      let link = toClick.widgetNode.querySelector(".link");
      if(link) {
        let elem = renderer.tree[link._id];
        let coords = cm.cursorCoords(true, "page");
        navigate({clientX: coords.left, clientY: coords.top, preventDefault: ()=>{}}, elem);
      }
    }
  }
}

var activeCells = {};

appHandle("addActiveCell", (changes, info) => {
  let {id} = info;
  info.selected = 0;
  activeCells[id] = info;
});

appHandle("removeActiveCell", (changes, info) => {
  let {id} = info;
  delete activeCells[id];
});

appHandle("setCellState", (changes, info) => {
  let active = activeCells[info.id];
  active.selected = 0;
  active.state = info.state;
});

appHandle("updateActiveCell", (changes, info) => {
  let active = activeCells[info.id];
  active.query = info.query.replace(/^= /, "");
  active.selected = 0;
  active.state = "query";
});

appHandle("moveCellAutocomplete", (changes, info) => {
  let active = activeCells[info.cell.id];
  let {direction} = info;
  active.selected += direction;
});

function updateActiveCell(event, elem) {
  let {cell} = elem;
  dispatch("updateActiveCell", {id: cell.id, cell, query: event.currentTarget.textContent}).commit();
}

function activateCell(event, elem) {
  let {cell} = elem;
  let query = cell.query.split("|")[0];
  dispatch("addActiveCell", {id: cell.id, cell, query}).commit();
}

function createEmbedPopout(cm, paneId) {
  let coords = cm.cursorCoords("head", "page");
  // dispatch("createEmbedPopout", {paneId, x: coords.left, y: coords.top - 20}).commit();
  cm.operation(() => {
    let from = cm.getCursor("from");
    let id = uuid();
    let range = `{=${id}=}`;
    cm.replaceRange(range, from, cm.getCursor("to"));
    dispatch("addActiveCell", {id: range, query: "", placeholder: true});
  });
}

function makeDoEmbedFunction(cm, mark, cell, paneId) {
  return (value) => {
    let {from, to} = mark.find();
    if(value[0] === "=") {
      value = value.substring(1);
    }
    value = value.trim();
    let [text, rawParams] = value.split("|");
    text = text.trim();
    // @TODO: this doesn't take disambiguations into account
    let display = eve.findOne("display name", {name: text});
    if(display) {
      text = display.id;
    }
    let replacement = `{${text}|${rawParams || ""}}`;
    if(cm.getRange(from, to) !== replacement) {
      cm.replaceRange(replacement, from, to);
    }
    paneEditors[paneId].cmInstance.focus();
    dispatch("insert query", {query: text}).dispatch("removeActiveCell", cell).commit();
  }
}

function embeddedCellKeys(event, elem) {
  let {paneId, cell} = elem;
  let target = event.currentTarget;
  let value = target.textContent;
  let editor = paneEditors[paneId];
  let cm = editor.cmInstance;
  let mark = editor.marks[cell.id];
  if(event.keyCode === KEYS.BACKSPACE && value === "") {
    let {from, to} = mark.find();
    cm.replaceRange("", from, to);
    paneEditors[paneId].cmInstance.focus();
    dispatch("removeActiveCell", cell).commit();
    event.preventDefault();
  } else if(event.keyCode === KEYS.ESC || (event.keyCode === KEYS.ENTER && value.trim() === "")) {
    if(cell.placeholder || (cell.cell && cell.cell.placeholder)) {
      let {from, to} = mark.find();
      cm.replaceRange("= ", from, to);
    }
    paneEditors[paneId].cmInstance.focus();
    dispatch("removeActiveCell", cell).commit();
    event.preventDefault();
  } else if(event.keyCode === KEYS.ENTER) {
    let doEmbed = makeDoEmbedFunction(cm, mark, cell, paneId);
    if(elem.selected && elem.selected.action) {
      if(typeof elem.selected.action === "function") {
        elem.selected.action(elem, value, doEmbed);
      }
    }
    event.preventDefault();
  } else if(event.keyCode === KEYS.UP) {
    dispatch("moveCellAutocomplete", {cell, direction:-1}).commit();
    event.preventDefault();
  } else if(event.keyCode === KEYS.DOWN) {
    dispatch("moveCellAutocomplete", {cell, direction:1}).commit();
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
      let id = part;
      if(!ids[part]) {
        ids[part] = 2;
      } else if(ids[part] >= 2) {
        id += ids[part];
        ids[part]++;
      }
      let placeholder = false;
      if(part.match(/\{\=.*\=\}/)) {
        placeholder = true;
      }
      cells.push({start: ix, length: part.length, value: part, query: part.substring(1, part.length - 1), id, placeholder});
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
  let value = event.value;
  dispatch("insert query", {query: value})
  .dispatch("ui set search", {paneId: elem.paneId, value: event.value})
  .commit();
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
        mode: elem.mode || "text",
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

function prepareEntity(results:{}[], params:{field?:string}) {
  let elem = {};
  let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
  let elems = [];
  for(let entity of entities) {
    let elem = copy(params);
    elem.entity = entity;
    elems.push(elem);
  }
  if(elems.length === 1) return elems[0];
  else return elems;
}
let _prepare:{[rep:string]: (results:{}[], params:{paneId?:string, [p:string]: any}) => any} = {
  name: prepareEntity,
  link: prepareEntity,
  attributes: prepareEntity,
  related: prepareEntity,
  index: prepareEntity,
  view: prepareEntity,
  results: prepareEntity,

  value(results, params:{field:string, data?:{}}) {
    if(!params.field) throw new Error("Value representation requires a 'field' param indicating which field to represent");
    let field = params.field;
    if(!results.length) return [];

    // If field isn't in results, try to resolve it as a field name, otherwise error out
    if(results[0][field] === undefined) {
      let potentialIds = eve.find("display name", {name: field});
      let neueField;
      for(let display of potentialIds) {
        if(results[0][display.id] !== undefined) {
          if(neueField) {
            neueField = undefined;
            break;
          }
          neueField = display.id;
        }
      }
      if(!neueField) throw new Error(`Unable to uniquely resolve field name ${field} in result fields ${Object.keys(results[0])}`);
      else field = neueField;
    }

    let elems = [];
    for(let row of results) elems.push({text: row[field], data: params.data});
    return elems;
  },
  error(results, params) {
    return {text: params["message"]};
  },
  table(results, params:{data?: {}}) {
    return {rows: results, data: params.data};
  },
  directory(results, params:{data?:{}, field?:string}) {
    let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
    if(entities.length === 1) {
      let collection = entities[0];
      entities.length = 0;
      for (let fact of eve.find("is a attributes", {collection})) entities.push(fact.entity);
    }
    return {entities, data: params.data};
  },
  embeddedCell(results, params) {
    let rep = params["childRep"];
    let childInfo;
    if(_prepare[rep]) {
      params["data"] = params["data"] || params;
      childInfo = _prepare[rep](results, params);
      childInfo.data = childInfo.data || params;
    } else {
      childInfo = {data: params};
    }
    return {childInfo, rep, click: activateCell, cell: params["cell"]};
  },
};

function represent(search: string, rep:string, results, params:{}):Element {
  // console.log("repping:", results, " as", rep, " with params ", params);
  if(rep in _prepare) {
    let embedParamSets = _prepare[rep](results.results, <any>params);
    let isArray = embedParamSets && embedParamSets.constructor === Array;
    try {
      if(!embedParamSets || isArray && embedParamSets.length === 0) {
        return uitk.error({text: `${search} as ${rep}`})
      } else if(embedParamSets.constructor === Array) {
        let wrapper = {c: "flex-column", children: []};
        for(let embedParams of embedParamSets) {
          embedParams["data"] = embedParams["data"] || params;
          wrapper.children.push(uitk[rep](embedParams));
        }
        return wrapper;
      } else {
        let embedParams = embedParamSets;
        embedParams["data"] = embedParams["data"] || params;
        return uitk[rep](embedParams);
      }
    } catch(err) {
      console.error("REPRESENTATION ERROR");
      console.error({search, rep, results, params});
      console.error(err);
      return uitk.error({text: `Failed to embed as ${params["childRep"] || rep}`})
    }
  }
}

window.addEventListener("popstate", function(evt) {
  console.log("iPS", ignorePopState);
  if(ignorePopState) return;
  let {paneId = undefined, contains = undefined} = evt.state || {};
  if(paneId === undefined || contains === undefined) return;
  console.log("popstate", evt.state);
  dispatch("ui set search", {paneId, value: contains, popState: true}).commit();
});

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;
