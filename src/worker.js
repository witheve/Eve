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
  postMessage({type: "tableCards", cards: returns});

  var uiTables = ["uiElem", "uiText", "uiAttr", "uiStyle", "uiEvent", "uiChild"];
  var diff = {};
  for(var i = 0; i < uiTables.length; i++) {
    var table = uiTables[i];
    if(uiStorage[table]) {
      var adds = [];
      var removes = [];
      system.getStore(table).diff(uiStorage[table], adds, removes);
      uiStorage[table] = system.getStore(table);
      diff[table] = {
        adds: adds,
        removes: removes
      };
    } else {
      uiStorage[table] = system.getStore(table);
      diff[table] = {
        adds: system.getStore(table).getFacts(),
        removes: []
      };
    }
  }
  postMessage({type: "renderUI", diff: diff})
}

var editorProg;
var editorApp;

function onCompile(code) {
  var parsed = parse(code);
  try {
    editorProg = parsedToEveProgram(parsed);
    editorApp = app(editorProg.program, {parent: null});
    editorApp.run([["time", 0]].concat(editorProg.values));
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
  }
}
