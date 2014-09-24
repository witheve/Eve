//*********************************************************
// utils
//*********************************************************

var now = function() {
  if(typeof window !== "undefined" && window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
}

//*********************************************************
// watchers
//*********************************************************

var createUICallback = function(id, label, key) {
  return function(e) {
    console.log("event: ", e);
    program.run([["external_events", id, label, key, eve.data.globalId++]]);
  };
}

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
}

var uiWatcher = function(prev, system) {
  //var adds = [];
  //var removes = [];
  //system.diff(prev, adds, removes);

  //console.log(adds);
  //console.log(removes);

  var elem = system.getTable("ui_elems").getFacts();
  var text = system.getTable("ui_text").getFacts();
  var attrs = system.getTable("ui_attrs").getFacts();
  var styles = system.getTable("ui_styles").getFacts();
  var events = system.getTable("ui_events").getFacts();
  var children = system.getTable("ui_child").getFacts();

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
}

//*********************************************************
// Program
//*********************************************************

var program = eve.dsl.system();
eve.test.wrapCommonTables(program);

program.run = function(facts) {
  var prev; // TODO COW system
  var start = now();
  this.input(facts);
  var runtime = now() - start;
  start = now();
  uiWatcher(prev, this.system);
  var render = now() - start;
  $("#timeStat").html(runtime.toFixed(2));
  $("#renderStat").html(render.toFixed(2));
  var numFacts = 0;
  var tableToStore = this.system.tableToStore;
  for (var table in tableToStore) {
    numFacts += this.system.getStore(tableToStore[table]).facts.length;
  }
  console.log("numFacts", numFacts);
  $("#factsStat").html(numFacts);
}

//*********************************************************
// utils
//*********************************************************

var elem = eve.ui.elem;
var ref = eve.ui.ref;

var on = function(rule, label) {
  rule.source("external_events");
  rule.eq("external_events.label", label);
}

var setConstant = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("external_events.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.outputConstant(v, "state-temp.value");
}

var set = function(rule, k, v) {
  rule.sink("state-temp");
  rule.output("external_events.eid", "state-temp.id");
  rule.outputConstant(k, "state-temp.key");
  rule.output(v, "state-temp.value");
}

var joinState = function(rule, k, to) {
  var id = dsl.nextId();
  rule.source("state", id);
  rule.eq(id + ".key", k);
  rule.join(to, id + ".value");
}

var page = function(rule, p) {
  rule.source("state");
  rule.eq("state.key", "page");
  rule.eq("state.value", p);
}

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
  rule.source("field");
  page(rule, "rules list");
  rule.group("field.table");
  rule.ui(elem("li", {id: ["table", "field.table"], parent: ["table-list", "", "field.table"], doubleClick: ["open table", ref("field.table")], click: ["toggle table", ref("field.table")]}, [
    elem("h2", {}, [ref("field.table")]),
    elem("ul", {id: ["table-fields", "field.table"]}, [])
  ]));
});

program.rule("draw fields for open tables", function(rule) {
  rule.source("open tables");
  rule.source("field");
  rule.source("displayNames");
  rule.join("field.table", "open tables.table");
  rule.join("field.field", "displayNames.id");
  rule.calculate("id", ["field.table", "field.field"], "field.table + '.' + field.field");
  rule.ui(elem("li", {id: ["table-field", "id"], parent: ["table-fields", "field.table", "field.ix"]}, [
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
  rule.ui(elem("div", {id: ["rule-page", "state.value"]}, [
    elem("button", {click: ["goto page", "rules list"]}, ["back"]),
    elem("h2", {}, [ref("editor_rule.description")]),
    elem("ul", {id: ["sources", "editor_rule.id"]}, []),
    elem("ul", {id: ["sinks", "editor_rule.id"]}, [])
  ]));
});

program.rule("rule page sources", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.eq("pipe.direction", "+source");

  rule.ui(elem("li", {id: ["source", "pipe.pipe"], parent: ["sources", "editor_rule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.rule("rule page sinks", function(rule) {
  page(rule, "rule");
  rule.source("editor_rule");
  rule.source("pipe");

  joinState(rule, "activeRule", "editor_rule.id");
  rule.join("pipe.rule", "editor_rule.id");
  rule.eq("pipe.direction", "+sink");

  rule.ui(elem("li", {id: ["sink", "pipe.pipe"], parent: ["sinks", "editor_rule.id", "pipe.table"]}, [ref("pipe.table")]));

});

program.compile();
program.run([["time", 0], ["external_events", "asdf", "goto page", "rules list", 0]]);
