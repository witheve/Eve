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

function errorsToFacts(errors) {
  if(!errors) return [];

  return errors.map(function(cur) {
    var text = typeof cur === "string" ? cur : "Line " + cur.line + ": " + cur.message;
    return [eveApp.runNumber, text];
  });
}

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
                  "compilerWatcher": {},
                  "remoteWatcher": {},
                  "programInfo": {},
                  };
  this.runNumber = 0;
  this.running = true;
  this.system.update(commonViews(), []);
  this.system.recompile();
}

Application.prototype.totalFacts = function() {
  var numFacts = 0;
  for (var table in this.system.nameToIx) {
    var store = this.system.getStore(table);
    if(store) numFacts += store.facts.length;
  }
  return numFacts;
};

Application.prototype.updateSystem = function(system) {
  this.system = system;
};

Application.prototype.run = function(facts, removes) {
  if(!this.running) return;

  this.runNumber++;
  var start = now();
  try {
    this.system.updateStore("error", [], this.system.getStore("error").getFacts());
    this.system.update(facts, removes || []);
    var errors = [];
    this.system.refresh(errors);
    compileWatcher(this, this.storage["compilerWatcher"], this.system);
    webRequestWatcher(this, this.storage["webRequestWatcher"], this.system);
    timerWatcher(this, this.storage["timerWatcher"], this.system);
    uiWatcher(this, this.storage["uiWatcher"], this.system);
    //errors
    if(errors.length) {
      this.system.updateStore("error", errorsToFacts(errors), []);
    }
    this.system.updateStore("profile", [[this.runNumber, "runtime", now() - start]], []);
  } catch(e) {
    this.system.updateStore("error", [[this.runNumber, e.stack]], []);
  }
  start = now();
  remoteWatcher(this, this.storage["remoteWatcher"], this.system);
  this.system.updateStore("profile", [[this.runNumber, "remoteWatcher", now() - start]], []);

  return errors;
};

function app(system, opts) {
  return new Application(system, opts);
}

//*********************************************************************
// helpers
//*********************************************************************

var addedTables = {};

function pushAll(arr, things) {
  Array.prototype.push.apply(arr, things);
  return arr;
}

function view(name, fields) {
  addedTables[name] = true;
  var facts = [["view", name]];
  for(var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var munged = name + "|field=" + field;
//     facts.push(["displayName", munged, field]);
    facts.push(["field", munged, name, i]);
  }
  return facts;
}

function inputView(name, fields) {
  var final = view(name, fields);
  final.push(["isInput", name]);
  return final;
}

function editorViews() {
  var facts = [];
  pushAll(facts, inputView("editor|programView", ["program", "view"]));
  pushAll(facts, inputView("editor|programQuery", ["program", "query"]));
  pushAll(facts, inputView("editor|insertedFact", ["program", "view", "row", "col", "value"]));
  pushAll(facts, inputView("editor|generatedView", ["view"]));
  pushAll(facts, inputView("editor|view", ["view"]));
  pushAll(facts, inputView("editor|field", ["field", "view", "ix"]));
  pushAll(facts, inputView("editor|query", ["query", "view", "ix"]));
  pushAll(facts, inputView("editor|constantConstraint", ["query", "field", "value"]));
  pushAll(facts, inputView("editor|functionConstraint", ["constraint", "query", "field", "code"]));
  pushAll(facts, inputView("editor|functionConstraintInput", ["constraint", "field", "variable"]));
  pushAll(facts, inputView("editor|viewConstraint", ["constraint", "query", "sourceView", "isNegated"]));
  pushAll(facts, inputView("editor|viewConstraintBinding", ["constraint", "field", "sourceField"]));
  pushAll(facts, inputView("editor|aggregateConstraint", ["constraint", "query", "field", "sourceView", "code"]));
  pushAll(facts, inputView("editor|aggregateConstraintBinding", ["constraint", "field", "sourceField"]));
  pushAll(facts, inputView("editor|aggregateConstraintSolverInput", ["constraint", "field", "variable"]));
  pushAll(facts, inputView("editor|aggregateConstraintAggregateInput", ["constraint", "sourceField", "variable"]));
  pushAll(facts, inputView("editor|isInput", ["view"]));
  pushAll(facts, inputView("editor|isCheck", ["view"]));
  pushAll(facts, inputView("editor|displayName", ["id", "name"]));
  pushAll(facts, inputView("editorProfile", ["run", "event", "time"]));
  pushAll(facts, inputView("editorError", ["run", "error"]));
  pushAll(facts, inputView("compileError", ["run", "error"]));
  pushAll(facts, inputView("tableCard", ["run", "table"]));
  pushAll(facts, inputView("tableCardProgram", ["run", "program"]));
  pushAll(facts, inputView("tableCardUIInfo", ["run", "hasUI"]));
  return facts;
}

