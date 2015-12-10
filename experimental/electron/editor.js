"use strict"

var fs = require("fs");
var util = require("util");
var tsc = require("typescript");
var CodeMirror = require("codemirror");
require("codemirror/mode/javascript/javascript.js");
require("codemirror/mode/css/css.js");
require("codemirror/addon/scroll/scrollpastend.js");
require("codemirror/keymap/vim.js");
require("codemirror/addon/selection/active-line.js");
require("codemirror/addon/search/match-highlighter.js");
require("codemirror/addon/edit/matchbrackets.js");
require("codemirror/addon/edit/closebrackets.js");
require("codemirror/addon/hint/show-hint.js");
require("codemirror/addon/hint/anyword-hint.js");
require("codemirror/addon/comment/comment.js");

var consoleContainer = document.createElement("div");
consoleContainer.className = "console-container hidden";
document.body.appendChild(consoleContainer);
var consoleResults = document.createElement("div");
consoleResults.className = "console-results";
consoleContainer.appendChild(consoleResults);

function fillConsoleEditorOnClick(e) {
  consoleEditor.setValue(e.currentTarget.textContent);
  consoleEditor.focus();
}

function handleConsoleEvent(event) {
  let args = event.args[0];
  if(args.args.hidden) { return; }

  let showCodeItem = true;
  let codeItem = document.createElement('div');
  if(!args.args.fromFile) {
  	codeItem.textContent = args.args.code;
    codeItem.onclick = fillConsoleEditorOnClick;
  } else if(args.args && args.args.file) {
    codeItem.textContent = "Eval " + args.args.file;
  } else {
    showCodeItem = false;
  }
  codeItem.className = "code";
  let item = document.createElement("div");
  item.textContent = "Unknown event: " + event.channel;
  if(event.channel === "jsResult") {
    item.className = "result";
    item.textContent = util.inspect(JSON.parse(args.result || "null"));
  } else if (event.channel === "jsError") {
    item.className = "error";
    item.textContent = args.error;
  } else if(event.channel === "jsLog") {
    console.log(args.log);
    item.className = "log";
    item.textContent = args.log;
  }
  if(showCodeItem) {
    consoleResults.appendChild(codeItem);
  }
  consoleResults.appendChild(item);
  consoleResults.scrollTop = 1000000;
}

var consoleEditor = new CodeMirror(consoleContainer, {
  theme: "material",
  keyMap: "vim",
  mode: "javascript",
  extraKeys: {
    "Cmd-Enter": () => {
      webView.send("evalJS", {code: consoleEditor.getValue()});
      consoleEditor.setValue("");
    },
    "Shift-Cmd-Enter": () => {
      let info = {channel: "jsResult", args: []};
      let code = consoleEditor.getValue();
      try {
        let result = window.eval.call(window, code);
        info.args.push({args: {code}, result});
      } catch(e) {
        info.channel = "jsError";
        info.args.push({args: {code}, error: e.stack})
      }
      handleConsoleEvent(info);
      consoleEditor.setValue("");
    },
    "Tab": betterTab,
  },
  highlightSelectionMatches: true,
  styleActiveLine: true,
  matchBrackets: true,
  autoCloseBrackets: true,
});

var editorContainer = document.createElement("div");
editorContainer.className = "editor-container";
document.body.appendChild(editorContainer);

var docs = {
  "editor.js": new CodeMirror.Doc(fs.readFileSync("editor.js").toString(), "javascript"),
  "editor.css": new CodeMirror.Doc(fs.readFileSync("editor.css").toString(), "css"),
  "../cardwiki/src/wiki.ts": new CodeMirror.Doc(fs.readFileSync("../cardwiki/src/wiki.ts").toString(), "application/typescript"),
  "../cardwiki/css/editor.css": new CodeMirror.Doc(fs.readFileSync("../cardwiki/css/editor.css").toString(), "css"),
  "../cardwiki/src/bootstrap.ts": new CodeMirror.Doc(fs.readFileSync("../cardwiki/src/bootstrap.ts").toString(), "application/typescript"),
}

