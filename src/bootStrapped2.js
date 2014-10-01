//*********************************************************
// utils
//*********************************************************

var now = function() {
  if(typeof window !== "undefined" && window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
};

//*********************************************************
// watchers
//*********************************************************
var eventId = 1;
var mouseEvents = {"drop": true,
                   "drag": true,
                   "mouseover": true,
                   "dragover": true,
                   "dragstart": true,
                   "dragend": true,
                   "mousedown": true,
                   "mouseup": true,
                   "click": true,
                   "dblclick": true,
                   "contextmenu": true};

var createUICallback = function(id, event, label, key) {
  return function(e) {
    var items = [];
    var eid = eventId++;
    if(event === "dragover") {
      e.preventDefault();
    } else {
      if(mouseEvents[event]) {
        items.push(["mousePosition", eid, e.clientX, e.clientY]);
      }

      items.push(["externalEvent", id, label, key, eid, e.target.value]);
      curApp.run(items);
    }
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
};

var uiDiffWatcher = function(storage, system) {
  var tables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diff = {};
  console.time("diff");
  for(var i = 0; i < tables.length; i++) {
    var table = tables[i];
    if(storage[table]) {
      var adds = [];
      var removes = [];
      system.getTable(table).diff(storage[table], adds, removes);
      storage[table] = system.getTable(table);
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      storage[table] = system.getTable(table);
      diff[table] = {
        adds: system.getTable(table).getFacts(),
        removes: []
      };
    }
  }
  console.timeEnd("diff");
  //   console.log(diff);


  var elem_id = 0;
  var elem_type = 1;

  var text_text = 1;

  var attrs_attr = 1;
  var attrs_value = 2;

  var styles_attr = 1;
  var styles_value = 2;

  var events_event = 1;
  var events_label = 2;
  var events_key = 3;

  var child_childid = 2;

  var builtEls = storage["builtEls"] || {"root": document.createElement("div")};
  var handlers = storage["handlers"] || {};
  var roots = {};
  //remove root to prevent thrashing
  if(storage["builtEls"]) {
    //     document.body.removeChild(builtEls["root"]);
  }

  //add elements
  var elem = diff["uiElem"].adds;
  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    if(!svgs[cur[elem_type]]) {
      builtEls[cur[elem_id]] = document.createElement(cur[elem_type]);
    } else {
      builtEls[cur[elem_id]] = document.createElementNS("http://www.w3.org/2000/svg", cur[elem_type]);
    }
  }
  //remove elements
  var remElem = diff["uiElem"].removes;
  var remElemsLen = remElem.length;
  for(var i = 0; i < remElemsLen; i++) {
    var cur = remElem[i];
    var me = builtEls[cur[elem_id]];
    if(me && me.parentNode && me.parentNode.parentNode) {
      me.parentNode.removeChild(me);
    }
    handlers[cur[elem_id]] = null;
    builtEls[cur[elem_id]] = null;
  }


  //add text
  var text = diff["uiText"].adds;
  var textLen = text.length;
  var addedText = {};
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    if(!builtEls[cur[elem_id]]) {
      builtEls[cur[elem_id]] = document.createTextNode(cur[text_text]);
    } else {
      builtEls[cur[elem_id]].nodeValue = cur[text_text];
    }
    addedText[cur[elem_id]] = true;
  }

  //remove text
  var text = diff["uiText"].removes;
  var textLen = text.length;
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    var me = builtEls[cur[elem_id]];
    if(me && !addedText[cur[elem_id]]) {
      me.nodeValue = "";
      builtEls[cur[elem_id]] = null;
    }
  }

  var attrs = diff["uiAttr"].adds;
  var attrsLen = attrs.length;
  for(var i = 0; i < attrsLen; i++) {
    var cur = attrs[i];
    builtEls[cur[elem_id]].setAttribute(cur[attrs_attr], cur[attrs_value]);
  }

  var styles = diff["uiStyle"].adds;
  var stylesLen = styles.length;
  for(var i = 0; i < stylesLen; i++) {
    var cur = styles[i];
    builtEls[cur[elem_id]].style[cur[styles_attr]] = cur[styles_value];
  }

  //Remove events
  var events = diff["uiEvent"].removes;
  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    if(builtEls[cur[elem_id]] && handlers[cur[elem_id]] && handlers[cur[elem_id]][cur[events_event]]) {
      var handler = handlers[cur[elem_id]][cur[events_event]];
      builtEls[cur[elem_id]].removeEventListener(cur[events_event], handler);
      handlers[cur[elem_id]][cur[events_event]] = null;
    }
  }

  var events = diff["uiEvent"].adds;
  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    if(!handlers[cur[elem_id]]) {
      handlers[cur[elem_id]] = {};
    }
    var handler = handlers[cur[elem_id]][cur[events_event]] = createUICallback(cur[elem_id], cur[events_event], cur[events_label], cur[events_key]);
    builtEls[cur[elem_id]].addEventListener(cur[events_event], handler);
  }

  var children = diff["uiChild"].adds;
  var childrenLen = children.length;
  children.sort(function(a,b) {
    if(a[0] !== b[0]) {
      return a[0].localeCompare(b[0]);
    } else {
      if(typeof a[1] === "string" || typeof b[1] === "string") {
        return (a[1] + "").localeCompare((b[1] + ""));
      } else {
        return a[1] - b[1];
      }
    }
  });
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    builtEls[cur[elem_id]].appendChild(child);
  }

  if(!storage["builtEls"]) {
    storage["builtEls"] = builtEls;
    storage["handlers"] = handlers;
    document.body.appendChild(builtEls["root"]);
  }


};


