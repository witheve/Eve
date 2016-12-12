import {clone, debounce, uuid, sortComparator} from "./util";
import {Owner} from "./config";
import {sentInputValues, activeIds, renderRecords, renderEve} from "./renderer"
import {IDE} from "./ide";
import * as browser from "./runtime/browser";

import {IndexScalar, IndexList, EAV, Record} from "./db"


function analyticsEvent(kind: string, label?: string, value?: number) {
  let ga = window["ga"];
  if(!ga) return;

  ga("send", "event", "ide", kind, label, value);
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
    let [e, a, v] = remove;
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
    // @NOTE: We intentionally leak children -> parent for now to easily restore
    // children that get recreated with the same id which don't have an associated diff in their parent.
    //else if(a === "children") indexes.byChild.remove(v, e);
    else if(a === "value") entitiesWithUpdatedValues[e] = true;

  }

  for(let insert of diff.insert) {
    let [e, a, v] = insert;
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

//---------------------------------------------------------
// EveClient
//---------------------------------------------------------

export class EveClient {
  socket: WebSocket;
  socketQueue: string[] = [];
  localEve:boolean = false;
  localControl:boolean = false;
  showIDE:boolean = true;
  ide:IDE;

  constructor(url?:string) {
    let loc = url ? url : this.getUrl();

    this.socket = new WebSocket(loc);
    this.socket.onerror = (event) => {
      this.onError();
    }
    this.socket.onopen = (event) => {
      this.onOpen();
    }
    this.socket.onmessage = (event) => {
      this.onMessage(event);
    }
    this.socket.onclose = (event) => {
      this.onClose();
    }
  }

  getUrl() {
    let protocol = "ws://";
    if(location.protocol.indexOf("https") > -1) {
      protocol = "wss://";
    }
    return protocol + window.location.host +"/ws";
  }

  socketSend(message:string) {
    if(this.socket && this.socket.readyState === 1) {
      this.socket.send(message);
    } else {
      this.socketQueue.push(message);
    }
  }

  send(payload:{type: string, [attributes:string]: any}) {
    let message = JSON.stringify(payload);
    if(!this.localEve) {
      this.socketSend(message);
    } else {
      browser.responder.handleEvent(message);
    }
  }

  sendControl(message:string) {
    if(!this.localControl) {
      this.socketSend(message);
    } else {
      // @TODO where do local control messages go?
    }
  }

  sendEvent(records:any[]) {
    if(!records || !records.length) return;
    let eavs = [];
    for(let record of records) {
      eavs.push.apply(eavs, recordToEAVs(record));
    }
    this.send({type: "event", insert: eavs})
  }

  injectNotice(type:string, message:string) {
    if(this.ide) {
      this.ide.injectNotice(type, message);
    } else {
      if(type === "error") console.error(message);
      else if(type === "warning") console.warn(message);
      else console.info(message);
    }
  }

  onError() {
    this.localControl = true;
    this.localEve = true;
    if(!this.ide) {
      this._initProgram({runtimeOwner: Owner.client, controlOwner: Owner.client, withIDE: true, path: (window.location.hash || "").slice(1) || "/examples/quickstart.eve"});
    } else {
      this.injectNotice("error", "Unexpectedly disconnected from the server. Please refresh the page.");
    }
  }

  onOpen() {
    this.socketSend(JSON.stringify({type: "init", url: location.pathname, hash: location.hash.substring(1)}))
    for(let queued of this.socketQueue) {
      this.socketSend(queued);
    }
    // ping the server so that the connection isn't overzealously
    // closed
    setInterval(() => {
      this.socketSend(JSON.stringify({type: "ping"}));
    }, 30000);
  }

  onClose() {
    this.injectNotice("warning", "The editor has lost connection to the Eve server. All changes will be made locally.");
  }

  onMessage(event) {
    let data = JSON.parse(event.data);
    let handler = this["_" + data.type];
    if(handler) {
      handler.call(this, data);
    } else if(!this.ide || !this.ide.languageService.handleMessage(data)) {
      console.error(`Unknown client message type: ${data.type}`);
    }
  }

  _result(data) {
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

        console.info("Entities", copy);
        console.info("Indexes", indexes);
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
  }

  _initProgram(data) {
    this.localEve = data.runtimeOwner === Owner.client;
    this.localControl = data.controlOwner === Owner.client;
    this.showIDE = data.withIDE;
    if(this.localEve) {
      browser.init(data.code);
    }
    if(this.showIDE) {
      // Ensure the URL bar is in sync with the server.
      // @FIXME: This back and forth of control over where we are
      // is an Escherian nightmare.

      if(!data.path) {
        history.pushState({}, "", window.location.pathname);
      }

      this.ide = new IDE();
      this.ide.local = this.localControl;
      initIDE(this);
      this.ide.render();
      if(data.path && data.path.length > 2) {
        let currentHashChunks = location.hash.split("#").slice(1);
        let docId = currentHashChunks[0];
        if(docId && docId[docId.length - 1] === "/") docId = docId.slice(0, -1);
        this.ide.loadFile(docId, data.code);
      }
    }
    onHashChange({});
  }

  _parse(data) {
    if(!this.showIDE) return;
    this.ide.loadDocument(data.generation, data.text, data.spans, data.extraInfo, data.css); // @FIXME
  }

  _comments(data) {
    if(!this.showIDE) return;
    this.ide.injectSpans(data.spans, data.extraInfo);
  }

  _findNode(data) {
    if(!this.showIDE) return;
    this.ide.attachView(data.recordId, data.spanId);
  }

  _error(data) {
    this.injectNotice("error", data.message);
  }

}

//---------------------------------------------------------
// create socket
//---------------------------------------------------------

// @FIXME: This is just so bad.
// We'll create the socket at the end to kick off this whole ball of earwax and nail clippings.
export var socket;

//---------------------------------------------------------
// Index handlers
//---------------------------------------------------------

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

function subscribeToTagDiff(tag:string, callback: (inserts: string[], removes: string[], records: {[recordId:string]: any}) => void) {
  indexes.dirty.subscribe((index, dirty) => {
    let records = {};
    let inserts = [];
    let removes = [];

    let dirtyOldRecords = indexes.byTag.dirty[tag] || [];
    for(let recordId of dirtyOldRecords) {
      let record = indexes.records.index[recordId];
      if(!record || !record.tag || record.tag.indexOf(tag) === -1) {
        removes.push(recordId);
      }
    }

    for(let recordId in dirty) {
      let record = indexes.records.index[recordId];
      if(record.tag && record.tag.indexOf(tag) !== -1) {
        inserts.push(recordId);
        records[recordId] = record;
      }
    }

    callback(inserts, removes, records);
  });
}

subscribeToTagDiff("editor", (inserts, removes, records) => {
  if(!client.showIDE) return;
  client.ide.updateActions(inserts, removes, records);
});

subscribeToTagDiff("view", (inserts, removes, records) => {
  if(!client.showIDE) return;
  client.ide.updateViews(inserts, removes, records)
});

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
        } else if(v !== undefined) {
          eavs.push([e, a, v]);
        }
      }
    } else {
      let v = record[a];
      if(typeof v === "object") {
        eavs.push.apply(eavs, recordToEAVs(v));
        eavs.push([e, a, v.id]);
      } else if(v !== undefined) {
        eavs.push([e, a, v]);
      }
    }
  }
  return eavs;
}