function commonViews() {
  var facts = [];
  pushAll(facts, inputView("event", ["eid", "label", "key", "value"]));
  pushAll(facts, inputView("mousePosition", ["eid","x","y"]));
  pushAll(facts, inputView("keyboard", ["eid","keyCode","eventType"]));
  pushAll(facts, inputView("time", ["time"]));
  pushAll(facts, inputView("timer", ["id", "event", "rate"]));
  pushAll(facts, inputView("subscription", ["recipient", "view", "alias", "asCells"]));
  pushAll(facts, inputView("resultCell", ["view", "row", "col", "value"]));
  pushAll(facts, inputView("generatedView", ["view"]));
  pushAll(facts, inputView("error", ["run", "error"]));
  pushAll(facts, inputView("profile", ["run", "event", "time"]));
  pushAll(facts, view("remote|subscription", ["remote", "recipient", "view", "alias", "asCells"]));
  pushAll(facts, view("remote", ["remote"]));
  pushAll(facts, view("remote|insertedFact", ["remote", "view", "row", "col", "value"]));
  pushAll(facts, view("remote|view", ['remote', "view"]));
  pushAll(facts, view("remote|field", ['remote', "field", "view", "ix"]));
  pushAll(facts, view("remote|query", ['remote', "query", "view", "ix"]));
  pushAll(facts, view("remote|constantConstraint", ['remote', "query", "field", "value"]));
  pushAll(facts, view("remote|functionConstraint", ['remote', "constraint", "query", "field", "code"]));
  pushAll(facts, view("remote|functionConstraintInput", ['remote', "constraint", "field", "variable"]));
  pushAll(facts, view("remote|viewConstraint", ['remote', "constraint", "query", "sourceView", "isNegated"]));
  pushAll(facts, view("remote|viewConstraintBinding", ['remote', "constraint", "field", "sourceField"]));
  pushAll(facts, view("remote|aggregateConstraint", ['remote', "constraint", "query", "field", "sourceView", "code"]));
  pushAll(facts, view("remote|aggregateConstraintBinding", ['remote', "constraint", "field", "sourceField"]));
  pushAll(facts, view("remote|aggregateConstraintSolverInput", ['remote', "constraint", "field", "variable"]));
  pushAll(facts, view("remote|aggregateConstraintAggregateInput", ['remote', "constraint", "sourceField", "variable"]));
  pushAll(facts, view("remote|isInput", ['remote', "view"]));
  pushAll(facts, view("remote|isCheck", ['remote', "view"]));
  pushAll(facts, view("webRequest", ["id", "url", "event"]));
  pushAll(facts, view("click", ["id"]));
  pushAll(facts, view("sms outbox", ["id"]));
  pushAll(facts, view("user", ["id", "name"]));
  pushAll(facts, view("uiElem", ["id", "type"]));
  pushAll(facts, view("uiText", ["id", "text"]));
  pushAll(facts, view("uiChild", ["parent", "pos", "child"]));
  pushAll(facts, view("uiAttr", ["id", "attr", "value"]));
  pushAll(facts, view("uiStyle", ["id", "attr", "value"]));
  pushAll(facts, view("uiEvent", ["id", "event", "label", "key"]));
  return facts;
}
