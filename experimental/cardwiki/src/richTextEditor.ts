import * as app from "./app";
/// <reference path="marked-ast/marked.d.ts" />
import * as marked from "marked-ast";

declare var CodeMirror;
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
        cm.replaceRange(`${wrapping}${cleaned}${wrapping}`, from, cm.getCursor("to"));
        cm.setSelection(from, cm.getCursor("from"));
      }
    } else {
      cm.replaceRange(`${wrapping}${wrapping}`, from);
      let newLocation = { line: from.line, ch: from.ch + wrapping.length };
      cm.setCursor(newLocation);
    }
  })
}

export class RichTextEditor {

  cmInstance;
  marks: any[];
  timeout;
  meta: any;
  onUpdate: (meta: any, content: string) => void;
  getEmbed: (meta: any, query: string) => Element;
  getInline: (meta: any, query: string) => string;
  removeInline: (meta: any, query: string) => void;

  constructor(node, getEmbed, getInline, removeInline) {
    this.marks = [];
    this.meta = {};
    this.getEmbed = getEmbed;
    this.getInline = getInline;
    this.removeInline = removeInline;
    let cm = this.cmInstance = new CodeMirror(node, {
      lineWrapping: true,
      autoCloseBrackets: true,
      viewportMargin: Infinity,
      extraKeys: {
        "Cmd-B": (cm) => {
          wrapWithMarkdown(cm, "**");
        },
        "Cmd-I": (cm) => {
          wrapWithMarkdown(cm, "_");
        },
      }
    });

    var self = this;
    cm.on("changes", (cm, changes) => {
      self.onChanges(cm, changes);
      if (self.onUpdate) {
        self.onUpdate(self.meta, cm.getValue());
      }
    });
    cm.on("cursorActivity", (cm) => { self.onCursorActivity(cm) });
    cm.on("mousedown", (cm, e) => { self.onMouseDown(cm, e) });
  }

  onChanges(cm, changes) {
    let self = this;
    for (let change of changes) {
      let removed = change.removed.join("\n");
      let matches = removed.match(/({[^]*?})/gm);
      if (!matches) continue;
      for (let match of matches) {
        this.removeInline(this.meta, match);
      }
    }
    cm.operation(() => {
      let content = cm.getValue();
      let parts = content.split(/({[^]*?})/gm);
      let ix = 0;
      for (let mark of self.marks) {
        mark.clear();
      }
      self.marks = [];
      let cursorIx = cm.indexFromPos(cm.getCursor("from"));
      for (let part of parts) {
        if (part[0] === "{") {
          let {mark, replacement} = self.markEmbeddedQuery(cm, part, ix);
          if (mark) self.marks.push(mark);
          if(replacement) part = replacement;
        }
        ix += part.length;
      }
    });
  }

  onCursorActivity(cm) {
    if (!cm.somethingSelected()) {
      let cursor = cm.getCursor("from");
      let marks = cm.findMarksAt(cursor);
      for (let mark of marks) {
        if (mark.needsReplacement) {
          let {from, to} = mark.find();
          let ix = cm.indexFromPos(from);
          let text = cm.getRange(from, to);
          mark.clear();
          let {mark:newMark} = this.markEmbeddedQuery(cm, text, ix);
          if (newMark) this.marks.push(newMark);
        }
      }
    }

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (cm.somethingSelected()) {
        // console.log("TIME TO SHOW!");
      }
    }, 1000);
  }

  onMouseDown(cm, e) {
    let cursor = cm.coordsChar({ left: e.clientX, top: e.clientY });
    let pos = cm.indexFromPos(cursor);
    let marks = cm.findMarksAt(cursor);
    for (let mark of this.marks) {
      if (mark.info && mark.info.to) {
        // console.log("GOTO: ", mark.info.to);
      }
    }
  }

  markEmbeddedQuery(cm, query, ix) {
    let cursorIx = cm.indexFromPos(cm.getCursor("from"));
    let mark, replacement;
    let start = cm.posFromIndex(ix);
    let stop = cm.posFromIndex(ix + query.length);
    // as long as our cursor isn't in this span
    if (query !== "{}" && (cursorIx <= ix || cursorIx >= ix + query.length)) {
      // check if this is a query that's defining an inline attribute
      // e.g. {age: 30}
      let adjusted = this.getInline(this.meta, query)
      if (adjusted !== query) {
        replacement = adjusted;
        cm.replaceRange(adjusted, start, stop);
      } else {
        mark = cm.markText(start, stop, { replacedWith: this.getEmbed(this.meta, query.substring(1, query.length - 1)) });
      }
    } else {
      mark = cm.markText(start, stop, { className: "embed-code" });
      mark.needsReplacement = true;
    }
    return {mark, replacement};
  }
}

export function createEditor(getEmbed: (meta: any, query: string) => Element,
  getInline: (meta: any, query: string) => string,
  removeInline: (meta: any, query: string) => void) {
  return function wrapRichTextEditor(node, elem) {
    let editor = node.editor;
    let cm;
    if (!editor) {
      editor = node.editor = new RichTextEditor(node, getEmbed, getInline, removeInline);
      cm = node.editor.cmInstance;
      cm.focus();
    } else {
      cm = node.editor.cmInstance;
    }
    editor.onUpdate = elem.change;
    editor.meta = elem.meta || editor.meta;
    if (cm.getValue() !== elem.value) {
      cm.setValue(elem.value || "");
      cm.clearHistory();
    }
    cm.refresh();
  }
}
