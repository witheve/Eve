import * as commonmark from "commonmark";
import {CodeMirror} from "CodeMirror";
import {sendSwap, sendSave, sendParse} from "./client";
import {setActiveIds, renderer, renderEditor} from "./renderer";

let lineMarks = {"item": true, "heading": true, "heading1": true, "heading2": true, "heading3": true, "heading4": true};

let parser = new commonmark.Parser();

let codeEditor:any;

interface Pos {line: number, ch: number}
interface Range { from: Pos, to: Pos }

class Span {
  textMarker: any;
  editor: any;
  source: any;
  from: Pos;
  to: Pos;
  lineTextClass?: string;
  lineBackgroundClass?: string;

  constructor(editor: any, from: Pos, to: Pos, source: any) {
    this.source = source;
    this.from = from;
    this.to = to;
  }

  getMarkAttributes() {
    return {className: this.source.type.toUpperCase()}
  }

  applyMark(editor) {
    this.editor = editor;
    let cm = editor.editor;
    let {from, to} = this;
    if(!samePos(from, to)) {
      let attributes = this.getMarkAttributes();
      this.textMarker = cm.markText(from, to, attributes)
    } else {
      this.textMarker = cm.setBookmark(from, {});
    }
    this.textMarker.span = this;

    if(this.lineTextClass || this.lineBackgroundClass) {
      let start = from.line;
      let end = to.line;
      if(start == end) {
        end += 1;
      }
      for(let line = start; line < end; line++) {
        if(this.lineBackgroundClass) cm.addLineClass(line, "background", this.lineBackgroundClass);
        if(this.lineTextClass) cm.addLineClass(line, "text", this.lineTextClass);
      }
    }
  }

  find() {
    if(this.textMarker) {
      let loc = this.textMarker.find();
      if(loc.from) return loc;
      return {from: loc, to: loc};
    }
    return {from: this.from, to: this.to};
  }

  clear() {
    if(this.textMarker) {
      let cm = this.editor.editor;
      let loc = this.find();
      this.textMarker.clear();
      this.textMarker.span = null;
      this.textMarker = null;

      let start = loc.from.line;
      let end = loc.to.line;
      if(start == end) {
        end += 1;
      }
      for(let line = start; line < end; line++) {
        if(this.lineBackgroundClass) cm.removeLineClass(line, "background", this.lineBackgroundClass);
        if(this.lineTextClass) cm.removeLineClass(line, "text", this.lineTextClass);
      }
    }
  }

  onChange(change) {}
  onBeforeChange(change) {}
}

function changeToFinalPos(change) {
  let {from, to, text} = change;
  let adjusted = {line: from.line + (text.length - 1), ch: 0}
  if(text.length == 1) {
    adjusted.ch = from.ch + text[0].length;
  } else {
    adjusted.ch = text[text.length - 1].length;
  }
  return adjusted;
}

function formattingChange(span, change, action) {
  let editor = span.editor;
  let source = {type: span.source.type};
  let {from, to} = change;
  let adjusted = changeToFinalPos(change);
  if(action == "split") {
    splitMark(editor, span, from, adjusted);
  } else if(!action) {
    let loc = span.find();
    // if we're at the end of this mark
    if(samePos(loc.to, from)) {
      span.clear();
      editor.mark(loc.from, adjusted, source);
    }
  }
}

class HeadingSpan extends Span {

  constructor(editor: any, from: Pos, to: Pos, source: any) {
    super(editor, from, to, source);
    this.lineTextClass = "HEADING" + this.source.level;
    this.lineBackgroundClass = "HEADING" + this.source.level;
  }

  getMarkAttributes() {
    return {className: "HEADING" + this.source.level};
  }

  onChange(change) {
    let {from, to} = change;
    if(change.origin === "+delete") {
      let marks = getMarksByType(this.editor.editor, "heading", to);
      for(let mark of marks) {
        if(from.ch == 0) {
          this.editor.mark(from, from, mark.source);
        }
        // clear the old bookmark
        mark.clear();
      }
    }
  }
}

class ListItemSpan extends Span {

  constructor(editor: any, from: Pos, to: Pos, source: any) {
    super(editor, from, to, source);
    this.lineTextClass = "ITEM";
  }

