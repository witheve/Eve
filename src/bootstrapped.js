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
    program.run([["external_events", id, label, key, eve.data.globalId++]]);
  };
}

var uiWatcher = function(memory) {
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
    while(program.root.children.length) {
      program.root.removeChild(program.root.children[0]);
    }
  }

  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    roots[cur[elem_id]] = true;
    builtEls[cur[elem_id]] = document.createElement(cur[elem_type]);
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
    document.body.appendChild(program.root);
  }
  for(var i in roots) {
    program.root.appendChild(builtEls[i]);
  }
}

//*********************************************************
// Program
//*********************************************************

var program = eve.dsl.system();
eve.test.wrapCommonTables(program);

program.run = function(facts) {
  var start = now();
  this.input(facts);
  var runtime = now() - start;
  start = now();
  uiWatcher(this.system.memory);
  var render = now() - start;
  $("#timeStat").html(runtime.toFixed(2));
  $("#renderStat").html(render.toFixed(2));
  $("#factsStat").html(this.system.memory.getFacts().length);
}

//*********************************************************
// rules
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
  rule.eq("active.key", k);
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

program.rule("on goto page", function(rule) {
  on(rule, "goto page");
  set(rule, "page", "external_events.key");
});

program.rule("draw rule", function(rule) {
  rule.source("rule");
  page(rule, "rules list");
  rule.ui(elem("button", {id: ["rule", "rule.id"], draggable: "true", click: ["open rule", ref("rule.id")]}, [
    ref("rule.description")
  ]));
});

program.rule("open rule", function(rule) {
  on(rule, "open rule");
  set(rule, "activeRule", "external_events.key");
  setConstant(rule, "page", "rule");
});

program.rule("rule page", function(rule) {
  page(rule, "rule");
  rule.source("rule");
  joinState(rule, "activeRule", "rule.id");
  rule.ui(elem("div", {id: ["rule-page", "state.value"]}, [
    elem("button", {click: ["goto page", "rules list"]}, ["back"]),
    elem("h2", {}, [ref("rule.description")]),
    elem("ul", {id: ["sources", "rule.id"]}, [])
  ]));
});

program.rule("rule page sources", function(rule) {
  page(rule, "rule");
  rule.source("rule");
  rule.source("pipe");

  joinState(rule, "activeRule", "rule.id");
  rule.join("pipe.rule", "rule.id");
  rule.eq("pipe.direction", "+source");

  rule.ui(elem("li", {id: ["source", "pipe.id"]}, [ref("pipe.table")]));

});

program.compile();
program.run([["time", 0], ["external_events", "asdf", "goto page", "rules list", 0]]);
