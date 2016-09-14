import {clone, debounce, sortComparator} from "./util";
import {sentInputValues, activeIds, renderRecords, renderEve} from "./renderer"
import {handleEditorParse} from "./editor"

import {DB, IndexScalar, IndexList, EAV, Record} from "./db"

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
export var DEBUG:string|boolean = true;

// This guy is a temporary shim for the transition to fully local DBs.
var magicallyGlobalDB = new DB("ID_1234");

export var indexes = {
  records: magicallyGlobalDB._records,        // E -> Record
  dirty: magicallyGlobalDB._dirty,            // E -> A
  byName: magicallyGlobalDB.index("name"),    // name -> E
  byTag: magicallyGlobalDB.index("tag"),      // tag -> E

  // renderer indexes
  byClass: magicallyGlobalDB.index("class"),    // class -> E
  byStyle: magicallyGlobalDB.index("style"),    // style -> E
  byChild: magicallyGlobalDB.index("children"), // children -> E
};

function handleDiff(db:DB, diff) {
  let entitiesWithUpdatedValues = {};

  for(let remove of diff.remove) {
    let [e, a, v] = safeEav(remove);
    if(!db._records.index[e]) {
      console.error(`Attempting to remove an attribute of an entity that doesn't exist: ${e}`);
      continue;
    }

    let entity = db._records.index[e];
    let values = entity[a];
    if(!values) continue;
    db._dirty.insert(e, a);

    if(values.length <= 1 && values[0] === v) {
      delete entity[a];
    } else {
      let ix = values.indexOf(v);
      if(ix === -1) continue;
      values.splice(ix, 1);
    }

    if(db._indexes[a]) db._indexes[a].remove(v, e);
    if(a === "value") entitiesWithUpdatedValues[e] = true;

  }

  for(let insert of diff.insert) {
    let [e, a, v] = safeEav(insert);
    let entity = db._records.index[e];
    if(!entity) {
      entity = {};
      db._records.insert(e, entity);
    }
    db._attributes.insert(a, e);
    db._dirty.insert(e, a);

    if(!entity[a]) entity[a] = [];
    entity[a].push(v);

    if(db._indexes[a]) db._indexes[a].insert(v, e);
    if(a === "value") entitiesWithUpdatedValues[e] = true;
  }

  // Update value syncing
  for(let e in entitiesWithUpdatedValues) {
    let a = "value";
    let entity = db._records.index[e];
    if(!entity[a]) {
      sentInputValues[e] = [];
    } else {
      if(entity[a].length > 1) console.error("Unable to set 'value' multiple times on entity", e, entity[a]);
      let value = entity[a][0];
      let sent = sentInputValues[e];
      if(sent && sent[0] === value) {
        db._dirty.remove(e, a);
        sent.shift();
      } else {
        sentInputValues[e] = [];
      }
    }
  }
  // Trigger all the subscribers of dirty indexes
  for(let indexName in db._indexes) {
    db._indexes[indexName].dispatchIfDirty();
  }
  db._dirty.dispatchIfDirty();
  db._records.dispatchIfDirty();
  db._attributes.dispatchIfDirty();
  // Clear dirty states afterwards so a subscriber of X can see the dirty state of Y reliably
  for(let indexName in db._indexes) {
    db._indexes[indexName].clearDirty();
  }
  db._dirty.clearDirty();
  db._records.clearDirty();
  db._attributes.clearDirty();
  // Finally, wipe the dirty E -> A index
  db._dirty.clearIndex();
}

let prerendering = false;
var frameRequested = false;

interface Connection extends WebSocket {
  dbs: {[id:string]: DB}
}

var socket:Connection = new WebSocket("ws://" + window.location.host +"/ws") as any;

socket.dbs = {browser: magicallyGlobalDB};

