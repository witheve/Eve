declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import * as CodeMirror from "codemirror";
import {copy, uuid, coerceInput, builtinId, autoFocus, KEYS, mergeObject, setEndOfContentEditable, slugify, location as getLocation} from "./utils";
import {Diff, Query} from "./runtime";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";
import {createEditor} from "./richTextEditor";
import * as uitk from "./uitk";
import {navigate, preventDefault} from "./uitk";
import {eve, eveLocalStorageKey, handle as appHandle, dispatch, activeSearches, renderer} from "./app";
import {parseDSL} from "./parser";
import {parse as nlparse, StateFlags, FunctionTypes} from "./NLQueryParser";


export enum PANE { FULL, WINDOW, POPOUT };
enum BLOCK { TEXT, PROJECTION };

// Because html5 is full of broken promises and broken dreams
var popoutHistory = [];

//------------------------------------------------------------------------------
// State
//------------------------------------------------------------------------------
export let uiState:{
  widget: {
    search: {[paneId:string]: {value:string, plan?:boolean, focused?:boolean, submitted?:string}},
    table: {[key:string]: {field:string, direction:number}},
    collapsible: {[key:string]: {open:boolean}}
    attributes: any,
    card: {[key: string]: any},
  },
  pane: {[paneId:string]: {settings: boolean}},
  prompt: {open: boolean, paneId?: string, prompt?: (paneId?:string) => Element},
} = {
  widget: {
    search: {},
    table: {},
    collapsible: {},
    attributes: {},
    card: {},
  },
  pane: {},
  prompt: {open: false, paneId: undefined, prompt: undefined},
};

//---------------------------------------------------------
// Utils
//---------------------------------------------------------
// @NOTE: ids must not contain whitespace
export function asEntity(raw:string|number):string {
  let cleaned = raw && (""+raw).trim();
  if(!cleaned) return;

  if(eve.findOne("entity", {entity: cleaned})) return cleaned;
  cleaned = cleaned.toLowerCase();
  if(eve.findOne("entity", {entity: cleaned})) return cleaned; // This can be removed if we remove caps from ids. UUIDv4 does not use caps in ids
  let {id = undefined} = eve.findOne("index name", {name: cleaned}) || {};
  return id;
}

export function setURL(paneId:string, contains:string, replace?:boolean) {
  let name = uitk.resolveName(contains);
  if(paneId !== "p1") return; // @TODO: Make this a constant
  
  let url;
  if(contains.length === 0) url = "#";
  else if(name === contains) url = `#/search/${slugify(contains)}`;
  else url = `#/${slugify(name)}/${slugify(contains)}`;
  let state = {paneId, contains};
  window["states"] = window["states"] || [];
  window["states"].push(state);

  if(replace) window.history.replaceState(state, null, url);
  else window.history.pushState(state, null, url);

  historyState = state;
  historyURL = url;
}

function inferRepresentation(search:string|number, baseParams:{} = {}):{rep:string, params:{}} {
  let params = copy(baseParams);
  let entityId = asEntity(search);
  let cleaned = (search && (""+search).trim().toLowerCase()) || "";
  if(entityId || cleaned.length === 0) {
    params.entity = entityId || builtinId("home");
    if(params.entity === builtinId("home")) {
      params.unwrapped = true;
    }
    return {rep: "entity", params};
  }

  let [rawContent, rawParams] = cleaned.split("|");
  let parsedParams = getCellParams(rawContent, rawParams);
  params = mergeObject(params, parsedParams);
  if(params.rep === "table") {
    params.search = cleaned;
  }
  return {rep: params.rep, params};
}

//---------------------------------------------------------
// Dispatches
//---------------------------------------------------------

appHandle("ui update search", (changes: Diff, {paneId, value}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
  state.value = value;
})

appHandle("ui focus search", (changes:Diff, {paneId, value}:{paneId:string, value:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value};
  state.focused = true;
});


// @TODO: abstract (search) => {rep, params} fn and use it to infer {rep, params} for set pane and set popout.
// @TODO: Update pane(paneId) to take the actual pane fact so it's not tied to the DB.
// @TODO: Update pane(pane) to just directly call represent with the pane's facts.


appHandle("set pane", (changes:Diff, info:{paneId:string, kind?:PANE, rep?:string, contains?:string|number, params?:string|{}, popState?:boolean}) => {
  // Infer valid rep and params if search has changed
  if(info.contains !== undefined && !info.rep) {
    let inferred = inferRepresentation(info.contains, typeof info.params === "string" ? parseParams(<string>info.params) : info.params);
    info.rep = inferred.rep;
    info.params = inferred.params;
    if(!info.rep) throw new Error(`Could not infer a valid representation for search '${info.contains}' in pane '${info.paneId}'`);
  }

  // Fill missing properties from the previous fact, if present
  let prev = eve.findOne("ui pane", {pane: info.paneId}) || {};
  let {paneId, kind = prev.kind, rep = prev.rep, contains:raw = prev.contains, params:rawParams = prev.params, popState = false} = info;
  if(kind === undefined || rep == undefined || raw === undefined || rawParams === undefined) {
    throw new Error(`Cannot create new pane without all parameters specified for pane '${paneId}'`);
  }
  
  let contains = asEntity(raw) || (""+raw).trim();
  let params = typeof rawParams === "object" ? stringifyParams(rawParams) : rawParams || "";
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value: contains, focused: false};
  state.value = contains;
  state.focused = false;
  dispatch("remove pane", {paneId}, changes);
  changes.add("ui pane", {pane:paneId, kind, rep, contains, params});

  // @TODO: Make "p1" a constant
  if(paneId === "p1") {
    popoutHistory = [];
    if(!popState) setURL(paneId, contains);
  }
});

appHandle("remove pane", (changes:Diff, {paneId}:{paneId:string}) => {
  let children = eve.find("ui pane parent", {parent: paneId});
  for(let {pane:child} of children) {
    dispatch("remove pane", {paneId: child}, changes);
  }
  changes.remove("ui pane", {pane: paneId})
    .remove("ui pane position", {pane: paneId})
    .remove("ui pane parent", {parent: paneId})
    .remove("ui pane parent", {pane: paneId});
});

appHandle("set popout", (changes:Diff, info:{parentId:string, rep?:string, contains?:string|number, params?:string|{}, x:string|number, y:string|number, popState?:boolean}) => {
  // Recycle the parent's existing popout if it exists, otherwise create a new one
  let parentId = info.parentId;
  let paneId = uuid();
  let children = eve.find("ui pane parent", {parent: parentId});
  let parent = eve.findOne("ui pane", {pane: parentId});
  var reusing = false;
  if(parent && parent.kind === PANE.POPOUT) {
    reusing = true;
    paneId = parentId;
    parentId = eve.findOne("ui pane parent", {pane: parentId}).parent;
  }

  // Infer valid rep and params if search has changed
  if(info.contains && !info.rep) {
    let inferred = inferRepresentation(info.contains, typeof info.params === "string" ? parseParams(<string>info.params) : info.params);
    info.rep = inferred.rep;
    info.params = inferred.params;
    if(!info.rep) throw new Error(`Could not infer a valid representation for search '${info.contains}' in popout '${paneId}'`);
  }

  // Fill missing properties from the previous fact, if present
  let prev = eve.findOne("ui pane", {pane: paneId}) || {};
  let prevPos = eve.findOne("ui pane position", {pane: paneId}) || {};
  let {rep = prev.rep, contains:raw = prev.contains, params:rawParams = prev.params, x = prevPos.x, y = prevPos.y, popState = false} = info;
  if(rep === undefined || raw === undefined || rawParams === undefined || x === undefined || y === undefined) {
    throw new Error(`Cannot create new popout without all parameters specified for pane '${paneId}'`);
  }

  if(reusing) {
    x = prevPos.x;
    y = prevPos.y;
  }

  let params = typeof rawParams === "string" ? rawParams : stringifyParams(rawParams);
  let contains = asEntity(raw) || (""+raw).trim();

  if(!popState && prev.pane) popoutHistory.push({rep: prev.rep, contains: prev.contains, params: prev.params, x: prevPos.x, y: prevPos.y});
  dispatch("remove pane", {paneId}, changes);
  changes.add("ui pane", {pane: paneId, kind: PANE.POPOUT, rep, contains, params})
    .add("ui pane parent", {parent: parentId, pane: paneId})
    .add("ui pane position", {pane: paneId, x, y});
});

// @TODO: take parentId
appHandle("remove popup", (changes:Diff, {}:{}) => {
  let popup = eve.findOne("ui pane", {kind: PANE.POPOUT});
  if(popup) dispatch("remove pane", {paneId: popup.pane}, changes);
  popoutHistory = [];
});

appHandle("ui toggle search plan", (changes:Diff, {paneId}:{paneId:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value: ""};
  state.plan = !state.plan;
});

appHandle("add sourced eav", (changes, eav:{entity:string, attribute:string, value:string|number, source:string, forceEntity: boolean}) => {
  let {entity, attribute, value, source, forceEntity} = eav;
  if(!source) {
    source = uuid();
  }
  let valueId = asEntity(value);
  let coerced = coerceInput(value);
  let strValue = value.toString().trim();
  if(valueId) {
    value = valueId;
  } else if(strValue[0] === '"' && strValue[strValue.length - 1] === '"') {
    value = JSON.parse(strValue);
  } else if(typeof coerced === "number") {
    value = coerced;
  } else if(forceEntity || attribute === "is a") {
    let newEntity = uuid();
    let pageId = uuid();
    changes.dispatch("create page", {page: pageId,  content: ""})
           .dispatch("create entity", {entity: newEntity, name: strValue, page: pageId});
    value = newEntity;
  } else {
    value = coerced;
  }
  changes.add("sourced eav", {entity, attribute, value, source});
});

appHandle("remove sourced eav", (changes:Diff, eav:{entity:string, source:string}) => {
    changes.remove("sourced eav", eav);
});
 
