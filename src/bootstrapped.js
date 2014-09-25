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

var createUICallback = function(id, label, key) {
  return function(e) {
    console.log("event: ", e);
    program.run([["externalEvent", id, label, key, eve.data.globalId++, e.target.value]]);
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
};

var uiWatcher = function(prev, system) {
  //var adds = [];
  //var removes = [];
  //system.diff(prev, adds, removes);

  //console.log(adds);
  //console.log(removes);

  var elem = system.getTable("uiElem").getFacts();
  var text = system.getTable("uiText").getFacts();
  var attrs = system.getTable("uiAttr").getFacts();
  var styles = system.getTable("uiStyle").getFacts();
  var events = system.getTable("uiEvent").getFacts();
  var children = system.getTable("uiChild").getFacts();

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

  var builtEls = program.builtEls || {"root": document.createElement("div")};
  var roots = {};

  if(program.root) {
    document.body.removeChild(program.root);
    while(program.root.children.length) {
      program.root.removeChild(program.root.children[0]);
    }
  }

  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    roots[cur[elem_id]] = true;
    if(!svgs[cur[elem_type]]) {
      builtEls[cur[elem_id]] = document.createElement(cur[elem_type]);
    } else {
      builtEls[cur[elem_id]] = document.createElementNS("http://www.w3.org/2000/svg", cur[elem_type]);
    }
  }

  var textLen = text.length;
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    builtEls[cur[elem_id]] = document.createTextNode(cur[text_text]);
  }

  var attrsLen = attrs.length;
  for(var i = 0; i < attrsLen; i++) {
    var cur = attrs[i];
    builtEls[cur[elem_id]].setAttribute(cur[attrs_attr], cur[attrs_value]);
  }

  var stylesLen = styles.length;
  for(var i = 0; i < stylesLen; i++) {
    var cur = styles[i];
    builtEls[cur[elem_id]].style[cur[styles_attr]] = cur[styles_value];
  }

  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    builtEls[cur[elem_id]].addEventListener(cur[events_event], createUICallback(cur[elem_id], cur[events_label], cur[events_key]));
  }

  var childrenLen = children.length;
  children.sort();
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    delete roots[cur[child_childid]];
    builtEls[cur[elem_id]].appendChild(child);
  }

  if(!program.root) {
    program.builtEls = builtEls;
    program.root = builtEls["root"];
  }
  for(var i in roots) {
    program.root.appendChild(builtEls[i]);
  }

  document.body.appendChild(program.root);
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
  console.log(diff);


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

  var events = diff["uiEvent"].adds;
  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    builtEls[cur[elem_id]].addEventListener(cur[events_event], createUICallback(cur[elem_id], cur[events_label], cur[events_key]));
  }

  var children = diff["uiChild"].adds;
  var childrenLen = children.length;
  children.sort();
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    builtEls[cur[elem_id]].appendChild(child);
  }

  if(!storage["builtEls"]) {
    storage["builtEls"] = builtEls;
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
        var fields = dsl.tableToFields[cur[1]];
        if(fields) {
          for(var header = 0; header < fields.length; header++) {
            items.push(["gridHeader", cur[2], fields[header], header]);
          }
        }
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
    console.log("grid", items);
    program.callRuntime(items);
  }
};

//*********************************************************
// Program
//*********************************************************

var program = eve.dsl.system();
eve.test.wrapCommonTables(program);

program.storage = {"uiWatcher": {},
                   "compilerWatcher": {}};

program.callRuntime = function(facts) {
  var prev; // TODO COW system
  this.input(facts);
  compilerWatcher(this.storage["compilerWatcher"], this.system);
};

