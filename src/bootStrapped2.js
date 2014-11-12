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
// functions
//*********************************************************

function hours(ms) {
  return (new Date(ms)).getHours();
}

function minutes(ms) {
  return (new Date(ms)).getMinutes();
}

function seconds(ms) {
  return (new Date(ms)).getSeconds();
}

var sin = Math.sin;
var cos = Math.cos;
var tan = Math.tan;

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
  var max = -Infinity;
  var maxIx;
  for(var i = sort.length; i >= 0; i--) {
    if(sort[i] > max) {
      max = sort[i];
      maxIx = i;
    }
  }
  if (maxIx !== undefined) return desired[maxIx];
  if (otherwise !== undefined) return otherwise;
  assert(false);
}

function lastBefore(desired, sort, limit, otherwise) {
  var max = -Infinity;
  var maxIx;
  for(var i = sort.length; i >= 0; i--) {
    if((sort[i] > max) && (sort[i] < limit)) {
      max = sort[i];
      maxIx = i;
    }
  }
  if (maxIx !== undefined) return desired[maxIx];
  if (otherwise !== undefined) return otherwise;
  assert(false);
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
  var errors = [];
  this.system.refresh(errors);
  timerWatcher(this, this.storage["compilerWatcher"], this.system);
  compilerWatcher2(this, this.storage["compilerWatcher"], this.system);
  return errors;
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
  pushAll(facts, view("event", ["id", "label", "key", "eid", "value"]));
  pushAll(facts, view("timer", ["id", "event", "rate"]));
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
  return facts;
}
