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

var mouseEvents = {"drop": true,
                   "drag": true,
                   "mouseover": true,
                   "drageover": true,
                   "mousedown": true,
                   "mouseup": true,
                   "click": true,
                   "dblclick": true,
                   "contextmenu": true};

var createUICallback = function(id, event, label, key) {
  return function(e) {
//     console.log("event: ", event, e);
    var items = [];
    var eid = eve.data.globalId++;
    if(event === "dragover") {
      e.preventDefault();
    } else {
      if(mouseEvents[event]) {
        items.push(["mousePosition", eid, e.clientX, e.clientY]);
      }

      items.push(["externalEvent", id, label, key, eid, e.target.value]);
      curApp.run(items);
    }
  };
};

var svgs = {
  "svg": true,
  "path": true,
  "rect": true
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
    builtEls[cur[elem_id]].addEventListener(cur[events_event], createUICallback(cur[elem_id], cur[events_event], cur[events_label], cur[events_key]));
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
    curApp.callRuntime(items);
  }
};

//*********************************************************
// Program
//*********************************************************

function commonTables() {
  return compose(
    table("displayName", ["id", "name"]),
    table("join", ["valve", "pipe", "field"]),
    table("editorRule", ["id", "description"]),
    table("externalEvent", ["id", "label", "key", "eid", "value"]),

    table("click", ["id"]),
    table("mousePosition", ["eid","x","y"]),
    table("sms outbox", ["id"]),
    table("user", ["id", "name"]),
    table("edge", ["from", "to"]),
    table("path", ["from", "to"]),
    table("uiElem", ["id", "type"]),
    table("uiText", ["id", "text"]),
    table("uiChild", ["parent", "pos", "child"]),
    table("uiAttr", ["id", "attr", "value"]),
    table("uiStyle", ["id", "attr", "value"]),
    table("uiEvent", ["id", "event", "label", "key"]),
    table("time", ["time"]),
    table("timePerFlow", ["name", "type", "numTimes", "totalTime"])
  );
}

var Application = function(system) {
  this.system = system;
  this.storage = {"uiWatcher": {},
                   "compilerWatcher": {}};
}

Application.prototype.callRuntime = function(facts) {
  loadSystem(this.system, facts, []);
  this.system.refresh();
//   compilerWatcher(this.storage["compilerWatcher"], this.system);
};

Application.prototype.run = function(facts) {
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

function app(system) {
  return new Application(system);
}

var curApp =
    app(
      program(
        commonTables(),
        rule("my rule",
             source("time", {time: "time"}),
             calculate("foo", ["time"], "time + 1"),
             elem("p", {id: "foo", parent: ["root"]},
                 elem("span", {}, "wooohhoo"))
            )));


curApp.run([["time", 0], ["externalEvent", "asdf", "goto page", "ui editor", 0]]);