  onBeforeChange(change) {
    let {from, to, text} = change;
    let loc = this.find();
    if(!samePos(loc.from, from)) return;

    if(change.origin === "+delete") {
      this.clear();
      change.cancel();
    }
    if(change.origin === "+input") {
      // if we are at the start of a list item and adding a new line, we're really removing the
      // list item-ness of this row
      if(isNewlineChange(change) && this.editor.editor.getLine(from.line) === "") {
        this.clear();
        change.cancel();
      }
    }
  }

  onChange(change) {
    let {from, to, text} = change;
    let loc = this.find();
    if(!samePos(loc.from, from)) return;
    // check if we're adding a new line from a list line. If so, we continue
    // the list.
    if(isNewlineChange(change)) {
      let nextLine = {line: from.line + 1, ch: 0};
      let parentSource = this.source;
      this.editor.mark(nextLine, nextLine, {type: parentSource.type, _listData: parentSource._listData});
    }
  }
}

class CodeBlockSpan extends Span {

  constructor(editor: any, from: Pos, to: Pos, source: any) {
    super(editor, from, to, source);
    this.lineBackgroundClass = "CODE";
  }

  onBeforeChange(change) {
    if(change.origin === "+delete") {
      let loc = this.find();
      if(samePos(loc.from, loc.to)) {
        // clear the old bookmark
        this.clear();
        change.cancel();
      }
    }
  }

  onChange(change) {
    let {from, to, text} = change;
    let adjusted = changeToFinalPos(change);
    if(change.origin === "+input") {
      // check if we're adding a new line inside of a code_block. If so, that line is also a
      // code_block line
      let mark = this;
      let loc = mark.find();
      if(samePos(from, loc.from)) {
        mark.clear();
        if(isNewlineChange(change)) {
          let newTo = {line: adjusted.line + 1, ch: 0};
          let marker = this.editor.mark({line: loc.from.line, ch: 0}, newTo, mark.source);
        } else {
          // if we're typing at the beginning of a code_block, we need to
          // extend the block
          let newTo = loc.to;
          if(comparePos(adjusted, newTo) > 0) {
            newTo = {line: adjusted.line + 1, ch: 0};
          }
          let marker = this.editor.mark({line: loc.from.line, ch: 0}, newTo, mark.source);
        }
      } else if(isNewlineChange(change) && comparePos(from, loc.to) < 0) {
        this.editor.editor.addLineClass(from.line, "background", this.lineBackgroundClass)
        this.editor.editor.addLineClass(from.line + 1, "background", this.lineBackgroundClass)
      }
    } else if(change.origin === "+delete") {

      let mark = this;
      let loc = mark.find();
      // if the code_block is now empty, then we need to turn this mark into
      // a bookmark
      if(this.editor.editor.getRange(loc.from, loc.to) === "\n") {
        mark.clear();
        this.editor.mark(loc.from, loc.from, mark.source);
      } else if(loc.to.ch !== 0) {
        // if we removed the end of the block, we have to make sure that this mark
        // ends up terminating at the beginning of the next line.
        let to = {line: from.line + 1, ch: 0};
        mark.clear();
        this.editor.mark(loc.from, to, mark.source);
        // we then have to check if any formatting marks ended up in here
        // and remove them
        for(let containedMark of this.editor.editor.findMarks(loc.from, to)) {
          if(containedMark.span && containedMark.span.source.type !== "code_block") {
            containedMark.span.clear();
          }
        }
      }
    } else if(change.origin === "paste") {
      let mark = this;
      let loc = mark.find();

      if(samePos(from, loc.from) || comparePos(loc.to, from) > 0) {
        // mark all the pasted lines with the code classes
        let ix = 0;
        for(let text of change.text) {
          this.editor.editor.addLineClass(from.line + ix, "background", this.lineBackgroundClass);
          ix++;
        }
      }

      if(samePos(from, loc.from)) {
        mark.clear();
        // if we're typing at the beginning of a code_block, we need to
        // extend the block
        let newTo = {line: adjusted.line + change.text.length, ch: 0};
        let marker = this.editor.mark({line: loc.from.line, ch: 0}, newTo, mark.source);
      }

      if(loc.to.ch !== 0) {
        // if we removed the end of the block, we have to make sure that this mark
        // ends up terminating at the beginning of the next line.
        let to = {line: from.line + 1, ch: 0};
        mark.clear();
        this.editor.mark(loc.from, to, mark.source);
        // we then have to check if any formatting marks ended up in here
        // and remove them
        for(let containedMark of this.editor.editor.findMarks(loc.from, to)) {
          if(containedMark.source && containedMark.source.type !== "code_block") {
            containedMark.clear();
          }
        }
      }
    }
  }
}

