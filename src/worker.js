importScripts("eve.js", "bootStrapped2.js", "tokenizer.js");

var console = {
  log: function() {
    var final = [];
    for(var i in arguments) {
      final[i] = arguments[i];
    }
    try {
      postMessage({type: "log", args: final});
    } catch(e) {
      postMessage({type: "error", error: "Worker: Could not log a message"});
    }
  }
};

var uiStorage = {};

function compilerWatcher2(application, storage, system) {
  var returns = [];
  for(var table in editorProg.tablesCreated) {
    var info = editorProg.tablesCreated[table];
    var rows = system.getStore(table).getFacts();
    returns.push([table, info.fields, rows, info.constants]);
  }
  postMessage({type: "tableCards", cards: returns, time: now()});

  var uiTables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diff = {};
  var hasUI = false;
  for(var i = 0; i < uiTables.length; i++) {
    var table = uiTables[i];
    if(uiStorage[table]) {
      var adds = [];
      var removes = [];
      system.getStore(table).diff(uiStorage[table], adds, removes);
      uiStorage[table] = system.getStore(table);
      if(adds.length || removes.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      uiStorage[table] = system.getStore(table);
      var adds = system.getStore(table).getFacts();
      if(adds.length) { hasUI = true; }
      diff[table] = {
        adds: adds,
        removes: []
      };
    }
  }

  if(hasUI) {
    postMessage({type: "renderUI", diff: diff, time: now()});
  }
}

var editorProg;
var editorApp;

function onCompile(code) {
  var parsed = parse(code);
  try {
    var prev = editorApp;
    editorProg = parsedToEveProgram(parsed);
    editorApp = app(editorProg.program, {parent: null});
    var facts = [["time", 0]].concat(editorProg.values)
    if(prev) {
      editorApp.system.updateStore("externalEvent", prev.system.getStore("externalEvent").getFacts(), []);
    }
    editorApp.run(facts);
    if(editorProg.errors.length) {
      postMessage({type: "errors", errors: editorProg.errors});
    }
  } catch(e) {
    postMessage({type: "error", error: e.stack})
  }
}


onmessage = function(event) {
  switch(event.data.type) {
    case "compile":
      onCompile(event.data.code);
      break;
    case "event":
      editorApp.run(event.data.items);
      break;
  }
}
