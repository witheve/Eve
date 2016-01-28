import * as app from "./app";
import {Renderer} from "./microReact";
import {copy, mergeObject} from "./utils";
import * as CodeMirror from "codemirror";
import * as marked from "marked-ast";

require("codemirror/mode/gfm/gfm");
require("codemirror/mode/clojure/clojure");

declare var uuid;

function replaceAll(str, find, replace) {
  let regex = new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
  return str.replace(regex, replace);
}

function wrapWithMarkdown(cm, wrapping) {
  cm.operation(() => {
    let from = cm.getCursor("from");
    // if there's something selected wrap it
    if (cm.somethingSelected()) {
      let selected = cm.getSelection();
      let cleaned = replaceAll(selected, wrapping, "");
      if (selected.substring(0, wrapping.length) === wrapping
        && selected.substring(selected.length - wrapping.length) === wrapping) {
        cm.replaceRange(cleaned, from, cm.getCursor("to"));
        cm.setSelection(from, cm.getCursor("from"));
      } else {
        let str = `${wrapping}${cleaned}${wrapping}`;
        cm.replaceRange(str, from, cm.getCursor("to"));
        cm.setSelection(from, cm.getCursor("from"));
      }
    } else {
      cm.replaceRange(`${wrapping}${wrapping}`, from);
      let newLocation = { line: from.line, ch: from.ch + wrapping.length };
      cm.setCursor(newLocation);
    }
  })
}

function prefixWithMarkdown(cm, prefix) {
  cm.operation(() => {
    let from = cm.getCursor("from");
    let to = cm.getCursor("to");
    let toPrefix = [];
    for(let lineIx = from.line; lineIx <= to.line; lineIx++) {
      var currentPrefix = cm.getRange({line: lineIx, ch: 0}, {line: lineIx, ch: prefix.length});
      if(currentPrefix !== prefix && currentPrefix !== "") {
        toPrefix.push(lineIx);
      }
    }

    // if everything in the selection has been prefixed, then we need to unprefix
    if(toPrefix.length === 0) {
     for(let lineIx = from.line; lineIx <= to.line; lineIx++) {
       cm.replaceRange("", {line: lineIx, ch: 0}, {line: lineIx, ch: prefix.length});
      }
    } else {
      for(let lineIx of toPrefix) {
        cm.replaceRange(prefix, {line: lineIx, ch: 0});
      }
    }
  });
}

var defaultKeys = {
  "Cmd-B": (cm) => {
    wrapWithMarkdown(cm, "**");
  },
  "Cmd-I": (cm) => {
    wrapWithMarkdown(cm, "_");
  },
};

export class RichTextEditor {

  cmInstance: CodeMirror.Editor;
  marks: {};
  timeout;
  meta: any;
  //format bar
  formatBarDelay = 100;
  showingFormatBar = false;
  formatBarElement:Element = null;
  // events
  onUpdate: (meta: any, content: string) => void;

  constructor(node, options) {
    this.marks = {};
    this.meta = {};
    let extraKeys = mergeObject(copy(defaultKeys), options.keys || {});
    this.cmInstance = <CodeMirror.Editor>CodeMirror(node, {
      mode: "gfm",
      lineWrapping: true,
      autoCloseBrackets: true,
      viewportMargin: Infinity,
      extraKeys
    });
    let cm = this.cmInstance;

    var self = this;
    cm.on("changes", (cm, changes) => {
      self.onChanges(cm, changes);
      if (self.onUpdate) {
        self.onUpdate(self.meta, cm.getValue());
      }
    });
    cm.on("cursorActivity", (cm) => { self.onCursorActivity(cm) });
    cm.on("mousedown", (cm, e) => { self.onMouseDown(cm, e) });
    cm.getWrapperElement().addEventListener("mouseup", (e) => {
      self.onMouseUp(cm, e);
    });
  }

