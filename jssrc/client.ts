import {clone, debounce} from "./util";
import {sentInputValues, activeIds, activeChildren, renderRecords, renderEditor} from "./renderer"
import {handleEditorParse} from "./editor"

console.log("SUP G");

//---------------------------------------------------------
// Utilities
//---------------------------------------------------------

function safeEav(eav) {
  if(eav[0].type == "uuid")  {
    eav[0] = `⦑${eav[0].value}⦒`
  }
  if(eav[1].type == "uuid")  {
    eav[1] = `⦑${eav[1].value}⦒`
  }
  if(eav[2].type == "uuid")  {
    eav[2] = `⦑${eav[2].value}⦒`
  }
  return eav;
}

type IndexedList = {[v: string]: string[]}
type IndexSubscriber = (index: IndexedList, dirty?: IndexedList, self?:Index) => void
class Index {
  public index:IndexedList = {};
  public dirty:IndexedList = {};
  private subscribers:IndexSubscriber[] = [];

  constructor(public attribute:string) {}

  insert(v: any, e: string) {
    if(!this.index[v] || this.index[v].indexOf(e) === -1) {
      if(!this.index[v]) this.index[v] = [];
      if(!this.dirty[v]) this.dirty[v] = [];
      this.index[v].push(e);
      this.dirty[v].push(e);
      return true;
    }
    return false;
  }

  remove(v: any, e: string) {
    if(!this.index[v]) return false;

    let ix = this.index[v].indexOf(e)
    if(ix !== -1) {
      if(!this.dirty[v]) this.dirty[v] = [];
      this.index[v][ix] = this.index[v].pop();
      this.dirty[v].push(e);
      return true;
    }
    return false;
  }

  subscribe(subscriber:IndexSubscriber) {
    if(this.subscribers.indexOf(subscriber) === -1) {
      this.subscribers.push(subscriber);
      return true;
    }
    return false;
  }

  unsubscribe(subscriber:IndexSubscriber) {
    let ix = this.subscribers.indexOf(subscriber);
    if(ix !== -1) {
      this.subscribers[ix] = this.subscribers.pop();
      return true;
    }
    return false;
  }

  dispatchIfDirty() {
    if(Object.keys(this.dirty).length === 0) return;
    for(let subscriber of this.subscribers) {
      subscriber(this.index, this.dirty, this);
    }
    this.dirty = {};
  }
};

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
export var DEBUG:string|boolean = "state";
interface ClientState {
  entities: {root?: any, [id:string]: any},
  dirty: {root?: any, [id:string]: any},
}
export var state:ClientState = {entities: {}, dirty: {}};
export var indexes = {
  byName: new Index("name"),
  byTag: new Index("tag"),
  byClass: new Index("class"),
  byStyle: new Index("style"),
};

function handleDiff(state, diff) {
  let diffEntities = 0;
  let entitiesWithUpdatedValues = {};
  let {entities, dirty} = state;

  for(let remove of diff.remove) {
    let [e, a, v] = safeEav(remove);
    if(!entities[e]) {
      console.error(`Attempting to remove an attribute of an entity that doesn't exist: ${e}`);
      continue;
    }
    if(!dirty[e]) dirty[e] = [];
    let entity = entities[e];
    let values = entity[a];
    if(!values) continue;
    dirty[e].push(a);
    if(values.constructor !== Array || values.length <= 1) {
      delete entity[a];
    } else {
      let ix = values.indexOf(v);
      if(ix === -1) continue;
      values.splice(ix, 1);
    }

    // Update indexes
    if(a === "name") indexes.byName.remove(v, e);
    if(a === "tag") indexes.byTag.remove(v, e);
    if(a === "class") indexes.byClass.remove(v, e);
    if(a === "style") indexes.byStyle.remove(v, e);

    // Update active*
    if(a === "children" && activeChildren[v] === e) {
      delete activeChildren[v];
    }

    if(a === "value") {
      entitiesWithUpdatedValues[e] = true;
    }
  }

  for(let insert of diff.insert) {
    let [e, a, v] = safeEav(insert);
    if(!entities[e]) {
      entities[e] = {};
      diffEntities++;
    }
    if(!dirty[e]) dirty[e] = [];
    dirty[e].push(a);
    let entity = entities[e];
    if(!entity[a]) {
      entity[a] = v;
    } else if(entity[a] == v) {
      // do nothing (this really shouldn't happen, our diff is weird then)
      console.error(`Received a diff setting ${entity}["${a}"] = ${v} (the existing value)`);
      continue;
    } else if(entity[a].constructor !== Array) {
      entity[a] = [entity[a], v];
    } else {
      entity[a].push(v);
    }

    // Update indexes
    if(a === "name") indexes.byName.insert(v, e);
    if(a === "tag") indexes.byTag.insert(v, e);
    if(a === "class") indexes.byClass.insert(v, e);
    if(a === "style") indexes.byStyle.insert(v, e);


    // Update active*
    if(a === "children") {
      if(activeChildren[v]) console.error(`Unable to handle child element ${v} parented to two parents (${activeChildren[v]}, ${e}). Overwriting.`);
      activeChildren[v] = e;
    }

    if(a === "value") {
      entitiesWithUpdatedValues[e] = true;
    }
  }

  // Update value syncing
  for(let e in entitiesWithUpdatedValues) {
    let a = "value";
    let entity = entities[e];
    if(!entity[a]) {
      sentInputValues[e] = [];
    } else {
      if(entity[a].constructor === Array) console.error("Unable to set 'value' multiple times on entity", e, entity[a]);
      let sent = sentInputValues[e];
      if(sent && sent[0] === entity[a]) {
        let ix;
        while((ix = dirty[e].indexOf(a)) !== -1) {
          dirty[e].splice(ix, 1);
        }
        sent.shift();
      } else {
        sentInputValues[e] = [];
      }
    }
  }
  for(let indexName in indexes) {
    let index:Index = indexes[indexName];
    index.dispatchIfDirty();
  }
}

