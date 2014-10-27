var initialValue =  "* edge\n  ~ from to\n  + \"a\" \"b\"\n  + \"b\" \"c\"\n\n* path\n  | edge from to\n\n* path2\n  | edge from to:t\n  | path from:t to\n\n* path\n  | path2 from to";

if(window.localStorage["eveEditorCode"]) {
  initialValue = window.localStorage["eveEditorCode"];
}

CodeMirror.defineMode("eve", CodeMirrorModeParser);
CodeMirror.defineMIME("text/x-eve", "eve");

var editor = CodeMirror(document.querySelector("#editor"), {
  value: initialValue,
  tabSize: 2,
  mode:  "eve"
});

var editorApp;
var editorProg;
var worker = new Worker("../src/worker.js");

function tableCard(name, headers, rows, constants) {
  var card = $("<div class='card table-card'><h2></h2><div class='grid'><div class='grid-header'></div></div></div>");
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

function onTableCards(cards) {
  var start = now();
  $(".table-card").remove();
  var frag = document.createDocumentFragment();
  for(var cardIx in cards) {
    var card = cards[cardIx];
    frag.appendChild(tableCard(card[0], card[1], card[2], card[3]));
  }
  $("#cards").append(frag);
  $("#renderStat").html((now() - start).toFixed(2));
}

function clearErrors(errors) {
  $("#errors").empty().hide();
}

function addErrors(errors) {
  for(var i in errors) {
    var err = errors[i];
    if(typeof err === "string") {
      $("#errors").append("<li>" + err + "</li>");
    } else {
      $("#errors").append("<li> Line: " + err.line + 1 + " - " + err.errors[0].message + "</li>");
    }
  }
  $("#errors").show();
}

function onChange(cm, change) {
  var edValue = cm.getValue();
  window.localStorage["eveEditorCode"] = edValue;
  worker.postMessage({type: "compile", code: edValue});
}

worker.onmessage = function(event) {
  switch(event.data.type) {
    case "tableCards":
      clearErrors();
      onTableCards(event.data.cards);
      break;
    case "log":
      event.data.args.unshift("Worker: ");
      console.log.apply(console, event.data.args);
      break;
    case "error":
      addErrors([event.data.error])
      console.error(event.data.error);
      break;
    case "errors":
      addErrors(event.data.errors);
      console.error("Syntax error: ", event.data.errors);
      break;
    case "runStats":
      $("#timeStat").html(event.data.runtime);
      $("#factsStat").html(event.data.numFacts);
      break;
  }
}

editor.on("change", Cowboy.debounce(200, onChange));
onChange(editor, null);
