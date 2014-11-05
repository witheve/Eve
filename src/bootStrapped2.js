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
// aggregates
//*********************************************************

function sum(arr) {
  return arr.reduce(function (a,b) {return a+b;}, 0);
}

function count(arr) {
  return arr.length;
}

function avg(arr) {
  return sum(arr) / count(arr);
}

function maxBy(desired, sort, otherwise) {
  var max = sort[0];
  var maxIx = 0;
  for(var i = sort.length; i >= 0; i--) {
    if(sort[i] > max) {
      max = sort[i];
      maxIx = i;
    }
  }
  return desired[maxIx] || otherwise || "";
}

//*********************************************************
// Program
//*********************************************************

var Application = function(system, opts) {
  this.system = system;
  this.storage = {"uiWatcher": {"rootParent": (opts && opts["parent"])},
                  "compilerWatcher": {}};
}

Application.prototype.getUIRoot = function() {
  if(this.storage["uiWatcher"].builtEls) {
    return this.storage["uiWatcher"].builtEls.root;
  }
};

Application.prototype.totalFacts = function() {
  var numFacts = 0;
  for (var table in this.system.nameToIx) {
    numFacts += this.system.getStore(table).facts.length;
  }
  return numFacts;
};

Application.prototype.run = function(facts) {
  this.system.update(facts, [])
  this.system.refresh();
  compilerWatcher2(this, this.storage["compilerWatcher"], this.system);
};

function app(system, opts) {
  return new Application(system, opts);
}

//*********************************************************************
// helpers
//*********************************************************************

function pushAll(arr, things) {
  Array.prototype.push.apply(arr, things);
  return arr;
}

function view(name, fields) {
  var facts = [["view", name]];
  for(var i = 0; i < fields.length; i++) {
    var field = fields[i];
    facts.push(["field", name + "|field=" + field, name, i]);
  }
  return facts;
}

function commonViews() {
  var facts = [];
  pushAll(facts, view("externalEvent", ["id", "label", "key", "eid", "value"]));
  pushAll(facts, view("click", ["id"]));
  pushAll(facts, view("mousePosition", ["eid","x","y"]));
  pushAll(facts, view("keyboard", ["eid","keyCode","eventType"]));
  pushAll(facts, view("sms outbox", ["id"]));
  pushAll(facts, view("user", ["id", "name"]));
  pushAll(facts, view("uiElem", ["id", "type"]));
  pushAll(facts, view("uiText", ["id", "text"]));
  pushAll(facts, view("uiChild", ["parent", "pos", "child"]));
  pushAll(facts, view("uiAttr", ["id", "attr", "value"]));
  pushAll(facts, view("uiStyle", ["id", "attr", "value"]));
  pushAll(facts, view("uiEvent", ["id", "event", "label", "key"]));
  pushAll(facts, view("time", ["time"]));
  pushAll(facts, view("refresh", ["tick", "startTime", "endTime", "flow"]));
  return facts;
}
