import {clone} from "./util";
import {sentInputValues, activeIds, activeChildren, activeClasses, activeStyles, renderRecords, renderEditor} from "./renderer"

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

//---------------------------------------------------------
// Connect the websocket, send the ui code
//---------------------------------------------------------
export var DEBUG = true;
export var state = {entities: {}, dirty: {}};

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

    // Update active*
    if(a === "children" && activeChildren[v] === e) {
      delete activeChildren[v];
    }

    if(a === "class" && activeClasses[v]) {
      let classIx = activeClasses[v].indexOf(e);
      if(classIx !== -1) {
        activeClasses[v].splice(classIx, 1);
      }
    }

    if(a === "style" && activeStyles[v]) {
      let styleIx = activeStyles[v].indexOf(e);
      if(styleIx !== -1) {
        activeStyles[v].splice(styleIx, 1);
      }
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

    // Update active*
    if(a === "children") {
      if(activeChildren[v]) console.error(`Unable to handle child element ${v} parented to two parents (${activeChildren[v]}, ${e}). Overwriting.`);
      activeChildren[v] = e;
    }

    if(a === "class") {
      if(!activeClasses[v]) activeClasses[v] = [e];
      else activeClasses[v].push(e);
    }

    if(a === "style") {
      if(!activeStyles[v]) activeStyles[v] = [e];
      else activeStyles[v].push(e);
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
      console.table(data.insert);
      console.table(data.remove);
      if(state.entities) {
        let copy = clone(state.entities);
        console.log(copy);
        let byName = {};
        for(let entity in copy) {
          if(copy[entity].name) {
            copy[entity].entity = entity;
            byName[copy[entity].name] = copy[entity];
          }
        }
        console.log(byName);
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

  } else if(data.type == "full_parse") {
    // @TODO: replace me with EAV-bridge
    // activeParse = indexParse(data.parse);
    // renderEditor();
    // handleEditorParse(activeParse);
  } else if(data.type == "parse") {
    // @TODO: replace me with EAV-bridge
    // editorParse = indexParse(data.parse);
    // handleEditorParse(editorParse);

  } else if(data.type == "node_times") {
    // @TODO: replace me with EAV-bridge
    // activeParse.iterations = data.iterations;
    // activeParse.total_time = data.total_time;
    // activeParse.cycle_time = data.cycle_time;
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

export function indexParse(parse) {
  let lines = [];
  let tokens = parse.root.context.tokens
  for(let tokenId of tokens) {
    let token = parse[tokenId];
    if(!lines[token.line]) {
      lines[token.line] = [];
    }
    lines[token.line].push(token)
  }
  parse.lines = lines;
  let down = {};
  let up = {};
  for(let edge of parse.root.context.downEdges) {
    if(!down[edge[0]]) down[edge[0]] = [];
    if(!up[edge[1]]) up[edge[1]] = [];
    down[edge[0]].push(edge[1]);
    up[edge[1]].push(edge[0]);
  }
  parse.edges = {down, up};

  // if there isn't an active graph, then make the first query
  // active
  if(!activeIds["graph"]) {
    activeIds["graph"] = parse.root.children[0];
  }
  return parse;
}

export function nodeToRelated(pos, node, parse) {
  let active = {};
  if(!parse.root) return active;
  // search for which query we're looking at
  let prev;
  for(let queryId of parse.root.children) {
    let query = parse[queryId];
    if(query.line == pos.line + 1) {
      prev = query;
      break;
    } else if (query.line > pos.line + 1) {
      break;
    }
    prev = query;
  }
  if(prev) active["graph"] = prev.id;

  if(!node.id) return active;
  let {up, down} = parse.edges;
  active[node.id] = true;
  let nodesUp = up[node.id] ? up[node.id].slice() : [];
  for(let ix = 0; ix < nodesUp.length; ix++) {
    let cur = nodesUp[ix];
    active[cur] = true;
    for(let next of up[cur] || []) nodesUp.push(next);
  }
  let nodesDown = down[node.id] ? down[node.id].slice() : [];
  for(let ix = 0; ix < nodesDown.length; ix++) {
    let cur = nodesDown[ix];
    active[cur] = true;
    for(let next of down[cur] || []) nodesDown.push(next);
  }


  return active;
}

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