class CodeSpan extends Span {
  onChange(change) {
    let action = this.editor.formatting["strong"];
    if(change.origin === "+input") {
      formattingChange(this, change, action);
    }
  }
}

class StrongSpan extends Span {
  onChange(change) {
    let action = this.editor.formatting["strong"];
    if(change.origin === "+input") {
      formattingChange(this, change, action);
    }
  }
}

class EmphasisSpan extends Span {
  onChange(change) {
    let action = this.editor.formatting["strong"];
    if(change.origin === "+input") {
      formattingChange(this, change, action);
    }
  }
}

let MarkdownFormats = ["strong", "emph", "code"];
let TypeToSpanType = {
  "heading": HeadingSpan,
  "item": ListItemSpan,
  "code_block": CodeBlockSpan,
  "strong": StrongSpan,
  "emphasis": EmphasisSpan,
  "code": CodeSpan,
}
class MarkdownEditor {
  editor: any;
  spans: any;
  formatting: any;

  constructor(value: string) {
    var self = this;
    let editor = new CodeMirror(function() {}, {
      tabSize: 2,
      lineWrapping: true,
      extraKeys: ctrlify({
        "Cmd-Enter": doSwap,
        "Cmd-B": formatBold,
        "Cmd-I": formatItalic,
        "Cmd-E": formatHeader,
        "Cmd-Y": formatList,
        "Cmd-K": formatCodeBlock,
        "Cmd-L": formatCode,
      })
    });
    editor.markdownEditor = this;
    this.editor = editor;
    this.formatting = {};
    editor.on("beforeChange", function(editor, change) { self.onBeforeChange(change); });
    editor.on("change", function(editor, change) { self.onChange(change); });
    editor.on("cursorActivity", function(editor) { self.onCursorActivity(); });
    editor.on("paste", function(editor, event) { self.onPaste(event); });
    editor.on("copy", function(editor, event) { self.onCopy(event); });
    editor.on("changes", function(editor, changes) { self.onChanges(changes); });

    this.loadMarkdown(value);
    this.editor.clearHistory();
  }

  onBeforeChange(change) {
    let {from, to} = change;
    let marks;
    if(!samePos(from, to)) {
      let adjustedFrom = this.editor.posFromIndex(this.editor.indexFromPos(from) - 1);
      let adjustedTo = this.editor.posFromIndex(this.editor.indexFromPos(to) + 1);
      marks = this.editor.findMarks(adjustedFrom, adjustedTo);
    } else {
      marks = this.editor.findMarksAt(from);
    }
    for(let mark of marks) {
      if(mark.span && mark.span.onBeforeChange) {
        mark.span.onBeforeChange(change);
      }
    }
  }

  onChange(change) {
    let {from, to} = change;
    let codeBlockMarks = getMarksByType(this.editor, "code_block", from, to, "inclusive");
    let marks;
    if(!samePos(from, to)) {
      let adjustedFrom = this.editor.posFromIndex(this.editor.indexFromPos(from) - 1);
      let adjustedTo = this.editor.posFromIndex(this.editor.indexFromPos(to) + 1);
      marks = this.editor.findMarks(adjustedFrom, adjustedTo);
    } else {
      marks = this.editor.findMarksAt(from);
    }
    for(let mark of marks) {
      if(mark.span && mark.span.onChange) {
        mark.span.onChange(change);
      }
    }
    for(let format in this.formatting) {
      let action = this.formatting[format];
      if(action == "add") {
        let {from} = change;
        let adjusted = changeToFinalPos(change);
        let marker = this.mark(from, adjusted, {type: format});
      }
    }
  }

  onChanges(changes) {
    // remove any formatting that may have been applied
    this.formatting = {};
    sendParse(toMarkdown(this.editor));
  }

  onCursorActivity() {
    // remove any formatting that may have been applied
    this.formatting = {};
  }

  onCopy(event) { }
  onPaste(event) {
    // remove any formatting that may have been applied
    this.formatting = {};
  }

  _markSpan(span) {
    span.applyMark(this);
  }

  mark(from, to, source) {
    let spanClass = TypeToSpanType[source.type];
    this._markSpan(new spanClass(this, from, to, source));
  }

  marksByType(type, from, to) {

  }

  dom() {
    return this.editor.getWrapperElement();
  }

  refresh() {
    this.editor.refresh();
  }