//---------------------------------------------------------
// Initialize an IDE
//---------------------------------------------------------
export let client = new EveClient();

function initIDE(client:EveClient) {
  let ide = client.ide;
  ide.onChange = (ide:IDE) => {
    let generation = ide.generation;
    let md = ide.editor.toMarkdown();
    console.groupCollapsed(`SENT ${generation}`);
    console.info(md);
    console.groupEnd();
    client.send({scope: "root", type: "parse", generation, code: md});
  }
  ide.onEval = (ide:IDE, persist) => {
    client.send({type: "eval", persist});
  }
  ide.onLoadFile = (ide, documentId, code) => {
    client.send({type: "close"});
    client.send({scope: "root", type: "parse", code})
    client.send({type: "eval", persist: false});

    let url = `${location.pathname}#${documentId}`;
    let currentHashChunks = location.hash.split("#").slice(1);
    let curId = currentHashChunks[0];
    if(curId && curId[curId.length - 1] === "/") curId = curId.slice(0, -1);
    if(curId === documentId && currentHashChunks[1]) {
      url += "/#" + currentHashChunks[1];
    }

    history.pushState({}, "", url + location.search);
    analyticsEvent("load-document", documentId);
  }

  ide.onSaveDocument = (ide, documentId, code) => {
    client.sendControl(JSON.stringify({type: "save", path: documentId, code}));
  }

  ide.onTokenInfo = (ide, tokenId) => {
    client.send({type: "tokenInfo", tokenId});
  }

  let cache = window["_workspaceCache"];
  for(let workspace in cache || {}) {
    ide.loadWorkspace(workspace, cache[workspace]);
  }
}

function changeDocument() {
  if(!client.showIDE) return;
  let ide = client.ide;
  // @FIXME: This is not right in the non-internal case.
  let docId = "/examples/quickstart.eve";
  let path = location.hash && location.hash.split('?')[0].split("#")[1];
  if(path[path.length - 1] === "/") path = path.slice(0, -1);
  if(path && path.length > 2) {
    if(path[path.length - 1] === "/") path = path.slice(0, -1);
    docId = path;
  }

  if(!docId) return;
  if(docId === ide.documentId) return;
  try {
    ide.loadFile(docId);
  } catch(err) {
    client.injectNotice("info", "Unable to load unknown file: " + docId);
  }
  ide.render();
}

//---------------------------------------------------------
// Handlers
//---------------------------------------------------------

function onHashChange(event) {
  if(client.ide && client.ide.loaded) changeDocument();
  let hash = window.location.hash.split("#/")[2];
  let queryParam = window.location.hash.split('?')[1];

  if(hash || queryParam) {
    let segments = (hash||'').split("/").map(function(seg, ix) {
      return {id: uuid(), index: ix + 1, value: seg};
    }), queries = (queryParam||'').split('&').map(function (kv) {
      let [k, v] = kv.split('=',2);
      return {id: uuid(), key: k, value: v};
    });

    client.sendEvent([
      {tag: "url-change", "hash-segment": segments, "query-param": queries}
    ]);
  }
}

window.addEventListener("hashchange", onHashChange);

window.document.body.addEventListener("dragover", (e) => {
  e.preventDefault();
})

window.document.body.addEventListener("drop", (e) => {
  if(e.dataTransfer.files.length) {
    let reader = new FileReader();
    reader.onload = function (event) {
      socket.send(`{"type": "load", "info": ${reader.result}}`);
    };
    reader.readAsText(e.dataTransfer.files[0]);
  }
  e.preventDefault();
  e.stopPropagation();
});
