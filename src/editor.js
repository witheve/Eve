var editor = CodeMirror(document.querySelector("#editor"), {
  value: "* path\n  | edge from to\n\n* path2\n  | edge from to:t\n  | path from:t to\n\n* path\n  | path2 from to",
  tabSize: 2,
  mode:  "eve"
});

var editorApp;
var editorProg;

function makeRow() {

}

function tableCard(name, headers, rows, constants) {
  var card = $("<div class='card'><h2></h2><div class='grid'><div class='grid-header'></div></div></div>");
  var grid = $(".grid", card);
  var gridHeader = $(".grid-header", card);
  $("h2", card).html(name);
  for(var headerIx in headers) {
    var header = headers[headerIx];
    gridHeader.append("<div class='header'>" + header + "</div>");
  }
  for(var cons in constants) {
    gridHeader.append("<div class='header'>" + constants[cons].name + "</div>");
  }
  for(var ix in rows) {
    var row = rows[ix];
    var rowElem = $("<div class='grid-row'></div>");
    for(var field in row) {
      rowElem.append("<div>" + row[field] + "</div>")
    }
    for(var cons in constants) {
      rowElem.append("<div>" + constants[cons].constant + "</div>");
    }
    grid.append(rowElem);
  }
  return card.get(0);
}

function compilerWatcher(application, storage, system) {
  $("#program").empty();
  var frag = document.createDocumentFragment();
  for(var table in editorProg.tablesCreated) {
    var info = editorProg.tablesCreated[table];
    var rows = system.getTable(table).getFacts();
    frag.appendChild(tableCard(table, info.fields, rows, info.constants));
  }
  $("#program").append(frag);
}

function onChange(cm, change) {
  var parsed = parse(cm.getValue());
  try {
    editorProg = parsedToEveProgram(parsed);
    console.log(parsed);
    console.log(editorProg);
    editorApp = app(editorProg.program, {parent: document.querySelector("#program")});
    editorApp.run([["time", 0], ["edge", "a", "b"], ["edge", "b", "c"]]);
  } catch(e) {
    console.log(e);
  }
}

editor.on("change", onChange);
onChange(editor, null);