program.run = function(facts) {
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

//*********************************************************
// utils
//*********************************************************

var elem = eve.ui.elem;
var ref = eve.ui.ref;

var on = function(rule, label) {
  rule.source("externalEvent");
  rule.eq("externalEvent.label", label);
};

var setConstant = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("externalEvent.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.outputConstant(v, "state-temp.value");
};

var set = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("externalEvent.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.output(v, "state-temp.value");
};

var stateAs = function(rule, k, as) {
  rule.source("state", as);
  rule.eq(as + ".key", k);
};

var outputState = function(rule, k, to) {
  var id = dsl.nextId();
  rule.source("state", id);
  rule.eq(id + ".key", k);
  rule.output(id + ".value", to);
};

var joinState = function(rule, k, to) {
  var id = dsl.nextId();
  rule.source("state", id);
  rule.eq(id + ".key", k);
  rule.join(to, id + ".value");
};

var stateEq = function(rule, k, v) {
  var id = dsl.nextId();
  rule.source("state", id);
  rule.eq(id + ".key", k);
  rule.eq(id + ".value", v);
};

var pretendConstant = function(rule, k, v) {
  var state = dsl.nextId();
  rule.sink("state", state);
  rule.outputConstant(k, state + ".key");
  rule.outputConstant(v, state + ".value");
};

var page = function(rule, p) {
  stateEq(rule, "page", p);
};


program.table("state-temp", ["id", "key", "value"]);
program.table("state", ["key", "value"]);
program.table("latestId", ["id"]);

program.rule("real state", function(rule) {
  rule.source("state-temp");
  rule.sink("state");
  rule.calculate("sorted", ["state-temp.id"], "-1 * state-temp.id");
  rule.group("state-temp.key");
  rule.sort("sorted");
  rule.constantLimit(1);
  rule.output("state-temp.key", "state.key");
  rule.output("state-temp.value", "state.value");
});

program.rule("latest eid", function(rule) {
  rule.source("externalEvent");
  rule.sink("latestId");
  rule.calculate("sorted", ["externalEvent.eid"], "-1 * externalEvent.eid");
  rule.sort("sorted");
  rule.constantLimit(1);
  rule.output("externalEvent.eid", "latestId.id");
});



//*********************************************************
// compiler stuff
//*********************************************************

program.table("getTable", ["id", "table", "gridId"]);
program.table("getIntermediate", ["id", "rule", "gridId"]);
program.table("getResult", ["id", "rule", "sink", "gridId"]);

program.rule("editor rules by name", function(rule) {
  rule.source("externalEvent");
  rule.sink("editorRule");
  rule.eq("externalEvent.label", "set rule name");
  rule.calculate("sorted", ["externalEvent.eid"], "-1 * externalEvent.eid");
  rule.calculate("name", ["externalEvent.value"], "externalEvent.value === '' ? 'unnamed' : externalEvent.value");
  rule.sort("sorted");
  rule.group("externalEvent.key");
  rule.constantLimit(1);
  rule.output("externalEvent.key", "editorRule.id");
  rule.output("name", "editorRule.description");
});

//*********************************************************
// editor
//*********************************************************

program.rule("on goto page", function(rule) {
  on(rule, "goto page");
  set(rule, "page", "externalEvent.key");
});

program.rule("draw rules list ui", function(rule) {
  rule.source("latestId");
  page(rule, "rules list");
  pretendConstant(rule, "drawTablesList", "true");
  rule.ui(elem("div", {id: ["rules-list-root"], parent: ["root"], class: "root"}, [
    elem("ul", {id: ["table-list"], class: "table-list"}, []),
    elem("button", {click: ["set rule name", ref("latestId.id")]}, ["add rule"]),
    elem("ul", {id: ["rules-list"], class: "rules-list"}, [])
  ]));
});

program.rule("draw rule", function(rule) {
  rule.source("editorRule");
  page(rule, "rules list");
  rule.ui(elem("li", {id: ["rule", "editorRule.id"], parent: ["rules-list", "", "editorRule.id"], click: ["open rule", ref("editorRule.id")]}, [
    elem("h2", {}, [ref("editorRule.description")]),
    elem("div", {class: "io"}, [
      elem("ul", {id: ["sources", "editorRule.id"], class: "sources"}, []),
      elem("div", {class: "separator"}, [
        elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"}, [
          elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"}, [])
        ])
      ]),
      elem("ul", {id: ["sinks", "editorRule.id"], class: "sinks"}, [])
    ])
  ]));
});