  loadMarkdown(markdownText) {
    let editor = this.editor;
    let self = this;
    let {text, spans} = parseMarkdown(markdownText)

    editor.operation(function() {
      editor.setValue(text);
      for(let span of spans) {
        let [start, end, source] = span;
        self.mark(editor.posFromIndex(start), editor.posFromIndex(end), source);
      }
    });
  }

  getMarkdown() {
    return toMarkdown(this.editor);
  }

}

function parseMarkdown(markdown) {
  let parsed = parser.parse(markdown);
  let walker = parsed.walker();
  var cur;
  var text = [];
  var pos = 0;
  var lastLine = 1;
  var spans = [];
  var context = [];
  while(cur = walker.next()) {
    let node = cur.node;
    if(cur.entering) {
      while(node.sourcepos && node.sourcepos[0][0] > lastLine) {
        lastLine++;
        pos++;
        text.push("\n");
      }
      if(node.type !== "text") {
        context.push({node, start: pos});
      }
      if(node.type == "text" || node.type == "code_block" || node.type == "code") {
        text.push(node.literal);
        pos += node.literal.length;
      }
      if(node.type == "softbreak") {
        text.push("\n");
        pos += 1;
        lastLine++;
      }
      if(node.type == "code_block") {
        let start = context[context.length - 1].start;
        spans.push([start, pos, node]);
        lastLine = node.sourcepos[1][0] + 1;
      }
      if(node.type == "code") {
        let start = context[context.length - 1].start;
        spans.push([start, pos, node]);
      }
    } else {
      let info = context.pop();
      if(node.type == "emph" || node.type == "strong" || node.type == "link") {
        spans.push([info.start, pos, node]);
      } else if(node.type == "heading" || node.type == "item") {
        spans.push([info.start, info.start, node]);
      }
    }
  }
  return {text: text.join(""), spans};
}

function toMarkdown(editor) {
  let marks = editor.getAllMarks();
  let markers = [];
  let fullText = editor.getValue();
  let pieces = [];
  let pos = 0;
  for(let m of marks) {
    let mark = m.span;
    if(!mark) continue;
    let loc = mark.find();
    let from = editor.indexFromPos(loc.from);
    let to = editor.indexFromPos(loc.to);
    markers.push({pos: from, start: true, source: mark.source});
    markers.push({pos: to, start: false, source: mark.source});
  }
  markers.sort(function(a, b) {
    return a.pos - b.pos;
  });
  for(let mark of markers) {
    if(!mark.source) continue;
    if(pos !== mark.pos) {
      pieces.push(fullText.substring(pos, mark.pos));
      pos = mark.pos;
    }
    let source = mark.source;
    let type = source.type;
    if(type == "heading" && mark.start) {
      for(let ix = 0; ix < mark.source.level; ix++) {
        pieces.push("#");
      }
      pieces.push(" ");
    } else if(type == "emph") {
      pieces.push("_");
    } else if(type == "strong") {
      pieces.push("**");
    } else if(type == "code") {
      pieces.push("`");
    } else if(type == "code_block" && mark.start) {
      pieces.push("```\n");
    } else if(type == "code_block" && !mark.start) {
      // if the last character of the block is not a \n, we need to
      // add one since the closing fence must be on its own line.
      let last = pieces[pieces.length - 1];
      if(last[last.length - 1] !== "\n") {
        pieces.push("\n");
      }
      pieces.push("```\n");
    } else if(type == "item" && mark.start && source._listData.type == "bullet") {
      pieces.push("- ");
    } else if(type == "item" && mark.start && source._listData.type == "ordered") {
      pieces.push(`${source._listData.start}. `);
    } else if(type == "link" && mark.start) {
      pieces.push("[");
    } else if(type == "link" && !mark.start) {
      pieces.push(`](${source._destination})`);
    }
  }
  if(pos < fullText.length) {
    pieces.push(fullText.substring(pos));
  }
  return pieces.join("");
}

function getCodeBlocks(editor) {
  let blocks = [];
  for(let mark of editor.editor.getAllMarks()) {
    if(!mark.span) continue;
    if(mark.span.source.type == "code_block") {
      blocks.push(mark);
    }
  }
  return blocks;
}

function doSwap(editor) {
  sendSwap(toMarkdown(editor));
}

export function doSave() {
  sendSave(toMarkdown(codeEditor));
}

