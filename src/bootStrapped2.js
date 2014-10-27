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

var createUICallback = function(application, id, event, label, key) {
  return function(e) {
    var items = [];
    var eid = eventId++;
    if(event === "dragover") {
      e.preventDefault();
    } else {
      if(mouseEvents[event]) {
        items.push(["mousePosition", eid, e.clientX, e.clientY]);
      }

      var value = e.target.value;
      if(event === "dragstart") {
        console.log("start: ", JSON.stringify(eid));
        e.dataTransfer.setData("eid", JSON.stringify(eid));
        value = eid;
      }
      if(event === "drop" || event === "drag" || event === "dragover" || event === "dragend") {
        console.log("drop", e.dataTransfer.getData("eid"));
        try {
          value = JSON.parse(e.dataTransfer.getData("eid"));
        } catch(e) {
          value = "";
        }
      }
      e.stopPropagation();
      items.push(["externalEvent", id, label, key, eid, value]);
      application.run(items);
    }
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
};

var uiDiffWatcher = function(application, storage, system) {
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

  //add subProgram elements
  for(var i in compiledSystems) {
    builtEls[i + "_root"] = compiledSystems[i].getUIRoot();
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
    var handler = handlers[cur[elem_id]][cur[events_event]] = createUICallback(application, cur[elem_id], cur[events_event], cur[events_label], cur[events_key]);
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
    var parent = builtEls[cur[elem_id]];
    if(cur[elem_id] == "subProgramUI") {
    }
    if(parent && child) {
      parent.appendChild(child);
    }
  }

  if(!storage["builtEls"]) {
    storage["builtEls"] = builtEls;
    storage["handlers"] = handlers;
    if(storage["rootParent"]) {
      storage["rootParent"].appendChild(builtEls["root"]);
    }
  }


};


var compilerRowLimit = 30;
var compilerSeen = {};
var compiledSystems = {};
var compilerWatcher = function(application, storage, system) {
  if(!system.getTable("getTable")) return;

  var getTable = system.getTable("getTable").getFacts();
  var getIntermediate = system.getTable("getIntermediate").getFacts();
  var getResult = system.getTable("getResult").getFacts();
  var pendingCompiles = system.getTable("pendingCompiles").getFacts();

  var items = [];

  if(pendingCompiles.length) {
    console.time("compile");
    var sys = System.empty({name: pendingCompiles[0][1]});
    var tablesToCompile = system.getTable("tablesToCompile").getFacts();
    sys.updateTable("table", tablesToCompile, []);
    var rulesToCompile = system.getTable("rulesToCompile").getFacts();
    sys.updateTable("rule", rulesToCompile, []);
    var fieldsToCompile = system.getTable("fieldsToCompile").getFacts();
    sys.updateTable("field", fieldsToCompile, []);
    var valvesToCompile = system.getTable("valvesToCompile").getFacts();
    sys.updateTable("valve", valvesToCompile, []);
    var pipesToCompile = system.getTable("pipesToCompile").getFacts();
    sys.updateTable("pipe", pipesToCompile, []);
    var tableConstraintToCompile = system.getTable("tableConstraintToCompile").getFacts();
    sys.updateTable("tableConstraint", tableConstraintToCompile, []);
    var constantConstraintToCompile = system.getTable("constantConstraintToCompile").getFacts();
    sys.updateTable("constantConstraint", constantConstraintToCompile, []);
    var functionConstraintToCompile = system.getTable("functionConstraintToCompile").getFacts();
    sys.updateTable("functionConstraint",functionConstraintToCompile, []);
    var functionConstraintInputToCompile = system.getTable("functionConstraintInputToCompile").getFacts();
    sys.updateTable("functionConstraintInput", functionConstraintInputToCompile, []);
    var limitValveToCompile = system.getTable("limitValveToCompile").getFacts();
    sys.updateTable("limitValve", limitValveToCompile, []);
    var groupValveToCompile = system.getTable("groupValveToCompile").getFacts();
    sys.updateTable("groupValve", groupValveToCompile, []);
    var sortValveToCompile = system.getTable("sortValveToCompile").getFacts();
    sys.updateTable("sortValve", sortValveToCompile, []);
    var reducerToCompile = system.getTable("reducerToCompile").getFacts();
    sys.updateTable("reducer", reducerToCompile, []);
    var prev = compiledSystems[pendingCompiles[0][1]];
    var prevEvents = [];
    var parent;
    if(prev && prev.getUIRoot()) {
      parent = prev.getUIRoot().parentNode;
      if(parent) {
        parent.removeChild(prev.getUIRoot());
      }
      prevEvents = prev.system.getTable("externalEvent").getFacts();
    }
    try {
      compiledSystems[pendingCompiles[0][1]] = app(sys.refresh().recompile(), {parent: parent});
      compiledSystems[pendingCompiles[0][1]].system.updateTable("externalEvent", prevEvents, []);
      compiledSystems[pendingCompiles[0][1]].run([["time", 0], ["edge", "a", "b"], ["edge", "b", "c"], ["edge", "c", "d"], ["edge", "d", "b"]].concat(prevEvents));
    } catch(e) {
      console.log("compile failed");
    }
    console.timeEnd("compile");
    items.push(["compiled", pendingCompiles[0][0]]);
  }

  if(getTable.length) {
    var len = getTable.length;
    for(var i = 0; i < len; i++) {
      var cur = getTable[i];
      var sys = compiledSystems[cur[1]].system;
      if(!sys) continue;
      var id = cur[0];
      if(!compilerSeen[id]) {
        application.system.updateTable("gridItem", [], application.system.getTable("gridItem").getFacts());
        var table = sys.getTable(cur[2]).getFacts();
        var tableLen = table.length;
        if(tableLen) {
          var rowLen = table[0].length;
          for(var row = 0; row < tableLen && row < compilerRowLimit; row++) {
            for(var col = 0; col < rowLen; col++) {
              items.push(["gridItem", cur[3], row, col, table[row][col]]);
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
      var sys = compiledSystems[cur[1]].system;
      if(!sys) continue;
      var id = cur[0];
      if(!compilerSeen[id]) {
        application.system.updateTable("gridItem", [], application.system.getTable("gridItem").getFacts());
        var solver = sys.getSolver(cur[2]);
        if(!solver) continue;

        var table = solver.getFacts();
        var tableLen = table.length;
        if(tableLen) {
          var rowLen = table[0].length;
          for(var row = 0; row < tableLen && row < compilerRowLimit; row++) {
            for(var col = 0; col < rowLen; col++) {
              items.push(["gridItem", cur[3], row, col, table[row][col]]);
            }
          }
        }
        compilerSeen[id] = true;
      }
    }
  }


  if(items.length) {
    application.callRuntime(items);
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
    table("refresh", ["tick", "startTime", "endTime", "flow"])
  );
}

var Application = function(system, opts) {
  this.system = system;
  this.storage = {"uiWatcher": {"rootParent": (opts && opts["parent"])},
                  "compilerWatcher": {}};
}

Application.prototype.callRuntime = function(facts) {
  this.system.update(facts, [])
  this.system.refresh();
  compilerWatcher(this, this.storage["compilerWatcher"], this.system);
};

Application.prototype.getUIRoot = function() {
  if(this.storage["uiWatcher"].builtEls) {
    return this.storage["uiWatcher"].builtEls.root;
  }
};

Application.prototype.run = function(facts) {
  var start = now();
  this.callRuntime(facts);
  var runtime = now() - start;
  var uiStorage = this.storage["uiWatcher"];
  var system = this.system;
  var self = this;
  if(!uiStorage["queued"]) {
    uiStorage["queued"] = true;
    window.requestAnimationFrame(function() {
      start = now();
      uiDiffWatcher(self, uiStorage, system);
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

function app(system, opts) {
  return new Application(system, opts);
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

function onStart() {
  return source("time", {time: "time"});
}

function constantSink(table, map) {
  return function(context) {
    var items = [];
    var final = {};
    for(var i in map) {
      var id = "const" + context.nextId++;
      items.push(constant(id, map[i]));
      final[i] = id
    }
    items.push(sink(table, final));
    return compose.apply(null, items)(context);
  }
}

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

function stateValueAt(key, value, eid) {
  return function(context) {
    var keyId = key + context.nextId++;
    var stateTempId = "st" + context.nextId++;
    var sortedId = "sorted" + context.nextId++;
    var lessthanId = "lessthan" + context.nextId++;
    return compose(constant(keyId, key),
                   source("state-temp", {id: stateTempId, key: keyId, value: value}),
                   calculate(sortedId, [stateTempId], "-1 * " + stateTempId),
                   constant(lessthanId, true),
                   calculate(lessthanId, [stateTempId, eid], stateTempId + " <= " + eid),
                   aggregate([eid], [sortedId], 1))(context);
  }
}

function subProgram() {
  var args = arguments;
  return function(context) {
    context.program = 'p' + context.nextId++;
    var facts = [["program", context.program, args[0]]];
    for(var i = 1; i < args.length; i++) {
      Array.prototype.push.apply(facts, args[i](context));
    }
    return facts;
  }
}

//*********************************************************************
// Editor app
//*********************************************************************

var editor =
    subProgram("editor",
               commonTables(),

               //*********************************************************************
               // util
               //*********************************************************************

               table("state-temp", ["id", "key", "value"]),
               table("state", ["key", "value"]),
               table("latestId", ["id"]),
               table("removed", ["type", "id"]),

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

               rule("initial page",
                    onStart(),
                    constantSink("state-temp", {id: 0, key: "page", value: "program list"})
                    ),

               //*********************************************************************
               // Compiler
               //*********************************************************************


               table("getTable", ["id", "program", "table", "gridId"]),
               table("getIntermediate", ["id", "program", "rule", "gridId"]),
               table("getResult", ["id", "program", "rule", "sink", "gridId"]),

               rule("common tables",
                    onStart(),
                    constantSink("programTable", {program: "common", table: "displayName"}),
                    constantSink("programTable", {program: "common", table: "join"}),
                    constantSink("programTable", {program: "common", table: "editorRule"}),
                    constantSink("programTable", {program: "common", table: "externalEvent"}),
                    constantSink("programTable", {program: "common", table: "click"}),
                    constantSink("programTable", {program: "common", table: "mousePosition"}),
                    constantSink("programTable", {program: "common", table: "sms outbox"}),
                    constantSink("programTable", {program: "common", table: "user"}),
                    constantSink("programTable", {program: "common", table: "edge"}),
                    constantSink("programTable", {program: "common", table: "path"}),
                    constantSink("programTable", {program: "common", table: "uiElem"}),
                    constantSink("programTable", {program: "common", table: "uiText"}),
                    constantSink("programTable", {program: "common", table: "uiChild"}),
                    constantSink("programTable", {program: "common", table: "uiAttr"}),
                    constantSink("programTable", {program: "common", table: "uiStyle"}),
                    constantSink("programTable", {program: "common", table: "uiEvent"}),
                    constantSink("programTable", {program: "common", table: "time"}),
                    constantSink("programTable", {program: "common", table: "refresh"})
                   ),

               rule("add rule",
                    constant("label", "add rule"),
                    source("externalEvent", {eid: "eid", label: "label", key: "key", value: "rawName"}),
                    constant("unnamed", "unnamed"),
                    constant("setRuleName", "set rule name"),
                    constant("openRule", "open rule"),
                    sink("externalEvent", {eid: "eid", label: "openRule", key: "key", value: "unnamed"}),
                    sink("externalEvent", {eid: "eid", label: "setRuleName", key: "key", value: "unnamed"})
                   ),

               rule("editor rules by name",
                    constant("label", "set rule name"),
                    source("externalEvent", {eid: "eid", label: "label", key: "key", value: "rawName"}),
                    calculate("sorted", ["eid"], "-1 * eid"),
                    calculate("name", ["rawName"], "rawName === '' ? 'unnamed' : rawName"),
                    aggregate(["key"], ["sorted"], 1),
                    sink("editorRule", {id: "key", description: "name"})
                   ),

               rule("editor programRule",
                    constant("label", "set rule name"),
                    source("externalEvent", {eid: "eid", label: "label", key: "rule"}),
                    constant("activeProgram", "activeProgram"),
                    source("state-temp", {id: "pid", key: "activeProgram", value: "program"}),
                    calculate("sorted", ["pid"], "-1 * pid"),
                    constant("lessthan", true),
                    calculate("lessthan", ["pid", "eid"], "pid <= eid"),
                    aggregate(["eid"], ["sorted"], 1),
                    sink("compileProgram", {id: "eid", program: "program"}),
                    sink("programRule", {program: "program", rule: "rule"})
                   ),

               rule("compiler rules",
                    source("programRule", {program: "program", rule: "rule"}),
                    aggregate(["program"], ["rule"], undefined, "ix"),
                    sink("rule", {rule: "rule", ix: "ix"})),

               table("tableConstraint-temp", ["valve", "pipe", "field"]),

               table("compileProgram", ["id", "program"]),
               table("compiled", ["id"]),
               table("pendingCompiles", ["id", "program"]),
               table("tablesToCompile", ["table"]),
               table("fieldsToCompile", ["table", "field", "ix"]),
               table("rulesToCompile", ["rule", "ix"]),
               table("valvesToCompile", ["valve", "rule", "ix"]),
               table("pipesToCompile", ["pipe", "table", "rule", "direction"]),
               table("tableConstraintToCompile", ["valve", "pipe", "field"]),
               table("constantConstraintToCompile", ["valve", "value"]),
               table("functionConstraintToCompile", ["function", "code", "valve", "rule"]),
               table("functionConstraintInputToCompile", ["function", "valve", "variable"]),
               table("groupValveToCompile", ["rule", "valve"]),
               table("limitValveToCompile", ["rule", "valve"]),
               table("sortValveToCompile", ["rule", "valve", "ix"]),
               table("reducerToCompile", ["rule", "inValve", "outValve", "inVariable", "code"]),

               rule("pending compiles",
                    source("compileProgram", {program: "program", id: "id"}),
                    notSource("compiled", {id: "id"}),
                    sink("pendingCompiles", {id: "id", program: "program"})),

               rule("tables to compile",
                    source("compileProgram", {program: "program", id: "id"}),
                    source("programTable", {program: "program", table: "table"}),
                    notSource("compiled", {id: "id"}),
                    sink("tablesToCompile", {table: "table"})),

               rule("fields to compile",
                    source("tablesToCompile", {table: "table"}),
                    source("field", {table: "table", field: "field", ix: "ix"}),
                    sink("fieldsToCompile", {table: "table", field: "field", ix: "ix"})),

               rule("rules to compile",
                    source("pendingCompiles", {program: "program"}),
                    source("programRule", {program: "program", rule: "rule"}),
                    source("rule", {rule: "rule", ix: "ix"}),
                    sink("rulesToCompile", {rule: "rule", ix: "ix"})),

               rule("valves to compile",
                    source("rulesToCompile", {rule: "rule"}),
                    source("valve", {valve: "valve", rule: "rule", ix: "ix"}),
                    sink("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"})),

               rule("pipes to compile",
                    source("rulesToCompile", {rule: "rule"}),
                    source("pipe", {pipe: "pipe", table: "table", rule: "rule", direction: "direction"}),
                    sink("pipesToCompile", {pipe: "pipe", table: "table", rule: "rule", direction: "direction"})),

               rule("tableConstraints to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("tableConstraint", {valve: "valve", pipe: "pipe", field: "field"}),
                    sink("tableConstraintToCompile", {valve: "valve", pipe: "pipe", field: "field"})),

               rule("constantConstraints to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("constantConstraint", {valve: "valve", value: "value"}),
                    sink("constantConstraintToCompile", {valve: "valve", value: "value"})),

               rule("functionConstraintToCompile to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("functionConstraint", {function: "function", code: "code", valve: "valve", rule: "rule"}),
                    sink("functionConstraintToCompile", {function: "function", code: "code", valve: "valve", rule: "rule"})),

               rule("functionConstraintInputToCompile to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("functionConstraintInput", {function: "function", valve: "valve", variable: "variable"}),
                    sink("functionConstraintInputToCompile", {function: "function", valve: "valve", variable: "variable"})),

               rule("groupValve to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("groupValve", {rule: "rule", valve: "valve"}),
                    sink("groupValveToCompile", {rule: "rule", valve: "valve"})),

               rule("limitValve to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("limitValve", {rule: "rule", valve: "valve"}),
                    sink("limitValveToCompile", {rule: "rule", valve: "valve"})),

               rule("reducer to compile",
                    source("valvesToCompile", {valve: "valve", rule: "rule", ix: "ix"}),
                    source("reducer", {rule: "rule", inValve: "inValve", outValve: "outValve", inVariable: "inVariable", code: "code"}),
                    sink("reducerToCompile", {rule: "rule", inValve: "inValve", outValve: "outValve", inVariable: "inVariable", code: "code"})),

               //*********************************************************************
               // Program list
               //*********************************************************************

               rule("draw program list",
                    page("program list"),
                    elem("div", {id: "programs-list-container", class: "program-list-container", parent: ["root"]},
                         elem("div", {class: "cards-container"},
                              elem("ul", {id: "program-list", class: "program-list"}),
                              elem("span", {class: "add", click: ["add program", "foo"]}, "create a stack")),
                         elem("div", {class: "card-preview"})
              )),

               rule("draw program items",
                    page("program list"),
                    source("program", {id: "id", name: "name"}),
                    elem("li", {id: inject("id"), parent: ["program-list", inject("name")], click: ["open program", inject("id")]},
                         inject("name"))
                   ),


               rule("programs",
                    on("add program", {id: "id", eid: "eid"}),
                    calculate("programName", ["eid"], "'program ' + eid"),
                    set("activeProgram", "programName", {eid: "eid"}),
                    setConstant("page", "rules list", {eid: "eid"}),
                    sink("program", {id: "programName", name: "programName"})
                   ),

               rule("port all editor tables to new programs",
                    on("add program", {eid: "eid"}),
                    calculate("programName", ["eid"], "'program ' + eid"),
                    constant("common", "common"),
                    source("programTable", {program: "common", table: "table"}),
                    sink("programTable", {program: "programName", table: "table"})
                   ),

               rule("open program",
                    on("open program", {eid: "eid", key: "program"}),
                    set("activeProgram", "program", {eid: "eid"}),
                    setConstant("page", "rules list", {eid: "eid"})
                   ),

               //*********************************************************************
               // Cards
               //*********************************************************************

               table("card", ["id", "type"]),
               table("cardMeta", ["id", "field", "value"]),

               rule("card UI",
                    page("card UI"),
                    elem("div", {id: "card-ui", parent: ["root"], class: "card-ui"},
                         elem("ul", {id: "card-list", class: "card-list"}),
                         elem("button", {click: ["add card", ""]}, "add card")
                        )
                   ),

               rule("display table cards",
                    page("card UI"),
                    constant("table", "table"),
                    source("card", {id: "id", type: "table"}),
                    calculate("cardId", ["id"], "'card' + id"),
                    elem("li", {id: inject("cardId"), parent: ["card-list", inject("id")], class: "card"}, "this is a table card")),

               rule("display calculation cards",
                    page("card UI"),
                    constant("calculation", "calculation"),
                    source("card", {id: "id", type: "calculation"}),
                    calculate("cardId", ["id"], "'card' + id"),
                    elem("li", {id: inject("cardId"), parent: ["card-list", inject("id")], class: "card"}, "1 + 1 = 3")),

               rule("display text cards",
                    page("card UI"),
                    constant("text", "text"),
                    source("card", {id: "id", type: "text"}),
                    calculate("cardId", ["id"], "'card' + id"),
                    elem("li", {id: inject("cardId"), parent: ["card-list", inject("id")], class: "card"},
                         elem("textarea", {value: "this is some awesome text"}))),

               rule("display view cards",
                    page("card UI"),
                    constant("view", "view"),
                    source("card", {id: "id", type: "view"}),
                    calculate("cardId", ["id"], "'card' + id"),
                    elem("li", {id: inject("cardId"), parent: ["card-list", inject("id")], class: "card"}, "view!")),

               rule("add card",
                    on("add card", {eid: "eid"}),
                    constant("cancelAddCard", "cancel add card"),
                    notSource("externalEvent", {key: "eid", label: "cancelAddCard"}),
                    notSource("card", {id: "eid"}),
                    calculate("tableType", ["eid"], "eid + '_table'"),
                    calculate("calculationType", ["eid"], "eid + '_calculation'"),
                    calculate("textType", ["eid"], "eid + '_text'"),
                    calculate("viewType", ["eid"], "eid + '_view'"),
                    calculate("documentType", ["eid"], "eid + '_document'"),
                    calculate("websiteType", ["eid"], "eid + '_website'"),
                    elem("div", {id: "add-card-dialog", parent: ["card-ui"], class: "add-card-dialog"},
                         elem("h2", {}, "choose a type:"),
                         elem("ul", {},
                              elem("li", {click: ["set card type", inject("tableType")]}, "table"),
                              elem("li", {click: ["set card type", inject("calculationType")]}, "calculation"),
                              elem("li", {click: ["set card type", inject("textType")]}, "text"),
                              elem("li", {click: ["set card type", inject("viewType")]}, "view"),
                              elem("li", {click: ["set card type", inject("documentType")]}, "document"),
                              elem("li", {click: ["set card type", inject("websiteType")]}, "website")
                                 )
                        )
                   ),

               rule("set card type",
                    on("set card type", {key: "key"}),
                    calculate("eid", ["key"], "parseInt(key.split('_')[0])"),
                    calculate("type", ["key"], "key.split('_')[1]"),
                    sink("card", {id: "eid", type: "type"})
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

               rule("compile if uncompiled",
                    page("rules list"),
                    joinState("activeProgram", "program"),
                    calculate("id", ["program"], "'initial' + program"),
//                     notSource("compileProgram", {program: "program"}),
                    sink("compileProgram", {id: "id", program: "program"})
                   ),

               rule("active program ui",
                    page("rules list"),
                    source("compileProgram", {program: "program"}),
                    joinState("activeProgram", "program"),
                    calculate("uiRoot", ["program"], "program + '_root'"),
                    constant("pos", 0),
                    constant("subProgramUI", "subProgramUI"),
                    sink("uiChild", {parent: "subProgramUI", child: "uiRoot", pos: "pos"})),

               rule("draw rules list ui",
                    page("rules list"),
                    source("latestId", {id: "id"}),
                    pretendConstant("drawTablesList", "true"),
                    elem("div", {id: "rules-list-root", parent: ["root"], class: "root rules-list-container"},
                         elem("header", {},
                              elem("button", {click: ["goto page", "program list"]}, "back")),
                         elem("div", {},
                              elem("ul", {id: "table-list", class: "table-list"}),
                              elem("div", {},
                                   elem("ul", {id: "rules-list", class: "rules-list"}),
                                   elem("button", {click: ["add rule", inject("id")]}, "add rule")
                                  )),
                         elem("div", {id: "subProgramUI"})
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
                              elem("ul", {id: inject("sinksId"), class: "sinks"})
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
                    calculate("id", ["table", "rid"], "'sink' + table + rid"),
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
                    joinState("activeProgram", "program"),
                    source("programTable", {table: "tableId", program: "program"}),
                    stateEq("drawTablesList", "true"),
                    calculate("id", ["tableId"], "'table' + tableId"),
                    calculate("fieldsId", ["tableId"], "'table-fields' + tableId"),
                    elem("li", {id: inject("id"), parent: ["table-list", inject("tableId")], draggable: "true", dragStart:["add pipe", inject("tableId")],  click: ["open table", inject("tableId")], doubleClick: ["toggle table", inject("tableId")]},
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
                    pretendConstant("drawTablesList", "true"),
                    elem("div", {id: "rule-page", parent: ["root"], class: "rule-page"},
                         elem("header", {},
                              elem("button", {click: ["goto page", "rules list"]}, "back"),
                              elem("input", {type: "text", input: ["set rule name", inject("rid")], value: inject("description")})),
                         elem("div", {class: "vbox"},
                              elem("ul", {id: "table-list", class: "table-list"}),
                              elem("div", {class: "io"},
                                   elem("ul", {id: inject("sourcesId"), class: "sources", drop: ["source drop", ""], dragOver: ["", ""]}),
//                                    elem("div", {class: "separator"},
//                                         elem("svg", {width:"100%", height:"100%", viewbox: "0 0 10 20", preserveaspectratio: "none"},
//                                              elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokewidth:"0.5"}))),
                                   elem("div", {id: "workspace", class: "workspace", dragOver: ["", ""], drop: ["add to workspace", ""]}),
//                                    elem("div", {class: "separator"},
//                                         elem("svg", {width:"100%", height:"100%", viewbox: "0 0 10 20", preserveaspectratio: "none"},
//                                              elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokewidth:"0.5"}))),
                                   elem("ul", {id: inject("sinksId"), class: "sinks", drop: ["sink drop", ""], dragOver: ["", ""]}))
                                  )
                        )),

               rule("on source drop",
                    on("source drop", {value: "eid"}),
                    constant("addPipe", "add pipe"),
                    source("externalEvent", {eid: "eid", label: "addPipe", key: "table"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    constant("+source", "+source"),
                    sink("pipe", {pipe: "eid", table: "table", rule: "rule", direction: "+source"})),

               rule("on sink drop ",
                    on("sink drop", {value: "eid"}),
                    constant("addPipe", "add pipe"),
                    source("externalEvent", {eid: "eid", label: "addPipe", key: "table"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    constant("+sink", "+sink"),
                    sink("pipe", {pipe: "eid", table: "table", rule: "rule", direction: "+sink"})),

               rule("add table to workspace",
                    on("add to workspace", {value: "eid"}),
                    constant("addPipe", "add pipe"),
                    source("externalEvent", {eid: "eid", label: "addPipe", key: "table"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    constant("+source", "+source"),
                    sink("pipe", {pipe: "eid", table: "table", rule: "rule", direction: "+source"})
                   ),

               rule("append table valves to workspace",
                    on("add to workspace", {value: "eid"}),
                    constant("addPipe", "add pipe"),
                    source("externalEvent", {eid: "eid", label: "addPipe", key: "table"}),
                    source("field", {table: "table", field: "field", ix: "ix"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    aggregate(["field"], ["ix"]),
                    calculate("valve", ["eid", "field"], "eid + '_' + field"),
                    calculate("name", ["table", "field"], "table + '.' + field"),
                    sink("displayName", {id: "valve", name: "name"}),
                    sink("valveToEid-temp", {valve: "valve", rule: "rule", eid: "eid", ix: "ix"}),
                    sink("tableConstraint-temp", {valve: "valve", pipe: "eid", field: "field"})
                   ),

               rule("append pipe valves to workspace",
                    on("add to workspace", {value: "eid"}),
                    constant("moveSource", "move source"),
                    source("externalEvent", {eid: "eid", label: "moveSource", key: "pipe"}),
                    source("pipe", {pipe: "pipe", table: "table"}),
                    source("field", {table: "table", field: "field", ix: "ix"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    aggregate(["field"], ["ix"]),
                    calculate("valve", ["pipe", "field"], "pipe + '_' + field"),
                    calculate("name", ["table", "field"], "table + '.' + field"),
                    sink("displayName", {id: "valve", name: "name"}),
                    sink("valveToEid-temp", {valve: "valve", rule: "rule", eid: "eid", ix: "ix"}),
                    sink("tableConstraint-temp", {valve: "valve", pipe: "eid", field: "field"})
                   ),

               rule("rule page sources",
                    page("rule"),
                    source("editorRule", {id: "rid"}),
                    constant("dir", "+source"),
                    source("pipe", {rule: "rid", direction: "dir", table: "table", pipe: "pipe"}),
                    joinState("activeRule", "rid"),
                    calculate("id", ["pipe"], "'source' + pipe"),
                    calculate("parent", ["pipe", "rid"], "'sources' + rid"),
                    calculate("sourceFieldsId", ["pipe"], "'rule-source-fields' + pipe"),
                    elem("li", {id: inject("id"), parent: [inject("parent"), inject("table")], draggable: "true", dragStart: ["move source", inject("pipe")],  class: "io-item"},
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

                    calculate("dragId", ["pipeId", "fieldId"], "pipeId + '_' + fieldId"),
                    calculate("id", ["pipeId", "fieldId"], "'rule-source-field' + pipeId + '_' + fieldId"),
                    calculate("parent", ["pipeId"], "'rule-source-fields' + pipeId"),

                    elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")], draggable: "true", dragStart: ["move source field", inject("dragId")]},
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
                    source("tableConstraint-temp", {valve: "valve", pipe: "pipeId", field: "fieldId"}),
                    source("displayName", {id: "valve", name: "name"}),

                    joinState("activeRule", "rid"),

                    calculate("id", ["pipeId", "fieldId"], "'rule-sink-output' + pipeId + '_' + fieldId"),
                    calculate("parent", ["pipeId"], "'rule-outputs-fields' + pipeId"),

                    elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")]},
                         inject("name")
                        )),

               rule("rule page sink outputs without displayName",
                    page("rule"),
                    source("editorRule", {id: "rid"}),
                    constant("dir", "+sink"),
                    source("pipe", {pipe: "pipeId", table: "tableId", rule: "rid", direction: "dir"}),
                    source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                    source("tableConstraint-temp", {valve: "valve", pipe: "pipeId", field: "fieldId"}),
                    notSource("displayName", {id: "valve"}),

                    joinState("activeRule", "rid"),

                    calculate("id", ["pipeId", "fieldId"], "'rule-sink-output' + pipeId + '_' + fieldId"),
                    calculate("parent", ["pipeId"], "'rule-outputs-fields' + pipeId"),

                    elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")]},
                         inject("valve")
                        )),

               rule("rule page sink missing outputs",
                    page("rule"),
                    source("editorRule", {id: "rid"}),
                    constant("dir", "+sink"),
                    source("pipe", {pipe: "pipeId", table: "tableId", rule: "rid", direction: "dir"}),
                    source("field", {table: "tableId", field: "fieldId", ix: "ix"}),
                    notSource("tableConstraint-temp", {pipe: "pipeId", field: "fieldId"}),

                    joinState("activeRule", "rid"),

                    calculate("sinkId", ["pipeId", "fieldId"], "pipeId + '_' + fieldId"),
                    calculate("id", ["pipeId", "fieldId"], "'rule-sink-output' + pipeId + '_' + fieldId"),
                    calculate("parent", ["pipeId"], "'rule-outputs-fields' + pipeId"),

                    elem("li", {id: inject("id"), parent: [inject("parent"), inject("ix")], class: "empty-output", drop: ["link to sink", inject("sinkId")]},
                         "- - - -"
                        )),

               /////////////////////////////////////////////////////////////////////////////////
               // I think this is now a reasonable way of handling adding ix's to valves. It also
               // takes care of deduping and ensures that valves stay in the order they were added in.
               // Later we'll have to come up with a way to make them reorderable.

               table("valveToEid-temp", ["valve", "rule", "eid", "ix"]),
               table("valveToEid", ["valve", "rule", "eid", "ix"]),

               rule("valve to eid",
                    source("valveToEid-temp", {valve: "valve", rule: "rule", eid: "eid", ix: "ix"}),
                    aggregate(["valve"], ["eid"], 1),
                    sink("valveToEid", {valve: "valve", rule: "rule", eid: "eid", ix: "ix"})),

               rule("from eid valves to valves",
                    source("valveToEid", {valve: "valve", rule: "rule", eid: "eid", ix: "eidIx"}),
                    constant("valveConst", "valve"),
                    notSource("removed", {type: "valveConst", id: "valve"}),
                    aggregate(["rule"], ["eid", "eidIx"], undefined, "ix"),
                    sink("valve", {valve: "valve", rule: "rule", ix: "ix"})
                   ),

               rule("tableConstraint-temp to constraints",
                    source("tableConstraint-temp", {valve: "valve", pipe: "pipe", field: "field"}),
                    constant("tableConstraintType", "tableConstraint"),
                    notSource("removed", {type: "tableConstraintType", id: "valve"}),
                    sink("tableConstraint", {valve: "valve", pipe: "pipe", field: "field"})
                   ),

               // end hack
               ///////////////////////////////////////////////////////////////////////////////////

               rule("link input to output causes a recompile",
                    on("link to sink", {value: "eid"}),
                    stateValueAt("activeProgram", "program", "eid"),
                    sink("compileProgram", {id: "eid", program: "program"})
                   ),

               rule("add to workspace causes a recompile",
                    on("add to workspace", {value: "eid"}),
                    stateValueAt("activeProgram", "program", "eid"),
                    sink("compileProgram", {id: "eid", program: "program"})
                   ),

               rule("join causes a recompile",
                    on("drop on column", {value: "eid"}),
                    stateValueAt("activeProgram", "program", "eid"),
                    sink("compileProgram", {id: "eid", program: "program"})
                   ),

               //////////////////////////////////////////////////////////////////////////////////
               // this is a hack and works largely by accident. This should really use stateValueAt
               // in order to match requests up with the correct program/rule/gridId, but that requires
               // multiple aggregates in a single rule.
               rule("link input to output needs new intermediates",
                    on("link to sink", {value: "eid"}),
                    joinState("activeProgram", "program"),
                    joinState("activeRule", "rule"),
                    joinState("activeRuleGridId", "id"),
                    sink("getIntermediate", {rule: "rule", program: "program", id: "eid", gridId: "id"})
                   ),

               rule("add to workspace needs new intermediates",
                    on("add to workspace", {value: "eid"}),
                    joinState("activeProgram", "program"),
                    joinState("activeRule", "rule"),
                    joinState("activeRuleGridId", "id"),
                    sink("getIntermediate", {rule: "rule", program: "program", id: "eid", gridId: "id"})
                   ),

               rule("join needs new intermediates",
                    on("drop on column", {value: "eid"}),
                    joinState("activeProgram", "program"),
                    joinState("activeRule", "rule"),
                    joinState("activeRuleGridId", "id"),
                    sink("getIntermediate", {rule: "rule", program: "program", id: "eid", gridId: "id"})
                   ),
               // end hack
               ///////////////////////////////////////////////////////////////////////////////////


               rule("link input to output",
                    on("link to sink", {value: "eid", key: "sinkpipe_field"}),
                    constant("moveSourceField", "move source field"),
                    source("externalEvent", {eid: "eid", label: "moveSourceField", key: "sourcepipe_field"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    source("pipe", {pipe: "sourcePipe", table: "table"}),
                    calculate("sourcePipe", ["sourcepipe_field"], "parseInt(sourcepipe_field.split('_')[0])"),
                    calculate("sourceField", ["sourcepipe_field"], "sourcepipe_field.split('_')[1]"),
                    calculate("sinkPipe", ["sinkpipe_field"], "parseInt(sinkpipe_field.split('_')[0])"),
                    calculate("sinkField", ["sinkpipe_field"], "sinkpipe_field.split('_')[1]"),
                    calculate("name", ["table", "sourceField"], "table + '.' + sourceField"),
                    sink("displayName", {id: "sourcepipe_field", name: "name"}),
                    sink("valveToEid-temp", {valve: "sourcepipe_field", rule: "rule", eid: "eid", ix: "eid"}),
                    sink("tableConstraint-temp", {valve: "sourcepipe_field", pipe: "sourcePipe", field: "sourceField"}),
                    sink("tableConstraint-temp", {valve: "sourcepipe_field", pipe: "sinkPipe", field: "sinkField"})
                   ),

               rule("add field to workspace",
                    on("add to workspace", {value: "eid"}),
                    constant("moveSourceField", "move source field"),
                    source("externalEvent", {eid: "eid", label: "moveSourceField", key: "sourcepipe_field"}),
                    stateValueAt("activeRule", "rule", "eid"),
                    calculate("sourcePipe", ["sourcepipe_field"], "parseInt(sourcepipe_field.split('_')[0])"),
                    calculate("sourceField", ["sourcepipe_field"], "sourcepipe_field.split('_')[1]"),
                    calculate("name", ["table", "sourceField"], "table + '.' + sourceField"),
                    source("pipe", {pipe: "sourcePipe", table: "table"}),
                    sink("displayName", {id: "sourcepipe_field", name: "name"}),
                    sink("valveToEid-temp", {valve: "sourcepipe_field", rule: "rule", eid: "eid", ix: "eid"}),
                    sink("tableConstraint-temp", {valve: "sourcepipe_field", pipe: "sourcePipe", field: "sourceField"})
                   ),


               rule("link valve to output",
                    on("link to sink", {value: "eid", key: "sinkpipe_field"}),
                    constant("moveColumn", "move column"),
                    source("externalEvent", {eid: "eid", label: "moveColumn", key: "valve"}),
                    calculate("sinkPipe", ["sinkpipe_field"], "parseInt(sinkpipe_field.split('_')[0])"),
                    calculate("sinkField", ["sinkpipe_field"], "sinkpipe_field.split('_')[1]"),
                    sink("tableConstraint-temp", {valve: "valve", pipe: "sinkPipe", field: "sinkField"})
                   ),

               rule("join columns",
                    on("drop on column", {value: "eid", key: "rootOfJoin"}),
                    constant("moveColumn", "move column"),
                    source("externalEvent", {eid: "eid", label: "moveColumn", key: "valve"}),
                    source("tableConstraint-temp", {valve: "valve", pipe: "pipe", field: "field"}),
                    constant("+source", "+source"),
                    source("pipe", {pipe: "pipe", direction: "+source"}),
                    constant("valveType", "valve"),
                    constant("tableConstraintType", "tableConstraint"),
                    sink("removed", {type: "tableConstraintType", id: "valve"}),
                    sink("removed", {type: "valveType", id: "valve"}),
                    sink("tableConstraint-temp", {valve: "rootOfJoin", pipe: "pipe", field: "field"}),
                    sink("join", {valve: "rootOfJoin", pipe: "pipe", field: "field"})
                   ),

               rule("get grid for rule page",
                    page("rule"),
                    joinState("activeRule", "rid"),
                    joinState("activeRuleGridId", "gridId"),
                    joinState("activeProgram", "program"),
                    sink("getIntermediate", {rule: "rid", program: "program", id: "gridId", gridId: "gridId"})),

               rule("grid headers for workspace grid",
                    page("rule"),
                    joinState("activeRuleGridId", "gridId"),
                    joinState("activeRule", "rid"),
                    source("valve", {rule: "rid", valve: "valve", ix: "ix"}),
                    source("displayName", {id: "valve", name: "name"}),
                    sink("gridHeader", {gridId: "gridId", name: "name", ix: "ix", key: "valve"})),

               rule("grid headers for workspace grid without displayName",
                    page("rule"),
                    joinState("activeRuleGridId", "gridId"),
                    joinState("activeRule", "rid"),
                    source("valve", {rule: "rid", valve: "valve", ix: "ix"}),
                    notSource("displayName", {id: "valve"}),
                    sink("gridHeader", {gridId: "gridId", name: "valve", ix: "ix", key: "valve"})),

               //*********************************************************
               // Grids
               //*********************************************************

               table("gridItem", ["gridId", "row", "col", "val"]),
               table("gridHeader", ["gridId", "name", "ix", "key"]),
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
                    elem("div", {id: inject("colId"), parent: [inject("rowId"), inject("gridCol")], click: ["click", inject("gridId")]},
                         inject("gridVal")
                        )),

               rule("draw grid headers",
                    source("drawGrid", {gridId: "gridId"}),
                    source("gridHeader", {gridId: "gridId", ix: "ix", name: "name", key: "key"}),
                    calculate("headerId", ["gridId"], "'grid-header' + gridId"),
                    calculate("itemId", ["ix", "gridId"], "'grid-header-item' + gridId + '_' + ix"),
                    elem("div", {id: inject("itemId"), parent: [inject("headerId"), inject("ix")], draggable: "true", dragStart: ["move column", inject("key")], dragOver: ["", ""], drop: ["drop on column", inject("key")]},
                         inject("name")
                        )),

               //*********************************************************
               // table page
               //*********************************************************

               rule("get grid for table page",
                    page("table"),
                    joinState("activeTable", "table"),
                    joinState("activeTableGridId", "id"),
                    joinState("activeProgram", "program"),
                    sink("getTable", {table: "table", program: "program", id: "id", gridId: "id"})),

               rule("grid headers for table page",
                    page("table"),
                    joinState("activeTableGridId", "gridId"),
                    joinState("activeTable", "table"),
                    source("field", {table: "table", field: "field", ix: "ix"}),
                    calculate("table_field", ["table", "field"], "table + '_' + field"),
                    sink("gridHeader", {gridId: "gridId", name: "field", ix: "ix", key: "field"})),

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

    );

var curApp = app(program("editor", editor), {parent: document.body});

var context = {nextId: 10000};
var paths =
    subProgram("paths",
               commonTables(),
               rule("blah blah",
                    source("time", {time: "time"}),
                    elem("button", {id: "time", parent: ["root", 0], click: ["add one", "foo"]}, "add one")),
               rule("count",
                    constant("addOne", "add one"),
                    source("externalEvent", {label: "addOne", eid: "eid"}),
                    aggregate(["addOne"], []),
                    reduce("count", "eid", "eid.length"),
                    elem("p", {id: "count", parent: ["root", 1]}, inject("count"))
                   )


              )(context);

//curApp.run([["time", 0], ["edge", "a", "b"], ["edge", "b", "c"]].concat(paths));