program.rule("rules list sources", function(rule) {
  page(rule, "rules list");
  rule.source("editorRule");
  rule.source("pipe");

  rule.join("editorRule.id", "pipe.rule");
  rule.eq("pipe.direction", "+source");

  rule.calculate("id", ["pipe.table", "editorRule.id"], "pipe.table + editorRule.id");

  rule.ui(elem("li", {id: ["source", "id"], parent: ["sources", "editorRule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.rule("rules list sinks", function(rule) {
  page(rule, "rules list");
  rule.source("editorRule");
  rule.source("pipe");

  rule.join("editorRule.id", "pipe.rule");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.table", "editorRule.id"], "pipe.table + editorRule.id");

  rule.ui(elem("li", {id: ["sink", "id"], parent: ["sinks", "editorRule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.table("openTable-temp", ["table", "state"]);
program.table("openTable", ["table"]);

program.rule("table is open? -temp", function(rule) {
  on(rule, "toggle table");
  rule.sink("openTable-temp");
  rule.fieldToValve("externalEvent.eid");
  rule.group("externalEvent.key");
  rule.aggregate("externalEvent.key", "open/closed", "(externalEvent.key).length % 2 === 0 ? 'closed' : 'open'");
  rule.output("open/closed", "openTable-temp.state");
  rule.output("externalEvent.key", "openTable-temp.table");
});

program.rule("table is open?", function(rule) {
  rule.source("openTable-temp");
  rule.sink("openTable");
  rule.eq("openTable-temp.state", "open");
  rule.output("openTable-temp.table", "openTable.table");
});

program.rule("draw table", function(rule) {
  rule.source("field");
  page(rule, "rules list");
  stateEq(rule, "drawTablesList", "true");
  rule.group("field.table");
  rule.ui(elem("li", {id: ["table", "field.table"], parent: ["table-list", "", "field.table"], click: ["open table", ref("field.table")], doubleClick: ["toggle table", ref("field.table")]}, [
    elem("h2", {}, [ref("field.table")]),
    elem("ul", {id: ["table-fields", "field.table"]}, [])
  ]));
});

program.rule("draw fields for openTable", function(rule) {
  rule.source("openTable");
  rule.source("field");
  rule.source("displayName");
  stateEq(rule, "drawTablesList", "true");
  rule.join("field.table", "openTable.table");
  rule.join("field.field", "displayName.id");
  rule.calculate("id", ["field.table", "field.field"], "field.table + '.' + field.field");
  rule.ui(elem("li", {id: ["table-field", "id"], parent: ["table-fields", "field.table", "field.ix"]}, [
    ref("displayName.name")
  ]));
});

program.rule("open table", function(rule) {
  on(rule, "open table");
  set(rule, "activeTable", "externalEvent.key");
  setConstant(rule, "page", "table");
});

program.rule("open rule", function(rule) {
  on(rule, "open rule");
  set(rule, "activeRule", "externalEvent.key");
  setConstant(rule, "page", "rule");
});

//*********************************************************
// rule page
//*********************************************************

program.rule("rule page", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  joinState(rule, "activeRule", "editorRule.id");
  rule.ui(elem("div", {id: ["rule-page"], parent: ["root"], class: "rule-page"}, [
    elem("header", {}, [
      elem("button", {click: ["goto page", "rules list"]}, ["back"]),
      elem("input", {type: "text", input: ["set rule name", ref("editorRule.id")], value: ref("editorRule.description")}, []),
    ]),
    elem("div", {class: "io"}, [
      elem("ul", {id: ["sources", "editorRule.id"], class: "sources"}, []),
      elem("div", {class: "separator"}, [
        elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"}, [
          elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"}, [])
        ])
      ]),
      elem("ul", {id: ["sinks", "editorRule.id"], class: "sinks"}, [])
    ])
  ]));
});

program.rule("rule page sources", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  rule.source("pipe");
  rule.source("displayName");

  joinState(rule, "activeRule", "editorRule.id");
  rule.join("pipe.rule", "editorRule.id");
  rule.join("pipe.pipe", "displayName.id");
  rule.eq("pipe.direction", "+source");

  rule.ui(elem("li", {id: ["source", "pipe.pipe"], parent: ["sources", "editorRule.id", "pipe.table"], class: "io-item"}, [
    //TODO: this should really be displayName, but they're nonsensical for generated stuff.
    elem("span", {}, [ref("pipe.table")]),
    elem("ul", {id: ["rule-source-fields", "pipe.pipe"]}, [])
  ]));

});

program.rule("rule page source fields", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  rule.source("pipe");
  rule.source("field");
  rule.source("displayName");

  joinState(rule, "activeRule", "editorRule.id");
  rule.join("pipe.rule", "editorRule.id");
  rule.join("pipe.table", "field.table");
  rule.join("field.field", "displayName.id");
  rule.eq("pipe.direction", "+source");

  rule.calculate("id", ["pipe.pipe", "field.field"], "pipe.pipe + '_' + field.field");

  rule.ui(elem("li", {id: ["rule-source-field", "id"], parent: ["rule-source-fields", "pipe.pipe", "field.ix"], click: ["blah", "bar"]}, [
    ref("displayName.name")
  ]));

});


program.rule("rule page sinks", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  rule.source("pipe");
  rule.source("displayName");

  joinState(rule, "activeRule", "editorRule.id");
  rule.join("pipe.rule", "editorRule.id");
  rule.join("pipe.pipe", "displayName.id");
  rule.eq("pipe.direction", "+sink");

  rule.ui(elem("li", {id: ["sink", "pipe.pipe"], parent: ["sinks", "editorRule.id", "pipe.table"], class: "io-item"}, [
    //TODO: this should really be displayName, but they're nonsensical for generated stuff.
    elem("span", {}, [ref("pipe.table")]),
    elem("ul", {id: ["rule-sink-fields", "pipe.pipe"]}, []),
    elem("ul", {id: ["rule-sink-outputs", "pipe.pipe"]}, [])
  ]));

});

program.rule("rule page sink fields", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  rule.source("pipe");
  rule.source("field");
  rule.source("displayName");

  joinState(rule, "activeRule", "editorRule.id");
  rule.join("pipe.rule", "editorRule.id");
  rule.join("pipe.table", "field.table");
  rule.join("field.field", "displayName.id");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.pipe", "field.field"], "pipe.pipe + '_' + field.field");

  rule.ui(elem("li", {id: ["rule-sink-field", "id"], parent: ["rule-sink-fields", "pipe.pipe", "field.ix"]}, [
    ref("displayName.name")
  ]));

});

program.rule("rule page sink outputs", function(rule) {
  page(rule, "rule");
  rule.source("editorRule");
  rule.source("pipe");
  rule.source("field");
  rule.source("displayName");
  rule.source("tableConstraint");

  joinState(rule, "activeRule", "editorRule.id");
  rule.join("pipe.rule", "editorRule.id");
  rule.join("pipe.pipe" ,"tableConstraint.pipe");
  rule.join("pipe.table", "field.table");
  rule.join("field.field", "tableConstraint.field");
  rule.join("tableConstraint.valve", "displayName.id");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.pipe", "field.field", "tableConstraint.valve"], "pipe.pipe + '_' + field.field + '_' + tableConstraint.valve");

  rule.ui(elem("li", {id: ["rule-sink-output", "id"], parent: ["rule-sink-outputs", "pipe.pipe", "field.ix"]}, [
    ref("displayName.name")
  ]));

});

//*********************************************************
// Grids
//*********************************************************

program.table("gridItem", ["gridId", "row", "col", "val"]);
program.table("gridHeader", ["gridId", "name", "ix"]);
program.table("drawGrid", ["gridId", "parent"]);

program.rule("draw a grid", function(rule) {
  rule.source("drawGrid");
  rule.calculate("ix", [], "10000");
  rule.ui(elem("div", {id: ["grid", "drawGrid.gridId"], parent: ["table-page", null, "ix"], class: "grid"}, [
  ]));
  rule.calculate("ix", [], "-1");
  rule.ui(elem("div", {id: ["grid-header", "drawGrid.gridId"], parent: ["grid", "drawGrid.gridId", "ix"], class: "grid-header"}, []));
});

program.rule("draw grid rows", function(rule) {
  rule.source("drawGrid");
  rule.source("gridItem");
  rule.join("drawGrid.gridId", "gridItem.gridId");
  rule.calculate("gid", ["gridItem.row", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridItem.row");
  rule.ui(elem("div", {id: ["grid-row", "gid"], parent: ["grid", "drawGrid.gridId", "gridItem.row"], class: "grid-row"}, []));
  rule.calculate("gcid", ["gridItem.row", "gridItem.col", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridItem.row + '_' + gridItem.col");
  rule.ui(elem("div", {id: ["grid-col-item", "gcid"], parent: ["grid-row", "gid", "gridItem.col"], click: ["foo", "drawGrid.gridId"]}, [
    ref("gridItem.val")
  ]));
});

program.rule("draw grid headers", function(rule) {
  rule.source("drawGrid");
  rule.source("gridHeader");
  rule.join("drawGrid.gridId", "gridHeader.gridId");
  rule.calculate("hid", ["gridHeader.ix", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridHeader.ix");
  rule.ui(elem("div", {id: ["grid-header-item", "hid"], parent: ["grid-header", "drawGrid.gridId", "gridHeader.ix"]}, [
    ref("gridHeader.name")
  ]));
});

//*********************************************************
// table page
//*********************************************************

program.rule("get grid for table page", function(rule) {
  on(rule, "open table");
  rule.sink("getTable");
  rule.calculate("id", ["externalEvent.eid"], "'getTable_' + externalEvent.eid");
  rule.output("id", "getTable.gridId");
  rule.output("externalEvent.key", "getTable.table");
  rule.output("externalEvent.eid", "getTable.id");
  set(rule, "activeTableGridId", "id");
});

program.rule("draw table page", function(rule) {
  page(rule, "table");
  rule.source("displayName");
  rule.sink("drawGrid");
  joinState(rule, "activeTable", "displayName.id");
  stateAs(rule, "activeTableGridId", "active");
  rule.output("active.value", "drawGrid.gridId");
  rule.outputConstant("table-page", "drawGrid.parent");
  rule.ui(elem("p", {id: ["table-page"], parent: ["root"]}, [
    elem("button", {click: ["goto page", "rules list"]}, ["back"]),
    elem("h2", {}, [ref("displayName.name")])
  ]));

});

//*********************************************************
// ui editor
//*********************************************************

program.rule("draw UI editor", function(rule) {
  page(rule, "ui editor");
  pretendConstant(rule, "drawTablesList", "true");
  rule.ui(elem("div", {id: ["ui-editor-root"], parent: ["root"], class: "root ui-editor"}, [
    elem("ul", {id: ["table-list"], class: "table-list"}, []),
    elem("p", {}, [
      "hey"
    ])
  ]));
});

//*********************************************************
// Go
//*********************************************************

program.compile();
program.run([["time", 0], ["externalEvent", "asdf", "goto page", "rules list", 0]]);