export function handleEditorParse(parse) {
  if(!codeEditor) return;
  let parseLines = parse.lines;
  let from:any = {};
  let to:any = {};
  let ix = 0;
  let parseBlocks = parse.blocks;
  codeEditor.editor.operation(function() {
    for(let block of getCodeBlocks(codeEditor)) {
      if(!parseBlocks[ix]) continue;
      let loc = block.span.find();
      let fromLine = loc.from.line;
      let toLine = loc.to.line;
      let parseStart = parseBlocks[ix].line;
      let offset = parseStart - fromLine + 1;

      for(let line = fromLine; line < toLine; line++) {
        // clear all the marks on that line?
        for(let mark of codeEditor.editor.findMarks({line, ch: 0}, {line, ch: 1000000})) {
          if(!mark.span) {
            mark.clear();
          }
        }
        from.line = line;
        to.line = line;
        let tokens = parseLines[line + offset];
        if(tokens) {
          let state;
          for(let token of tokens) {
            from.ch = token.surrogateOffset;
            to.ch = token.surrogateOffset + token.surrogateLength;
            let className = token.type;
            if(state == "TAG" || state == "NAME") {
              className += " " + state;
            }
            codeEditor.editor.markText(from, to, {className, inclusiveRight: true});
            state = token.type
          }
        }
      }
      ix++;
    }
  });
}

function ctrlify(keymap) {
  let finalKeymap = {};
  for(let key in keymap) {
    finalKeymap[key] = keymap[key];
    if(key.indexOf("Cmd") > -1) {
      finalKeymap[key.replace("Cmd", "Ctrl")] = keymap[key];
    }
  }
  return finalKeymap;
}


function samePos(a, b) {
  return comparePos(a,b) === 0;
}

function comparePos(a, b) {
  if(a.line === b.line && a.ch === b.ch) return 0;
  if(a.line > b.line) return 1;
  if(a.line === b.line && a.ch > b.ch) return 1;
  return -1;
}

function whollyEnclosed(inner, outer) {
  let left = comparePos(inner.from, outer.from);
  let right = comparePos(inner.to, outer.to);
  if((left === 1 || left === 0) && (right === -1 || right === 0)) {
    return true;
  }
  return false;
}

function fullyMark(editor, selection, source) {
  let marks = getMarksByType(editor.editor, source.type, selection.from, selection.to);
  let marked = false;
  for(let m of marks) {
    let mark = m.span;
    let loc = mark.find();
    // if this mark is wholly equalivent to the selection
    // then we remove it and we've "marked" the span
    if(samePos(loc.from, selection.from) && samePos(loc.to, selection.to)) {
      marked = true;
      mark.clear();
      // if the mark is wholly enclosed by the selection, then
      // we remove it as we'll be replacing it with a larger span
    } else if(whollyEnclosed(loc, selection)) {
      mark.clear();
      // if the selection is wholly enclosed in the mark, we have to split
      // the mark so the selection is no longer contained in it
    } else if(whollyEnclosed(selection, loc)) {
      let startMarker = editor.mark(loc.from, selection.to, source);
      let endMarker = editor.mark(selection.to, loc.to, source);
      mark.clear();
      marked = true;
      // otherwise we need to trim the mark to not include the selection.
      // if the mark is on the left
    } else if(comparePos(loc.to, selection.from) > 0) {
      let startMarker = editor.mark(loc.from, selection.from, source);
      mark.clear();
      // if the mark is on the right
    } else if(comparePos(loc.from, selection.to) < 0) {
      let startMarker = editor.mark(selection.to, loc.to, source);
      mark.clear();
    }
  }
  if(!marked) {
    editor.mark(selection.from, selection.to, source);
  }
}

function doFormat(editor, type) {
  let cm = editor.editor;
  cm.operation(function() {
    if(cm.somethingSelected()) {
      let from = cm.getCursor("from");
      let to = cm.getCursor("to");
      fullyMark(editor, {from, to}, {type: type});
    } else {
      // by default, we want to add boldness to the next change we make
      let action = "add";
      let cursor = cm.getCursor("from");
      let marks = cm.findMarksAt(cursor);
      // get the marks at the cursor, if we're at the end of or in the middle
      // of a strong span, then we need to set that the next change is meant
      // to be remove for strong
      for(let m of marks) {
        let mark = m.span;
        if(!mark.source || mark.source.type !== type) continue;
        let loc = mark.find();
        if(samePos(loc.to, cursor)) {
          // if we're at the end of a bold span, we don't want the next change
          // to be bold
          action = "remove";
        } else if (samePos(loc.from, cursor)) {
          // if we're at the beginning of a bold span, we're stating we want
          // to add more bold to the front
          action = "add";
        } else {
          // otherwise you're in the middle of a span, and we want the next
          // change to not be bold
          action = "split";
        }
      }
      editor.formatting[type] = action;
    }
  });
}