var compilerRowLimit = 30;
var compilerSeen = {};
var compilerWatcher = function(storage, system) {
  var getTable = system.getTable("getTable").getFacts();
  var getIntermediate = system.getTable("getIntermediate").getFacts();
  var getResult = system.getTable("getResult").getFacts();

  var items = [];

  if(getTable.length) {
    var len = getTable.length;
    for(var i = 0; i < len; i++) {
      var cur = getTable[i];
      var id = cur[0];
      if(!compilerSeen[id]) {
        var table = system.getTable(cur[1]).getFacts();
        var tableLen = table.length;
        if(tableLen) {
          var rowLen = table[0].length;
          for(var row = 0; row < tableLen && row < compilerRowLimit; row++) {
            for(var col = 0; col < rowLen; col++) {
              items.push(["gridItem", cur[2], row, col, table[row][col]]);
            }
          }
        }
        compilerSeen[id] = true;
      }
    }
  }

  if(getIntermediate.length) {

    var len = getIntermediate.length;
    for(var i = 0; i < len; i++) {
      var cur = getIntermediate[i];
      var id = cur[0];
      if(!compilerSeen[id]) {
        var table = system.getSolver(cur[1]).getFacts();
        var tableLen = table.length;
        if(tableLen) {
          var rowLen = table[0].length;
          for(var row = 0; row < tableLen && row < compilerRowLimit; row++) {
            for(var col = 0; col < rowLen; col++) {
              items.push(["gridItem", cur[2], row, col, table[row][col]]);
            }
          }
        }
        compilerSeen[id] = true;
      }
    }
  }

  if(items.length) {
    curApp.callRuntime(items);
  }
};

//*********************************************************
// Program
//*********************************************************

