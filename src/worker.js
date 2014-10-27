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

function compilerWatcher2(application, storage, system) {
  var returns = [];
  for(var table in editorProg.tablesCreated) {
    var info = editorProg.tablesCreated[table];
    var rows = system.getTable(table).getFacts();
    returns.push([table, info.fields, rows, info.constants]);
  }
  postMessage({type: "tableCards", cards: returns})
}

var editorProg;
var editorApp;

function onCompile(code) {
  var parsed = parse(code);
  try {
    editorProg = parsedToEveProgram(parsed);
    console.log(parsed);
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
