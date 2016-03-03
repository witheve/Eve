declare var pluralize; // @TODO: import me.

import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import * as CodeMirror from "codemirror";
import {copy, uuid, coerceInput, builtinId, autoFocus, KEYS, mergeObject, setEndOfContentEditable, slugify, location as getLocation} from "./utils";
import {Diff, Query} from "./runtime";
import {Element, Handler, RenderHandler, Renderer} from "./microReact";
import * as uitk from "./uitk";
import {navigate, preventDefault} from "./uitk";
import {eve, eveLocalStorageKey, handle as appHandle, dispatch, activeSearches, renderer} from "./app";
import {parseDSL} from "./parser";
import {parse as nlparse, normalizeString, Intents, FunctionTypes, NodeTypes, Result as NLResult} from "./NLQueryParser";

declare var ga;

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
    table: {[key:string]: {sortField:string, sortDirection:number, adders?:{}[], changes?: {field: string, prev: any, row:{}, value: any}[]}},
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
  cleaned = normalizeString(cleaned);
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
  ga('send', 'pageview', {
    'page': location.pathname + location.search  + location.hash
  });
}

function inferRepresentation(search:string|number, baseParams:{} = {}):{rep:string, params:{}} {
  let params = copy(baseParams);
  let entityId = asEntity(search);
  let cleaned = (search && (""+search).trim().toLowerCase()) || "";
  if(entityId || cleaned.length === 0) {
    let rep = "entity";
    params.entity = entityId || builtinId("home");
    if(params.entity === builtinId("home")) {
      rep = "directory";
      // params.unwrapped = true;
    }
    return {rep, params};
  }

  let [rawContent, rawParams] = cleaned.split("|");
  let parsedParams = getCellParams(rawContent, rawParams);
  params = mergeObject(params, parsedParams);
  if(params.rep === "table") {
    params.search = cleaned;
  }
  return {rep: params.rep, params};
}

function staticOrMappedTable(search:string, params) {
  let parsed = safeNLParse(search);
  let topParse = parsed[0];
  console.log(topParse);
  params.rep = "table";
  params.search = search;
  // @NOTE: This requires the first project to be the main result of the search
  params.fields = topParse.query.projects[0].fields.map((field) => field.name);
  params.groups = topParse.context.groupings.map((group) => {
    // @FIXME: This needs to really come off the group itself.
    if(group.attribute) return group.attribute.projectedAs;
    if(group.entity) return group.entity.projectedAs;
    if(group.collection) return group.collection.projectedAs;
    if(group.fxn) return group.fxn.projectedAs;
    else return group.name;
  });
  //params.fields = uitk.getFields({example: results[0], blacklist: ["__id"]});

  if(!topParse || topParse.intent !== Intents.QUERY) return params;

  // Must not contain any primitive relations
  let editable = true;
  let subject;
  let entity;
  let fieldMap:{[field:string]: string} = {};
  let collections:string[] = [];
  for(let ctx in topParse.context) {
    if(ctx === "attributes" || ctx === "entities" || ctx === "collections") continue;
    for(let node of topParse.context[ctx]) {
      if(node.fxn && node.fxn.project) {
        editable = false;
        break;
      }
    }
  }
  
  // Number of subjects (projected entities or collections) must be 1.
  if(editable) {
    for(let node of topParse.context.collections) {
      let coll = node.collection;
      if(coll.project) {
        if(subject) {
          editable = false;
          break;
        } else {
          subject = coll.projectedAs;
        }
      }
      collections.push(coll.id);
    }
  }
  if(editable) {
    for(let node of topParse.context.entities) {
      let ent = node.entity;
      if(ent.project) {
        if(subject) {
          editable = false;
          break;
        } else {
          subject = ent.projectedAs;
          entity = ent.id;
        }
      }
    }
  }

  if(editable) {
    for(let node of topParse.context.attributes) {
      let attr = node.attribute;
      if(attr.project) {
        fieldMap[attr.projectedAs] = attr.id;
      }
    }
    if(entity && Object.keys(fieldMap).length !== 1) editable = false;
  }

  if(editable) {
    params.rep = "mappedTable";
    params.subject = subject;
    params.entity = entity;
    params.fieldMap = fieldMap;
    params.collections = collections;
    console.log("MAPPED PARAMS", params);
    return params;
  }

  return params;
}