function commonTables() {
  return compose(
    table("displayName", ["id", "name"]),
    table("join", ["valve", "pipe", "field"]),
    table("editorRule", ["id", "description"]),
    table("externalEvent", ["id", "label", "key", "eid", "value"]),

    table("click", ["id"]),
    table("mousePosition", ["eid","x","y"]),
    table("sms outbox", ["id"]),
    table("user", ["id", "name"]),
    table("edge", ["from", "to"]),
    table("path", ["from", "to"]),
    table("uiElem", ["id", "type"]),
    table("uiText", ["id", "text"]),
    table("uiChild", ["parent", "pos", "child"]),
    table("uiAttr", ["id", "attr", "value"]),
    table("uiStyle", ["id", "attr", "value"]),
    table("uiEvent", ["id", "event", "label", "key"]),
    table("time", ["time"]),
    table("timePerFlow", ["name", "type", "numTimes", "totalTime"])
  );
}

var Application = function(system) {
  this.system = system;
  this.storage = {"uiWatcher": {},
                  "compilerWatcher": {}};
}

Application.prototype.callRuntime = function(facts) {
  this.system.update(facts, [])
  this.system.refresh();
  compilerWatcher(this.storage["compilerWatcher"], this.system);
};

Application.prototype.run = function(facts) {
  var start = now();
  this.callRuntime(facts);
  var runtime = now() - start;
  var uiStorage = this.storage["uiWatcher"];
  var system = this.system;
  if(!uiStorage["queued"]) {
    uiStorage["queued"] = true;
    window.requestAnimationFrame(function() {
      start = now();
      uiDiffWatcher(uiStorage, system);
      var render = now() - start;
      $("#renderStat").html(render.toFixed(2));
      uiStorage["queued"] = false;
    });
  }
  $("#timeStat").html(runtime.toFixed(2));
  var numFacts = 0;
  var tableToStore = this.system.tableToStore;
  for (var table in tableToStore) {
    numFacts += this.system.getStore(tableToStore[table]).facts.length;
  }
  console.log("numFacts", numFacts);
  $("#factsStat").html(numFacts);
};

function app(system) {
  return new Application(system);
}


//*********************************************************************
// helpers
//*********************************************************************

function mergeObjects(o1, o2) {
  var final = {};
  for(var i in o1) {
    final[i] = o1[i];
  }
  if(o2) {
    for(var i in o2) {
      final[i] = o2[i];
    }
  }
  return final;
}

function page(p) {
  return compose(
    source("state", {key: "key", value: "value"}),
    constant("key", "page"),
    constant("value", p)
  );
}

function on(label, map) {
  return function(context) {
    var labelId = "__label" + context.nextId++;
    var bindings = mergeObjects({label: labelId}, map);
    return compose(
      constant(labelId, label),
      source("externalEvent", bindings)
    )(context);
  }
};

function setConstant(k, v, map) {
  return function(context) {
    if(map && map.eid) {
      var key = "__key" + context.nextId++;
      var value = "__value" + context.nextId++;
      return compose(
        constant(key, k),
        constant(value, v),
        sink("state-temp", {id: map.eid, key: key, value: value})
      )(context);
    } else {
      var bindings = mergeObjects({eid: "__eid" + context.nextId++}, map);
      var key = "__key" + context.nextId++;
      var value = "__value" + context.nextId++;
      return compose(
        source("externalEvent", bindings),
        constant(key, k),
        constant(value, v),
        sink("state-temp", {id: bindings.eid, key: key, value: value})
      )(context);
    }
  }
};

function set(k, v, map) {
  return function(context) {
    if(map && map.eid) {
      var key = "__key" + context.nextId++;
      return compose(
        constant(key, k),
        sink("state-temp", {id: map.eid, key: key, value: v})
      )(context);
    } else {
      var bindings = mergeObjects({eid: "__eid" + context.nextId++}, map);
      var key = "__key" + context.nextId++;
      return compose(
        source("externalEvent", bindings),
        constant(key, k),
        sink("state-temp", {id: bindings.eid, key: key, value: v})
      )(context);
    }
  }
};

function outputState(rule, k, to) {
  var id = dsl.nextId();
  rule.source("state", id);
  rule.eq(id + ".key", k);
  rule.output(id + ".value", to);
};