socket.onmessage = function(msg) {
  let data = JSON.parse(msg.data);
  if(data.type == "result") {
    let db = magicallyGlobalDB; //socket.dbs[data.db];
    handleDiff(db, data);

    let diffEntities = Object.keys(db._records.dirty).length;
    if(DEBUG) {
      console.groupCollapsed(`Received Result +${data.insert.length}/-${data.remove.length} (∂Entities: ${diffEntities})`);
      if(DEBUG === true || DEBUG === "diff") {
        console.table(data.insert);
        console.table(data.remove);
      }
      if(DEBUG === true || DEBUG === "state") {
        // we clone here to keep the entities fresh when you want to thumb through them in the log later (since they are rendered lazily)
        console.log("Entities", indexes.records.index);
        console.log("Indexes", db._indexes);
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
interface Block {id: string, name: string, sort: number, line: number};
interface Token {id: string, type: string, sort: number, line: number, surrogateOffset: number, surrogateLength: number};
type Line = Token[]

interface ParseInfo {
  blocks:Block[],
  blockIds:{[id:string]: Block},
  lines:Line[],
  tokenIds:{[id:string]: Token},
}
export var parseInfo:ParseInfo = {blocks: [], lines: [], blockIds: {}, tokenIds: {}};

let updateEditorParse = debounce(handleEditorParse, 1); // @FIXME: We need to listen for any changes to records with those tags



function tokensToParseInfo(tokenIds) {
  let records = indexes.records.index;

  // @FIXME: we don't want to be incremental right now, it's tough.
  tokenIds = indexes.byTag.index["token"];

  let lines:Token[][] = [];
  for(let tokenId of tokenIds) {
    // if(parseInfo.tokenIds[tokenId]) {
    //   let ix = parseInfo..indexOf(parseInfo.tokenIds[tokenId]);
    //   parseInfo.tokens.splice(ix, 1);
    //   parseInfo.tokenIds[tokenId] = undefined;
    // }

    let token = records[tokenId];
    if(!token) continue;
    let line = token.line[0];
    if(!lines[line]) {
      lines[line] = [];
    }
    parseInfo.tokenIds[tokenId] = {
      id: token.id[0],
      type: token.type[0],
      sort: token.sort[0],
      line: token.line[0],
      surrogateOffset: token.surrogateOffset[0],
      surrogateLength: token.surrogateLength[0]
    };
    lines[line].push(parseInfo.tokenIds[tokenId]);
  }

  for(let line of lines) {
    if(!line) continue;
    line.sort(sortComparator);
  }
  parseInfo.lines = lines;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(function(index, dirty) {
  if(!dirty["token"]) return;
  tokensToParseInfo(dirty["token"]);
});

function blocksToParseInfo(blockIds) {
  let records = indexes.records.index;

  // @FIXME: we don't want to be incremental right now, it's tough.
  blockIds = indexes.byTag.index["block"];


  let blocks:Block[] = [];
  for(let blockId of blockIds) {
    // if(parseInfo.blockIds[blockId]) {
    //   let ix = parseInfo.blocks.indexOf(parseInfo.blockIds[blockId]);
    //   parseInfo.blocks.splice(ix, 1);
    //   parseInfo.blockIds[blockId] = undefined;
    // }
    let block = records[blockId];
    if(!block) continue;
    parseInfo.blockIds[blockId] = {id: blockId, name: block.name[0], sort: block.sort[0], line: block.line[0]};
    blocks.push(parseInfo.blockIds[blockId]);
  }
  blocks.sort(sortComparator);
  parseInfo.blocks = blocks;
  updateEditorParse(parseInfo);
}
indexes.byTag.subscribe(function(index, dirty) {
  if(!dirty["block"]) return;
  blocksToParseInfo(dirty["block"]);
});

function handleEditorUpdates(index, dirty) {
  let blockIds:string[] = [];
  let tokenIds:string[] = [];
  for(let recordId in dirty) {
    if(parseInfo.blockIds[recordId]) blockIds.push(recordId);
    if(parseInfo.tokenIds[recordId]) tokenIds.push(recordId);
  }
  if(blockIds.length) blocksToParseInfo(blockIds);
  if(tokenIds.length) tokensToParseInfo(tokenIds);
}
indexes.dirty.subscribe(handleEditorUpdates);

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

export function sendEvent(query) {
  //console.log("QUERY", query);
  if(socket && socket.readyState == 1) {
    //socket.send(JSON.stringify({scope: "event", type: "query", query}))
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
