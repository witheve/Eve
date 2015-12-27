"use strict"
import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import {Element} from "./microReact";
import * as runtime from "./runtime";
import {TokenTypes, StepType, getTokens, queryToExecutable} from "./queryParser";
import {eve} from "./app";
import * as app from "./app";
import * as microReact from "./microReact";
import * as utils from "./utils";

declare var CodeMirror;
declare var pluralize;
declare var uuid;

const MAX_NUMBER = runtime.MAX_NUMBER;

//---------------------------------------------------------
// Entity
//---------------------------------------------------------

export var coerceInput = utils.coerceInput;

var breaks = /[{}\|:\n#"]/;
var types = {
  "#": "header",
  "{": "link open",
  "}": "link close",
  ":": "assignment",
  "\"": "text",
}
function tokenize(entity) {
  let line = 0;
  let ix = 0;
  let len = entity.length;
  let tokens = [];
  let cur = {ix, line, type: "text", text: ""};
  for(; ix < len; ix++) {
    let ch = entity[ix];
    if(ch.match(breaks)) {
      let type = types[ch];
      if(type === "text") {
        ch = entity[++ix];
        while(ch && ch !== "\"") {
          if(ch === "\n") line++;
          cur.text += ch;
          ch = entity[++ix];
        }
        tokens.push(cur);
        ix++;
        cur = {ix: ix+1, line, type: "text", text: ""};
        continue;
      }
      if(ch === "\n") line++;
      if(cur.text !== "" || cur.line !== line) {
        tokens.push(cur);
      }
      if(ch === "\n") {
        cur = {ix: ix+1, line, type: "text", text: ""};
        continue;
      }
      cur = {ix, line, type, text: ch};
      tokens.push(cur);
      if(types[cur.text]) {
        cur.type = types[cur.text];
      }
      if(type === "header") {
        //trim the next character if it's a space between the header indicator
        //and the text;
        if(entity[ix+1] === " ") ix++;
      }
      cur = {ix: ix+1, line, type: "text", text: ""};
    } else {
      cur.text += ch;
    }
  }
  tokens.push(cur);
  return tokens;
}

function parse(tokens) {
  let links = [];
  let eavs = [];
  let collections = [];
  let state:any = {items: []};
  let lines = [];
  let line;
  let lineIx = -1;
  for(let token of tokens) {
    if(token.line !== lineIx) {
      // this accounts for blank lines.
      while(lineIx < token.line) {
        line = {ix: token.line, header: false, items: []};
        lines.push(line);
        lineIx++;
      }
    }
    let {type} = token;
    switch(type) {
      case "header":
        line.header = true;
        break;
      case "link open":
        state.capturing = true;
        state.mode = "link";
        state.items.push(token);
        break;
      case "link close":
        state.items.push(token);
        state.type = "link";
        if(state.mode === "assignment") {
          if(state.attribute === "is a") {
            state.type = "collection";
            state.link = state.value;
          } else {
            state.type = "eav";
          }
          eavs.push(state);
        } else {
          state.type = "eav";
          state.attribute = "generic related to";
          state.value = state.link;
          eavs.push(state);
        }
        line.items.push(state);
        state = {items: []};
        break;
      case "assignment":
        if(!state.capturing) {
          token.type = "text";
          line.items.push(token);
          break;
        }
        state.mode = "assignment";
        state.attribute = state.link;
        break;
      case "text":
        if(!state.capturing) {
          line.items.push(token);
        } else if(state.mode === "link") {
          state.link = token.text.trim();
          state.items.push(token);
        } else if(state.mode === "assignment") {
          state.value = coerceInput(token.text.trim());
          state.items.push(token);
        }
        break;
    }
  }
  return {lines, links, collections, eavs};
}

var parseCache;
function parseEntity(entityId, content) {
  if(!parseCache) parseCache = {};
  let cached = parseCache[entityId];
  if(!cached || cached[0] !== content) {
    cached = parseCache[entityId] = [content, parse(tokenize(content))];
  }
  return cached[1];
}

function CodeMirrorElement(node, elem) {
  let cm = node.editor;
  if(!cm) {
    cm = node.editor = new CodeMirror(node, {
      mode: "gfm",
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          commitEntity(cm, latest);
          },
          "Ctrl-Enter": (cm) => {
                let latest = app.renderer.tree[elem.id];
                commitEntity(cm, latest);
          }
      }
    });
    if(elem.onInput) {
      cm.on("change", elem.onInput)
    }
    if(elem.keydown) {
      cm.on("keydown", (cm) => { elem.keydown(cm, elem); });
    }
    if(elem.blur) {
      cm.on("blur", (cm) => { elem.blur(cm, elem); });
    }
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function NewBitEditor(node, elem) {
  let cm = node.editor;
  if(!cm) {
    cm = node.editor = new CodeMirror(node, {
      mode: "gfm",
      lineWrapping: true,
      extraKeys: {
        "Cmd-Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          submitAction(cm, latest);
        },
        "Ctrl-Enter": (cm) => {
            let latest = app.renderer.tree[elem.id];
            submitAction(cm, latest);
        }
      }
    });
    if(elem.onInput) {
      cm.on("change", elem.onInput)
    }
    if(elem.keydown) {
      cm.on("keydown", (cm) => { elem.keydown(cm, elem); });
    }
    if(elem.blur) {
      cm.on("blur", (cm) => { elem.blur(cm, elem); });
    }
    cm.focus();
    cm.setValue("\n");
    // create a line widget
    let widget = document.createElement("div");
    widget.className = "header-line";
    cm.addLineWidget(0, widget);
    cm.addLineClass(0, "text", "header");
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function CMSearchBox(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      lineWrapping: true,
      extraKeys: {
        "Enter": (cm) => {
          let latest = app.renderer.tree[elem.id];
          app.dispatch("setSearch", {value: cm.getValue(), searchId: latest.searchId}).commit();
        }
      }
    });
    cm.on("change", (cm) => {
      let value = cm.getValue();
      let tokens = getTokens(value);
      for(let mark of state.marks) {
        mark.clear();
      }
      state.marks = [];
      for(let token of tokens) {
        let start = cm.posFromIndex(token.pos);
        let stop = cm.posFromIndex(token.pos + token.orig.length);
        state.marks.push(cm.markText(start, stop, {className: TokenTypes[token.type].toLowerCase()}));
      }
    });
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function entityToGraph(entityId, content) {
  let parsed = parseEntity(entityId, content);
  let links = [];
  for(let link of parsed.links) {
    links.push({link: link.link.toLowerCase(), type: (link.linkType || "unknown").toLowerCase()});
  }
  for(let collection of parsed.collections) {
    links.push({link: collection.link.toLowerCase(), type: "collection"});
  }
  return links;
}

//---------------------------------------------------------
// Wiki
//---------------------------------------------------------

var dragging = null;

app.handle("startEditingEntity", (result, info) => {
  result.add("editing", {editing: true, search: info.searchId});
});

app.handle("stopEditingEntity", (result, info) => {
  if(!eve.findOne("editing")) return;
  result.remove("editing");
  let {entity, value} = info;
  entity = entity.trim().toLowerCase();
  if(!entity) return;
  var blockId = entity + "|manual content block";
  if(!eve.findOne("manual eav", {entity: blockId})) {
    result.add("manual eav", {entity: blockId, attribute: "is a", value: "content block"});
    result.add("manual eav", {entity: blockId, attribute: "source", value: "manual"});
    result.add("manual eav", {entity: blockId, attribute: "associated entity", value: entity});
  } else {
    result.remove("manual eav", {entity: blockId, attribute: "content"});
  }
  result.add("manual eav", {entity: blockId, attribute: "content", value});
});

app.handle("setSearch", (result, info) => {
  let searchId = info.searchId;
  let search = eve.findOne("search query", {id: searchId})["search"];
  if(search === info.value) return;

  if(!eve.findOne("history stack", {entity: search})) {
    let stack = eve.find("history stack");
    result.add("history stack", {entity: search, pos: stack.length});
  }
  let newSearchValue = info.value.trim();
  app.activeSearches[searchId] = queryToExecutable(newSearchValue);
  result.remove("builtin search query", {id: searchId});
  result.add("builtin search query", {id: searchId, search: newSearchValue});
});

app.handle("submitAction", (result, info) => {
  let searchId = info.searchId;
  let search = eve.findOne("search query", {id: searchId})["search"];
  result.merge(saveSearch(search, app.activeSearches[searchId].executable));
  if(info.type === "attribute") {
    if(!info.entity || !info.attribute || !info.value) return;
    result.merge(addEavAction(search, info.entity, info.attribute, info.value));
  } else if(info.type === "collection") {
    result.merge(addToCollectionAction(search, info.entity, info.collection));
  } else if(info.type === "bit") {
    let template = info.template.trim();
    if(template[0] !== "#") {
      template = "# " + template;
    }
    result.merge(addBitAction(search, template));
  }
});

app.handle("addNewSearch", (result, info) => {
  let id = uuid();
  let search = info.search || "";
  app.activeSearches[id] = queryToExecutable(search);
  result.add("builtin search", {id, top: info.top || 100, left: info.left || 100});
  result.add("builtin search query", {id, search});
});

app.handle("addNewSyntaxSearch", (result, info) => {
  let id = uuid();
  let code = info.search || "";
  result.add("builtin syntax search", {id, top: info.top || 100, left: info.left || 100});
  result.add("builtin syntax search code", {id, code});
});

app.handle("removeSearch", (result, info) => {
  let {searchId} = info;
  if(!searchId) return;
  result.remove("builtin search", {id: searchId});
  result.remove("builtin search query", {id: searchId});
  result.remove("builtin syntax search", {id: searchId});
  result.remove("builtin syntax search code", {id: searchId});
  for(let view of eve.find("builtin syntax search view", {id: searchId})) {
    let diff = removeView(view.view);
    result.merge(diff);
  }
  result.remove("builtin syntax search view", {id: searchId});
  result.remove("builtin syntax search error", {id: searchId});
  app.activeSearches[searchId] = null;
});

app.handle("startAddingAction", (result, info) => {
  result.remove("adding action");
  result.add("adding action", {type: info.type, search: info.searchId});
});

app.handle("stopAddingAction", (result, info) => {
  result.remove("adding action");
});

app.handle("removeAction", (result, info) => {
  if(info.type === "eav") {
    result.merge(removeAddEavAction(info.actionId));
  } else if(info.type === "collection") {
    result.merge(removeAddToCollectionAction(info.actionId));
  } else if(info.type === "bit") {
    result.merge(removeAddBitAction(info.actionId));
  }
});

app.handle("startDragging", (result, info) => {
  let {searchId, x, y} = info;
  let pos = eve.findOne("search", {id: searchId});
  if(!pos) {
    pos = eve.findOne("builtin syntax search", {id: searchId});
  }
  dragging = {id: searchId, offsetTop: y - pos.top, offsetLeft: x - pos.left, action: info.action || "moveSearch"};
});

app.handle("stopDragging", (result, info) => {
  dragging = null;
});

app.handle("moveSearch", (result, info) => {
  let {searchId, x, y} = info;
  if(eve.findOne("builtin search", {id: searchId})) {
    result.remove("builtin search", {id: searchId});
    result.add("builtin search", {id: searchId, top: y - dragging.offsetTop, left: x - dragging.offsetLeft});
  } else {
    result.remove("builtin syntax search", {id: searchId});
    result.add("builtin syntax search", {id: searchId, top: y - dragging.offsetTop, left: x - dragging.offsetLeft});
  }
});

app.handle("resizeSearch", (result, info) => {
  let {searchId, x, y} = info;
  let type = "builtin search size";
  let pos = eve.findOne("builtin search", {id: searchId});
  if(!pos) {
    pos = eve.findOne("builtin syntax search", {id: searchId});
  }
  result.remove("builtin search size", {id: searchId});
  let height = y - pos.top + 5;
  let width = x - pos.left + 5;
  if(width <= 100) {
    width = 100;
  }
  if(height <= 100) {
    height = 100;
  }
  result.add(type, {id: searchId, width, height});
});

app.handle("toggleShowPlan", (result, info) => {
  if(eve.findOne("showPlan", {search: info.searchId})) {
    result.remove("showPlan", {search: info.searchId});
  } else {
    result.add("showPlan", {search: info.searchId});
  }
});

export function root() {
  if(window["slides"]) {
    return window["slides"].root();
  } else {
    return eveRoot();
  }
}

export function eveRoot():Element {
  let searchers = [];
  for(let search of eve.find("search")) {
    searchers.push(newSearchResults(search.id));
  }
  for(let search of eve.find("builtin syntax search")) {
    searchers.push(syntaxSearch(search.id));
  }
  return {id: "root", c: "root", dblclick: addNewSearch, children: [
//       slideControls(),
    {c: "canvas", mousemove: maybeDrag, mouseup:stopDragging, children: searchers},
  ]};
}

function maybeDrag(e, elem) {
  if(dragging) {
    app.dispatch(dragging.action, {searchId: dragging.id, x: e.clientX, y: e.clientY}).commit();
    e.preventDefault();
  }
}

function addNewSearch(e, elem) {
  if(e.target.classList.contains("canvas")) {
    if(e.shiftKey) {
      app.dispatch("addNewSyntaxSearch", {top: e.clientY, left: e.clientX}).commit();
    } else {
      app.dispatch("addNewSearch", {top: e.clientY, left: e.clientX}).commit();
    }
    e.preventDefault();
  }
}

function injectEmbeddedSearches(node:HTMLElement, elem:Element) {
  let embedded:HTMLElement[] = <any>node.querySelectorAll("[data-embedded-search]");
  for(let embed of embedded) {
    let search, searchId, searchText = embed.getAttribute("data-embedded-search");
    for(let id in app.activeSearches) {
      if(app.activeSearches[id].text === searchText) {
        searchId = id;
        break;
      }
    }
    if(searchId) search = app.activeSearches[searchId];
    else {
      searchId = uuid();
      search = app.activeSearches[searchId] = queryToExecutable(searchText);
    }
    // @FIXME: Horrible, horrible kludge.
    let subRenderer = new microReact.Renderer();
    let contents = entityContents(elem["searchId"], searchId, search);
    subRenderer.render(contents.elems);
    let node = subRenderer.content;
    if(contents.inline) {
        embed.classList.add("inline");
        let inlineContainer = document.createElement("span");
        while(node.children.length) {
            inlineContainer.appendChild(node.firstChild);
        }
        node = inlineContainer;
    }
    embed.appendChild(node);
  }
}

var markedEntityRenderer = new MarkedRenderer();
markedEntityRenderer.heading = function(text:string, level: number) {
  return `<h${level}>${text}</h${level}>`; // override auto-setting an id based on content.
};
function entityToHTML(entityId:string, searchId:string, content:string, passthrough?: string[]):string {
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
      if(eve.findOne("collection", {collection: value.toLowerCase()})) type = "collection";
      else if(eve.findOne("entity", {entity: value.toLowerCase()})) type = "entity";
      else if(passthrough && passthrough.indexOf(value) !== -1) type = "passthrough";
      else if(colonIx === -1) type = "query";

      if(type === "attribute") {
        let attr = content.slice(0, colonIx).trim();
        replacement = `<span class="attribute" data-attribute="${attr}">${value}</span>`;

      } else if(type === "entity") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('setSearch', {value: '${value}', searchId: '${searchId}'}).commit();`;
        replacement = `<a class="link attribute entity" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "collection") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('setSearch', {value: '${value}', searchId: '${searchId}'}).commit();`;
        replacement = `<a class="link attribute collection" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "query") {
        //throw new Error("@TODO: Implement embedded projections");
        // add postRender to newSearch pane container that checks for data-search attribute. If it exists, compile the search template for each of them and insert.
        let containerId = `${searchId}|${content}|${queryCount++}`;
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

function entityUi(entityId, instance:string|number = "", searchId) {
  let entityBlocks = eve.find("content blocks", {entity: entityId});
  let entityViews = [];
  for(let block of entityBlocks) {
    let isManual = eve.findOne("entity eavs", {entity: block.block, attribute: "source", value: "manual"});
    let entityView;
    if(isManual) {
      if(!eve.findOne("editing", {search: searchId})) {
        entityView = {
        id: `${block.block}${instance}`,
        c: "entity",
        searchId,
        entity: entityId,
        dangerouslySetInnerHTML: entityToHTML(entityId, searchId, block.content),
        postRender: injectEmbeddedSearches,
        dblclick: editEntity
      };
      } else {
        entityView = {id: `${block.block}${instance}|editor`, c: "entity editor", entity: entityId, searchId, postRender: CodeMirrorElement, value: block.content, blur: commitEntity};
      }
      entityViews.unshift(entityView);
    } else {
      let source = eve.findOne("entity eavs", {entity: block.block, attribute: "source"}).value;
      //strip the header
      let content = block.content;
      content = content.substring(content.indexOf("\n"));

      let children:Element[] = [{dangerouslySetInnerHTML: entityToHTML(entityId, searchId, content)}];
      children.push({c: "source-link ion-help", text: "", click: followLink, linkText: source, searchId});
      entityView = {id: `${block.block}${instance}`, c: "entity generated", searchId, entity: entityId, children};
      entityViews.push(entityView);
    }
  }
  if(entityViews.length === 0) {
    if(!eve.findOne("editing", {search: searchId})) {
      entityViews.push({id: `${entityId}${instance}`, c: "entity", searchId, entity: entityId, children: [{c: "placeholder", text: "Add a description"}], dblclick: editEntity});
    } else {
      entityViews.push({id: `${entityId}${instance}|editor`, c: "entity editor", entity: entityId, searchId, postRender: CodeMirrorElement, value: "", blur: commitEntity});
    }
  }
  let relatedBits = [];
  for(let incoming of eve.find("entity links", {link: entityId})) {
    if(incoming.entity === entityId) continue;
    if(eve.findOne("entity eavs", {entity: incoming.entity, attribute: "is a", value: "content block"})) continue;
    if(eve.findOne("entity eavs", {entity: incoming.entity, attribute: "is a", value: entityId})) continue;
    relatedBits.push({c: "entity link", click: followLink, searchId, linkText: incoming.entity, text: incoming.entity});
  }
  if(relatedBits.length) {
    entityViews.push({c: "entity related-bits", children: [
      {text: "Related cards: "},
      {c: "related-list", children: relatedBits}
    ]});
  }

  return {c: "entity-container", children: [
    {c: "entity-blocks", children: entityViews},
  ]};
}

function searchDescription(tokens, plan) {
  let planChildren = [];
  for(let step of plan) {
    if(step.type === StepType.GATHER) {
      let related = step.relatedTo ? "related to those" : "";
      let coll = "anything"
      if(step.subject) {
        coll = pluralize(step.subject, 2);
      }
      planChildren.push({c: "text collection", text: `gather ${coll} ${related}`});
    } else if(step.type === StepType.INTERSECT) {
      if(step.deselected) {
        planChildren.push({c: "text", text: `remove the ${pluralize(step.subject, 2)}`});
      } else {
        planChildren.push({c: "text", text: `keep only the ${pluralize(step.subject, 2)}`});
      }
    } else if(step.type === StepType.LOOKUP) {
      planChildren.push({c: "text attribute", text: `lookup ${step.subject}`});
    } else if(step.type === StepType.FIND) {
      planChildren.push({c: "text entity", text: `find ${step.subject}`});
    } else if(step.type === StepType.FILTERBYENTITY) {
      if(step.deselected) {
        planChildren.push({c: "text entity", text: `remove anything related to ${step.subject}`});
      } else {
        planChildren.push({c: "text entity", text: `related to ${step.subject}`});
      }
    } else if(step.type === StepType.FILTER) {
      planChildren.push({c: "text operation", text: `filter those by ${step.subject}`});
    } else if(step.type === StepType.SORT) {
      planChildren.push({c: "text operation", text: `sort them`});
    } else if(step.type === StepType.GROUP) {
      planChildren.push({c: "text operation", text: `group them`});
    } else if(step.type === StepType.LIMIT) {
      let limit;
      if(step.limit.results) {
        limit = `to ${step.limit.results} results`;
      } else {
        limit = `to ${step.limit.perGroup} items per group`;
      }
      planChildren.push({c: "text operation", text: `limit ${limit}`});
    } else if(step.type === StepType.CALCULATE) {
      planChildren.push({c: "text operation", text: `calculate ${step.func}`});
    } else if(step.type === StepType.AGGREGATE) {
      planChildren.push({c: "text operation", text: `${step.subject}`});
    } else {
      planChildren.push({c: "text", text: `${step.type}->`});
    }
  }
  planChildren.unshift();
  return {c: "plan-container", children: [
    {c: "description", text: "Search plan:"},
    {c: "search-plan", children: planChildren}
  ]};
}

export function entityContents(paneId:string, searchId:string, search): {elems: Element[], inline?: boolean} {
  let plan = search.plan;
  if(!plan.length)
    return {inline: true, elems: [{t: "span", c: "link", text: search.queryString, linkText: search.queryString, click:followLink, searchId: paneId}]};

  let contents = [];
  let singleton = true;
  if(plan.length === 1 && (plan[0].type === StepType.FIND || plan[0].type === StepType.GATHER)) {
    contents.push({c: "singleton", children: [entityUi(plan[0].subject || plan[0].subject, searchId, searchId)]});
  } else singleton = false;

  // If we're just looking up an attribute for a specific entity, embed that value
  if(plan.length === 2 && plan[0].type === StepType.FIND && plan[1].type === StepType.LOOKUP) {
    let results = search.executable.exec();
    let text;
    if(!results.results.length) {
        text = `('${search.queryString}' was not found)`;
    } else {
        text = results.results[0][plan[1].name];
    }
    return {inline: true, elems: [{t: "span", c: "attribute", text}]};
  }

  if(singleton) return {elems: contents};
  let resultItems = [];
  contents.push({c: "results", id: "root", children: resultItems});
  let headers = []
  // figure out what the headers are
  for(let step of plan) {
    if(step.type === StepType.FILTERBYENTITY || step.type === StepType.INTERSECT) continue;
    if(step.size === 0) continue;
    headers.push({text: step.name});
  }

  let groupedFields = {};
  // figure out what fields are grouped, if any
  for(let step of plan) {
    if(step.type === StepType.GROUP) {
      groupedFields[step.subjectNode.name] = true;
    } else if(step.type === StepType.AGGREGATE) {
      groupedFields[step.name] = true;
    }
  }

  let results = search.executable.exec();
  let groupInfo = results.groupInfo;
  let planLength = plan.length;
  let itemClass = planLength > 1 ? " bit" : " link list-item";
  row: for(let ix = 0, len = results.unprojected.length; ix < len; ix += search.executable.unprojectedSize) {
    if(groupInfo && ix > groupInfo.length) break;
    if(groupInfo && groupInfo[ix] === undefined) continue;

    // Get content row to insert into
    let resultItem;
    if(groupInfo && resultItems[groupInfo[ix]]) resultItem = resultItems[groupInfo[ix]];
    else if(groupInfo) resultItem = resultItems[groupInfo[ix]] = {c: "path", children: []};
    else {
      resultItem = {c: "path", children: []};
      resultItems.push(resultItem);
    }

    let planOffset = 0;
    for(let planIx = 0; planIx < planLength; planIx++) {
      let planItem = plan[planIx];
      let item, id = `${searchId} ${ix} ${planIx}`;
      if(planItem.size) {
        let resultPart = results.unprojected[ix + planOffset + planItem.size - 1];
        if(!resultPart) continue row;
        let text, klass, click, link;
        if(planItem.type === StepType.GATHER) {
          item = {id, c: `${itemClass} entity bit`, text: resultPart["entity"], click: followLink, searchId: paneId, linkText: resultPart["entity"]};
        } else if(planItem.type === StepType.LOOKUP) {
          item = {id, c: `${itemClass} attribute`, text: resultPart["value"]};
        } else if(planItem.type === StepType.AGGREGATE) {
          item = {id, c: `${itemClass} value`, text: resultPart[planItem.name]};
        } else if(planItem.type === StepType.FILTERBYENTITY || planItem.type === StepType.INTERSECT) {
          // we don't really want these to show up.
        } else if(planItem.type === StepType.CALCULATE) {
          item = {id, c: `${itemClass} value`, text: resultPart["result"]};
        } else {
          item = {id, c: itemClass, text: JSON.stringify(resultPart)};
        }
        if(item) {
          if(groupedFields[planItem.name] && !resultItem.children[planIx]) {
            resultItem.children[planIx] = {c: "sub-group", children: [item]};
          } else if(!groupedFields[planItem.name] && !resultItem.children[planIx]) {
            resultItem.children[planIx] = {c: "sub-group", children: [item]};
          } else if(!groupedFields[planItem.name]) {
            resultItem.children[planIx].children.push(item);
          }
          if(planLength === 1) resultItem.c = "path list-row";
        }
        planOffset += planItem.size;
      }
    }
  }
  resultItems.unshift({c: "search-headers", children: headers});

  return {elems: contents};
}

export function newSearchResults(searchId) {
  let {top, left} = eve.findOne("search", {id: searchId});
  let search = eve.findOne("search query", {id: searchId})["search"];
  let {tokens, plan, executable} = app.activeSearches[searchId];
  let resultItems = [];
  let groupedFields = {};
  if(executable && plan.length && (plan.length > 1 || plan[0].type === StepType.GATHER)) {
    // figure out what fields are grouped, if any
    for(let step of plan) {
      if(step.type === StepType.GROUP) {
        groupedFields[step.subjectNode.name] = true;
      } else if(step.type === StepType.AGGREGATE) {
        groupedFields[step.name] = true;
      }
    }

    let results = executable.exec();
    let groupInfo = results.groupInfo;
    let planLength = plan.length;
    row: for(let ix = 0, len = results.unprojected.length; ix < len; ix += executable.unprojectedSize) {
      if(groupInfo && ix > groupInfo.length) break;
      if(groupInfo && groupInfo[ix] === undefined) continue;
      let resultItem;
      if(groupInfo && !resultItems[groupInfo[ix]]) {
        resultItem = resultItems[groupInfo[ix]] = {c: "path", children: []};
      } else if(!groupInfo) {
        resultItem = {c: "path", children: []};
        resultItems.push(resultItem);
      } else {
        resultItem = resultItems[groupInfo[ix]];
      }
      let planOffset = 0;
      for(let planIx = 0; planIx < planLength; planIx++) {
        let planItem = plan[planIx];
        if(planItem.size) {
          let resultPart = results.unprojected[ix + planOffset + planItem.size - 1];
          if(!resultPart) continue row;
          let text, klass, click, link;
          if(planItem.type === StepType.GATHER) {
            text = resultPart["entity"];
            klass = "entity";
            click = followLink;
            link = resultPart["entity"];
          } else if(planItem.type === StepType.LOOKUP) {
            text = resultPart["value"];
            klass = "attribute";
          } else if(planItem.type === StepType.AGGREGATE) {
            text = resultPart[planItem.subject];
            klass = "value";
          } else if(planItem.type === StepType.FILTERBYENTITY || planItem.type === StepType.INTERSECT) {
            // we don't really want these to show up.
          } else if(planItem.type === StepType.CALCULATE) {
            text = JSON.stringify(resultPart.result);
            klass = "value";
          } else {
            text = JSON.stringify(resultPart);
          }
          if(text !== undefined) {
            klass += planLength > 1 ? " bit" : " link list-item";
            let item = {id: `${searchId} ${ix} ${planIx}`, c: `${klass}`, text, click, searchId, linkText: link};
            if(groupedFields[planItem.name] && !resultItem.children[planIx]) {
              resultItem.children[planIx] = {c: "sub-group", children: [item]};
            } else if(!groupedFields[planItem.name] && !resultItem.children[planIx]) {
              resultItem.children[planIx] = {c: "sub-group", children: [item]};
            } else if(!groupedFields[planItem.name]) {
              resultItem.children[planIx].children.push(item);
            }
            if(planLength === 1) {
              resultItem.c = "path list-row";
            }
          }
          planOffset += planItem.size;
        }
      }
    }
  }
  let entityContent = [];
  let noHeaders = false;
  if(plan.length === 1 && plan[0].type === StepType.FIND) {
    entityContent.push({c: "singleton", children: [entityUi(plan[0].subject, searchId, searchId)]});
  } else if(plan.length === 1 && plan[0].type === StepType.GATHER) {
    entityContent.unshift({c: "singleton", children: [entityUi(plan[0].subject, searchId, searchId)]});
    let text = `There are no ${pluralize(plan[0].subject, resultItems.length)} in the system.`;
    if(resultItems.length > 0) {
      text = `There ${pluralize("are", resultItems.length)} ${resultItems.length} ${pluralize(plan[0].subject, resultItems.length)}:`;
    }
    resultItems.unshift({c: "description", text});
    noHeaders = true;
  } else if(plan.length === 0) {
    entityContent.push({c: "singleton", children: [entityUi(search.toLowerCase(), searchId, searchId)]});
  } else {
    let headers = []
    // figure out what the headers are
    if(!noHeaders) {
      for(let step of plan) {
        if(step.type === StepType.FILTERBYENTITY || step.type === StepType.INTERSECT) continue;
        if(step.size === 0) continue;
        headers.push({text: step.name});
      }
    }
    resultItems.unshift({c: "search-headers", children: headers});
  }

  let actions = [];
  for(let bitAction of eve.find("add bit action", {view: search})) {
    let {template, action} = bitAction;
    actions.push({c: "action new-bit", children: [
      {c: "bit entity", dangerouslySetInnerHTML: entityToHTML(action, searchId, template, Object.keys(executable.projectionMap))},
      {c: "remove ion-android-close", click: removeAction, actionType: "bit", actionId: bitAction.action}
    ]})
  }

  let actionContainer;
  let addActionChildren = [];
  let adding = eve.findOne("adding action", {search: searchId});
  if(adding) {
    if(adding.type === "bit") {
      addActionChildren.push({c: "add-card-editor", children: [
        {c: "new-bit-editor", searchId, value: "\n", postRender: NewBitEditor},
        {c: "spacer"},
        //         {c: "button", text: "submit", click: submitAction},
        {c: "ion-android-close close", click: stopAddingAction},
      ]});
    }
  }
  if(plan.length && plan[0].type !== StepType.FIND) {
    let text = "Add a card";
    if(actions.length) {
      text = "Add another card"
    }
    actionContainer = {c: "actions-container", children: [
      {c: "actions-header", children: [
        {c: "add-card-link", text: text, actionType: "bit", searchId, click: startAddingAction},
//         {c: "spacer"},
//         {c: "", text: "+", actionType: "bit", searchId, click: startAddingAction}
      ]},
      actions.length ? {c: "actions", children: actions} : undefined,
    ]};
  }

  let size = eve.findOne("builtin search size", {id: searchId});
  let width, height;
  if(size) {
    width = size.width;
    height = size.height;
  }

  let isDragging = dragging && dragging.id === searchId ? "dragging" : "";
  let showPlan = eve.findOne("showPlan", {search: searchId}) ? searchDescription(tokens, plan) : undefined;
  return {id: `${searchId}|container`, c: `container search-container ${isDragging}`, top, left, width, height, children: [
    {c: "search-input", mousedown: startDragging, mouseup: stopDragging, searchId, children: [
      {c: "search-box", value: search, postRender: CMSearchBox, searchId},
      {c: "spacer"},
      {c: `ion-ios-arrow-${showPlan ? 'up' : 'down'} plan`, click: toggleShowPlan, searchId},
      {c: "ion-android-close close", click: removeSearch, searchId},
    ]},
    {c: "container-content", children: [
        showPlan,
        {c: "entity-content", children: entityContent},
        resultItems.length ? {c: "search-results", children: resultItems} : {},
        actionContainer,
        {c: "add-action", children: addActionChildren},
    ]},
    {c: "resize", mousedown: startDragging, mouseup: stopDragging, searchId, action: "resizeSearch"}
  ]};
}

function removeAction(e, elem) {
  app.dispatch("removeAction", {type: elem.actionType, actionId: elem.actionId}).commit();
}

function toggleShowPlan(e, elem) {
  app.dispatch("toggleShowPlan", {searchId: elem.searchId}).commit();
}

function startDragging(e, elem) {
  if(e.target === e.currentTarget) {
    app.dispatch("startDragging", {searchId: elem.searchId, x: e.clientX, y: e.clientY, action: elem.action}).commit();
  }
}

function stopDragging(e, elem) {
  if(!dragging) return;
  app.dispatch("stopDragging", {}).commit();
}

function removeSearch(e, elem) {
  app.dispatch("removeSearch", {searchId: elem.searchId}).commit();
}

function startAddingAction(e, elem) {
  app.dispatch("startAddingAction", {type: elem.actionType, searchId: elem.searchId}).commit();
}

function stopAddingAction(e, elem) {
  app.dispatch("stopAddingAction", {}).commit();
}

function submitAction(e, elem) {
  let values:any = {type: eve.findOne("adding action")["type"],
                    searchId: elem.searchId};
  if(values.type === "bit") {
    if(e.getValue) {
      values.template = e.getValue();
    } else {
      let editor = e.currentTarget.parentNode.querySelector("new-bit-editor").editor;
      values.template = editor.getValue();
    }
  } else {
    let parent = e.currentTarget.parentNode;
    for(let child of parent.childNodes) {
      if(child.nodeName === "INPUT") {
        values[child.className] = child.value;
      }
    }
  }
  app.dispatch("submitAction", values)
      .dispatch("stopAddingAction", {})
      .commit();
}

function commitEntity(cm, elem) {
  app.dispatch("stopEditingEntity", {searchId: elem.searchId, entity: elem.entity, value: cm.getValue()}).commit();
}

function editEntity(e, elem) {
  app.dispatch("startEditingEntity", {searchId: elem.searchId, entity: elem.entity}).commit();
  e.preventDefault();
}

function followLink(e, elem) { // @DEPRECATED
  app.dispatch("setSearch", {value: elem.linkText, searchId: elem.searchId}).commit();
}

function saveSearch(name, query) {
  if(!eve.findOne("view", {view: name})) {
    query.name = name;
    let diff = queryObjectToDiff(query);
    return diff;
  } else {
    return eve.diff();
  }
}

function addToCollectionAction(name, field, collection) {
  let diff = eve.diff();
  // add an action
  let action = `${name}|${field}|${collection}`;
  diff.add("add collection action", {view: name, action, field, collection});
  diff.add("action", {view: "added collections", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": name});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": field});
  diff.add("action mapping constant", {action, from: "collection", value: collection});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddToCollectionAction(action) {
  let info = eve.findOne("add collection action", {action});
  if(info) {
    let diff = addToCollectionAction(info.view, info.field, info.collection);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function addEavAction(name, entity, attribute, field) {
  let diff = eve.diff();
  // add an action
  let action = `${name}|${entity}|${attribute}|${field}`;
  diff.add("add eav action", {view: name, action, entity, attribute, field,});
  diff.add("action", {view: "added eavs", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": name});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": entity});
  diff.add("action mapping", {action, from: "value", "to source": action, "to field": field});
  diff.add("action mapping constant", {action, from: "attribute", value: attribute});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddEavAction(action) {
  let info = eve.findOne("add eav action", {action});
  if(info) {
    let diff = addEavAction(info.view, info.entity, info.attribute, info.field);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function addBitAction(name, template) {
  // console.log(name, "|", template, "|", query);
  let diff = eve.diff();
  // add an action
  let bitQueryId = `${name}|bit`;
  let action = `${name}|${template}`;
  diff.add("add bit action", {view: name, action, template});
//   diff.remove("add bit action", {view: name});
  let bitQuery = eve.query(bitQueryId)
                  .select("add bit action", {view: name}, "action")
                  .select(name, {}, "table")
                  .calculate("bit template", {row: ["table"], name, template: ["action", "template"], action: ["action", "action"]}, "result")
                  .project({entity: ["result", "entity"], attribute: ["result", "attribute"], value: ["result", "value"]});
  diff.merge(queryObjectToDiff(bitQuery));
  // diff.merge(removeView(bitQueryId));
  diff.add("action", {view: "generated eav", action, kind: "union", ix: 1});
  // a source
  diff.add("action source", {action, "source view": bitQueryId});
  // a mapping
  diff.add("action mapping", {action, from: "entity", "to source": action, "to field": "entity"});
  diff.add("action mapping", {action, from: "attribute", "to source": action, "to field": "attribute"});
  diff.add("action mapping", {action, from: "value", "to source": action, "to field": "value"});
  diff.add("action mapping constant", {action, from: "source view", value: name});
  return diff;
}

function removeAddBitAction(action) {
  let info = eve.findOne("add bit action", {action});
  if(info) {
    let diff = addBitAction(info.view, info.template);
    return diff.reverse();
  } else {
    return eve.diff();
  }
}

export function removeView(view) {
  return runtime.Query.remove(view, eve);
}

export function clearSaved() {
  let diff = eve.diff();
  diff.remove("view");
  diff.remove("action");
  diff.remove("action source");
  diff.remove("action mapping");
  diff.remove("action mapping constant");
  diff.remove("action mapping sorted");
  diff.remove("action mapping limit");
  diff.remove("add collection action");
  diff.remove("add eav action");
  return diff;
}

//---------------------------------------------------------
// Syntax search
//---------------------------------------------------------

app.handle("setSyntaxSearch", (result, info) => {
  let searchId = info.searchId;
  let code = eve.findOne("builtin syntax search code", {id: searchId})["code"];
  if(code === info.code) return;

  let newSearchValue = info.code.trim();
  let wrapped = newSearchValue;
  if(wrapped.indexOf("(query") !== 0) {
    wrapped = `(query :$$view "${searchId}"\n${wrapped})`;
  }
  // remove the old one
  for(let view of eve.find("builtin syntax search view", {id: searchId})) {
    let diff = removeView(view.view);
    result.merge(diff);
  }
  result.remove("builtin syntax search view", {id: searchId});
  result.remove("builtin syntax search error", {id: searchId});

  try {
    var parsed = window["parser"].parseDSL(wrapped);
    for(let view in parsed.views) {
      result.add("builtin syntax search view", {id: searchId, view});
    }
    result.merge(window["parser"].asDiff(eve, parsed));
  } catch(e) {
    result.add("builtin syntax search error", {id: searchId, error: e.toString()})
  }

  result.remove("builtin syntax search code", {id: searchId});
  result.add("builtin syntax search code", {id: searchId, code: newSearchValue});
});


function CMSyntaxEditor(node, elem) {
  let cm = node.editor;
  if(!cm) {
    let state = {marks: []};
    cm = node.editor = new CodeMirror(node, {
      mode: "clojure",
      lineWrapping: true,
      extraKeys: {
        "Ctrl-Enter": (cm) => {
          app.dispatch("setSyntaxSearch", {searchId:elem.searchId, code: cm.getValue()}).commit();
        },
        "Cmd-Enter": (cm) => {
          app.dispatch("setSyntaxSearch", {searchId:elem.searchId, code: cm.getValue()}).commit();
        }
      }
    });
    cm.on("change", (cm) => {
//       let value = cm.getValue();
//       let tokens = newSearchTokens(value);
//       for(let mark of state.marks) {
//         mark.clear();
//       }
//       state.marks = [];
//       for(let token of tokens) {
//         let start = cm.posFromIndex(token.pos);
//         let stop = cm.posFromIndex(token.pos + token.orig.length);
//         state.marks.push(cm.markText(start, stop, {className: token.type}));
//       }
    });
    cm.focus();
  }
  if(cm.getValue() !== elem.value) {
    cm.setValue(elem.value);
  }
}

function syntaxSearch(searchId) {
  let {top, left} = eve.findOne("builtin syntax search", {id: searchId});
  let code = eve.findOne("builtin syntax search code", {id: searchId})["code"];
  let isDragging = dragging && dragging.id === searchId ? "dragging" : "";
  let error = eve.findOne("builtin syntax search error", {id: searchId});
  let resultUi;
  if(!error) {
    let results = eve.find(searchId);
    let fields = Object.keys(results[0] || {}).filter((field) => field !== "__id");
    let headers = [];
    for(let field of fields) {
      headers.push({c: "header", text: field});
    }
    let resultItems = [];
    for(let result of results) {
      let fieldItems = [];
      for(let field of fields) {
        fieldItems.push({c: "field", text: result[field]});
      }
      resultItems.push({c: "row", children: fieldItems});
    }
    resultUi = {c: "results", children: [
      {c: "headers", children: headers},
      {c: "rows", children: resultItems}
    ]};
  } else {
    resultUi = {c: "error", text: error.error};
  }

  let size = eve.findOne("builtin search size", {id: searchId});
  let width, height;
  if(size) {
    width = size.width;
    height = size.height;
  }
  return {id: `${searchId}|container`, c: `container search-container ${isDragging} syntax-search`, top, left, width, height, children: [
    {c: "search-input", mousedown: startDragging, searchId, children: [
      {c: "search-box syntax-editor", value: code, postRender: CMSyntaxEditor, searchId},
      {c: "ion-android-close close", click: removeSearch, searchId},
    ]},
    resultUi,
    {c: "resize", mousedown: startDragging, searchId, action: "resizeSearch"}
  ]};
}


//---------------------------------------------------------
// AST and compiler
//---------------------------------------------------------

// view: view, kind[union|query|table]
// action: view, action, kind[select|calculate|project|union|ununion|stateful|limit|sort|group|aggregate], ix
// action source: action, source view
// action mapping: action, from, to source, to field
// action mapping constant: action, from, value

var recompileTrigger = {
  exec: () => {
    for(let view of eve.find("view")) {
      if(view.kind === "table") continue;
      let query = compile(eve, view.view);
      eve.asView(query);
    }
    return {};
  }
}

eve.addTable("view", ["view", "kind"]);
eve.addTable("action", ["view", "action", "kind", "ix"]);
eve.addTable("action source", ["action", "source view"]);
eve.addTable("action mapping", ["action", "from", "to source", "to field"]);
eve.addTable("action mapping constant", ["action", "from", "value"]);
eve.addTable("action mapping sorted", ["action", "ix", "source", "field", "direction"]);
eve.addTable("action mapping limit", ["action", "limit type", "value"]);

eve.table("view").triggers["recompile"] = recompileTrigger;
eve.table("action").triggers["recompile"] = recompileTrigger;
eve.table("action source").triggers["recompile"] = recompileTrigger;
eve.table("action mapping").triggers["recompile"] = recompileTrigger;
eve.table("action mapping constant").triggers["recompile"] = recompileTrigger;
eve.table("action mapping sorted").triggers["recompile"] = recompileTrigger;
eve.table("action mapping limit").triggers["recompile"] = recompileTrigger;

function queryObjectToDiff(query:runtime.Query) {
  return query.changeset(eve);
}
// add the added collections union so that sources can be added to it by
// actions.
var diff = eve.diff();
diff.add("view", {view: "generated eav", kind: "union"});
eve.applyDiff(diff);


export function compile(ixer, viewId) {
  let view = ixer.findOne("view", {view: viewId});
  if(!view) {
    throw new Error(`No view found for ${viewId}.`);
  }
  let compiled = ixer[view.kind](viewId);
  let actions = ixer.find("action", {view: viewId});
  if(!actions) {
    throw new Error(`View ${viewId} has no actions.`);
  }
  // sort actions by ix
  actions.sort((a, b) => a.ix - b.ix);
  for(let action of actions) {
    let actionKind = action.kind;
    if(actionKind === "limit") {
      let limit = {};
      for(let limitMapping of ixer.find("action mapping limit", {action: action.action})) {
        limit[limitMapping["limit type"]] = limitMapping["value"];
      }
      compiled.limit(limit);
    } else if(actionKind === "sort" || actionKind === "group") {
      let sorted = [];
      let mappings = ixer.find("action mapping sorted", {action: action.action});
      mappings.sort((a, b) => a.ix - b.ix);
      for(let mapping of mappings) {
        sorted.push([mapping["source"], mapping["field"], mapping["direction"]]);
      }
      if(sorted.length) {
        compiled[actionKind](sorted);
      } else {
        throw new Error(`${actionKind} without any mappings: ${action.action}`)
      }
    } else {
      let mappings = ixer.find("action mapping", {action: action.action});
      let mappingObject = {};
      for(let mapping of mappings) {
        let source = mapping["to source"];
        let field = mapping["to field"];
        if(actionKind === "union" || actionKind === "ununion") {
          mappingObject[mapping.from] = [field];
        } else {
          mappingObject[mapping.from] = [source, field];
        }
      }
      let constants = ixer.find("action mapping constant", {action: action.action});
      for(let constant of constants) {
        mappingObject[constant.from] = constant.value;
      }
      let source = ixer.findOne("action source", {action: action.action});
      if(!source && actionKind !== "project") {
        throw new Error(`${actionKind} action without a source in '${viewId}'`);
      }
      if(actionKind !== "project") {
        compiled[actionKind](source["source view"], mappingObject, action.action);
      } else {
        compiled[actionKind](mappingObject);
      }
    }
  }
  return compiled;
}

//---------------------------------------------------------
// Eve functions
//---------------------------------------------------------

runtime.define("entity to graph", {multi: true}, function(entity, text) {
  return entityToGraph(entity, text);
});

runtime.define("parse eavs", {multi: true}, function(entity, text) {
  return parseEntity(entity, text).eavs;
});

runtime.define("bit template", {multi: true}, function(row, name, template, action) {
  let content = template;
  for(let key in row) {
    let item = row[key];
    content = content.replace(new RegExp(`{${key.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")}}`, "gi"), item);
  }
  let entity;
  let header = content.match(/#.*$/mgi);
  if(header) {
    entity = header[0].replace("#", "").toLowerCase().trim();
  } else {
    entity = `${name}|${row.__id}`;
  }
  let blockId = `${action}|${row.__id}`;
  return [{entity: blockId, attribute: "is a", value: "content block"},
          {entity: blockId, attribute: "associated entity", value: entity},
          {entity: blockId, attribute: "content", value: content},
          {entity: blockId, attribute: "source", value: name}];
});

runtime.define("collection content", {}, function(collection) {
  return {content: `# ${pluralize(collection, 2)}`};
});


//---------------------------------------------------------
// Queries
//---------------------------------------------------------

// eve.addTable("manual entity", ["entity", "content"]);
// eve.addTable("action entity", ["entity", "content", "source"]);

// eve.asView(eve.union("entity")
//               .union("manual entity", {entity: ["entity"], content: ["content"]})
//               .union("action entity", {entity: ["entity"], content: ["content"]})
//               .union("unmodified added bits", {entity: ["entity"], content: ["content"]})
//               .union("automatic collection entities", {entity: ["entity"], content: ["content"]}));

// eve.asView(eve.query("unmodified added bits")
//               .select("added bits", {}, "added")
//               .deselect("manual entity", {entity: ["added", "entity"]})
//               .project({entity: ["added", "entity"], content: ["added", "content"]}));

// eve.asView(eve.query("parsed eavs")
//             .select("entity", {}, "entity")
//             .calculate("parse eavs", {entity: ["entity", "entity"], text: ["entity", "content"]}, "parsed")
//             .project({entity: ["entity", "entity"], attribute: ["parsed", "attribute"], value: ["parsed", "value"]}));

// eve.asView(eve.union("entity eavs")
//             .union("added collections", {entity: ["entity"], attribute: "is a", value: ["collection"]})
//             .union("parsed eavs", {entity: ["entity"], attribute: ["attribute"], value: ["value"]})
//             // this is a stored union that is used by the add eav action to take query results and
//             // push them into eavs, e.g. sum salaries per department -> [total salary = *]
//             .union("added eavs", {entity: ["entity"], attribute: ["attribute"], value: ["value"]}));

// eve.asView(eve.query("is a attributes")
//               .select("entity eavs", {attribute: "is a"}, "is a")
//               .project({collection: ["is a", "value"], entity: ["is a", "entity"]}));

// @HACK: this view is required because you can't currently join a select on the result of a function.
// so we create a version of the eavs table that already has everything lowercased.
// eve.asView(eve.query("lowercase eavs")
//               .select("entity eavs", {}, "eav")
//               .calculate("lowercase", {text: ["eav", "value"]}, "lower")
//               .project({entity: ["eav", "entity"], attribute: ["eav", "attribute"], value: ["lower", "result"]}));

// eve.asView(eve.query("entity links")
//               .select("lowercase eavs", {}, "eav")
//               .select("entity", {entity: ["eav", "value"]}, "entity")
//               .project({entity: ["eav", "entity"], link: ["entity", "entity"], type: ["eav", "attribute"]}));

// eve.asView(eve.union("directionless links")
//               .union("entity links", {entity: ["entity"], link: ["link"]})
//               .union("entity links", {entity: ["link"], link: ["entity"]}));

// eve.asView(eve.union("collection entities")
//             // the rest of these are editor-level views
//             .union("is a attributes", {entity: ["entity"], collection: ["collection"]})
//             // this is a stored union that is used by the add to collection action to take query results and
//             // push them into collections, e.g. people older than 21 -> [[can drink]]
//             .union("added collections", {entity: ["entity"], collection: ["collection"]}));

// eve.asView(eve.query("collection")
//             .select("collection entities", {}, "collections")
//             .group([["collections", "collection"]])
//             .aggregate("count", {}, "count")
//             .project({collection: ["collections", "collection"], count: ["count", "count"]}));

// eve.asView(eve.query("automatic collection entities")
//               .select("collection", {}, "coll")
//               .deselect("manual entity", {entity: ["coll", "collection"]})
//               .calculate("collection content", {collection: ["coll", "collection"]}, "content")
//               .project({entity: ["coll", "collection"], content: ["content", "content"]}));

//---------------------------------------------------------
// Go
//---------------------------------------------------------

function initSearches() {
  for(let search of eve.find("builtin search")) {
    app.activeSearches[search.id] = queryToExecutable(eve.findOne("builtin search query", {id: search.id})["search"]);
  }
}

// @TODO: KILL ME
import "./bootstrap";

function initEve() {
  let stored = localStorage[app.eveLocalStorageKey];
  if(!stored) {
    var diff = eve.diff();
    let id = uuid();
    diff.add("builtin search", {id, top: 100, left: 100});
    diff.add("builtin search query", {id, search: "foo"});
    eve.applyDiffIncremental(diff);
  }
  initSearches();
}

app.renderRoots["wiki"] = root;
app.init("wiki", function() {
  document.body.classList.add(localStorage["theme"] || "light");
  app.activeSearches = {};
  initEve();
});

declare var exports;
window["wiki"] = exports;