function joinState(k, to) {
  return function(context) {
    var key = "__key" + context.nextId++;
    return compose(
      constant(key, k),
      source("state", {key: key, value: to})
    )(context);
  }
};

function stateEq(k, v) {
  return function(context) {
    var key = "__key" + context.nextId++;
    var value = "__value" + context.nextId++;
    return compose(
      constant(key, k),
      constant(value, v),
      source("state", {key: key, value: v})
    )(context);
  }
};

function pretendConstant(k, v) {
  return function(context) {
    var key = "__key" + context.nextId++;
    var value = "__value" + context.nextId++;
    return compose(
      constant(key, k),
      constant(value, v),
      sink("state", {key: key, value: value})
    )(context);
  }
};

function subProgram() {
  console.log("facts");
  var args = arguments;
  return function(context) {
    context.program = 'p' + context.nextId++;
    var facts = [["program", context.program, args[0]]];
    for(var i = 1; i < args.length; i++) {
      Array.prototype.push.apply(facts, args[i](context));
    }
    console.log("facts", facts);
    return facts;
  }
}

//*********************************************************************
// Editor app
//*********************************************************************

var curApp =
    app(
      program("editor",
              subProgram("editor",
                         commonTables(),

                         //*********************************************************************
                         // util
                         //*********************************************************************

                         table("state-temp", ["id", "key", "value"]),
                         table("state", ["key", "value"]),
                         table("latestId", ["id"]),

                         rule("real state",
                              source("state-temp", {id: "id", key: "key", value: "value"}),
                              calculate("sorted", ["id"], "-1 * id"),
                              aggregate(["key"], ["sorted"], 1),
                              sink("state", {key: "key", value: "value"})),

                         rule("latest eid",
                              source("externalEvent", {eid: "eid"}),
                              calculate("sorted", ["eid"], "-1 * eid"),
                              aggregate([], ["sorted"], 1),
                              sink("latestId", {id: "eid"})),

                         //*********************************************************************
                         // Compiler
                         //*********************************************************************


                         table("getTable", ["id", "table", "gridId"]),
                         table("getIntermediate", ["id", "rule", "gridId"]),
                         table("getResult", ["id", "rule", "sink", "gridId"]),

                         rule("editor rules by name",
                              constant("label", "set rule name"),
                              source("externalEvent", {eid: "eid", label: "label", key: "key", value: "rawName"}),
                              calculate("sorted", ["eid"], "-1 * eid"),
                              calculate("name", ["rawName"], "rawName === '' ? 'unnamed' : rawName"),
                              aggregate(["key"], ["sorted"], 1),
                              sink("editorRule", {id: "key", description: "name"})
                             ),

                         //*********************************************************************
                         // Program list
                         //*********************************************************************

                         rule("draw program list",
                              page("program list"),
                              elem("ul", {id: "program-list", parent: ["root"], class: "program-list"})),

                         rule("draw program items",
                              page("program list"),
                              source("program", {id: "id", name: "name"}),
                              elem("li", {id: inject("id"), parent: ["program-list", inject("name")], click: ["open program", inject("id")]},
                                   inject("name"))
                             ),

                         rule("open program",
                              on("open program", {eid: "eid", key: "program"}),
                              set("activeProgram", "program", {eid: "eid"}),
                              setConstant("page", "rules list", {eid: "eid"})
                             ),

                         //*********************************************************************
                         // Rules list
                         //*********************************************************************

                         table("activeRule", ["rule"]),

                         rule("on goto page",
                              constant("label", "goto page"),
                              source("externalEvent", {label: "label", eid: "eid", key: "pageName"}),
                              constant("page", "page"),
                              sink("state-temp", {id: "eid", key: "page", value: "pageName"})),

                         rule("active rules",
                              source("editorRule", {id: "rid", description: "description"}),
                              joinState("activeProgram", "program"),
                              source("programRule", {program: "program", rule: "rid"}),
                              sink("activeRule", {rule: "rid"})),

                         rule("draw rules list ui",
                              page("rules list"),
                              source("latestId", {id: "id"}),
                              pretendConstant("drawTablesList", "true"),
                              elem("div", {id: "rules-list-root", parent: ["root"], class: "root"},
                                   elem("button", {click: ["goto page", "program list"]}, "back"),
                                   elem("ul", {id: "table-list", class: "table-list"}),
                                   elem("button", {click: ["set rule name", inject("id")]}, "add rule"),
                                   elem("ul", {id: "rules-list", class: "rules-list"})
                                  )),

                         rule("draw rule",
                              page("rules list"),
                              source("activeRule", {rule: "rid"}),
                              source("editorRule", {id: "rid", description: "description"}),
                              calculate("ruleId", ["rid"], "'rule' + rid"),
                              calculate("sourcesId", ["rid"], "'sources' + rid"),
                              calculate("sinksId", ["rid"], "'sinks' + rid"),
                              elem("li", {id: inject("ruleId"), parent: ["rules-list", inject("rid")], click: ["open rule", inject("rid")]},
                                   elem("h2", {}, inject("description")),
                                   elem("div", {class: "io"},
                                        elem("ul", {id: inject("sourcesId"), class: "sources"}),
                                        elem("div", {class: "separator"},
                                             elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                                  elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"})
                                                 )
                                            ),
                                        elem("ul", {id: inject("sinksId"), class: "sinks"}, [])
                                       )
                                  )),

                         rule("rules list sources",
                              page("rules list"),
                              constant("dir", "+source"),
                              source("activeRule", {rule: "rid"}),
                              source("editorRule", {id: "rid"}),
                              source("pipe", {rule: "rid", direction: "dir", table: "table"}),
                              calculate("id", ["table", "rid"], "'source' + table + rid"),
                              calculate("parent", ["rid"], "'sources' + rid"),
                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("table")]}, inject("table"))
                             ),

                         rule("rules list sinks",
                              page("rules list"),
                              constant("dir", "+sink"),
                              source("activeRule", {rule: "rid"}),
                              source("editorRule", {id: "rid"}),
                              source("pipe", {rule: "rid", direction: "dir", table: "table"}),
                              calculate("id", ["table", "rid"], "'source' + table + rid"),
                              calculate("parent", ["rid"], "'sinks' + rid"),
                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("table")]}, inject("table"))),

                         rule("open rule",
                              on("open rule", {eid: "eid", key: "cur"}),
                              set("activeRule", "cur", {eid: "eid"}),
                              set("activeRuleGridId", "eid", {eid: "eid"}),
                              setConstant("page", "rule", {eid: "eid"})
                             ),


                         //*********************************************************************
                         // Tables list
                         //*********************************************************************

                         table("openTable-temp", ["table", "state"]),
                         table("openTable", ["table"]),

                         rule("table is open? -temp",
                              on("toggle table", {eid: "eid", key: "key"}),
                              aggregate(["key"], []),
                              reduce("key", "open_closed", "(key).length % 2 === 0 ? 'closed' : 'open'"),
                              sink("openTable-temp", {state: "open_closed", table: "key"})),

                         rule("table is open?",
                              constant("open", "open"),
                              source("openTable-temp", {state: "open", table: "table"}),
                              sink("openTable", {table: "table"})),

                         rule("draw table",
                              source("field", {table: "tableId"}),
                              stateEq("drawTablesList", "true"),
                              aggregate(["table"], []),
                              calculate("id", ["tableId"], "'table' + tableId"),
                              calculate("fieldsId", ["tableId"], "'table-fields' + tableId"),
                              elem("li", {id: inject("id"), parent: ["table-list", inject("tableId")], click: ["open table", inject("tableId")], doubleClick: ["toggle table", inject("tableId")]},
                                   elem("h2", {}, inject("tableId")),
                                   elem("ul", {id: inject("fieldsId")})
                                  )),

                         rule("draw fields for openTable",
                              source("openTable", {table: "tableId"}),
                              source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                              stateEq("drawTablesList", "true"),
                              calculate("id", ["tableId", "fieldId"], "'table-field' + tableId + '.' + fieldId"),
                              calculate("parent", ["tableId"], "'table' + tableId"),
                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")]},
                                   inject("field")
                                  )),

                         rule("open table",
                              on("open table", {eid: "eid", key: "key"}),
                              set("activeTable", "key", {eid: "eid"}),
                              set("activeTableGridId", "eid", {eid: "eid"}),
                              setConstant("page", "table", {eid: "eid"})),


                         //*********************************************************
                         // rule page
                         //*********************************************************

                         rule("rule page",
                              page("rule"),
                              source("editorRule", {id: "rid", description: "description"}),
                              joinState("activeRule", "rid"),
                              constant("workspace", "workspace"),
                              joinState("activeRuleGridId", "gridId"),
                              sink("drawGrid", {gridId: "gridId", parent: "workspace"}),
                              calculate("sourcesId", ["rid"], "'sources' + rid"),
                              calculate("sinksId", ["rid"], "'sinks' + rid"),
                              elem("div", {id: "rule-page", parent: ["root"], class: "rule-page"},
                                   elem("header", {},
                                        elem("button", {click: ["goto page", "rules list"]}, "back"),
                                        elem("input", {type: "text", input: ["set rule name", inject("rid")], value: inject("description")})),
                                   elem("div", {class: "io"},
                                        elem("ul", {id: inject("sourcesId"), class: "sources"}),
                                        elem("div", {class: "separator"},
                                             elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                                  elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"}))),
                                        elem("ul", {id: inject("sinksId"), class: "sinks"}, [])),
                                   elem("div", {id: "workspace", class: "workspace"})
                                  )),

                         rule("rule page sources",
                              page("rule"),
                              source("editorRule", {id: "rid"}),
                              constant("dir", "+source"),
                              source("pipe", {rule: "rid", direction: "dir", table: "table", pipe: "pipe"}),
                              joinState("activeRule", "rid"),
                              calculate("id", ["pipe"], "'source' + pipe"),
                              calculate("parent", ["pipe", "rid"], "'sources' + rid"),
                              calculate("sourceFieldsId", ["pipe"], "'rule-source-fields' + pipe"),
                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("table")], class: "io-item"},
                                   elem("span", {}, inject("table")),
                                   elem("ul", {id: inject("sourceFieldsId")})
                                  )),

                         rule("rule page source fields",
                              page("rule"),
                              source("editorRule", {id: "rid"}),
                              constant("dir", "+source"),
                              source("pipe", {rule: "rid", table: "tableId", direction: "dir", pipe: "pipeId"}),
                              source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                              joinState("activeRule", "rid"),

                              calculate("id", ["pipeId", "fieldId"], "'rule-source-field' + pipeId + '_' + fieldId"),
                              calculate("parent", ["pipeId"], "'rule-source-fields' + pipeId"),

                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")], click: ["blah", "bar"]},
                                   inject("fieldId")
                                  )),

                         rule("rule page sinks",
                              page("rule"),
                              source("editorRule", {id: "rid"}),
                              constant("dir", "+sink"),
                              source("pipe", {rule: "rid", direction: "dir", table: "table", pipe: "pipe"}),
                              joinState("activeRule", "rid"),
                              calculate("id", ["pipe"], "'source' + pipe"),
                              calculate("parent", ["pipe", "rid"], "'sinks' + rid"),
                              calculate("sinkFieldsId", ["pipe"], "'rule-sink-fields' + pipe"),
                              calculate("sinkOutputsId", ["pipe"], "'rule-outputs-fields' + pipe"),
                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("table")], class: "io-item"},
                                   elem("span", {}, inject("table")),
                                   elem("ul", {id: inject("sinkFieldsId")}),
                                   elem("ul", {id: inject("sinkOutputsId")})
                                  )),

                         rule("rule page sink fields",
                              page("rule"),
                              source("editorRule", {id: "rid"}),
                              constant("dir", "+sink"),
                              source("pipe", {rule: "rid", table: "tableId", direction: "dir", pipe: "pipeId"}),
                              source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                              joinState("activeRule", "rid"),

                              calculate("id", ["pipeId", "fieldId"], "'rule-sink-field' + pipeId + '_' + fieldId"),
                              calculate("parent", ["pipeId"], "'rule-sink-fields' + pipeId"),

                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")], click: ["blah", "bar"]},
                                   inject("fieldId")
                                  )),

                         rule("rule page sink outputs",
                              page("rule"),
                              source("editorRule", {id: "rid"}),
                              constant("dir", "+sink"),
                              source("pipe", {pipe: "pipeId", table: "tableId", rule: "rid", direction: "dir"}),
                              source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                              source("tableConstraint", {valve: "valve", pipe: "pipeId", field: "fieldId"}),

                              joinState("activeRule", "rid"),

                              calculate("id", ["pipeId", "fieldId"], "'rule-sink-output' + pipeId + '_' + fieldId"),
                              calculate("parent", ["pipeId"], "'rule-outputs-fields' + pipeId"),

                              elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")]},
                                   inject("valve")
                                  )),

                         rule("get grid for rule page",
                              page("rule"),
                              joinState("activeRule", "rid"),
                              joinState("activeRuleGridId", "gridId"),
                              sink("getIntermediate", {rule: "rid", id: "gridId", gridId: "gridId"})),

                         rule("grid headers for workspace grid",
                              page("rule"),
                              joinState("activeRuleGridId", "gridId"),
                              joinState("activeRule", "rid"),
                              source("valve", {rule: "rid", valve: "valve", ix: "ix"}),
                              sink("gridHeader", {gridId: "gridId", name: "valve", ix: "ix"})),

                         //*********************************************************
                         // Grids
                         //*********************************************************

                         table("gridItem", ["gridId", "row", "col", "val"]),
                         table("gridHeader", ["gridId", "name", "ix"]),
                         table("drawGrid", ["gridId", "parent"]),

                         rule("draw a grid",
                              source("drawGrid", {gridId: "gridId", parent: "parent"}),
                              calculate("rootId", ["gridId"], "'grid' + gridId"),
                              calculate("headerId", ["gridId"], "'grid-header' + gridId"),
                              elem("div", {id: inject("rootId"), parent: [inject("parent"), 10000], class: "grid"}),
                              elem("div", {id: inject("headerId"), parent: [inject("rootId"), -1], class: "grid-header"})),

                         rule("draw grid rows",
                              source("drawGrid", {gridId: "gridId"}),
                              source("gridItem", {gridId: "gridId", row: "gridRow", col: "gridCol", val: "gridVal"}),
                              calculate("rootId", ["gridId"], "'grid' + gridId"),
                              calculate("rowId", ["gridRow", "gridId"], "'grid-row' + gridId + '_' + gridRow"),
                              elem("div", {id: inject("rowId"), parent: [inject("rootId"), inject("gridRow")], class: "grid-row"}),
                              calculate("colId", ["gridRow", "gridCol", "gridId"], "gridId + '_' + gridRow + '_' + gridCol"),
                              elem("div", {id: inject("colId"), parent: [inject("rowId"), inject("gridCol")], click: ["foo", inject("gridId")]},
                                   inject("gridVal")
                                  )),

                         rule("draw grid headers",
                              source("drawGrid", {gridId: "gridId"}),
                              source("gridHeader", {gridId: "gridId", ix: "ix", name: "name"}),
                              calculate("headerId", ["gridId"], "'grid-header' + gridId"),
                              calculate("itemId", ["ix", "gridId"], "'grid-header-item' + gridId + '_' + ix"),
                              elem("div", {id: inject("itemId"), parent: [inject("headerId"), inject("ix")]},
                                   inject("name")
                                  )),

                         //*********************************************************
                         // table page
                         //*********************************************************

                         rule("get grid for table page",
                              page("table"),
                              joinState("activeTable", "table"),
                              joinState("activeTableGridId", "id"),
                              sink("getTable", {table: "table", id: "id", gridId: "id"})),

                         rule("grid headers for table page",
                              page("table"),
                              joinState("activeTableGridId", "gridId"),
                              joinState("activeTable", "table"),
                              source("field", {table: "table", field: "field", ix: "ix"}),
                              sink("gridHeader", {gridId: "gridId", name: "field", ix: "ix"})),

                         rule("draw table page",
                              page("table"),
                              joinState("activeTableGridId", "activeGridId"),
                              joinState("activeTable", "table"),
                              constant("table-page", "table-page"),
                              sink("drawGrid", {gridId: "activeGridId", parent: "table-page"}),
                              elem("div", {id: "table-page", parent: ["root"]},
                                   elem("button", {click: ["goto page", "rules list"]}, "back"),
                                   elem("h2", {}, inject("table")))),

                         //*********************************************************
                         // ui editor
                         //*********************************************************

                         table("uiItem", ["id", "type"]),

                         rule("draw UI editor",
                              page("ui editor"),
                              pretendConstant("drawTablesList", "true"),
                              elem("div", {id: "ui-editor-root", parent: ["root"], class: "root ui-editor"},
                                   elem("ul", {id: "table-list", class: "table-list"}),
                                   elem("ul", {class: "toolbox"},
                                        elem("li", {draggable: "true", dragStart: ["toolbox drag", "button"]}, "button"),
                                        elem("li", {draggable: "true", dragStart: ["toolbox drag", "span"]}, "text"),
                                        elem("li", {draggable: "true", dragStart: ["toolbox drag", "div"]}, "box"),
                                        elem("li", {draggable: "true", dragStart: ["toolbox drag", "input"]}, "input")
                                       ),
                                   elem("div", {id: "canvas", class: "canvas", dragOver: ["blah", "baz"], drop: ["dropped control", "drop"]})
                                  )),

                         rule("ui items",
                              on("dropped control", {eid: "droppedEid"}),
                              source("mousePosition", {eid: "droppedEid", x: "mouseX", y: "mouseY"}),
                              constant("toolbox drag", "toolbox drag"),
                              source("externalEvent", {eid: "controlEid", label: "toolbox drag", key: "controlType"}),
                              constant("lower", true),
                              calculate("lower", ["controlEid", "droppedEid"], "controlEid < droppedEid"),
                              calculate("sorted", ["controlEid"], "-1 * controlEid"),
                              aggregate(["droppedEid"], ["sorted"], 1),
                              sink("uiItem", {id: "droppedEid", type: "controlType"})
                             ),

                         rule("draw ui items",
                              source("uiItem", {id: "id", type: "controlType"}),
                              source("mousePosition", {eid: "id", x: "mouseX", y: "mouseY"}),
                              calculate("elemId", ["id"], "'drawn' + id"),
                              elem(inject("controlType"),
                                   {id: inject("elemId"),
                                    draggable: "true",
                                    dragStart: ["move ui item", inject("id")],
                                    class: "control",
                                    style: {top: inject("mouseY"),
                                    left: inject("mouseX")},
                                   parent: ["canvas", inject("id")]},
                              inject("controlType")))

    ),

    subProgram("paths",
               rule("foo",
                    page("bar"),
                    source("time", {time: "time"}),
                    elem("p", {id: "time", parent: ["root"]}, inject("time"))
                   )
              )
    ));


curApp.run([["time", 0], ["externalEvent", "asdf", "goto page", "program list", 0]]);