  showFormatBar() {
    this.showingFormatBar = true;
    var renderer = new Renderer();
    var cm = this.cmInstance;
    let head = cm.getCursor("head");
    let from = cm.getCursor("from");
    let to = cm.getCursor("to");
    let start = cm.cursorCoords(head, "local");
    let top = start.bottom + 5;
    if((head.line === from.line && head.ch === from.ch)
       || (cm.cursorCoords(from, "local").top === cm.cursorCoords(to, "local").top)) {
      top = start.top - 40;
    }
    let barSize = 300 / 2;
    var item = {c: "formatBar", style: `position:absolute; left: ${start.left - barSize}px; top:${top}px;`, children: [
      {c: "button ", text: "H1", click: () => { prefixWithMarkdown(cm, "# "); }},
      {c: "button ", text: "H2", click: () => { prefixWithMarkdown(cm, "## "); }},
      {c: "sep"},
      {c: "button bold", text: "B", click: () => { wrapWithMarkdown(cm, "**"); }},
      {c: "button italic", text: "I", click: () => { wrapWithMarkdown(cm, "_"); }},
      {c: "sep"},
      {c: "button ", text: "-", click: () => { prefixWithMarkdown(cm, "- "); }},
      {c: "button ", text: "1.", click: () => { prefixWithMarkdown(cm, "1. "); }},
      {c: "button ", text: "[ ]", click: () => { prefixWithMarkdown(cm, "[ ] "); }},
      {c: "sep"},
      {c: "button ", text: "link"},
    ]};
    renderer.render([item]);
    let elem = <Element>renderer.content.firstChild;
    this.formatBarElement = elem;
    cm.getWrapperElement().appendChild(elem);
    // this.cmInstance.addWidget(pos, elem);
  }

  hideFormatBar() {
    this.showingFormatBar = false;
    this.formatBarElement.parentNode.removeChild(this.formatBarElement);
    this.formatBarElement = null;
  }

  onChanges(cm, changes) {
    let self = this;
  }

  onCursorActivity(cm) {
    if(this.showingFormatBar && !cm.somethingSelected()) {
      this.hideFormatBar();
    }
  }

  onMouseUp(cm, e) {
    if(!this.showingFormatBar) {
      var self = this;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        if (cm.somethingSelected()) {
          self.showFormatBar();
        }
      }, this.formatBarDelay);
    }
  }

  onMouseDown(cm, e) {
    let cursor = cm.coordsChar({ left: e.clientX, top: e.clientY });
    let pos = cm.indexFromPos(cursor);
    let marks = cm.findMarksAt(cursor);
  }

}

export function createEditor(node, elem) {
  let options = elem.options || {};
  let editor = node.editor;
  let cm:any;
  if (!editor) {
    editor = node.editor = new RichTextEditor(node, options);
    cm = node.editor.cmInstance;
    if(!options.noFocus) {
      cm.focus();
    }
  } else {
    cm = node.editor.cmInstance;
  }
  editor.onUpdate = elem.change;
  editor.meta = elem.meta || editor.meta;
  let doc = cm.getDoc();
  if (doc.getValue() !== elem.value) {
    doc.setValue(elem.value || "");
    doc.clearHistory();
    doc.setCursor({line: 1, ch: 0});
  }
  if(elem.cells) {
    cm.operation(() => {
      let cellIds = {};
      for(let cell of elem.cells) {
        cellIds[cell.id] = true;
        let mark = editor.marks[cell.id];
        let add = false;
        if(!mark) {
          add = true;
        } else {
          let found = mark.find();
          if(!found) {
            add = true;
          } else {
            // if the mark doesn't contain the correct text, we need to nuke it.
            let {from, to} = found;
            if(cm.getRange(from, to) !== cell.value || cell.start !== cm.indexFromPos(from)) {
              add = true;
            }
          }
        }
        if(add) {
          let dom;
          if(!mark) {
            dom = document.createElement("div");
            dom.id = `${elem["meta"].paneId}|${cell.id}|container`;
          } else {
            dom = mark.replacedWith;
            mark.clear();
          }
          let newMark = cm.markText(cm.posFromIndex(cell.start), cm.posFromIndex(cell.start + cell.length), {replacedWith: dom});
          dom["mark"] = newMark;
          editor.marks[cell.id] = newMark;
        }
      }
      for(let markId in editor.marks) {
        if(!cellIds[markId]) {
          editor.marks[markId].clear();
          delete editor.marks[markId];
        }
      }
    });
  }
  cm.refresh();
}
