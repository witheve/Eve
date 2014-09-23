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
    program.run([["external_events", id, label, key, eve.data.globalId++]]);
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
};

var uiWatcher = function(prev, memory) {
  //var adds = [];
  //var removes = [];
  //memory.diff(prev, adds, removes);

  //console.log(adds);
  //console.log(removes);

  var elem = memory.getTable("ui_elems");
  var text = memory.getTable("ui_text");
  var attrs = memory.getTable("ui_attrs");
  var styles = memory.getTable("ui_styles");
  var events = memory.getTable("ui_events");
  var children = memory.getTable("ui_child");

  var elem_id = 1;
  var elem_type = 2;

  var text_text = 2;

  var attrs_attr = 2;
  var attrs_value = 3;

  var styles_attr = 2;
  var styles_value = 3;

  var events_event = 2;
  var events_label = 3;
  var events_key = 4;

  var child_childid = 3;

  var builtEls = program.builtEls || {};
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
    program.root = document.createElement("div");
  }
  for(var i in roots) {
    program.root.appendChild(builtEls[i]);
  }

  document.body.appendChild(program.root);
};


var compilerSeen = {};
var compilerWatcher = function(prev, memory) {
  var getTables = memory.getTable("getTables");
  var getIntermediates = memory.getTable("getIntermediates");
  var getResults = memory.getTable("getResults");

  var items = [];

  if(getTables.length) {
    var len = getTables.length;
    for(var i = 0; i < len; i++) {
      var cur = getTables[i];
      var id = cur[1];
      if(!compilerSeen[id]) {
        var table = memory.getTable(cur[2]);
        var tableLen = table.length;
        var fields = dsl.tableToFields[cur[2]];
        if(fields) {
          for(var header = 0; header < fields.length; header++) {
            items.push(["gridHeaders", cur[3], fields[header], header]);
          }
        }
        if(tableLen) {
          var rowLen = table[0].length;
          for(var row = 0; row < tableLen && row < 30; row++) {
            for(var col = 1; col < rowLen; col++) {
              items.push(["gridItems", cur[3], row, col, table[row][col]]);
            }
          }
        }
        compilerSeen[id] = true;
      }
    }
  }

  if(getIntermediates.length) {
  }

  if(getResults.length) {
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

program.callRuntime = function(facts) {
  var prev = this.system.memory;
  this.input(facts);
  compilerWatcher(prev, this.system.memory);
};

program.run = function(facts) {
  var prev = this.system.memory;
  var start = now();
  this.callRuntime(facts);
  var runtime = now() - start;
  start = now();
  uiWatcher(prev, this.system.memory);
  var render = now() - start;
  $("#timeStat").html(runtime.toFixed(2));
  $("#renderStat").html(render.toFixed(2));
  $("#factsStat").html(this.system.memory.getFacts().length);
};

//*********************************************************
// utils
//*********************************************************

var elem = eve.ui.elem;
var ref = eve.ui.ref;

var on = function(rule, label) {
  rule.source("external_events");
  rule.eq("external_events.label", label);
};

var setConstant = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("external_events.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.outputConstant(v, "state-temp.value");
};

var set = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("external_events.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.output(v, "state-temp.value");
};

var stateAs = function(rule, k, as) {
  rule.source("state", as);
  rule.eq(as + ".key", k);
}

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

var page = function(rule, p) {
  rule.source("state");
  rule.eq("state.key", "page");
  rule.eq("state.value", p);
};

program.table("state-temp", ["id", "key", "value"]);
program.table("state", ["key", "value"]);

program.rule("real state", function(rule) {
  rule.source("external_events");
  rule.source("state-temp");
  rule.sink("state");
  rule.calculate("sorted", ["state-temp.id"], "-1 * state-temp.id");
  rule.group("state-temp.key");
  rule.sort("sorted");
  rule.constantLimit(1);
  rule.output("state-temp.key", "state.key");
  rule.output("state-temp.value", "state.value");
});


//*********************************************************
// compiler stuff
//*********************************************************

program.table("getTables", ["id", "table", "gridId"]);

//*********************************************************
// editor
//*********************************************************

program.rule("on goto page", function(rule) {
  on(rule, "goto page");
  set(rule, "page", "external_events.key");
});

program.rule("draw rules list ui", function(rule) {
  page(rule, "rules list");
  rule.ui(elem("div", {id: ["rules-list-root"], class: "root"}, [
    elem("ul", {id: ["table-list"], class: "table-list"}, []),
    elem("ul", {id: ["rules-list"], class: "rules-list"}, [])
  ]));
});

program.rule("draw rule", function(rule) {
  rule.source("editor_rule");
  page(rule, "rules list");
  rule.ui(elem("li", {id: ["rule", "editor_rule.id"], parent: ["rules-list", "", "editor_rule.id"], click: ["open rule", ref("editor_rule.id")]}, [
    elem("h2", {}, [ref("editor_rule.description")]),
    elem("div", {class: "io"}, [
      elem("ul", {id: ["sources", "editor_rule.id"], class: "sources"}, []),
      elem("div", {class: "separator"}, [
        elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"}, [
          elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"}, [])
        ])
      ]),
      elem("ul", {id: ["sinks", "editor_rule.id"], class: "sinks"}, [])
    ])
  ]));
});


