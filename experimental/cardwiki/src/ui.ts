import {parse as marked, Renderer as MarkedRenderer} from "../vendor/marked";
import {Element} from "./microReact";
import {eve} from "./app";

enum BLOCK { TEXT, PROJECTION };

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
        let onClick = `app.dispatch('setSearch', {value: '${value}', searchId: '${paneId}'}).commit();`;
        replacement = `<a class="link attribute entity" data-attribute="${attr}" onclick="${onClick}">${value}</a>`;

      } else if(type === "collection") {
        let attr = content.slice(0, colonIx !== -1 ? colonIx : undefined).trim();
        let onClick = `app.dispatch('setSearch', {value: '${value}', searchId: '${paneId}'}).commit();`;
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
// Wiki UI
//---------------------------------------------------------
export function root():Element {
  let panes = [];
  for(let {pane:paneId} of eve.find("ui pane")) {
    panes.push(pane(paneId));
  }
  return {c: "wiki-root test", children: panes};
}

// Add search functionality + Pane Chrome
export function pane(paneId:string):Element {
  let {contains:entityId} = eve.findOne("ui pane", {pane: paneId}) || {};
  return {c: "wiki-pane", children: [
    {c: "header", children: [
      {c: "title", text: "some title here"},
      {c: "controls pane-controls", children: [
        {c: "icon-search"},
        {c: "icon-minimize"},
        {c: "icon-close"}
      ]}
    ]},
    entity(entityId, paneId)
  ]};
}

export function entity(entityId:string, paneId:string):Element {
  let blocks = [];
  for(let {block:blockId} of eve.find("content blocks", {entity: entityId})) blocks.push(block(blockId, paneId));
  return {c: "wiki-entity", children: blocks};
}

export function block(blockId:string, paneId:string):Element {
  let {content, kind} = eve.findOne("content blocks", {block: blockId}) || {};
  // @FIXME: Add kind to content blocks;
  kind = BLOCK.TEXT;
  let html = "";
  if(kind === BLOCK.TEXT) {
    html = entityToHTML(paneId, content);
  } else {
    throw new Error(`UNKNOWN BLOCK KIND: '${kind}' (${BLOCK[kind]})`);
  }

  return {c: "wiki-block", dangerouslySetInnerHTML: html};
}