let prerendering = false;
var frameRequested = false;

var socket = new WebSocket("ws://" + window.location.host +"/ws");
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    handleDiff(state, data);
    renderRecords(state);

    let diffEntities = 0;
    if(DEBUG) {
      console.groupCollapsed(`Received Result +${data.insert.length}/-${data.remove.length} (∂Entities: ${diffEntities})`);
      if(DEBUG === true || DEBUG === "diff") {
        console.table(data.insert);
        console.table(data.remove);
      }
      if(DEBUG === true || DEBUG === "state") {
        // we clone here to keep the entities fresh when you want to thumb through them in the log later (since they are rendered lazily)
        let copy = clone(state.entities);

        console.log("Entities", copy);
        console.log("Indexes", indexes);
      }
      console.groupEnd();
    }

    if(document.readyState === "complete") {
      renderEditor();
    } else if(!prerendering) {
      prerendering = true;
      document.addEventListener("DOMContentLoaded", function() {
        renderEditor();
      });
    }

  } else if(data.type == "error") {
    console.error(data.message, data);
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
  onHashChange({});
}
socket.onclose = function() {
  console.log("Disconnected from eve server!");
}

//---------------------------------------------------------
// Bootstrapping interface
//---------------------------------------------------------
export var parseInfo = {blocks: [], lines: []};

let updateEditorParse = debounce(handleEditorParse, 0);

function tokensToParseInfo(index, dirty) {
  if(!dirty["token"]) return;

  let tokenIds = index["token"];
  let lines = [];
  for(let tokenId of tokenIds) {
    let token = state.entities[tokenId];
    if(!lines[token.line]) {
      lines[token.line] = [];
    }
    lines[token.line].push(token);
  }
  parseInfo.lines = lines;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(tokensToParseInfo);

function blocksToParseInfo(index, dirty) {
  if(!dirty["block"]) return;
  let blockIds = index["block"];
  let blocks = [];
  for(let blockId of blockIds) {
    let block = state.entities[blockId];
    blocks.push(block);
  }
  parseInfo.blocks = blocks;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(blocksToParseInfo);

//---------------------------------------------------------
// Communication helpers
//---------------------------------------------------------

export function formatObjects(objs) {
  let rows = [];
  for(let obj of objs) {
    let id;
    let kvs = {};
    let fields = [];
    for(let key in obj) {
      let value = obj[key];
      if(key == "tags") {
        for(let tag of value) {
          fields.push("#" + tag);
        }
        kvs["tag"] = value
      } else if(key == "id") {
        id = obj[key];
      } else {
        let stringValue;
        if(typeof value == "string" && value[0] == "⦑") {
          stringValue = value;
        } else {
          stringValue = JSON.stringify(value);
        }
        fields.push(key + ": " + stringValue);
        kvs[key] = stringValue;
      }
    }
    if(id) {
        console.log(kvs);
      for(let key in kvs) {
        let value = kvs[key];
        if(value.prototype !== Array) {
          rows.push(`[#eav entity: ${id}, attribute: "${key}", value: ${value}]`);
        } else {
          for(let elem of value) {
            rows.push(`[#eav entity: ${id}, attribute: "${key}", value: ${elem}]`);
          }
        }
      }
    } else {
      let final = "[" + fields.join(", ") + "]";
      rows.push(final)
    }
  }
  return rows;
}

export function sendEventObjs(objs) {
  if(!objs.length) return;
  let query = `handle some event
  \`\`\`
  bind
    ${formatObjects(objs).join("\n    ")}
  \`\`\``
  return sendEvent(query);
}

export function sendEvent(query) {
  //console.log("QUERY", query);
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "event", type: "query", query}))
  }
  return query;
}

export function sendSwap(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "swap", query}))
  }
}

export function sendSave(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "save", query}))
  }
}

export function sendParse(query) {
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({scope: "root", type: "parse", query}))
  }
}

//---------------------------------------------------------
// Handlers
//---------------------------------------------------------

function onHashChange(event) {
  let hash = window.location.hash.substr(1);
  if(hash[0] == "/") hash = hash.substr(1);
  let segments = hash.split("/").map(function(seg, ix) {
    return `[index: ${ix + 1}, value: "${seg}"]`;
  });
  let query =
  `hash changed remove any current url segments
    \`\`\`
    match
      url = [#url hash-segment]
    commit
      url.hash-segment -= hash-segment
    \`\`\`\n\n`;
  if(hash !== "") {
    query +=
    `hash changed if there isn't already a url, make one
      \`\`\`
      match
        not([#url])
      commit
        [#url hash-segment: ${segments.join(" ")}]
      \`\`\`
        \n\n` +
    `add the new hash-segments if there is
      \`\`\`
      match
        url = [#url]
      commit
        url <- [hash-segment: ${segments.join(" ")}]
      \`\`\`
    `;
  }
  sendEvent(query);
}

window.addEventListener("hashchange", onHashChange);