appHandle("update page", (changes:Diff, {page, content}: {page: string, content: string}) => {
  changes.remove("page content", {page});
  changes.add("page content", {page, content});
  // let trimmed = content.trim();
  // let endIx = trimmed.indexOf("\n");
  // let name = trimmed.slice(1, endIx !== -1 ? endIx : undefined).trim();
  // let {entity} = eve.findOne("entity page", {page});
  // let {name:prevName = undefined} = eve.findOne("display name", {id: entity}) || {};
  // if(name !== prevName) {
  //   changes.remove("display name", {id: entity, name: prevName});
  //   changes.add("display name", {id: entity, name});
  //   let parts = getLocation().split("/");
  //   if(parts.length > 2 && parts[2].replace(/_/gi, " ") === entity) {
  //     window.history.replaceState(window.history.state, null, `/${slugify(name)}/${slugify(entity)}`);
  //   }
  // }
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
    .add("page content", {page, content: `#${content} query`})
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
  query = query.trim().toLowerCase();
  let parsed = nlparse(query);
  let topParse = parsed[0];
  if(eve.findOne("query to id", {query})) return;
  if(topParse.state === StateFlags.COMPLETE) {
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

appHandle("handle setAttribute in a search", (changes:Diff, {attribute, entity, value, replace}) => {
  if(replace) {
    //check if there's a generator, if so, remove that.
    let generated = eve.find("generated eav", {entity, attribute});
    if(generated.length) {
      for(let gen of generated) {
        changes.merge(dispatch("remove attribute generating query", {eav: {entity, attribute}, view: gen["source"]}));
      }
    } else {
      changes.remove("sourced eav", {entity, attribute})
    }
  }
  changes.merge(dispatch("add sourced eav", {entity, attribute, value}));
});

function dispatchSearchSetAttributes(query, chain?) {
  if(!chain) {
    chain = dispatch();
  }
  let parsed = nlparse(query);
  let topParse = parsed[0];
  let isSetSearch = false;
  if(topParse.context.setAttributes.length) {
    let attributes = [];
    for(let attr of topParse.context.setAttributes) {
      // @TODO: NLP needs to tell us whether we're supposed to modify this attribute
      // or if we're just adding a new eav for it.
      let replace = true;
      let entity = attr.entity.id;
      let attribute = attr.displayName;
      chain.dispatch("handle setAttribute in a search", {entity, attribute, value: attr.value, replace});
      attributes.push(`${attr.entity.displayName}`);
    }
    query = attributes.join(" and ");
    isSetSearch = true;
  }
  return {chain, query, isSetSearch};
}

// @TODO: there's a lot of duplication between insert query, create query, and insert implication
appHandle("insert implication", (changes:Diff, {query}) => {
  let artifacts = parseDSL(query);
  if(artifacts.changeset) changes.merge(artifacts.changeset);
  for(let viewId in artifacts.views) {
    let name = artifacts.views[viewId]["displayName"];
    if(!eve.findOne("display name", {id: viewId}) && name) changes.add("display name", {id: viewId, name});
    changes.merge(artifacts.views[viewId].changeset(eve));
  }
})

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
  if(field !== undefined) state.field = field;
  if(direction !== undefined) state.direction = direction;
  uiState.widget.table[key] = state;
});
appHandle("toggle settings", (changes:Diff, {paneId, open = undefined}) => {
  let state = uiState.pane[paneId] || {settings: false};
  state.settings = open !== undefined ? open : !state.settings;
  uiState.pane[paneId] = state;
});
appHandle("toggle collapse", (changes:Diff, {collapsible, open = undefined}) => {
  let state = uiState.widget.collapsible[collapsible] || {open: false};
  state.open = open !== undefined ? open : !state.open;
  uiState.widget.collapsible[collapsible] = state;
});
appHandle("toggle prompt", (changes:Diff, {prompt = undefined, paneId = undefined, open = undefined}) => {
  let state = uiState.prompt;
  if(state.prompt !== prompt) {
    state.prompt = prompt;
    state.open = open !== undefined ? open : true;
    state.paneId = paneId;
  } else {
    state.open !== undefined ? open : !state.open;
  }
  uiState.prompt = state;
});
appHandle("remove entity", (changes:Diff, {entity}) => {
  changes.remove("sourced eav", {entity})
    .remove("display name", {id: entity})
    .remove("manual eavs", {entity})
    .remove("entity page", {entity});
});

//---------------------------------------------------------
// Wiki Containers
//---------------------------------------------------------
export function root():Element {
  let panes = [];
  for(let {pane:paneId} of eve.find("ui pane")) {
    panes.push(pane(paneId));
  }
  if(uiState.prompt.open && uiState.prompt.prompt && !uiState.prompt.paneId) {
    panes.push({c: "shade", click: closePrompt, children: [
      uiState.prompt.prompt()
    ]});
  }
  return {c: "wiki-root", id: "root", children: panes, click: removePopup};
}

// @TODO: Add search functionality + Pane Chrome
let paneChrome:{[kind:number]: (paneId:string, entityId:string) => {c?: string, header?:Element, footer?:Element, captureClicks?:boolean}} = {
  [PANE.FULL]: (paneId, entityId) => ({
    c: "fullscreen",
    header: {t: "header", c: "flex-row", children: [
      // {c: "logo eve-logo", data: {paneId}, link: "", click: navigate},
      searchInput(paneId, entityId),
      {c: "controls visible", children: [
         {c: "ion-gear-a toggle-settings", style: "font-size: 1.35em;", prompt: paneSettings, paneId, click: openPrompt}
      ]}
    ]}
  }),
  [PANE.POPOUT]: (paneId, entityId) => {
    let parent = eve.findOne("ui pane parent", {pane: paneId})["parent"];
    return {
      c: "window",
      captureClicks: true,
      header: {t: "header", c: "", children: [
        {t: "button", c: "ion-android-open", click: navigateParent, link: entityId, paneId, parentId: parent, text:""},
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

function openPrompt(event, elem) {
  dispatch("toggle prompt", {prompt: elem.prompt, paneId: elem.paneId, open: true}).commit();
}
function closePrompt(event, elem) {
  if(event.target === event.currentTarget) {
    dispatch("toggle prompt", {open: false}).commit();
  }
}

function navigateParent(event, elem) {
  dispatch("remove popup", {paneId: elem.paneId})
  .dispatch("set pane", {paneId: elem.parentId, contains: elem.link})
  .commit();
}

function removePopup(event, elem) {
  if(!event.defaultPrevented) {
    let chain = dispatch("remove popup", {}).dispatch("clearActiveCells", {});
    for(let entity in uiState.widget.attributes) {
      chain.dispatch("clearActiveAttribute", {entity});
    }
    chain.commit();
  }
}

function loadFromFile(event:Event, elem) {
  let target = <HTMLInputElement>event.target;
  if(!target.files.length) return;
  if(target.files.length > 1) throw new Error("Cannot load multiple files at once");
  let file = target.files[0];
  let reader = new FileReader();
  reader.onload = function(event:any) {
    let serialized = event.target.result;
    eve.load(serialized);
    dispatch("toggle prompt", {prompt: loadedPrompt, open: true}).commit();
  };
  reader.readAsText(file);
}

function deleteDatabasePrompt():Element {
  return {c: "modal-prompt delete-prompt", children: [
    {t: "header", c: "flex-row", children: [
      {t: "h2", text: "DELETE DATABASE"},
      {c: "flex-grow"},
      {c: "controls", children: [{c: "ion-close-round", click: closePrompt}]}
    ]},
    {c: "info", text: "This will remove all information currently stored in Eve for you and cannot be undone."},
    {c: "flex-row", children: [
      {t: "button", c: "delete-btn", text: "DELETE EVERYTHING FOREVER", click: nukeDatabase},
      {c: "flex-grow"},
      {t: "button", text: "Cancel", click: closePrompt},
    ]}
  ]};
}

function nukeDatabase() {
  localStorage.clear();
  window.location.reload();
}


function savePrompt():Element {
  let serialized = localStorage[eveLocalStorageKey];
  return {c: "modal-prompt save-prompt", children: [
    {t: "header", c: "flex-row", children: [
      {t: "h2", text: "Save DB"},
      {c: "flex-grow"},
      {c: "controls", children: [{c: "ion-close-round", click: closePrompt}]}
    ]},
    {t: "a", href: "data:application/octet-stream;charset=utf-16le;base64," + btoa(serialized), download: "save.evedb", text: "save to file"}
  ]};
}

function loadPrompt():Element {
  let serialized = localStorage[eveLocalStorageKey];
  return {c: "modal-prompt load-prompt", children: [
    {t: "header", c: "flex-row", children: [
      {t: "h2", text: "Load DB"},
      {c: "flex-grow"},
      {c: "controls", children: [{c: "ion-close-round", click: closePrompt}]}
    ]},
    {t: "p", children: [
      {t: "span", text: "WARNING: This will overwrite your current database. This is irreversible. You should consider "},
      {t: "a", text: "saving your DB", prompt: savePrompt, click: openPrompt},
      {t: "span", text: " first."}
    ]},
    {t: "input", type: "file", text: "load from file", change: loadFromFile}
  ]};
}

function loadedPrompt():Element {
  return {c: "modal-prompt load-prompt", children: [
    {t: "header", c: "flex-row", children: [
      {t: "h2", text: "Load DB"},
      {c: "flex-grow"},
      {c: "controls", children: [{c: "ion-close-round", click: closePrompt}]}
    ]},
    {text: "Successfully loaded DB from file"}
  ]};
}

export function pane(paneId:string):Element {
  // @FIXME: Add kind to ui panes
  let {contains:rawContains = undefined, kind = PANE.FULL, rep = undefined, params:rawParams = undefined} = eve.findOne("ui pane", {pane: paneId}) || {};
  let {results, params:parsedParams, content:contains} = queryUIInfo(rawContains || "home");
  let params = mergeObject(parseParams(rawParams), parsedParams);
  params.paneId = paneId;
  let makeChrome = paneChrome[kind];
  if(!makeChrome) throw new Error(`Unknown pane kind: '${kind}' (${PANE[kind]})`);
  let {c:klass, header, footer, captureClicks} = makeChrome(paneId, contains);
  let entityId = asEntity(contains);

  let content;
  let contentType = "invalid";
  if(contains.length === 0 || entityId) contentType = "entity";
  else if(eve.findOne("query to id", {query: contains})) contentType = "search";

  if(params.rep || rep) {
    content = represent(contains, params.rep || rep, results, params, (params.unwrapped ? undefined : (elem, ix?) => uitk.card({id: `${paneId}|${contains}|${ix === undefined ? "" : ix}`, children: [elem]})));
    content.t = "content";
    content.c = `${content.c || ""} ${params.unwrapped ? "unwrapped" : ""}`;
  }

  if(contentType === "invalid") {
    var disambiguation = {c: "flex-row spaced-row disambiguation", children: [
      {t: "span", text: `I couldn't find anything; should I`},
      {t: "a", c: "link btn add-btn", text: `add ${contains}`, name: contains, paneId, click: createPage },
      {t: "span", text: "?"},
    ]};
    content = undefined;
  } else if(contentType === "search") {
    // @TODO: This needs to move into Eve's notification / chat bar
    var disambiguation = {id: "search-disambiguation", c: "flex-row spaced-row disambiguation", children: [
      {text: "Or should I"},
      {t: "a", c: "link btn add-btn", text: `add a card`, name: contains, paneId, click: createPage},
      {text: `for ${contains}?`}
    ]};
  }

  let scroller = content;

  if(kind === PANE.FULL) {
    scroller = {c: "scroller", children: [
      {c: "top-scroll-fade"},
      content,
      {c: "bottom-scroll-fade"},
    ]};
  }

  let pane:Element = {c: `wiki-pane ${klass || ""}`, paneId, children: [header, disambiguation, scroller, footer]};
  let pos = eve.findOne("ui pane position", {pane: paneId});
  if(pos) {
    pane.style = `left: ${isNaN(pos.x) ? pos.x : pos.x + "px"}; top: ${isNaN(pos.y) ? pos.y : (pos.y + 20) + "px"};`;
  }
  if(captureClicks) {
    pane.click = preventDefault;
  }

  if(uiState.prompt.open && uiState.prompt.paneId === paneId) {
    pane.children.push(
      {c: "shade", paneId, click: closePrompt},
      uiState.prompt.prompt(paneId)
    );
  }
  return pane;
}

export function search(search:string, paneId:string):Element {
  let [rawContent, rawParams] = search.split("|");
  let parsedParams = getCellParams(rawContent, rawParams);
  let {results, params, content} = queryUIInfo(search);
  params["paneId"] = paneId;
  mergeObject(params, parsedParams);
  let rep = represent(content, params["rep"], results, params);
  return {t: "content", c: "wiki-search", children: [
    rep
  ]};
}

function createPage(evt:Event, elem:Element) {
  let name = elem["name"];
  let entity = uuid();
  let page = uuid();
  dispatch("create page", {page, content: ``})
  .dispatch("create entity", {entity, page, name})
  .dispatch("set pane", {paneId: elem.paneId, contains: entity, rep: "entity", params: ""}).commit();
}

function deleteEntity(event, elem) {
  let name = uitk.resolveName(elem.entity);
  dispatch("remove entity", {entity: elem.entity}).commit();
  dispatch("set pane", {paneId: elem.paneId, contains: name}).commit();
}

function paneSettings(paneId:string) {
  let pane = eve.findOne("ui pane", {pane: paneId});
  let {entity = undefined} = eve.findOne("entity", {entity: uitk.resolveId(pane.contains)}) || {};
  let isSystem = !!(entity && eve.findOne("entity eavs", {entity, attribute: "is a", value: builtinId("system")}));
  return {t: "ul", c: "settings", children: [
    {t: "li", c: "save-btn", text: "save", prompt: savePrompt, click: openPrompt},
    {t: "li", c: "load-btn", text: "load", prompt: loadPrompt, click: openPrompt},
    entity && !isSystem ? {t: "li", c: "delete-btn", text: "delete card", entity, paneId, click: deleteEntity} : undefined,
    {t: "li", c: "delete-btn", text: "DELETE DATABASE", prompt: deleteDatabasePrompt, click: openPrompt},
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

// Credit to https://mathiasbynens.be/demo/url-regex and @gruber
let urlRegex = /\b(([\w-]+:\/\/?|www[.])[^\s()<>]+(?:\([\w\d]+\)|([^[\.,\-\/#!$%' "^*;:{_`~()\-\s]|\/)))/i;

function queryUIInfo(query) {
  let [content, rawParams] = query.split("|");
  let embedType;
  // let params = getCellParams(content, rawParams);
  let params = parseParams(rawParams);
  let results;
  let entityId = asEntity(content);
  if(entityId) {
    results = {unprojected: [{entity: entityId}], results: [{entity: entityId}]};

  } else if(urlRegex.exec(content)) {
    results = {unprojected: [{url: content}], results: [{url: content}]};

  } else {
    let cleaned = content && content.trim().toLowerCase();
    let queryId = eve.findOne("query to id", {query: cleaned});
    if(queryId) {
      let queryResults = eve.find(queryId.id);
      let queryUnprojected = eve.table(queryId.id).unprojected;
      if(!queryResults.length) {
        params["rep"] = "error";
        params["message"] = "No results";
      } else {
        results = {unprojected: queryUnprojected, results: queryResults};
      }
    } else {
      params["rep"] = "error";
      params["message"] = "invalid search";
    }
  }
  return {results, params, content};
}

function getCellParams(content, rawParams) {
  content = content.trim();
  let params = parseParams(rawParams);
  let entityId = asEntity(content);
  if(entityId) {
    params["rep"] = params["rep"] || "link";
  } else if(urlRegex.exec(content)) {
    params["rep"] = params["rep"] || "externalLink";
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
    let totalFound = 0;
    for(let item in context) {
      totalFound += context[item].length;
    }
    if(aggregates.length === 1 && context["groupings"].length === 0) {
      rep = "CSV";
      field = aggregates[0].name;
    } else if(!hasCollections && context.fxns.length === 1 && context.fxns[0].type !== FunctionTypes.BOOLEAN) {
      rep = "CSV";
      field = context.fxns[0].name;
    } else if(!hasCollections && context.attributes.length === 1) {
      rep = "CSV";
      field = context.attributes[0].displayName;
    } else if(context.entities.length + context.fxns.length === totalFound) {
      // if there are only entities and boolean functions then we want to show this as cards
      params["rep"] = "entity";
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
export function wikiEditor(node, elem) {
  createEditor(node, elem);
  let {paneId, entityId} = elem.meta;
  paneEditors[`${paneId}|${entityId}`] = node.editor;
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
  if(text.match(/\$\$.*\$\$/)) {
    text = "";
  }

  let {name = undefined} = eve.findOne("display name", {id: text}) || {};
  if(name) {
    text = name;
  }
  return {children: [
    {c: "embedded-cell", children: [
      {c: "adornment", text: "="},
      {t: "span", c:"", contentEditable: true, text, click: preventDefault, input: updateActiveCell, keydown: embeddedCellKeys, cell, selected, paneId, postRender: autoFocus ? focusCellEditor : undefined},
    ]},
    autocompleter(options, paneId, cell)
  ]};
}

function autocompleter(options, paneId, cell): Element {
  let children = [];
  for(let option of options) {
    let item = {c: "option", children: option.children, text: option.text, selected: option, cell, paneId, click: executeAutocompleterOption, keydown: optionKeys};
    if(option.selected) {
      item.c += " selected";
    }
    children.push(item);
  }
  return {c: "autocompleter", key: performance.now().toString(), cell, containerId: `${paneId}|${cell.id}|container`, children, postRender: positionAutocompleter};
}

function optionKeys(event, elem) {
  if(event.keyCode === KEYS.ENTER) {
    executeAutocompleterOption(event.currentTarget, elem);
  }
}

function executeAutocompleterOption(event, elem) {
  if(event.defaultPrevented) return;
  let {paneId, cell} = elem;
  let editor = paneEditors[cell.editorId];
  let cm = editor.cmInstance;
  let mark = editor.marks[cell.id];
  let doEmbed = makeDoEmbedFunction(cm, mark, cell, paneId);
  if(elem.selected && elem.selected.action) {
    if(typeof elem.selected.action === "function") {
      elem.selected.action(elem, cell.query, doEmbed);
    }
  }
}

function autocompleterOptions(entityId, paneId, cell) {
  let [text, rawParams] = cell.query.trim().split("|");
  if(text.match(/\$\$.*\$\$/)) {
    return {options: [], selected: {}};
  }
  let params = {};
  try {
    params = getCellParams(text, rawParams);
  } catch(e) {
    // @TODO: eventually people shouldn't be typing params in here so we should probably be doing
    // something else. But for now, if you're doing this, you're special.
  }
  let contentEntityId = asEntity(text);
  if(contentEntityId) {
    text = uitk.resolveName(contentEntityId);
  }

  let isEntity = eve.findOne("display name", {id: contentEntityId});
  let parsed = [];
  if(text !== "") {
    try {
      parsed = nlparse(text); // @TODO: this should come from the NLP parser once it's hooked up.
    } catch(e) {

    }
  }
  // the autocomplete can have multiple states
  let state = cell.state || "query";
  // every option has a score for how pertinent it is
  // things with a score of 0 will be filtered, everything else
  // will be sorted descending.
  let options:{score: number, action: any, text?: string, children?: Element[]}[];
  if(state === "query") {
    options = queryAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "represent") {
    options = representAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "create") {
    options = createAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "define") {
    options = defineAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "modify") {
    options = modifyAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "property") {
    options = propertyAutocompleteOptions(isEntity, parsed, text, params, entityId);
  } else if(state === "url") {
    options = urlAutocompleteOptions(isEntity, parsed, text, params, entityId);
  }
  options = options.sort((a, b) => b.score - a.score);
  let selected;
  if(options.length) {
    let selectedIx = cell.selected % options.length;
    if(selectedIx < 0) selectedIx = options.length + selectedIx;
    selected = options[selectedIx];
    selected.selected = true;
  }
  for(let option of options) {
    option["cell"] = cell;
    option["paneId"] = paneId;
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
  let pageName = uitk.resolveName(entityId);
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [];
  let hasValidParse = parsed.some((parse) => parse.state === StateFlags.COMPLETE);
  parsed.sort((a, b) => b.score - a.score);
  let topOption = parsed[0];
  let joiner = "a";
  if(text && text[0].match(/[aeiou]/i)) {
    joiner = "an";
  }

  let isAttribute = false;
  if(topOption) {
    let totalFound = 0;
    let {context} = topOption;
    for(let item in context) {
      totalFound += context[item].length;
    }
    let isEntAttr = totalFound === 2 && (context.entities.length === 1 || context.collections.length === 1);
    if(isEntAttr && context.maybeAttributes.length === 1) {
      options.push({score: 4,  action: setCellState, state: "define", text: `add ${text}`});
      isAttribute = true;
    } else if(isEntAttr && context.attributes.length === 1) {
      options.push({score: 2.5,  action: setCellState, state: "modify", text: `modify ${text}`});
    }
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
  if(text && eve.findOne("index name", {id: entityId}).name !== text.toLowerCase()) {
    if(!isAttribute) {
      options.push({score: 2.5, action: setCellState, state: "property", text: `add as a property of ${pageName}`})
    }
    if(isEntity)  {
      let isAScore = 2.5;
      if(eve.findOne("collection", {collection: isEntity.id})) {
        isAScore = 3;
      }
      options.push({score: 2.5, action: addAttributeAndEmbed, replace: "is a", entityId, value: isEntity.id, attribute: "related to", text: `${pageName} is related to ${text}`});
      options.push({score: isAScore, action: addAttributeAndEmbed, replace: "related to", entityId, value: isEntity.id, attribute: "is a", text: `${pageName} is ${joiner} ${text}`});
    }
  }

  // url embedding
  if(urlRegex.exec(text)) {
    options.push({score: 3, action:  setCellState, state: "url", text: "embed url as..."});
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
  let pageName = uitk.resolveName(entityId);
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
  let chain = dispatch("create page", {page, content: ``})
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
    options.push({score:1, text: "a list", action: embedAs, rep: "index", params});
    options.push({score:1, text: "a directory", action: embedAs, rep: "directory", params});
  }
  if(isEntity) {
    options.push({score:1, text: "a list of related pages", action: embedAs, rep: "related", params});
    // options.push({score:1, text: "a properties table", action: embedAs, rep: "attributes", params});
  }
  return options;
}

function urlAutocompleteOptions(isEntity, parsed, url:string, params, entityId:string) {
  // @NOTE: url must be normalized before reaching here.
  // @FIXME: Need to get a url property onto the params. Should that be done here?
  let ext = url.slice(url.lastIndexOf(".") + 1).trim().toLowerCase();
  let domain = url.slice(url.indexOf("//") + 2).split("/")[0];
  let isImage = ["png", "jpg", "jpeg", "bmp", "tiff"].indexOf(ext) !== -1;
  let isVideo = (["mp4", "ogv", "webm", "mov", "avi", "flv"].indexOf(ext) !== -1) || (["www.youtube.com", "youtu.be"].indexOf(domain) !== -1);
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [
    {score: 2, text: "a link", action: embedAs, rep: "externalLink", params},
    {score: isImage ? 3 : 1, text: "an image", action: embedAs, rep: "externalImage", params},
    {score: isVideo ? 3 : 1, text: "a video", action: embedAs, rep: "externalVideo", params},
  ];
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

function propertyAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text?: string, [attr:string]: any}[] = [];
  let topParse = parsed[0];
  let asQuery = topParse && topParse.state === StateFlags.COMPLETE;
  let option:any = {score: 1, action: definePropertyAndEmbed, entityId, asQuery};
  option.children = [
    {c: "attribute-name", text: "property"},
    {c: "inline-cell", contentEditable: true, selected:option, keydown: defineKeys, postRender: autoFocus}
  ]
  options.push(option);
  return options;
}

function definePropertyAndEmbed(elem, value, doEmbed) {
  let {selected} = elem;
  let {entityId, asQuery, defineValue} = selected;
  if(asQuery) {
    value = `= ${value}`;
  }
  let success = handleAttributeDefinition(entityId, defineValue, value);
  let entityName = uitk.resolveName(entityId);
  doEmbed(`${entityName}'s ${defineValue}|rep=CSV;field=${defineValue}`);
}

function defineAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text?: string, [attr:string]: any}[] = [];
  let topParse = parsed[0];
  let context = topParse.context;
  let attribute;
  if(context.maybeAttributes[0]) {
    attribute = context.maybeAttributes[0].name;
  } else {
    attribute = context.attributes[0].displayName;
  }
  let subject = context.entities[0] || context.collections[0];
  let entity = subject.id;
  let option:any = {score: 1, action: defineAndEmbed, attribute, entity};
  option.children = [
    {c: "attribute-name", text: attribute},
    {c: "inline-cell", contentEditable: true, selected:option, keydown: defineKeys, postRender: autoFocus}
  ]
  options.push(option);
  return options;
}

function focusSelected(node, elem) {
  if(elem.selected.selected && node !== document.activeElement){
    node.focus();
    setEndOfContentEditable(node);
  }
}

function selectOptionIx(event, elem) {
  event.preventDefault();
  dispatch("moveCellAutocomplete", {cell: elem.selected.cell, value: elem.optionIx}).commit();
}

function modifyAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text?: string, [attr:string]: any}[] = [];
  let topParse = parsed[0];
  let context = topParse.context;
  let attribute = context.attributes[0].displayName;
  let subject = context.entities[0] || context.collections[0];
  let entity = subject.id;
  let eavs = eve.find("entity eavs", {entity, attribute});
  let ix = 0;
  let sourcesSeen = {};
  for(let eav of eavs) {
    let option:any = {score: 1, action: modifyAndEmbed, eav, params};
    let generated = eve.findOne("generated eav", {entity: eav.entity, attribute: eav.attribute, value: eav.value});
    let text = eav.value;
    let sourceView;
    let display = eve.findOne("display name", {id: text});
    if(generated) {
      sourceView = generated.source;
      if(sourcesSeen[sourceView]) continue;
      sourcesSeen[sourceView] = true;
      text = `= ${eve.findOne("query to id", {id: sourceView}).query}`;
      option.sourceView = sourceView;
      option.query = text;
    } else if(display) {
      text = `= ${display.name}`;
    }
    option.children = [
      {c: "attribute-name", text: attribute},
      {c: "inline-cell", contentEditable: true, text, optionIx: ix, click:selectOptionIx, selected:option, keydown: defineKeys, postRender: focusSelected}
    ]
    options.push(option);
    ix++;
  }
  let option:any = {score: 1, action: defineAndEmbed, attribute, entity};
  option.children = [
    {c: "attribute-name", text: attribute},
    {c: "inline-cell", contentEditable: true, selected:option, keydown: defineKeys, postRender: focusSelected}
  ]
  options.push(option);
  return options;
}

function modifyAndEmbed(elem, text, doEmbed) {
  let {eav, defineValue, params, sourceView, query} = elem.selected;
  let success = submitAttribute({currentTarget: {value: defineValue}}, {eav, sourceView, query});
  if(!success) {
    console.log("I don't know what to do");
  }
  // if you didn't remove all the attributes, just re-embed what was there
  if(eve.findOne("entity eavs", {entity: eav.entity, attribute: eav.attribute})) {
    doEmbed(`${text}|${stringifyParams(params)}`);
  } else {
    // otherwise there's no point in embedding an error cell
    doEmbed("");
  }
}

function interpretAttributeValue(value): {isValue: boolean, parse?:any, value?:any} {
  let cleaned = value.trim();
  let isNumber = parseFloat(value);
  if(!isNumber) {
    //parse it
    cleaned = cleaned.trim();
    let entityId = asEntity(cleaned);
    if(entityId) {
      return {isValue: true, value: entityId};
    }
    let parsed = nlparse(cleaned);
    return {isValue: false, parse: parsed, value: cleaned};
  } else {
    return {isValue: true, value: coerceInput(cleaned)};
  }
}

function handleAttributeDefinition(entity, attribute, search, chain?) {
  if(!chain) {
    chain = dispatch();
  }
  let {isValue, value, parse} = interpretAttributeValue(search);
  console.log("HANDLING", isValue, value, parse);
  if(isValue) {
    chain.dispatch("add sourced eav", {entity, attribute, value}).commit();
  } else {
    let queryText = value.trim();
    // add the query
    dispatch("insert query", {query: queryText}).commit();
    // create another query that projects eavs
    let cleaned = queryText && queryText.trim().toLowerCase();
    let queryToId = eve.findOne("query to id", {query: cleaned});
    if(!queryToId) return false;
    let id = queryToId.id;
    let params = getCellParams(queryText, "");
    if(!params["field"]) {
      return false;
    } else {
      //build a query
      let eavProject = `(query :$$view "${entity}|${attribute}|${id}" (select "${id}" :${params["field"].replace(" ", "-")} value)
      (project! "generated eav" :entity "${entity}" :attribute "${attribute}" :value value :source "${id}"))`;
      chain.dispatch("insert implication", {query: eavProject}).commit();
    }
  }
  return true;
}

function defineAndEmbed(elem, text, doEmbed) {
  let {selected} = elem;
  let {entity, attribute, defineValue} = selected;
  let success = handleAttributeDefinition(entity, attribute, defineValue);
  if(success) {
    doEmbed(`${text}|rep=CSV;field=${attribute}`);
  } else {
    console.error("Couldn't figure out subject of: " + defineValue);
    doEmbed(`${text}|rep=error;message=I couldn't figure out the subject of that search;`)
  }
}

function defineKeys(event, elem) {
  let cell = elem.selected.cell;
  if(event.keyCode === KEYS.ENTER) {
    elem.selected.defineValue = event.currentTarget.textContent;
    event.preventDefault();
  } else if(event.keyCode === KEYS.UP) {
    dispatch("moveCellAutocomplete", {cell, direction: -1}).commit();
  } else if(event.keyCode === KEYS.DOWN) {
    dispatch("moveCellAutocomplete", {cell, direction: 1}).commit();
  } else if(event.keyCode === KEYS.ESC) {
    dispatch("clearActiveCells").commit();
    if(elem.selected.paneId) {
      paneEditors[cell.editorId].cmInstance.focus();
    }
  }
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

export var activeCells = {};

appHandle("clearActiveCells", (changes, info) => {
  for(let cell in activeCells) {
    changes.dispatch("removeActiveCell", activeCells[cell]);
  }
});

appHandle("addActiveCell", (changes, info) => {
  changes.dispatch("clearActiveCells", {});
  let {id} = info;
  info.selected = 0;
  info.editorId = info.cell.editorId;
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
  active.query = info.query;
  active.selected = 0;
  active.state = "query";
});

appHandle("moveCellAutocomplete", (changes, info) => {
  let active = activeCells[info.cell.id];
  let {direction, value} = info;
  if(value === undefined) {
    active.selected += direction;
  } else {
    active.selected = value;
  }
});

function updateActiveCell(event, elem) {
  let {cell} = elem;
  dispatch("updateActiveCell", {id: cell.id, cell, query: event.currentTarget.textContent}).commit();
}

function activateCell(event, elem) {
  let {cell} = elem;
  let query = cell.query.split("|")[0];
  dispatch("addActiveCell", {id: cell.id, cell, query}).commit();
  event.preventDefault();
}

function createEmbedPopout(cm, editorId) {
  cm.operation(() => {
    let from = cm.getCursor("from");
    let id = uuid();
    cm.replaceRange("=", from, cm.getCursor("to"));
    let to = cm.getCursor("from");
    let fromIx = cm.indexFromPos(from);
    let toIx = cm.indexFromPos(to);
    let cell = {id, start: fromIx, length: toIx - fromIx, placeholder: true, query: "", editorId};
    dispatch("addActiveCell", {id, query: "", cell, placeholder: true});
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
    let entityId = asEntity(text);
    if(entityId) {
      text = entityId;
    }
    let replacement = `{${text}|${rawParams || ""}}`;
    if(text === "") {
      replacement = "";
    }
    if(cm.getRange(from, to) !== replacement) {
      cm.replaceRange(replacement, from, to);
    }
    paneEditors[cell.editorId].cmInstance.focus();
    let chain = dispatch("removeActiveCell", cell);
    if(replacement) {
      chain.dispatch("insert query", {query: text});
    }
    chain.commit();
  }
}

function embeddedCellKeys(event, elem) {
  let {paneId, cell} = elem;
  let target = event.currentTarget;
  let value = target.textContent;
  let editor = paneEditors[cell.editorId];
  let cm = editor.cmInstance;
  let mark = editor.marks[cell.id];
  if(event.keyCode === KEYS.BACKSPACE && value === "") {
    let {from, to} = mark.find();
    cm.replaceRange("", from, to);
    paneEditors[cell.editorId].cmInstance.focus();
    dispatch("removeActiveCell", cell).commit();
    event.preventDefault();
  } else if(event.keyCode === KEYS.ESC || (event.keyCode === KEYS.ENTER && value.trim() === "")) {
    let {from, to} = mark.find();
    if(cell.placeholder) {
      cm.replaceRange("= ", from, to);
    }
    paneEditors[cell.editorId].cmInstance.focus();
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
  event.stopPropagation();
}

function updatePage(meta, content) {
  dispatch("update page", {page: meta.page, content}).commit();
}

//---------------------------------------------------------
// Editor prep
//---------------------------------------------------------

function prepareCardEditor(entityId, paneId) {
  var {content = undefined} = eve.findOne("entity", {entity: entityId}) || {};
  var page = eve.findOne("entity page", {entity: entityId})["page"];
  var name = uitk.resolveName(entityId);
  var cells = getCells(content, `${paneId}|${entityId}`);
  var cellItems = cells.map((cell, ix) => {
    var ui;
    var active = activeCells[cell.id];
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
  let editorId = `${paneId}|${entityId}`;
  var keys = {
    "Backspace": (cm) => maybeActivateCell(cm, editorId),
    "Cmd-Enter": (cm) => maybeNavigate(cm, editorId),
    "=": (cm) => createEmbedPopout(cm, editorId)
  };
  return {postRender: wikiEditor, onUpdate: updatePage, options: {keys: keys}, cells, cellItems};
}

//---------------------------------------------------------
// Page parsing
//---------------------------------------------------------

function getCells(content: string, editorId) {
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
      if(part.match(/\{\$\$.*\$\$\}/)) {
        placeholder = true;
      }
      cells.push({start: ix, length: part.length, value: part, query: part.substring(1, part.length - 1), id, placeholder, editorId});
    }
    ix += part.length;
  }
  for(let active in activeCells) {
    let cell = activeCells[active].cell;
    if(cell.placeholder && cell.editorId === editorId) {
      cells.push(cell);
    }
  }
  return cells;
}

//---------------------------------------------------------
// Attributes
//---------------------------------------------------------

appHandle("add entity attribute", (changes:Diff, {entity, attribute, value}) => {
  let success = handleAttributeDefinition(entity, attribute.trim(), value, changes);
});

appHandle("toggle add tile", (changes:Diff, {key, entityId}) => {
  let state = uiState.widget.card[key] || {showAdd: false};
  state.showAdd = !state.showAdd;
  state.entityId = entityId;
  state.key = key;
  // in case you closed it with an adder selected
  if(state.showAdd) {
    state.adder = undefined;
  }
  uiState.widget.card[key] = state;
});

appHandle("set tile adder", (changes:Diff, {key, adder}) => {
  let state = uiState.widget.card[key] || {showAdd: true, key};
  state.adder = adder;
  uiState.widget.card[key] = state;
});

appHandle("set tile adder attribute", (changes:Diff, {key, attribute, value, isActiveTileAttribute}) => {
  let state = uiState.widget.card[key] || {showAdd: true, key};
  if(!isActiveTileAttribute) {
    state[attribute] = value.trim();
  } else {
    state.activeTile[attribute] = value.trim();
  }
  uiState.widget.card[key] = state;
});

appHandle("submit tile adder", (changes:Diff, {key, node}) => {
  let state = uiState.widget.card[key] || {showAdd: true, key};
  if(state.adder && state.adder.submit) {
    state.adder.submit(state.adder, state, node);
  }
  uiState.widget.card[key] = state;
});

appHandle("activate tile", (changes:Diff, {tileId, cardId}) => {
  let state = uiState.widget.card[cardId] || {showAdd: false, key: cardId};
  if(tileId && (!state.activeTile || state.activeTile.id !== tileId)) {
    state.activeTile = {id: tileId};
  } else if(!tileId) {
    state.activeTile = undefined;
  }
  uiState.widget.card[cardId] = state;
});

function activateTile(event, elem) {
  if(event.defaultPrevented) return;
  dispatch("activate tile", {tileId: elem.tileId, cardId: elem.cardId}).commit();
}

function submitActiveTile(event, elem) {
  if(elem.source) {
    // replace
      dispatch("replace sourced tile", {key: elem.cardId, source:elem.source, attribute: elem.attribute, entityId: elem.entityId}).commit();
  } else {
    // handle a list submit
    dispatch("submit list tile", {cardId: elem.cardId, attribute: elem.attribute, entityId: elem.entityId, reverseEntityAndValue: elem.reverseEntityAndValue}).commit();
  }
  event.preventDefault();
}

function removeActiveTile(event, elem) {
  if(elem.source) {
    dispatch("remove sourced eav", {source: elem.source}).commit();
  } else {
    console.error("Tried to remove a tile without a source. What do we do?");
  }
  event.preventDefault();
}

function tile(elem) {
  let {cardId, tileId, active, attribute, entityId, source, reverseEntityAndValue} = elem;
  let klass = (elem.c || "") + " tile";
  if(active) {
    klass += " active";
  }
  elem.c = klass;
  elem.click = activateTile;
  elem.children = [
    {c: "tile-content-wrapper", children: elem.children},
    {c: "controls", children: [
      !elem.removeOnly ? {c: "ion-checkmark submit", click: submitActiveTile, cardId, attribute, entityId, source, reverseEntityAndValue} : undefined,
      !elem.submitOnly ? {c: "ion-backspace cancel", click: removeActiveTile, cardId, attribute, entityId, source} : undefined,
    ]}
  ];
  return elem;
}

function isTileActive(cardId, tileId) {
  let state = uiState.widget.card[cardId];
  return state && state.activeTile && state.activeTile.id === tileId;
}

appHandle("toggle active tile item", (changes, {cardId, attribute, id}) => {
  let state = uiState.widget.card[cardId] || {showAdd: true, key: cardId, activeTile: {}};
  if(!state.activeTile[attribute]) {
    state.activeTile[attribute] = {};
  }
  let cur = state.activeTile[attribute][id];
  if(cur) {
    delete state.activeTile[attribute][id];
  } else {
    state.activeTile[attribute][id] = true;
  }
  uiState.widget.card[cardId] = state;
});

appHandle("submit list tile", (changes, {cardId, attribute, entityId, reverseEntityAndValue}) => {
  let state = uiState.widget.card[cardId] || {activeTile: {}};
  let {itemsToRemove, itemsToAdd} = state.activeTile;
  if(itemsToRemove) {
    for(let source in itemsToRemove) {
      changes.remove("sourced eav", {source});
    }
  }
  if(itemsToAdd) {
    for(let value of itemsToAdd) {
      if(!reverseEntityAndValue) {
        changes.dispatch("add sourced eav", {entity: entityId, attribute, value: value.trim(), forceEntity: true});
      } else {
        let cleaned = value.trim();
        let entityValue = asEntity(cleaned);
        if(!entityValue) {
          //create an entity with that name
          entityValue = uuid();
          let pageId = uuid();
          changes.dispatch("create page", {page: pageId,  content: ""})
                 .dispatch("create entity", {entity: entityValue, name: cleaned, page: pageId});
        }
        changes.dispatch("add sourced eav", {entity: entityValue, attribute, value: entityId});
      }
    }
  }
  changes.dispatch("activate tile", {cardId});
});

function toggleListTileItem(event, elem) {
  dispatch("toggle active tile item", {cardId: elem.cardId, attribute: elem.storeAttribute, id: elem.storeId}).commit();
  event.preventDefault();
}

appHandle("add active tile item", (changes, {cardId, attribute, id, value, tileId}) => {
  let state = uiState.widget.card[cardId] || {showAdd: true, key: cardId, activeTile: {id: tileId}};
  if(!state.activeTile) {
    state.activeTile = {id: tileId};
  }
  if(!state.activeTile[attribute]) {
    state.activeTile[attribute] = [];
  }
  let cur = state.activeTile[attribute][id];
  state.activeTile[attribute][id] = value;
  uiState.widget.card[cardId] = state;
});

function autosizeAndStoreListTileItem(event, elem) {
  let node = event.currentTarget;
  dispatch("add active tile item", {cardId: elem.cardId, attribute: elem.storeAttribute, tileId: elem.tileId, id: elem.storeId, value: node.value}).commit();
  uitk.autosizeInput(node, elem);
}

export function listTile(elem) {
  let {values, data, tileId, attribute, cardId, entityId, forceActive, reverseEntityAndValue, noProperty, rep="value", c:klass=""} = elem;
  tileId = tileId || attribute;
  let state = uiState.widget.card[cardId] || {};
  let active = forceActive || isTileActive(cardId, tileId);
  let listChildren = [];
  let max = 0;
  for(let value of values) {
    let current = reverseEntityAndValue ? value.eav.entity : value.eav.value;
    if(uitk.resolveName(current) === "entity" && attribute === "is a") continue;
    let source = value.source;
    let valueElem:any = {c: "value", data, text: current};
    if(rep === "externalImage") {
      valueElem.url = current;
      valueElem.text = undefined;
    }
    let ui = uitk[rep](valueElem);
    if(active) {
      ui["cardId"] = cardId;
      ui["storeAttribute"] = "itemsToRemove";
      ui["storeId"] = source;
      ui.click = toggleListTileItem;
      if(state.activeTile.itemsToRemove && state.activeTile.itemsToRemove[source]) {
        ui.c += " marked-to-remove";
      }
    }
    listChildren.push(ui);
  }
  if(active) {
    let added = (state.activeTile ? state.activeTile.itemsToAdd : false) || [];
    let ix = 0;
    for(let add of added) {
      listChildren.push({c: "value", children: [
        {t: "input", placeholder: "add", value: add, attribute, entityId, storeAttribute: "itemsToAdd", storeId: ix, cardId, input: autosizeAndStoreListTileItem, postRender: uitk.autosizeAndFocus, keydown: handleTileKeys, reverseEntityAndValue}
      ]});
      ix++;
    }
    listChildren.push({c: "value", children: [
      {t: "input", placeholder: "add", value: "", attribute, entityId, storeAttribute: "itemsToAdd", storeId: ix, cardId, input: autosizeAndStoreListTileItem, postRender: ix === 0 ? uitk.autosizeAndFocus : uitk.autosizeInput, keydown: handleTileKeys, reverseEntityAndValue}
    ]});
  }
  let tileChildren = [];
  let isIsA = attribute === "is a";
  if(!noProperty) {
    tileChildren.push({c: "property", text: isIsA ? "tags" : attribute});
  }
  tileChildren.push({c: "list", children: listChildren});
  let size = isIsA ? "is a" : "full";
  return tile({c: `${klass} ${size}`, size, cardId, data, tileId, active, attribute, entityId, reverseEntityAndValue, submitOnly: true, children: tileChildren});
}

function autosizeTextarea(node, elem) {
  node.style.height = "1px";
  node.style.height = 1 + node.scrollHeight + "px";
}

function autosizeAndFocusTextArea(node, elem) {
  autoFocus(node, elem);
  autosizeTextarea(node, elem);
}

function storeActiveTileValue(elem, value) {
  dispatch("set tile adder attribute", {key: elem.cardId, attribute: elem.storeAttribute, value, isActiveTileAttribute: true}).commit();
}

appHandle("replace sourced tile", (changes, {key, attribute, entityId, source}) => {
  let state = uiState.widget.card[key] || {activeTile: {}};
  let {replaceValue} = state.activeTile;
  let sourced = eve.findOne("sourced eav", {source});
  if(!sourced) {
    console.error("Tried to modify a sourced eav that doesn't exist?")
    return;
  }
  if(replaceValue !== undefined && sourced.value !== replaceValue.trim()) {
    changes.remove("sourced eav", {source});
    if(attribute === "description") {
      replaceValue = `"${replaceValue}"`;
    }
    changes.dispatch("add sourced eav", {entity: entityId, attribute, value: replaceValue, forceEntity: true});
  }
  changes.dispatch("activate tile", {cardId: key});
});

function handleTileKeys(event, elem) {
  if(event.keyCode === KEYS.ENTER) {
    if(elem.source) {
      dispatch("replace sourced tile", {key: elem.cardId, source: elem.source, attribute: elem.attribute, entityId: elem.entityId}).commit();
    } else {
      dispatch("submit list tile", {cardId: elem.cardId, attribute: elem.attribute, entityId: elem.entityId, reverseEntityAndValue: elem.reverseEntityAndValue}).commit();
    }
    event.preventDefault();
  } else if(event.keyCode === KEYS.ESC) {
    dispatch("activate tile", {cardId: elem.cardId}).commit();
  }
}

function autosizeAndStoreTextarea(event, elem) {
  let node = event.currentTarget;
  storeActiveTileValue(elem, node.value);
  autosizeTextarea(node, elem);
}

function textTile(elem) {
  let {value, data, attribute, cardId, entityId} = elem;
  let tileId = value.source;
  let source = value.source;
  let state = uiState.widget.card[cardId] || {};
  let active = isTileActive(cardId, tileId);
  let tileChildren = [];
  if(attribute !== "description") {
    tileChildren.push({c: "property", text: attribute});
  }
  if(!active) {
    tileChildren.push({c: "value text", text: value.eav.value});
  } else {
    tileChildren.push({t: "textarea", c: "value text", source, attribute, storeAttribute: "replaceValue", cardId, entityId,
                      keydown: handleTileKeys, input: autosizeAndStoreTextarea, postRender: autosizeAndFocusTextArea, value: value.eav.value});
  }
  return tile({c: "full", tileId, cardId, entityId, attribute, source, active, children: tileChildren});
}

function autosizeAndStoreInput(event, elem) {
  let node = event.currentTarget;
  storeActiveTileValue(elem, node.value);
  uitk.autosizeInput(node, elem);
}

function valueTile(elem) {
  let {value, data, attribute, cardId, entityId} = elem;
  let tileId = attribute;
  let source = value.source;
  let state = uiState.widget.card[cardId] || {};
  let active = isTileActive(cardId, tileId);
  let tileChildren = [];
  tileChildren.push({c: "property", text: attribute});
  let ui;
  let content = uitk.resolveName(value.eav.value);
  if(!content) content = value.eav.value;
  if(!active) {
    ui = uitk.value({c: "value", data, text: value.eav.value});
  } else {
    ui = {t: "input", c: "value", source, attribute, storeAttribute: "replaceValue", cardId, entityId, value: content, postRender: uitk.autosizeAndFocus,
    input: autosizeAndStoreInput, keydown: handleTileKeys};
  }
  let max = Math.max(content.toString().length, 0);
  tileChildren.push({c: "value", children: [ui]});
  let size;
  if(max <= 8) {
    size = "small";
  } else if(max <= 16) {
    size = "medium";
  } else {
    size = "full";
  }
  let klass = size;
  if(!value.isManual) {
    klass += " computed";
  }
  return tile({c: klass, size, cardId, data, tileId, active, attribute, source, entityId, children: tileChildren});
}

function imageTile(elem) {
  let {values, data, attribute, cardId, entityId} = elem;
  let ui;
  if(values.length > 1) {
    elem.rep = "externalImage";
    elem.noProperty = true;
    elem.c = "image ";
    ui = listTile(elem);
  } else {
    let value = values[0];
    let source = value.source;
    let size = "full";
    let klass = "image full";
    let tileId = attribute;
    let tileChildren = [{t: "img", c: "image", src: `${value.eav.value}`}];
    let active = isTileActive(cardId, tileId);
    ui = tile({c: klass, size, cardId, data, tileId, active, attribute, source, entityId, children: tileChildren});
  }
  return ui;
}

function documentTile(elem) {
  let {value, data, attribute, cardId, entityId} = elem;
  let tileChildren = [];
  let tileId = attribute;
  let source = value.source;
  let state = uiState.widget.card[cardId] || {};
  let active = isTileActive(cardId, tileId);
  let size = "full";
  let klass = "document full";
  return tile({c: klass, size, cardId, data, tileId, active, attribute, source, entityId, children: tileChildren});
}

function row(elem) {
  elem.c = `${elem.c || ""} row flex-row`;
  return elem;
}

function getEAVInfo(eav) {
  let {entity, attribute, value} = eav;
  let found = eve.findOne("generated eav", {entity, attribute, value});
  let sourceId = eve.findOne("sourced eav", {entity, attribute, value});
  let item:any = {eav, isManual: !found};
  if(found) {
    item.sourceView = found.source;
    item.source = found.source;
  } else if(sourceId) {
    item.source = sourceId.source;
  }
  return item;
}

export function entityTilesUI(entityId, paneId, cardId) {
  var eavs = eve.find("entity eavs", {entity: entityId});
  var items = {};
  var attrs = [];
  for(let eav of eavs) {
    let {attribute} = eav;
    let info = getEAVInfo(eav);
    if(!items[attribute]) {
      items[attribute] = [];
      attrs.push(attribute);
    }
    items[attribute].push(info);
  }
  let tiles = {"small": [], "medium": [], "full": [], "is a": []};
  let rows = [];
  let data = {paneId, entityId};
  if(items["image"]) {
    let values = items["image"];
    let tile = imageTile({values, data, cardId, entityId, attribute: "image"});
    rows.push(row({children: [tile]}));
    delete items["image"];
  }

  if(items["description"]) {
    let values = items["description"];
    for(let value of values) {
      let tile = textTile({value, data, cardId, entityId, attribute: "description"});
      rows.push(row({children: [tile]}));
    }
    delete items["description"];
  }
  if(eve.findOne("collection", {collection: entityId}) || eve.findOne("entity eavs", {entity: entityId, attribute: "is a", value: asEntity("collection")})) {
    let listChildren = [];
    let entities = eve.find("entity eavs", {attribute: "is a", value: entityId});
    let values = entities.map(getEAVInfo);
    let tile = listTile({values, data, cardId, entityId, attribute: "is a", reverseEntityAndValue: true, tileId: "_collectionItems", noProperty: true});
    rows.push(row({children: [tile]}));
  }
  let tilesToPlace = 0;
  for(let attribute of attrs) {
    let values = items[attribute];
    if(!values) continue;
    let newTile;
    if(values.length > 1 || attribute === "is a") {
      newTile = listTile({values, data, attribute, cardId, entityId});
    } else {
      newTile = valueTile({value: values[0], data, attribute, cardId, entityId});
    }
    let size = newTile.size;
    tiles[size].push(newTile);
    if(size !== "is a") tilesToPlace++;
  }

  let optionIx = 0;
  while(tilesToPlace > 0) {
    let rowChildren = [];
    let iter = 0;
    while(iter < 5 && !rowChildren.length) {
      if(optionIx === 0 && tiles["full"].length) {
        rowChildren.push(tiles["full"].pop());
        break;
      }
      if(optionIx === 1 && tiles["medium"].length > 1) {
        rowChildren.push(tiles["medium"].pop());
        rowChildren.push(tiles["medium"].pop());
        break;
      }
      if(optionIx === 2 && tiles["medium"].length && tiles["small"].length >= 1) {
        rowChildren.push(tiles["medium"].pop());
        rowChildren.push(tiles["small"].pop());
        break;
      }
      if(optionIx === 3 && tiles["small"].length >= 3) {
        rowChildren.push(tiles["small"].pop());
        rowChildren.push(tiles["small"].pop());
        rowChildren.push(tiles["small"].pop());
        break;
      }
      if(optionIx === 4 && tiles["medium"].length) {
        rowChildren.push(tiles["medium"].pop());
        break;
      }
      if(optionIx > 4) optionIx = 0;
      else optionIx++;
      iter++;
    }
    // any smalls leftover
    if(!rowChildren.length) {
      while(tiles["small"].length) {
        rowChildren.push(tiles["small"].pop());
      }
    }
    tilesToPlace -= rowChildren.length;
    rows.push({c: "flex-row row", children: rowChildren});
  }

  if(tiles["is a"]) {
    rows.push({c: "flex-row row", children: [tiles["is a"][0]]});
  }

  let state = uiState.widget.attributes[entityId] || {};

  return {c: "tiles", children: rows};
}

function attributesUIAutocompleteOptions(isEntity, parsed, text, params, entityId) {
  let options:{score: number, action: any, text: string, [attr:string]: any}[] = [];
  //there are two possible things either we're creating a page
  // or we need to pick what field of the result we want
  return options;
}

appHandle("setActiveAttribute", (changes: Diff, {eav, sourceView}) => {
  if(!uiState.widget.attributes[eav.entity]) {
    uiState.widget.attributes[eav.entity] = {};
  }
  let cur = uiState.widget.attributes[eav.entity];
  cur.active = eav;
  cur.sourceView = sourceView;
});

appHandle("clearActiveAttribute", (changes: Diff, {entity}) => {
  let cur = uiState.widget.attributes[entity];
  if(cur) {
    cur.active = false;
    cur.sourceView = false;
  }
})

function removeSubItem(event, elem) {
  event.preventDefault();
  submitAttribute(event, elem);
}

function setActiveAttribute(event, elem) {
  if(!event.defaultPrevented) {
    dispatch("setActiveAttribute", {eav: elem.eav, sourceView: elem.sourceView}).commit();
    event.preventDefault();
  }
}

function handleAttributesKey(event, elem) {
  if(event.keyCode === KEYS.ENTER && elem.submit) {
    elem.submit(event, elem);
  } else if(event.keyCode === KEYS.ESC) {
    dispatch("setActiveAttribute", {eav: {entity: elem.eav.entity}, sourceView: false}).commit();
  }
}

appHandle("setAttributeAdder", (changes:Diff, {entityId, field, value}) => {
  let cur = uiState.widget.attributes[entityId];
  if(!uiState.widget.attributes[entityId]) {
    cur = uiState.widget.attributes[entityId] = {};
  }
  cur[field] = value;
});

function setAdder(event, elem) {
  let value = event.currentTarget.value;
  dispatch("setAttributeAdder", {entityId: elem.entityId, field: elem.field, value}).commit();
}

function submitAdder(event, elem) {
  let {entityId} = elem;
  let state = uiState.widget.attributes[entityId];
  if(!state) return;
  let {adderAttribute, adderValue} = state;
  let success = false;
  if(adderAttribute && adderValue) {
    let chain = dispatch("setAttributeAdder", {entityId, field: "adderAttribute", value: ""})
    .dispatch("setAttributeAdder", {entityId, field: "adderValue", value: ""});
    success = handleAttributeDefinition(entityId, adderAttribute, adderValue, chain);
  }
  //make sure the focus ends up back in the property input
  event.currentTarget.parentNode.firstChild.focus();
  return success;
}

appHandle("remove attribute generating query", (changes:Diff, {eav, view}) => {
  let queryId = `${eav.entity}|${eav.attribute}|${view}`;
  eve.removeView(queryId)
  changes.merge(Query.remove(queryId, eve));
  //find all the unions this was used with
  for(let source of eve.find("action source", {"source view": queryId})) {
    let action = source.action;
    changes.remove("action", {action});
    changes.remove("action mapping", {action});
    changes.remove("action mapping constant", {action});
  }
  changes.remove("action source", {source: queryId});
});

function submitAttribute(event, elem) {
  let {eav, sourceView, query} = elem;
  let chain = dispatch("clearActiveAttribute", {entity: eav.entity});
  let value =  event.currentTarget.value;
  if(query !== undefined && value === query) {
    return chain.commit();
  }
  if(elem.sourceView !== undefined) {
    //remove the previous source
    chain.dispatch("remove attribute generating query", {eav, view: sourceView});
  } else {
    //remove the previous eav
    let fact = copy(eav);
    fact.__id = undefined;
    chain.dispatch("remove entity attribute", fact);
  }
  if(value !== undefined && value !== "") {
    return handleAttributeDefinition(eav.entity, eav.attribute, value, chain);
  } else {
    chain.commit();
  }
}

//---------------------------------------------------------
// Wiki Widgets
//---------------------------------------------------------
export function searchInput(paneId:string, value:string):Element {
  let state:any = uiState.widget.search[paneId] || {focused: false, plan: false};
  let name = state.value;
  if(!state.value) state.value = name;
  let display = eve.findOne("display name", {id: name});
  if(display) name = display.name;
  return {
    c: "flex-grow wiki-search-wrapper",
    children: [
      {c: "controls", children: [
        // {c: `ion-ios-arrow-${state.plan ? 'up' : 'down'} plan`, click: toggleSearchPlan, paneId},
        // while technically a button, we don't need to do anything as clicking it will blur the editor
        // which will execute the search
        {c: "ion-android-search visible", paneId}
      ]},
      codeMirrorElement({
        c: `flex-grow wiki-search-input ${state.focused ? "selected": ""}`,
        paneId,
        value: name,
        focus: focusSearch,
        blur: setSearch,
        cursorPosition: "end",
        change: updateSearch,
        shortcuts: {"Enter": setSearch}
      }),
    ]
  };
};

function focusSearch(event, elem) {
  dispatch("ui focus search", elem).commit();
}
function setSearch(event, elem) {
  let state:any = uiState.widget.search[elem.paneId] || {value: ""};
  let value = event.value !== undefined ? event.value : state.value;
  let pane = eve.findOne("ui pane", {pane: elem.paneId});
  if(!pane || pane.contains !== event.value) {
    let {chain, isSetSearch} = dispatchSearchSetAttributes(value);
    if(isSetSearch) {
      chain.dispatch("ui update search", {paneId: elem.paneId, value: pane.contains});
      chain.commit();
    } else {
      chain.dispatch("insert query", {query: value})
      .dispatch("set pane", {paneId: elem.paneId, contains: value})
      .commit();
    }
  }
}
function updateSearch(event, elem) {
  dispatch("ui update search", {paneId: elem.paneId, value: event.value}).commit();
}
function toggleSearchPlan(event, elem) {
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
  elem["cmChange"] = elem.change;
  elem["cmBlur"] = elem.blur;
  elem["cmFocus"] = elem.focus;
  elem.change = undefined;
  elem.blur = undefined;
  elem.focus = undefined;
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
      if(elem["cmChange"]) cm.on("change", handleCMEvent(elem["cmChange"], elem));
      if(elem["cmBlur"]) cm.on("blur", handleCMEvent(elem["cmBlur"], elem));
      if(elem["cmFocus"]) cm.on("focus", handleCMEvent(elem["cmFocus"], elem));
      if(elem.autofocus) cm.focus();
    }

    if(cm.getDoc().getValue() !== elem.value) {
      cm.setValue(elem.value || "");
      if(elem["cursorPosition"] === "end") {
        cm.setCursor(100000);
      }
    }
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
function getURLsFromResults(results:{[field:string]: any}[], {fields = ["url"]} = {}):string[] {
  let urls = [];
  if(!results.length) return urls;

  for(let field of fields) {
    if(results[0][field] === undefined) field = builtinId(field);
    for(let fact of results) {
      if(urlRegex.exec(fact[field])) urls.push(fact[field]);
    }
  }
  return urls;
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
function prepareURL(results:{}[], params:{field?:string}) {
  let elem = {};
  let urls = getURLsFromResults(results, {fields: params.field ? [params.field] : undefined});
  let elems = [];
  for(let url of urls) {
    let elem = copy(params);
    elem.url = url;
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
      let neueField = asEntity(field);
      if(!neueField) throw new Error(`Unable to uniquely resolve field name ${field} in result fields ${Object.keys(results[0])}`);
      else field = neueField;
    }

    let elems = [];
    for(let row of results) elems.push({text: row[field], data: params.data});
    return elems;
  },
  CSV(results, params:{field:string, data?:{}}) {
    if(!params.field) throw new Error("Value representation requires a 'field' param indicating which field to represent");
    let field = params.field;
    if(!results.length) return [];

    // If field isn't in results, try to resolve it as a field name, otherwise error out
    if(results[0][field] === undefined) {
      let neueField = asEntity(field);
      if(!neueField) throw new Error(`Unable to uniquely resolve field name ${field} in result fields ${Object.keys(results[0])}`);
      else field = neueField;
    }

    let values = [];
    for(let row of results) {
      values.push(row[field]);
    }
    return {values, data: params.data};
  },
  entity(results, params) {
    let entities = [];
    let firstResult = results[0];
    let fields = Object.keys(firstResult).filter((field) => {
      return !!asEntity(firstResult[field]);
    });
    for(let result of results) {
      for(let field of fields) {
        var entityId = result[field];
        var paneId = params["paneId"];
        var editor = prepareCardEditor(entityId, paneId);
        entities.push({entity: result[field], data: params, editor});
      }
    }
    return entities;
  },
  error(results, params) {
    return {text: params["message"]};
  },
  table(results, params:{paneId?: string, data?: {paneId?: string}, search: string}) {
    if(!params.search) return {rows: results, data: params.data};
    let parsed = nlparse(params.search);
    let topParse = parsed[0];
    if(!topParse) return {rows: results, data: params.data};

    // Must not contain any primitive relations
    let editable = true;
    let subject;
    let fieldMap:{[field:string]: {type: string, source: any, complex?: boolean}} = {};
    for(let ctx in topParse.context) {
      if(ctx === "attributes" || ctx === "entities" || ctx === "collections") continue;
      for(let node of topParse.context[ctx]) {
        if(node.project) {
          editable = false;
          break;
        }
      }
    }
    
    // Number of subjects (projected entities or collections) must be 1.
    for(let node of topParse.context.collections) {
      if(node.project) {
        if(subject) {
          editable = false;
          break;
        } else {
          let name = subject = node.displayName;
          fieldMap[name] = {type: "collection", source: node};
        }
      }
    }
    for(let node of topParse.context.entities) {
      if(node.project) {
        if(subject) {
          editable = false;
          break;
        } else {
          let name = subject = node.displayName;
          console.log(node.id);
          fieldMap[name] = {type: "entity", source: node};
        }
      }
    }

    if(editable) {
      for(let node of topParse.context.attributes) {
        if(node.project) {
          fieldMap[node.displayName] = {type: "attribute", source: node};
        }
      }

      function editRow(event, elem) {
        let {table:tableElem, row} = elem.row;
        
        if(event.detail === "add") {
          let state = elem.state.adder;
          if(!state[subject] && fieldMap[subject].type === "entity") {
            let entityId = fieldMap[subject].source.id;
            state[subject] = entityId;
            
          } else if(elem.field === subject && fieldMap[subject].type === "collection") {
            // @NOTE: Should this really be done by inserting "= " when the input is focused?
            let entityId = asEntity(uitk.resolveValue(state[subject]));
            if(entityId) {
              console.log("subject id", entityId);
              for(let field in fieldMap) {
                // @FIXME: This is brittle, if fields are ever renamed (e.g., salary (2) this won't work correctly).
                let {value = undefined} = eve.findOne("entity eavs", {entity: entityId, attribute: field}) || {};
                console.log("defaulting field", field, "to", value);
                if(value !== undefined && !state[field]) {
                  state[field] = value;
                }
              }
              dispatch("rerender");
            }
          }
          
          var valid = elem.fields.every((field) => {
            return state[field] !== undefined;
          });

          
          if(valid && elem.state.confirmed) {
            console.log("valid", state);
            let chain:any = dispatch("rerender");
            // create entity if it doesn't exist?
            let entity = state[subject];
            if(fieldMap[subject].type === "collection") {
              let name = state[subject];
              entity = asEntity(name);
              if(!entity) {
                entity = uuid();
                let pageId = uuid();
                console.log(" - creating entity", entity);
                chain.dispatch("create page", {page: pageId,  content: ""})
                  .dispatch("create entity", {entity, name: state[subject], page: pageId});
              }
            }
            
            for(let field in fieldMap) {              
              if(field === subject) continue;
                
              if(fieldMap[field].type === "attribute") {
                let attr = fieldMap[field].source;
                console.log(" - adding attr", attr.id, "=", uitk.resolveValue(state[field]), "for", entity);
                chain.dispatch("add sourced eav", {entity, attribute: attr.id, value: uitk.resolveValue(state[field])});
              }
            }

            for(let coll of topParse.context.collections) {
              console.log(" - adding coll", "is a", "=", coll.id, "for", entity);
              chain.dispatch("add sourced eav", {entity, attribute: "is a", value: coll.id});
            }
            
            elem["state"]["adder"] = {};
            console.log(chain);
            chain.commit();
            
          } else if(event.detail === "remove") {
            console.log("@FIXME: Implement remove");
            //dispatch("remove entity attribute", {entity, attribute: row.attribute, value: row.value}).commit();
          }
        }
      }

      return {key: `${params.paneId || params.data.paneId}|${params.search || ""}`, rows: results, data: params.data, editCell: (evt, elem) => console.log("cell", evt, elem), editRow, confirmRow: true, removeRow: false};
    }
    
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
  externalLink: prepareURL,
  externalImage: prepareURL,
  externalVideo: prepareURL,
  
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

function represent(search: string, rep:string, results, params:{}, wrapEach?:(elem:Element, ix?:number) => Element):Element {
  if(rep in _prepare) {
    let embedParamSets = _prepare[rep](results && results.results, <any>params);
    let isArray = embedParamSets && embedParamSets.constructor === Array;
    try {
      if(!embedParamSets || isArray && embedParamSets.length === 0) {
        return uitk.error({text: `${search} as ${rep}`})
      } else if(embedParamSets.constructor === Array) {
        let wrapper = {c: "flex-column", children: []};
        let ix = 0;
        for(let embedParams of embedParamSets) {
          embedParams["data"] = embedParams["data"] || params;
          if(wrapEach) wrapper.children.push(wrapEach(uitk[rep](embedParams), ix++));
          else wrapper.children.push(uitk[rep](embedParams));
        }
        return wrapper;
      } else {
        let embedParams = embedParamSets;
        embedParams["data"] = embedParams["data"] || params;
        if(wrapEach) return wrapEach(uitk[rep](embedParams));
        else return uitk[rep](embedParams);
      }
    } catch(err) {
      console.error("REPRESENTATION ERROR");
      console.error({search, rep, results, params});
      console.error(err);
      return uitk.error({text: `Failed to embed as ${params["childRep"] || rep}`})
    }
  } else {
    console.error("REPRESENTATION ERROR");
    console.error({search, rep, results, params});
    return uitk.error({text: `Unknown representation ${params["childRep"] || rep}`});
  }
}

var historyState = window.history.state;
var historyURL = getLocation();
window.addEventListener("popstate", function(evt) {
  let popout = eve.findOne("ui pane", {kind: PANE.POPOUT});
  if(popout && popoutHistory.length) {
    window.history.pushState(historyState, null, historyURL);
    let {rep, contains, params, x, y} = popoutHistory.pop();
    dispatch("set popout", {parentId: "p1", rep, contains, params, x, y, popState: true}).commit(); // @TODO: make "p1" a constant
    return;
  } else if(evt.state && evt.state.root) {
    window.history.back();
    return;
  }

  historyState = evt.state;
  historyURL = getLocation();

  let {paneId = undefined, contains = undefined} = evt.state || {};
  if(paneId === undefined || contains === undefined) return;
  dispatch("set pane", {paneId, contains, popState: true}).commit();
});

// Prevent backspace from going back
window.addEventListener("keydown", (event) => {
  var current = <HTMLElement>event.target;
  if(event.keyCode === KEYS.BACKSPACE && current.nodeName !== "INPUT" && current.nodeName !== "TEXTAREA" && current.contentEditable !== "true") {
    event.preventDefault();
  }
})

// @NOTE: Uncomment this to enable the new UI, or type `window["NEUE_UI"] = true; app.render()` into the console to enable it transiently.
window["NEUE_UI"] = true;