function safeNLParse(query):NLResult[] {
  try {
    return nlparse(query);
  } catch(e) {
    console.error("NLParse error");
    console.error(e);
    return [<NLResult><any>{intent: Intents.NORESULT, context: {}, query: {}, projects: {}}];
  }
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
  // if(parent && parent.kind === PANE.POPOUT) {
  //   reusing = true;
  //   paneId = parentId;
  //   parentId = eve.findOne("ui pane parent", {pane: parentId}).parent;
  // } else 
    if(children.length) {
    //check if there is already a child popout
    for(let childRel of children) {
      let child = eve.findOne("ui pane", {pane: childRel.pane});
      if(child.kind === PANE.POPOUT) {
        paneId = child.pane;
        break;
      }
    }
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

appHandle("close card", (changes, {paneId}) => {
  if(eve.findOne("ui pane", {pane: paneId}).kind === PANE.FULL) {
    changes.dispatch("set pane", {paneId, contains: ""});
  } else {
    changes.dispatch("remove pane", {paneId});
  }
});

appHandle("ui toggle search plan", (changes:Diff, {paneId}:{paneId:string}) => {
  let state = uiState.widget.search[paneId] = uiState.widget.search[paneId] || {value: ""};
  state.plan = !state.plan;
});

appHandle("add sourced eav", (changes, eav:{entity:string, attribute:string, value:string|number, source:string, forceEntity: boolean}) => {
  let {entity, attribute:attrName, value, source, forceEntity} = eav;
  if(!source) {
    source = uuid();
  }
  let attribute = normalizeString(attrName);
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
  changes.add("sourced eav", {entity, attribute, value, source})
    .remove("display name", {id: attribute})
    .add("display name", {id: attribute, name: attrName});
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
  let parsed = safeNLParse(query);
  let topParse = parsed[0];
  if(eve.findOne("query to id", {query})) return;
  if(topParse.intent === Intents.QUERY) {
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
  changes.merge(dispatch("add sourced eav", {entity, attribute, value, forceEntity: true}));
});

function dispatchSearchSetAttributes(query, chain?) {
  if(!chain) {
    chain = dispatch();
  }
  let parsed = safeNLParse(query);
  let topParse = parsed[0];
  let isSetSearch = false;
  if(topParse.intent === Intents.INSERT) {
    // debugger;
    let attributes = [];
    for(let insert of topParse.inserts) {
      // @TODO: NLP needs to tell us whether we're supposed to modify this attribute
      // or if we're just adding a new eav for it.
      let replace = true;
      let entity = insert.entity.entity.id;
      let attribute;
      if(insert.attribute.attribute) {
        attribute = insert.attribute.attribute.displayName;
      } else {
        attribute = insert.attribute.name;
      }
      let value;
      if(insert.value.type === NodeTypes.ENTITY) {
        let localValue = <any>insert.value;
        value = localValue.entity.id;
      } else if(insert.value.type === NodeTypes.NUMBER || insert.value.type === NodeTypes.STRING || insert.value.type === undefined) {
        let localValue = <any>insert.value;
        value = localValue.name;
      }
      if(value === undefined) continue;
      chain.dispatch("handle setAttribute in a search", {entity, attribute, value, replace});
      attributes.push(`${attribute}`);
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
appHandle("rename entity attribute", (changes:Diff, {entity, attribute:attrName, prev, value}) => {
  // @FIXME: proper unique source id
  let {source = "<global>"} = eve.findOne("sourced eav", {entity, attribute: prev, value}) || {};
  let attribute = normalizeString(attrName);
  if(prev !== undefined) {
    changes.remove("sourced eav", {entity, attribute: prev, value})
      .remove("display name", {id: prev});
  }
  changes.add("sourced eav", {entity, attribute, value, source})
    .add("display name", {id: attribute, name: attrName});
});
appHandle("sort table", (changes:Diff, {state, field, direction}) => {
  if(field !== undefined) {
    state.sortField = field;
    state.sortDirection = 1;
  }
  if(direction !== undefined) state.sortDirection = direction;
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
  for(let {pane:paneId} of eve.find("ui pane", {kind: PANE.FULL})) {
    panes.push(pane(paneId));
  }
  if(uiState.prompt.open && uiState.prompt.prompt && !uiState.prompt.paneId) {
    panes.push({c: "shade", click: closePrompt, children: [
      uiState.prompt.prompt()
    ]});
  }
  if(!localStorage["hideBanner"]) {
    panes.unshift({id: "feedback-banner", c: "banner", children: [
      {c: "content", children: [
        {text: "This is an early release of Eve meant for "},
        {t: "a", c: "link", href: "https://groups.google.com/forum/#!forum/eve-talk", text: "feedback"},
        {text: ". We're shooting for quality over quantity, so please don't post this to HN, Reddit, etc, but feel free to share it with friends."},
      ]},
      {c: "flex-grow spacer"},
      {t: "button", c: "ion-close", click: hideBanner}
    ]})
  }
  panes.unshift({c: "feedback-bar", children: [
    {t: "a", target: "_blank", href: "https://github.com/witheve/Eve/issues", text: "bugs"},
    {t: "a", target: "_blank", href: "https://groups.google.com/forum/#!forum/eve-talk", text: "suggestions"},
    {t: "a", target: "_blank", href: "https://groups.google.com/forum/#!forum/eve-talk", text: "discussion"},
  ]})
  return {c: "wiki-root", id: "root", children: panes};
}

function hideBanner(event, elem) {
  localStorage["hideBanner"] = true;
  dispatch("").commit();
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
    // let parent = eve.findOne("ui pane parent", {pane: paneId})["parent"];
    return {
      c: "window",
      captureClicks: true,
      header: {t: "header", c: "", children: [
        // {t: "button", c: "ion-android-search", click: navigateParent, link: entityId, paneId, text:""},
        // {t: "button", c: "ion-ios-close-empty", click: navigateParent, link: entityId, paneId, text:""},
        // {t: "button", c: "ion-ios-upload-outline", click: navigateParent, link: entityId, paneId, text:""},
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
  let root = eve.findOne("ui pane", {kind: PANE.FULL})["pane"];
  dispatch("remove popup", {paneId: elem.paneId})
  .dispatch("set pane", {paneId: root, contains: elem.link})
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
    eve.deleteDB();
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
  localStorage["local-eve"] = "";
  window.location.href = `${window.location.origin}/`;
}


function savePrompt():Element {
  let serialized = localStorage[eveLocalStorageKey];
  let blob = new Blob([serialized], {type: "application/json"});
  let url = URL.createObjectURL(blob);
  return {c: "modal-prompt save-prompt", children: [
    {t: "header", c: "flex-row", children: [
      {t: "h2", text: "Save DB"},
      {c: "flex-grow"},
      {c: "controls", children: [{c: "ion-close-round", click: closePrompt}]}
    ]},
    {t: "a", href: url, download: "save.evedb", text: "save to file"}
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
  else if(eve.findOne("query to id", {query: contains.trim().toLowerCase()})) contentType = "search";

  if(params.rep || rep) {
    params["search"] = contains;
    content = represent(contains, params.rep || rep, results, params, (params.unwrapped ? undefined : (elem, ix?) => uitk.card({id: `${paneId}|${contains}|${ix === undefined ? "" : ix}`, children: [elem]})));
    content.t = "content";
    content.c = `${content.c || ""} ${params.unwrapped ? "unwrapped" : ""}`;
  }

  var disambiguation:Element;
  if(contentType === "invalid") {
    disambiguation = {c: "flex-row spaced-row disambiguation", children: [
      {t: "span", text: `I couldn't find anything; should I`},
      {t: "a", c: "link btn add-btn", text: `add ${contains}`, name: contains, paneId, click: createPage },
      {t: "span", text: "?"},
    ]};
    content = undefined;
  } else if(contentType === "search") {
    // @TODO: This needs to move into Eve's notification / chat bar
    disambiguation = {id: "search-disambiguation", c: "flex-row spaced-row disambiguation", children: [
      {text: "Or should I"},
      {t: "a", c: "link btn add-btn", text: `add a card`, name: contains, paneId, click: createPage},
      {text: `for ${contains}?`}
    ]};
  }

  let scroller = content;

  if(kind === PANE.FULL) {
    let panes = eve.find("ui pane").filter((pane) => pane.kind !== PANE.FULL);
    let children = [content].concat(panes.map((p) => pane(p.pane)));
    scroller = {c: "scroller", children};
  }

  let curPane:Element = {c: `wiki-pane ${klass || ""}`, paneId, children: [header, disambiguation, scroller, footer]};
  let pos = eve.findOne("ui pane position", {pane: paneId});
  if(pos) {
    // curPane.style = `left: ${isNaN(pos.x) ? pos.x : pos.x + "px"}; top: ${isNaN(pos.y) ? pos.y : (pos.y + 20) + "px"};`;
  }
  if(captureClicks) {
    curPane.click = preventDefault;
  }

  if(uiState.prompt.open && uiState.prompt.paneId === paneId) {
    curPane.children.push(
      {c: "shade", paneId, click: closePrompt},
      uiState.prompt.prompt(paneId)
    );
  }
  return curPane;
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
  .dispatch("set pane", {paneId: elem["paneId"], contains: entity, rep: "entity", params: ""}).commit();
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

//---------------------------------------------------------
// Wiki editor functions
//---------------------------------------------------------
function parseParams(rawParams:string) {
  let params = {};
  if(!rawParams) return params;
  for(let kv of rawParams.split(";")) {
    let [key, value] = kv.split("=");
    if(!key || !key.trim()) continue;
    value = value.trim();
    if(!value) throw new Error("Must specify value for key '" + key + "'");
    
    if(value[0] === "{" && value[value.length - 1] === "}" || value[0] === "[" && value[value.length - 1] === "]") {
      try {
        let result = JSON.parse(value);
        value = result;
      } catch(err) { }
    }
    params[key.trim()] = coerceInput(value);
  }
  return params;
}
function stringifyParams(params:{}):string {
  let rawParams = "";
  if(!params) return rawParams;
  for(let key in params) {
    if(params[key] === undefined || params[key] === null) continue;
    rawParams += `${rawParams.length ? "; " : ""}${key} = ${typeof params[key] === "object" ? JSON.stringify(params[key]) : params[key]}`;
  }
  return rawParams;
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

    let parsed = safeNLParse(content);
    let currentParse = parsed[0];
    if(currentParse.intent === Intents.NORESULT) {
      params["rep"] = "error";
      return params;
    }
    let context = currentParse.context;
    let hasCollections = context.collections.length;
    let field;
    let rep;
    let aggregates = [];
    // console.log(currentParse.query.toString())
    for(let fxn of context.fxns) {
      if(fxn.fxn.type === FunctionTypes.AGGREGATE) {
        aggregates.push(fxn);
      }
    }
    let totalFound = 0;
    for(let item of ["attributes", "entities", "collections", "fxns", "maybeAttributes", "maybeEntities", "maybeCollections", "maybeFunctions"]) {
      totalFound += context[item].length;
    }
    console.log(context);
    if(aggregates.length === 1 && context["groupings"].length === 0) {
      rep = "result";
      field = aggregates[0].fxn.projectedAs;
    } else if(!hasCollections && context.fxns.length === 1 && context.fxns[0].fxn.type !== FunctionTypes.BOOLEAN) {
      rep = "result";
      field = context.fxns[0].fxn.projectedAs;
    } else if(!hasCollections && context.attributes.length === 1) {
      rep = "result";
      field = context.attributes[0].attribute.projectedAs;
    } else if(context.entities.length + context.fxns.length === totalFound) {
      // if there are only entities and boolean functions then we want to show this as cards
      params["rep"] = "entity";
    } else if(currentParse.query && currentParse.query.projects.length) {
      staticOrMappedTable(content, params);
    } else {
      // Error state, unknown entity
      params["rep"] = "error";
    }
    if(rep) {
      params["rep"] = rep;
      params["field"] = field;
    }
  }
  console.log("PARAMS", params);
  return params;
}

var paneEditors = {};


//---------------------------------------------------------

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
    let parsed = safeNLParse(cleaned);
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
  state.activeTile = undefined;
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
  // elem.click = activateTile;
  elem.children = [
    {c: "tile-content-wrapper", children: elem.children},
    {c: "edit ion-edit", click: activateTile, cardId, tileId, entityId, source},
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
      if(value === "" || value === undefined) continue;
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
    let valueElem:any = {c: "value", data, value: current, autolink: !active};
    if(rep === "externalImage") {
      valueElem.url = current;
      valueElem.text = undefined;
    }
    let ui:Element = {c: "value-wrapper", data, children: [uitk[rep](valueElem)]};
    if(active) {
      ui["cardId"] = cardId;
      ui["storeAttribute"] = "itemsToRemove";
      ui["storeId"] = source;
      ui.click = toggleListTileItem;
      if(state.activeTile.itemsToRemove && state.activeTile.itemsToRemove[source]) {
        ui.c = `${ui.c || ""} marked-to-remove`;
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
      replaceValue = `"${replaceValue.replace(/\"/g, '\\"')}"`;
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
    ui = uitk.value({c: "value", data, value: value.eav.value});
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

  return {c: "tile-scroll", children: [{c: "tiles", children: rows}]};
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
        {c: "ion-android-search visible", paneId, click: focusOrSetSearch}
      ]},
      codeMirrorElement({
        c: `flex-grow wiki-search-input ${state.focused ? "selected": ""}`,
        paneId,
        autoFocus: true,
        value: name,
        focus: focusSearch,
        // blur: setSearch,
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

function focusOrSetSearch(event, elem) {
  let target = <HTMLElement>document.querySelector(".wiki-search-input");
  let cm:CodeMirror.Editor = target["cm"];
  let state:any = uiState.widget.search[elem.paneId] || {value: ""};
  let rawVal = cm.getDoc().getValue();
  let value = rawVal !== undefined ? rawVal : state.value;
  let pane = eve.findOne("ui pane", {pane: elem.paneId});

  if(!pane || pane.contains !== (asEntity(value) || value)) {
    let {chain, isSetSearch} = dispatchSearchSetAttributes(value);
    chain.dispatch("insert query", {query: value})
      .dispatch("set pane", {paneId: elem.paneId, contains: value})
      .commit();
  } else {
    cm.focus();
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
  autoFocus?: boolean
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
      if(elem.autoFocus) cm.focus();
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
  result(results, params) {
    let elem = _prepare["CSV"](results, params);
    elem.search = params["search"];
    return elem;
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
        // var editor = prepareCardEditor(entityId, paneId);
        entities.push({entity: result[field], data: params, editor: {}});
      }
    }
    return entities;
  },
  error(results, params) {
    return {text: params["message"]};
  },
  mappedTable(results, params:{paneId?: string, data?: {paneId?: string}, search: string, entity?:string, subject: string, groups?:string[], fieldMap}) {
    let paneId = params.paneId || params.data && params.data.paneId;
    let key = `${paneId}|${params.search}`;
    let state =  uiState.widget.table[key];
    if(!state) {
      state = uiState.widget.table[key] = {sortField: undefined, sortDirection: 1, adders: [{}], changes: []};
    }
    params["sortable"] = true;
    params["rows"] = results;
    params["state"] = state;
    return params;
  },
  table(results, params:{paneId?: string, data?: {paneId?: string}, search: string}) {
    let paneId = params.paneId || params.data && params.data.paneId;
    let key = `${paneId}|${params.search}`;
    let state =  uiState.widget.table[key];
    if(!state) {
      state = uiState.widget.table[key] = {sortField: undefined, sortDirection: 1};
    }
    params["rows"] = results;
    params["state"] = state;
    return params;
    //return {rows: results, fields, state, groups: groupings, sortable: true, data: params.data};
  },
  directory(results, params:{data?:{}, field?:string}) {
    //let entities = getEntitiesFromResults(results, {fields: params.field ? [params.field] : undefined});
    let entities = [builtinId("entity")];
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
        if(wrapEach) return {c: "flex-column", children: [wrapEach(uitk[rep](embedParams))]};
        else return {c: "flex-column", children: [uitk[rep](embedParams)]};
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
