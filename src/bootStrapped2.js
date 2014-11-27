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

function milliseconds(ms) {
  return (new Date(ms)).getMilliseconds();
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
  this.eventId = 0;
  this.system = system || System.empty({name: "unknown"});
  this.storage = {"uiWatcher": {},
                  "timerWatcher": {},
                  "webRequestWatcher": {},
                  "tableCardWatcher": {}};
}

Application.prototype.totalFacts = function() {
  var numFacts = 0;
  for (var table in this.system.nameToIx) {
    numFacts += this.system.getStore(table).facts.length;
  }
  return numFacts;
};

Application.prototype.updateSystem = function(system) {
  this.system = system;
};

Application.prototype.run = function(facts, removes) {
  this.system.update(facts, removes || []);
  var errors = [];
  this.system.refresh(errors);
  webRequestWatcher(this, this.storage["webRequestWatcher"], this.system);
  timerWatcher(this, this.storage["timerWatcher"], this.system);
  tableCardWatcher(this, this.storage["tableCardWatcher"], this.system);
  uiWatcher(this, this.storage["uiWatcher"], this.system);
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
  pushAll(facts, view("event", ["eid", "label", "key", "value"]));
  pushAll(facts, view("webRequest", ["id", "url", "event"]));
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
  pushAll(facts, view("tableCard", ["run", "table"]));
  pushAll(facts, view("tableCardField", ["run", "table", "field", "ix"]));
  pushAll(facts, view("tableCardCell", ["run", "table", "row", "col", "value"]));
  return facts;
}
