//*********************************************************
// utils
//*********************************************************

var now = function() {
  if(typeof window !== "undefined" && window.performance) {
    return window.performance.now();
  } else if(typeof performance !== "undefined") {
    return performance.now();
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
      system.getStore(table).diff(storage[table], adds, removes);
      storage[table] = system.getStore(table);
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      storage[table] = system.getStore(table);
      diff[table] = {
        adds: system.getStore(table).getFacts(),
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
  if(!system.getStore("getTable")) return;

  var getTable = system.getStore("getTable").getFacts();
  var getIntermediate = system.getStore("getIntermediate").getFacts();
  var getResult = system.getStore("getResult").getFacts();
  var pendingCompiles = system.getStore("pendingCompiles").getFacts();

  var items = [];

  if(pendingCompiles.length) {
    console.time("compile");
    var sys = System.empty({name: pendingCompiles[0][1]});
    var tablesToCompile = system.getStore("tablesToCompile").getFacts();
    sys.updateTable("table", tablesToCompile, []);
    var rulesToCompile = system.getStore("rulesToCompile").getFacts();
    sys.updateTable("rule", rulesToCompile, []);
    var fieldsToCompile = system.getStore("fieldsToCompile").getFacts();
    sys.updateTable("field", fieldsToCompile, []);
    var valvesToCompile = system.getStore("valvesToCompile").getFacts();
    sys.updateTable("valve", valvesToCompile, []);
    var pipesToCompile = system.getStore("pipesToCompile").getFacts();
    sys.updateTable("pipe", pipesToCompile, []);
    var tableConstraintToCompile = system.getStore("tableConstraintToCompile").getFacts();
    sys.updateTable("tableConstraint", tableConstraintToCompile, []);
    var constantConstraintToCompile = system.getStore("constantConstraintToCompile").getFacts();
    sys.updateTable("constantConstraint", constantConstraintToCompile, []);
    var functionConstraintToCompile = system.getStore("functionConstraintToCompile").getFacts();
    sys.updateTable("functionConstraint",functionConstraintToCompile, []);
    var functionConstraintInputToCompile = system.getStore("functionConstraintInputToCompile").getFacts();
    sys.updateTable("functionConstraintInput", functionConstraintInputToCompile, []);
    var limitValveToCompile = system.getStore("limitValveToCompile").getFacts();
    sys.updateTable("limitValve", limitValveToCompile, []);
    var groupValveToCompile = system.getStore("groupValveToCompile").getFacts();
    sys.updateTable("groupValve", groupValveToCompile, []);
    var sortValveToCompile = system.getStore("sortValveToCompile").getFacts();
    sys.updateTable("sortValve", sortValveToCompile, []);
    var reducerToCompile = system.getStore("reducerToCompile").getFacts();
    sys.updateTable("reducer", reducerToCompile, []);
    var prev = compiledSystems[pendingCompiles[0][1]];
    var prevEvents = [];
    var parent;
    if(prev && prev.getUIRoot()) {
      parent = prev.getUIRoot().parentNode;
      if(parent) {
        parent.removeChild(prev.getUIRoot());
      }
      prevEvents = prev.system.getStore("externalEvent").getFacts();
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
        application.system.updateTable("gridItem", [], application.system.getStore("gridItem").getFacts());
        var table = sys.getStore(cur[2]).getFacts();
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
        application.system.updateTable("gridItem", [], application.system.getStore("gridItem").getFacts());
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

var Application = function(system, opts) {
  this.system = system;
  this.storage = {"uiWatcher": {"rootParent": (opts && opts["parent"])},
                  "compilerWatcher": {}};
}

Application.prototype.callRuntime = function(facts) {
  this.system.update(facts, [])
  this.system.refresh();
  compilerWatcher(this, this.storage["compilerWatcher"], this.system);
  compilerWatcher2(this, this.storage["compilerWatcher"], this.system);
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
//   if(!uiStorage["queued"]) {
//     uiStorage["queued"] = true;
//     window.requestAnimationFrame(function() {
//       start = now();
//       uiDiffWatcher(self, uiStorage, system);
//       var render = now() - start;
//       $("#renderStat").html(render.toFixed(2));
//       uiStorage["queued"] = false;
//     });
//   }
//   $("#timeStat").html(runtime.toFixed(2));
  var numFacts = 0;
  var tableToStore = this.system.tableToStore;
  for (var table in tableToStore) {
    numFacts += this.system.getStore(tableToStore[table]).facts.length;
  }
  console.log("numFacts", numFacts);
  postMessage({type: "runStats", runtime: runtime.toFixed(2), numFacts: numFacts});
//   $("#factsStat").html(numFacts);
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

// var curApp = app(program("editor", editor), {parent: document.body});

// var context = {nextId: 10000};
// var paths =
//     subProgram("paths",
//                rule("blah blah",
//                     source("time", {time: "time"}),
//                     elem("button", {id: "time", parent: ["root", 0], click: ["add one", "foo"]}, "add one")),
//                rule("count",
//                     constant("addOne", "add one"),
//                     source("externalEvent", {label: "addOne", eid: "eid"}),
//                     aggregate(["addOne"], []),
//                     reduce("count", "eid", "eid.length"),
//                     elem("p", {id: "count", parent: ["root", 1]}, inject("count"))
//                    )


//               )(context);

//curApp.run([["time", 0], ["edge", "a", "b"], ["edge", "b", "c"]].concat(paths));
