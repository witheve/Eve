import {clone, debounce, sortComparator} from "./util";
import {sentInputValues, activeIds, activeChildren, renderRecords, renderEve} from "./renderer"
import {handleEditorParse} from "./editor"

//---------------------------------------------------------
// Utilities
//---------------------------------------------------------
type EAV = [string, string, any];
type Record = any;

function safeEav(eav:[any, any, any]):EAV {
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

type IndexSubscriber<T> = (index: T, dirty?: T, self?: Index<T>) => void
class Index<T> {
  public index:T = {} as any;
  public dirty:T = {} as any;
  private subscribers:IndexSubscriber<T>[] = [];

  constructor(public attribute?:string) {}

  subscribe(subscriber:IndexSubscriber<T>) {
    if(this.subscribers.indexOf(subscriber) === -1) {
      this.subscribers.push(subscriber);
      return true;
    }
    return false;
  }

  unsubscribe(subscriber:IndexSubscriber<T>) {
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
  }

  clearDirty() {
    this.dirty = {} as any;
  }
}

interface IndexedList<V>{[v: string]: V[]}
class IndexList<V> extends Index<IndexedList<V>> {
  insert(key: string, value: V) {
    if(!this.index[key] || this.index[key].indexOf(value) === -1) {
      if(!this.index[key]) this.index[key] = [];
      if(!this.dirty[key]) this.dirty[key] = [];
      this.index[key].push(value);
      this.dirty[key].push(value);
      return true;
    }
    return false;
  }

  remove(key: string, value: V) {
    if(!this.index[key]) return false;

    let ix = this.index[key].indexOf(value)
    if(ix !== -1) {
      if(!this.dirty[key]) this.dirty[key] = [];
      this.index[key][ix] = this.index[key].pop();
      this.dirty[key].push(value);
      return true;
    }
    return false;
  }
};

interface IndexedScalar<V>{[v: string]: V}
class IndexScalar<V> extends Index<IndexedScalar<V>> {
  insert(key: string, value: V) {
    if(this.index[key] === undefined) {
      this.index[key] = value;
      this.dirty[key] = value;
      return true;
    } else if(this.index[key] !== value) {
      throw new Error(`Unable to set multiple values on scalar index for key: '${key}' old: '${this.index[key]}' new: '${value}'`);
    }
    return false;
  }

  remove(key: string, value: V) {
    if(this.index[key] === undefined) return false;

    this.dirty[key] = this.index[key];
    delete this.index[key];
    return true;
  }
}

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
export var DEBUG:string|boolean = "state";

export var indexes = {
  records: new IndexScalar<Record>(),      // E -> Record
  dirty: new IndexList<string>(),          // E -> A
  byName: new IndexList<string>("name"),   // name -> E
  byTag: new IndexList<string>("tag"),     // tag -> E
  byClass: new IndexList<string>("class"), // class -> E
  byStyle: new IndexList<string>("style"), // style -> E
};

function handleDiff(state, diff) {
  let diffEntities = 0;
  let entitiesWithUpdatedValues = {};

  let records = indexes.records;
  let dirty = indexes.dirty;

  for(let remove of diff.remove) {
    let [e, a, v] = safeEav(remove);
    if(!records.index[e]) {
      console.error(`Attempting to remove an attribute of an entity that doesn't exist: ${e}`);
      continue;
    }

    let entity = records.index[e];
    let values = entity[a];
    if(!values) continue;
    dirty.insert(e, a);

    if(values.length <= 1) {
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
    let entity = records.index[e];
    if(!entity) {
      entity = {};
      records.insert(e, entity);
      diffEntities++; // Nuke this and use records.dirty
    }

    dirty.insert(e, a);

    if(!entity[a]) entity[a] = [];
    entity[a].push(v);

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
    let entity = records.index[e];
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
  // Trigger all the subscribers of dirty indexes
  for(let indexName in indexes) {
    indexes[indexName].dispatchIfDirty();
  }
  // Clear dirty states afterwards so a subscriber of X can see the dirty state of Y reliably
  for(let indexName in indexes) {
    indexes[indexName].clearDirty();
  }
}

let prerendering = false;
var frameRequested = false;

var socket = new WebSocket("ws://" + window.location.host +"/ws");
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    let state = {entities: indexes.records.index, dirty: indexes.dirty.index};
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
      renderEve();
    } else if(!prerendering) {
      prerendering = true;
      document.addEventListener("DOMContentLoaded", function() {
        renderEve();
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

let updateEditorParse = debounce(handleEditorParse, 1);

function tokensToParseInfo(index, dirty) {
  if(!dirty["token"]) return;
  let records = indexes.records.index;

  let tokenIds = index["token"];
  let lines = [];
  for(let tokenId of tokenIds) {
    let token = records[tokenId];
    let line = token.line[0];
    if(!lines[line]) {
      lines[line] = [];
    }
    lines[line].push(token);
  }

  for(let line of lines) {
    if(!line) continue;
    line.sort(sortComparator);
  }

  parseInfo.lines = lines;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(tokensToParseInfo);

function blocksToParseInfo(index, dirty) {
  if(!dirty["block"]) return;
  let records = indexes.records.index;

  let blockIds = index["block"];
  let blocks = [];
  for(let blockId of blockIds) {
    let block = records[blockId];
    blocks.push(block);
  }
  blocks.sort(sortComparator);
  parseInfo.blocks = blocks;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(blocksToParseInfo);


function printDebugRecords(index, dirty) {
  for(let recordId in dirty) {
    let record = indexes.records.index[recordId];
    if(record.tag && record.tag.indexOf("debug") !== -1) {
      console.info(record);
    }
  }
}
indexes.dirty.subscribe(printDebugRecords);


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