program.rule("rules list sources", function(rule) {
  page(rule, "rules list");
  rule.source("editor_rule");
  rule.source("pipe");

  rule.join("editor_rule.id", "pipe.rule");
  rule.eq("pipe.direction", "+source");

  rule.calculate("id", ["pipe.table", "editor_rule.id"], "pipe.table + editor_rule.id");

  rule.ui(elem("li", {id: ["source", "id"], parent: ["sources", "editor_rule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.rule("rules list sinks", function(rule) {
  page(rule, "rules list");
  rule.source("editor_rule");
  rule.source("pipe");

  rule.join("editor_rule.id", "pipe.rule");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.table", "editor_rule.id"], "pipe.table + editor_rule.id");

  rule.ui(elem("li", {id: ["sink", "id"], parent: ["sinks", "editor_rule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.table("open tables-temp", ["table", "state"]);
program.table("open tables", ["table"]);

program.rule("table is open? -temp", function(rule) {
  on(rule, "toggle table");
  rule.sink("open tables-temp");
  rule.fieldToValve("external_events.eid");
  rule.group("external_events.key");
  rule.aggregate("external_events.key", "open/closed", "(external_events.key).length % 2 === 0 ? 'closed' : 'open'");
  rule.output("open/closed", "open tables-temp.state");
  rule.output("external_events.key", "open tables-temp.table");
});

program.rule("table is open?", function(rule) {
  rule.source("open tables-temp");
  rule.sink("open tables");
  rule.eq("open tables-temp.state", "open");
  rule.output("open tables-temp.table", "open tables.table");
});

program.rule("draw table", function(rule) {
  rule.source("schema");
  page(rule, "rules list");
  rule.group("schema.table");
  rule.ui(elem("li", {id: ["table", "schema.table"], parent: ["table-list", "", "schema.table"], click: ["open table", ref("schema.table")], doubleClick: ["toggle table", ref("schema.table")]}, [
    elem("h2", {}, [ref("schema.table")]),
    elem("ul", {id: ["table-fields", "schema.table"]}, [])
  ]));
});

program.rule("draw fields for open tables", function(rule) {
  rule.source("open tables");
  rule.source("schema");
  rule.source("displayNames");
  rule.join("schema.table", "open tables.table");
  rule.join("schema.field", "displayNames.id");
  rule.calculate("id", ["schema.table", "schema.field"], "schema.table + '.' + schema.field");
  rule.ui(elem("li", {id: ["table-field", "id"], parent: ["table-fields", "schema.table", "schema.ix"]}, [
    ref("displayNames.name")
  ]));
});

program.rule("open table", function(rule) {
  on(rule, "open table");
  set(rule, "activeTable", "external_events.key");
  setConstant(rule, "page", "table");
});

program.rule("open rule", function(rule) {
  on(rule, "open rule");
  set(rule, "activeRule", "external_events.key");
  setConstant(rule, "page", "rule");
});

//*********************************************************
// rule page
//*********************************************************

program.rule("rule page", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  joinState(rule, "activeRule", "editor_rule.id");
  rule.ui(elem("div", {id: ["rule-page", "state.value"], class: "rule-page"}, [
    elem("header", {}, [
      elem("button", {click: ["goto page", "rules list"]}, ["back"]),
      elem("h2", {}, [ref("editor_rule.description")])
    ]),
    elem("div", {class: "io"}, [
      elem("ul", {id: ["sources", "editor_rule.id"], class: "sources"}, []),
      elem("div", {class: "separator"}, [
        elem("svg", {width:"100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"}, [
          elem("path",{class: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"}, [])
        ])
      ]),
      elem("ul", {id: ["sinks", "editor_rule.id"], class: "sinks"}, [])
    ])
  ]));
});

program.rule("rule page sources", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");
  rule.source("displayNames");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.join("pipe.pipe", "displayNames.id");
  rule.eq("pipe.direction", "+source");

  rule.ui(elem("li", {id: ["source", "pipe.pipe"], parent: ["sources", "editor_rule.id", "pipe.table"], class: "io-item"}, [
    //TODO: this should really be displayName, but they're nonsensical for generated stuff.
    elem("span", {}, [ref("pipe.table")]),
    elem("ul", {id: ["rule-source-fields", "pipe.pipe"]}, [])
  ]));

});

program.rule("rule page source fields", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");
  rule.source("schema");
  rule.source("displayNames");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.join("pipe.table", "schema.table");
  rule.join("schema.field", "displayNames.id");
  rule.eq("pipe.direction", "+source");

  rule.calculate("id", ["pipe.pipe", "schema.field"], "pipe.pipe + '_' + schema.field");

  rule.ui(elem("li", {id: ["rule-source-field", "id"], parent: ["rule-source-fields", "pipe.pipe", "schema.ix"]}, [
    ref("displayNames.name")
  ]));

});


program.rule("rule page sinks", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");
  rule.source("displayNames");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.join("pipe.pipe", "displayNames.id");
  rule.eq("pipe.direction", "+sink");

  rule.ui(elem("li", {id: ["sink", "pipe.pipe"], parent: ["sinks", "editor_rule.id", "pipe.table"], class: "io-item"}, [
    //TODO: this should really be displayName, but they're nonsensical for generated stuff.
    elem("span", {}, [ref("pipe.table")]),
    elem("ul", {id: ["rule-sink-fields", "pipe.pipe"]}, []),
    elem("ul", {id: ["rule-sink-outputs", "pipe.pipe"]}, [])
  ]));

});

program.rule("rule page sink fields", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");
  rule.source("schema");
  rule.source("displayNames");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.join("pipe.table", "schema.table");
  rule.join("schema.field", "displayNames.id");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.pipe", "schema.field"], "pipe.pipe + '_' + schema.field");

  rule.ui(elem("li", {id: ["rule-sink-field", "id"], parent: ["rule-sink-fields", "pipe.pipe", "schema.ix"]}, [
    ref("displayNames.name")
  ]));

});

program.rule("rule page sink outputs", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");
  rule.source("schema");
  rule.source("displayNames");
  rule.source("tableConstraint");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.join("pipe.pipe" ,"tableConstraint.pipe");
  rule.join("pipe.table", "schema.table");
  rule.join("schema.field", "tableConstraint.field");
  rule.join("tableConstraint.valve", "displayNames.id");
  rule.eq("pipe.direction", "+sink");

  rule.calculate("id", ["pipe.pipe", "schema.field", "tableConstraint.valve"], "pipe.pipe + '_' + schema.field + '_' + tableConstraint.valve");

  rule.ui(elem("li", {id: ["rule-sink-output", "id"], parent: ["rule-sink-outputs", "pipe.pipe", "schema.ix"]}, [
    ref("displayNames.name")
  ]));

});

//*********************************************************
// Grids
//*********************************************************

program.table("gridItems", ["gridId", "row", "col", "val"]);
program.table("gridHeaders", ["gridId", "name", "ix"]);
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
  rule.source("gridItems");
  rule.join("drawGrid.gridId", "gridItems.gridId");
  rule.calculate("gid", ["gridItems.row", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridItems.row");
  rule.ui(elem("div", {id: ["grid-row", "gid"], parent: ["grid", "drawGrid.gridId", "gridItems.row"], class: "grid-row"}, []));
  rule.calculate("gcid", ["gridItems.row", "gridItems.col", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridItems.row + '_' + gridItems.col");
  rule.ui(elem("div", {id: ["grid-col-item", "gcid"], parent: ["grid-row", "gid", "gridItems.col"]}, [
    ref("gridItems.val")
  ]));
});

program.rule("draw grid headers", function(rule) {
  rule.source("drawGrid");
  rule.source("gridHeaders");
  rule.join("drawGrid.gridId", "gridHeaders.gridId");
  rule.calculate("hid", ["gridHeaders.ix", "drawGrid.gridId"], "drawGrid.gridId + '_' + gridHeaders.ix");
  rule.ui(elem("div", {id: ["grid-header-item", "hid"], parent: ["grid-header", "drawGrid.gridId", "gridHeaders.ix"]}, [
    ref("gridHeaders.name")
  ]));
});

//*********************************************************
// table page
//*********************************************************

program.rule("get grid for table page", function(rule) {
  on(rule, "open table");
  rule.sink("getTables");
  rule.calculate("id", ["external_events.eid"], "'getTable_' + external_events.eid");
  rule.output("id", "getTables.gridId");
  rule.output("external_events.key", "getTables.table");
  rule.output("external_events.eid", "getTables.id");
  set(rule, "activeTableGridId", "id");
});

program.rule("draw table page", function(rule) {
  page(rule, "table");
  rule.source("displayNames");
  rule.sink("drawGrid");
  joinState(rule, "activeTable", "displayNames.id");
  stateAs(rule, "activeTableGridId", "active");
  rule.output("active.value", "drawGrid.gridId");
  rule.outputConstant("table-page", "drawGrid.parent");
  rule.ui(elem("p", {id: ["table-page"]}, [
    elem("button", {click: ["goto page", "rules list"]}, ["back"]),
    elem("h2", {}, [ref("displayNames.name")])
  ]));

});


//*********************************************************
// Go
//*********************************************************

program.compile();
program.run([["time", 0], ["external_events", "asdf", "goto page", "rules list", 0]]);
