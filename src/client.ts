import {clone, debounce, uuid, sortComparator} from "./util";
import {sentInputValues, activeIds, renderRecords, renderEve} from "./renderer"
import {IDE} from "./ide";
import * as browser from "./runtime/browser";

import {IndexScalar, IndexList, EAV, Record} from "./db"

//---------------------------------------------------------
// Utilities
//---------------------------------------------------------
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

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
export var DEBUG:string|boolean = false;

export var indexes = {
  records: new IndexScalar<Record>(), // E -> Record
  dirty: new IndexList<string>(),     // E -> A
  byName: new IndexList<string>(),    // name -> E
  byTag: new IndexList<string>(),     // tag -> E

  // renderer indexes
  byClass: new IndexList<string>(),   // class -> E
  byStyle: new IndexList<string>(),   // style -> E
  byChild: new IndexScalar<string>()  // child -> E
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

    if(values.length <= 1 && values[0] === v) {
      delete entity[a];
    } else {
      let ix = values.indexOf(v);
      if(ix === -1) continue;
      values.splice(ix, 1);
    }

    // Update indexes
    if(a === "tag") indexes.byTag.remove(v, e);
    else if(a === "name") indexes.byName.remove(v, e);
    else if(a === "class") indexes.byClass.remove(v, e);
    else if(a === "style") indexes.byStyle.remove(v, e);
    else if(a === "children") indexes.byChild.remove(v, e);
    else if(a === "value") entitiesWithUpdatedValues[e] = true;

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
    if(a === "tag") indexes.byTag.insert(v, e);
    else if(a === "name") indexes.byName.insert(v, e);
    else if(a === "class") indexes.byClass.insert(v, e);
    else if(a === "style") indexes.byStyle.insert(v, e);
    else if(a === "children") indexes.byChild.insert(v, e);
    else if(a === "value") entitiesWithUpdatedValues[e] = true;
  }

  // Update value syncing
  for(let e in entitiesWithUpdatedValues) {
    let a = "value";
    let entity = records.index[e];
    if(!entity[a]) {
      sentInputValues[e] = [];
    } else {
      if(entity[a].length > 1) console.error("Unable to set 'value' multiple times on entity", e, entity[a]);
      let value = entity[a][0];
      let sent = sentInputValues[e];
      if(sent && sent[0] === value) {
        dirty.remove(e, a);
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
  // Finally, wipe the dirty E -> A index
  indexes.dirty.clearIndex();
}

let prerendering = false;
var frameRequested = false;

export var socket;
if(!global["local"]) {
  // socket = new WebSocket("ws://" + window.location.host + window.location.pathname, "eve-json");
  if(location.protocol.indexOf("https") > -1) {
    socket = new WebSocket("wss://" + window.location.host +"/ws");
  } else {
    socket = new WebSocket("ws://" + window.location.host +"/ws");
  }
} else {
  socket = {
    readyState: 1,
    send: (json) => {
      browser.handleEvent(json);
    }
  }
  browser.init(global["code"]);
}
socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    let state = {entities: indexes.records.index, dirty: indexes.dirty.index};
    handleDiff(state, data);

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
  } else if(data.type == "initLocal") {
    socket = {
      readyState: 1,
      send: (json) => {
        browser.handleEvent(json);
      },
      onmessage: socket.onmessage,
      onopen: socket.onopen
    }
    browser.init(data.code);
  } else if(data.type == "parse") {
    console.log("Got parse!", data);
    _ide.loadSpans(data.text, data.spans, data.extraInfo);
    _ide.render();
  } else if(data.type == "error") {
    console.error(data.message, data);
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
  socket.send(JSON.stringify({type: "init", url: location.pathname}))
  onHashChange({});
  setInterval(() => {
    socket.send("\"PING\"");
  }, 30000);
}
socket.onclose = function() {
  console.log("Disconnected from eve server!");
}

function renderOnChange(index, dirty) {
  renderRecords();
}
indexes.dirty.subscribe(renderOnChange);

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

function recordToEAVs(record) {
  if(!record) return;
  let eavs:EAV[] = [];
  if(record.id && record.id.constructor === Array) throw new Error("Unable to apply multiple ids to the same record: " + JSON.stringify(record));
  if(!record.id) record.id = uuid();
  record.id = "" + record.id + "";
  let e = record.id;

  for(let a in record) {
    if(record[a] === undefined) continue;
    if(a === "id") continue;
    if(record[a].constructor === Array) {
      for(let v of record[a]) {
        if(typeof v === "object") {
          eavs.push.apply(eavs, recordToEAVs(v));
          eavs.push([e, a, v.id]);
        } else {
          eavs.push([e, a, v]);
        }
      }
    } else {
      let v = record[a];
      if(typeof v === "object") {
        eavs.push.apply(eavs, recordToEAVs(v));
        eavs.push([e, a, v.id]);
      } else {
        eavs.push([e, a, v]);
      }
    }
  }
  return eavs;
}

export function sendEvent(records:any[]) {
  if(!records || !records.length) return;
  let eavs = [];
  for(let record of records) {
    eavs.push.apply(eavs, recordToEAVs(record));
  }
  if(socket && socket.readyState == 1) {
    socket.send(JSON.stringify({type: "event", insert: eavs}))
  }
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

  if(hash) {
    let segments = hash.split("/").map(function(seg, ix) {
      return {id: uuid(), index: ix + 1, value: seg};
    });

    sendEvent([
      {tag: "url-change", "hash-segment": segments}
    ]);
  }
}

window.addEventListener("hashchange", onHashChange);

//---------------------------------------------------------
// Initialize an IDE
//---------------------------------------------------------
let _ide = new IDE();
_ide.render();