var editor = new CodeMirror(editorContainer, {
  theme: "material",
  keyMap: "vim",
  highlightSelectionMatches: true,
  styleActiveLine: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  extraKeys: {
    "Cmd-Enter": () => {
      CodeMirror.commands.save(editor);
    },
    "Cmd-S": () => {
      CodeMirror.commands.save(editor);
    },
    "Tab": betterTab,
    "Cmd-/": () => { CodeMirror.commands.toggleComment(editor); }
  },
});

function betterTab(cm) {
  if(cm.somethingSelected()) {
    return CodeMirror.Pass;
  }
  CodeMirror.commands.insertSoftTab(cm);
}

var debounce;
editor.on("inputRead", function(cm) {
  clearTimeout(debounce);
  if (!cm.state.completionActive) debounce = setTimeout(function() {
    let curPos = cm.getCursor();
    let lastCharPos = {ch: curPos.ch - 1, line: curPos.line};
    let previousChar = cm.getRange(lastCharPos, curPos);
    if(!previousChar.match(/[a-zA-Z]/)) return;
    cm.showHint({completeSingle: false});
  }, 100);
});

function loadDoc(file) {
  let requestedDoc = docs[file];
  editor.setOption("file", file);
  editor.swapDoc(requestedDoc);
}

loadDoc("editor.js");

CodeMirror.Vim.map("j", "gj");
CodeMirror.Vim.map("k", "gk");
CodeMirror.Vim.map("-", "$");
CodeMirror.Vim.map("0", "^");
CodeMirror.Vim.map("<C-s>", ":w");
CodeMirror.Vim.map("<BS>", "<PageUp>");
CodeMirror.Vim.map("<Space>", "<PageDown>");
CodeMirror.Vim.map(",/", ":nohlsearch<Enter>");

CodeMirror.commands.save = (cm) => {
  let value = cm.getValue();
  let file = cm.options.file;
  if(file) {
    let cleaned = value.replace(/[ \t]+$/gm, "");
    fs.writeFileSync(file, cleaned);
  }
  if(file === "editor.css") {
    document.querySelector("#customStyle").textContent = value;
  } else if (file === "edito.js") {
    // do nothing
  } else {
    if(file.indexOf(".ts") > -1) {
      try {
        let compiled = tsc.transpile(value);
        webView.send("evalJS", {code: compiled, fromFile: true, file});
        webView.send("evalJS", {code: "app.render()", hidden: true});
      } catch(e) {
        console.log("tsc failed:", e);
      }
    } else if(file.indexOf(".css") > -1) {
      let lastSlash = file.lastIndexOf("/");
      let name = file.substring(lastSlash > -1 ? lastSlash + 1 : 0);
      webView.send("injectCSS", {name: name, code: value});
    }
  }
}

// global key bindings
var keycode = require("keycode");
document.addEventListener("keydown", (e) => {
  if(!e.metaKey) return;
  if(e.keyCode === keycode("E")) {
    editorContainer.classList.toggle("hidden");
    if(!editorContainer.classList.contains("hidden")) {
      editor.focus();
    }
  } else if(e.keyCode === keycode("1")) {
    loadDoc("editor.js");
  } else if(e.keyCode === keycode("2")) {
    loadDoc("editor.css");
  } else if(e.keyCode === keycode("3")) {
    loadDoc("../cardwiki/src/wiki.ts");
  } else if(e.keyCode === keycode("4")) {
    loadDoc("../cardwiki/css/editor.css");
  } else if(e.keyCode === keycode("5")) {
    loadDoc("../cardwiki/src/bootstrap.ts");
  } else if(e.keyCode === keycode("R")) {
    if(!e.shiftKey) {
      webView.reload();
      e.stopPropagation();
    } else {
      window.location.reload();
    }
  } else if(e.keyCode === keycode("T")) {
    if(e.shiftKey) {
      consoleResults.innerHTML = "";
    } else {
      consoleContainer.classList.toggle("hidden");
      if(!consoleContainer.classList.contains("hidden")) {
        consoleEditor.focus();
      }
    }
  } else if(e.keyCode === keycode("D")) {
    webView.openDevTools();
  }
});

var webView = document.createElement("webView");
webView.setAttribute("preload", "./editorInjection.js");
webView.setAttribute("src", "../cardwiki/editor.html");
webView.addEventListener("ipc-message", (event) => {
  handleConsoleEvent(event);
});
document.body.appendChild(webView);