function doLineFormat(editor, source) {
  let cm = editor.editor;
  cm.operation(function() {
    let loc = {from: cm.getCursor("from"), to: cm.getCursor("to")};
    let start = loc.from.line;
    let end = loc.to.line;
    let existing = [];
    let changed = false;
    for(let line = start; line <= end; line++) {
      let from = {line, ch: 0};
      // if there are line marks of another type, we need to remove them
      let allMarks = cm.findMarksAt(from);
      for(let mark of allMarks) {
        if(!mark.span) continue;
        let type = mark.span.source.type
        if(type !== source.type && lineMarks[type]) {
          mark.span.clear();
        }
      }
      let marks = getMarksByType(cm, source.type, from);
      // if there's already a mark, we don't need to do anything
      if(!marks.length) {
        changed = true;
        fullyMark(editor, {from, to: from}, source);
      } else {
        // we want to store the found marks in case we need to clear
        // them in the event that all the lines are already formatted
        existing.push.apply(existing, marks);
      }
    }
    // if all the lines were already formatted, then we need to remove
    // the formatting from all of them instead.
    if(!changed) {
      for(let mark of existing) {
        mark.span.clear();
      }
    }
    editor.refresh();
  });
}

// @TODO: formatting shouldn't apply in codeblocks.
function formatBold(editor) {
  doFormat(editor.markdownEditor, "strong");
}

function formatItalic(editor) {
  doFormat(editor.markdownEditor, "emph");
}

function formatCode(editor) {
  doFormat(editor.markdownEditor, "code");
}

function formatHeader(editor) {
  doLineFormat(editor.markdownEditor, {type: "heading", level: "1"});
}

function formatList(editor) {
  doLineFormat(editor.markdownEditor, {type: "item", _listData: {type: "bullet"}});
}

function formatCodeBlock(editor) {
  editor.operation(function() {
    let cursor = editor.getCursor("from");
    let to = {line: cursor.line, ch: 0};
    let text = editor.getLine(cursor.line);
    if(text !== "") {
      to.line += 1;
    }
    editor.markdownEditor.mark({line: cursor.line, ch: 0}, to, {type: "code_block"});
  });
}

function getMarksByType(editor, type, start, stop?, inclusive?) {
  let marks;
  if(start && stop && !samePos(start, stop)) {
    if(inclusive) {
      marks = editor.findMarks({line: start.line, ch: start.ch - 1}, {line: stop.line, ch: stop.ch + 1});
    } else {
      marks = editor.findMarks(start, stop);
    }
  } else if(start) {
    marks = editor.findMarksAt(start);
  } else {
    marks = editor.getAllMarks();
  }
  let valid = [];
  for(let mark of marks) {
    if(mark.span && mark.span.source.type === type) {
      valid.push(mark);
    }
  }
  return valid;
}

function splitMark(editor, mark, from, to?) {
  if(!to) to = from;
  let loc = mark.find();
  let source = mark.source;
  let startMarker = editor.mark(loc.from, from, source);
  if(comparePos(to, loc.to) === -1) {
    let endMarker = editor.mark(to, loc.to, source);
  }
  mark.clear();
}

function isNewlineChange(change) {
  return change.text.length == 2 && change.text[1] == "";
}

function injectCodeMirror(node, elem) {
  if(!node.editor) {
    codeEditor = new MarkdownEditor(elem.value);
    let editor = codeEditor;
    node.editor = editor;

    node.appendChild(editor.dom());
    editor.refresh();
  }
}

export function setKeyMap(event) {
  codeEditor.setOption("keyMap", event.currentTarget.value);
}

export function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

export function compileAndRun() {
  doSwap(codeEditor);
}

export function applyFix(event, elem) {
  //we need to do the changes in reverse order to ensure
  //the positions remain the same?
  let changes = elem.fix.changes.slice();
  changes.sort((a, b) => {
    let line = b.to.line - a.to.line;
    if(line == 0) {
      return b.to.offset - a.to.offset;
    }
    return line;
  });
  for(let change of changes) {
    codeEditor.replaceRange(change.value, {line: change.from.line - 1, ch: change.from.offset}, {line: change.to.line - 1, ch: change.to.offset});
  }
  doSwap(codeEditor);
}
