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

program.rule("cool", function(rule) {
  rule.source("rule");
  rule.ui(elem("button", {id: ["ex", "rule.id"], draggable: "true", click: ["did", ref("rule.id")]}, [
    ref("rule.description")
  ]));
});

program.table("foo", ["count"]);
program.rule("zomg", function(rule) {
  rule.source("external_events");
  rule.sink("foo");
  rule.aggregate("external_events.eid", "totalClicks", "(external_events.eid).length")
  rule.output("totalClicks", "foo.count");
});

// FIXME: this doesn't work right now because there's no way to ask if a table is empty.
// program.rule("empty zomg", function(rule) {
//   rule.negated("external_events");
//   rule.sink("foo");
//   rule.outputConstant(0, "foo.count");
// });

program.rule("woah", function(rule) {
  rule.source("foo");
  rule.source("time");
  rule.calculate("color", ["foo.count"], "foo.count > 10 ? 'red' : 'green'");
  rule.ui(elem("p", {id: ["click", "time.time"], style: {color: ref("color")}}, ["Num clicks: ", ref("foo.count")]));
});

program.rule("add bar button", function(rule) {
  rule.source("time");
  rule.ui(elem("button", {id: ["add bar", "time.time"], click: ["add bar", "time.time"]}, ["add bar"]));
});

program.table("bar", ["id"]);
program.table("delbar", ["id"]);
program.rule("bars", function(rule) {
  rule.source("external_events");
  rule.sink("bar", "bar");
  rule.filter("external_events.label", "external_events.label == 'add bar'");
  rule.output("external_events.eid", "bar.id");
})

program.rule("draw bars", function(rule) {
  rule.source("bar");
  rule.negated("delbar");
  rule.join("bar.id", "delbar.id");
  rule.ui(elem("p", {id: ["bar", "bar.id"], click: ["remove bar", ref("bar.id")]}, [ref("bar.id"), " - remove me"]));
});

program.rule("delete bars", function(rule) {
  rule.source("external_events");
  rule.sink("delbar");
  rule.filter("external_events.label", "external_events.label == 'remove bar'");
  rule.output("external_events.key", "delbar.id");
});

program.compile();
program.run([["time", 0], ["users", 0, "chris"], ["users", 1, "rob"], ["users", 2, "jamie"]]);
