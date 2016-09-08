import * as commonmark from "commonmark";
import {CodeMirror} from "CodeMirror";
import {sendSwap, sendSave, sendParse} from "./client";
import {setActiveIds, renderer, renderEve} from "./renderer";

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
      if(!loc) return;
      if(loc.from) return loc;
      return {from: loc, to: loc};
    }
    return {from: this.from, to: this.to};
  }

  clear(origin = "+delete") {
    if(this.textMarker) {
      let cm = this.editor.editor;
      let loc = this.find();
      this.from = loc.from;
      this.to = loc.to;
      this.editor.addToHistory({type: "span", added: [], removed: [this], origin});
      this.editor.queueUpdate();
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

  clone() {
    let spanType = TypeToSpanType[this.source.type] || Span;
    let loc = this.find();
    return new spanType(loc.from, loc.to, this.source);
  }

  refresh(change) {}
  onChange(change) {}
  onBeforeChange(change) {}
}

function cmLength (cm) {
  var lastLine = cm.lineCount() - 1;
  return cm.indexFromPos({line: lastLine, ch: cm.getLine(lastLine).length});
}

function normalizeChange(editor, change) {
  // if there's a text property, we're dealing with a codemirror change
  // object
  if(change.text) {
    let {from, text, removed} = change;
    let removedText = removed.join("\n");
    let addedText = text.join("\n");
    let start = editor.indexFromPos(from);
    let end = start + addedText.length;
    return {type: "range", start, removed: removedText, added: addedText}
  } else {
    // otherwise we're dealing with a span change which is already normalized
    // for us
    return change;
  }
}

function inverseNormalizedChange(change) {
  let {type, start, removed, added} = change;
  return {type, start, added: removed, removed: added};
}

function changeToOps(editor, change) {
  let {start, added, removed} = normalizeChange(editor, change);
  let remaining = cmLength(editor) - start - added.length;
  let ops = [];
  ops.push(start);
  ops.push(added);
  ops.push(removed.length * -1);
  ops.push(remaining)
  let invert = [];
  invert.push(start);
  invert.push(removed);
  invert.push(added.length * -1);
  invert.push(remaining);
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
  active: boolean;

  constructor(editor: any, from: Pos, to: Pos, source: any) {
    super(editor, from, to, source);
    this.lineTextClass = "HEADING" + this.source.level;
    this.lineBackgroundClass = "HEADING" + this.source.level;
    this.active = false;
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
          this.editor.mark(from, from, mark.span.source);
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
      if(samePos(loc.from, change.to)) {
        this.clear();
        change.cancel();
      }
    }
  }

  refresh(change) {
    let loc = this.find();
    let cm = this.editor.editor;
    for(let ix = loc.from.line; ix < loc.to.line; ix++) {
      let info = cm.lineInfo(ix);
      if(!info.bgClass || info.bgClass.indexOf(this.lineBackgroundClass) === -1) {
        cm.addLineClass(ix, "background", this.lineBackgroundClass);
      }
    }
  }

  onChange(change) {
    let {from, to, text} = change;
    let adjusted = changeToFinalPos(change);
    let mark = this;
    let loc = mark.find();

    if(from.line < loc.from.line || (from.line === loc.from.line && loc.from.ch !== 0) || samePos(loc.from, loc.to)) {
      mark.clear();
      // if we're typing at the beginning of a code_block, we need to
      // extend the block
      // let newTo = {line: adjusted.line + change.text.length, ch: 0};
      let newFrom = {line: from.line, ch: 0};
      let newTo = {line: loc.to.line > loc.from.line ? loc.to.line : from.line + 1, ch: 0};
      let marker = this.editor.mark(newFrom, newTo, mark.source);
    } else if(loc.to.ch !== 0) {
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
    } else {
      this.refresh(change);
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

class ImageSpan extends Span {
}

class LinkSpan extends Span {
}

class ElisionSpan extends Span {
  element: HTMLElement;
  getMarkAttributes() {
    if(!this.element) {
      this.element = document.createElement("div");
      this.element.textContent = "...";
    }
    return {className: this.source.type.toUpperCase(), replacedWith: this.element}
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
  "image": ImageSpan,
  "link": LinkSpan,
  "elision": ElisionSpan,
}

class MarkdownEditor {
  editor: any;
  spans: any;
  formatting: any;
  history: any;
  changing: boolean;
  queued: boolean;
  eliding: boolean;
  affectedMarks: any[];

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
    this.queued = false;
    this.eliding = false;
    this.affectedMarks = [];
    this.history = {position: 0, items: []}
    CodeMirror.commands.undo = function(cm) {
      cm.markdownEditor.undo();
    }
    CodeMirror.commands.redo = function(cm) {
      cm.markdownEditor.redo();
    }
    editor.on("beforeChange", function(editor, change) { self.onBeforeChange(change); });
    editor.on("change", function(editor, change) { self.onChange(change); });
    editor.on("cursorActivity", function(editor) { self.onCursorActivity(); });
    editor.on("paste", function(editor, event) { self.onPaste(event); });
    editor.on("copy", function(editor, event) { self.onCopy(event); });
    editor.on("changes", function(editor, changes) { self.onChanges(changes); });
    // editor.on("scroll", function(editor) { self.onScroll(); });

    this.loadMarkdown(value);
    this.editor.clearHistory();
    this.history = {position: 0, items: []};
  }

  onScroll() {

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
        if(!mark.find()) {
          mark.clear();
        } else {
          mark.span.onBeforeChange(change);
        }
      }
    }
    if(!change.canceled) {
      this.changing = true;
      this.affectedMarks.push.apply(this.affectedMarks, marks);
    }
  }

  onChange(change) {
    let marks = this.affectedMarks;
    if(change.origin === "+mdredo" || change.origin === "+mdundo") {
      for(let mark of marks) {
        if(mark.span && mark.span.refresh) {
          mark.span.refresh(change);
        }
      }
      return;
    }
    // any multi-line change should be in its own undo block
    if(change.text.length > 1) {
      this.finalizeLastHistoryEntry();
    }
    this.addToHistory(change);
    let {from, to} = change;
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
    this.affectedMarks = [];
    this.changing = false;
    this.history.transitioning = false;
    // remove any formatting that may have been applied
    this.formatting = {};
    this.queueUpdate();
  }

  onCursorActivity() {
    if(!this.changing) {
      this.finalizeLastHistoryEntry();
    }
    // remove any formatting that may have been applied
    this.formatting = {};
  }

  onCopy(event) { }
  onPaste(event) {
    this.finalizeLastHistoryEntry();
    // remove any formatting that may have been applied
    this.formatting = {};
  }

  finalizeLastHistoryEntry() {
    let history = this.history;
    if(history.items.length) {
      history.items[history.items.length - 1].finalized = true;
    }
  }

  addToHistory(change) {
    let history = this.history;
    if(history.transitioning) return;
    // if we're not in the last position, we need to remove all the items
    // after since we're effectively branching in history
    if(history.items.length !== history.position) {
      history.items = history.items.slice(0, history.position);
    }
    let changeSet : {changes: any[]} = {changes: []};
    let last = history.items[history.items.length - 1];
    let normalized = changeSet.changes;
    if(last && !last.finalized) {
      normalized = last.changes;
    }
    if(change.origin !== "+mdundo" && change.origin !== "+mdredo") {
      normalized.push(normalizeChange(this.editor, change));
    }
    if(normalized.length && (!last || last.finalized)) {
      history.position++;
      history.items.push(changeSet);
    }
  }

  undo() {
    let self = this;
    let history = this.history;
    if(history.position === 0) return;
    this.finalizeLastHistoryEntry();
    history.position--;
    let changeSet = history.items[history.position];
    let editor = this.editor;
    history.transitioning = true;
    editor.operation(function() {
      for(let ix = changeSet.changes.length - 1; ix > -1; ix--) {
        let change = changeSet.changes[ix];
        let inverted = inverseNormalizedChange(change);
        if(inverted.type === "range") {
          editor.replaceRange(inverted.added, editor.posFromIndex(inverted.start), editor.posFromIndex(inverted.start + inverted.removed.length), "+mdundo");
        } else if(inverted.type === "span") {
          for(let removed of inverted.removed) {
            removed.clear("+mdundo");
          }
          for(let added of inverted.added) {
            self._markSpan(added, "+mdundo");
          }
        }
      }
    })
  }

  redo() {
    let self = this;
    let history = this.history;
    if(history.position > history.items.length - 1) return;
    let changeSet = history.items[history.position];
    history.position++;
    let editor = this.editor;
    history.transitioning = true;
    editor.operation(function() {
      for(let change of changeSet.changes) {
        if(change.type === "range") {
          editor.replaceRange(change.added, editor.posFromIndex(change.start), editor.posFromIndex(change.start + change.removed.length), "+mdredo");
        } else if(change.type === "span") {
          for(let removed of change.removed) {
            removed.clear("+mdredo");
          }
          for(let added of change.added) {
            self._markSpan(added, "+mdredo");
          }
        }
      }
    })
  }

  _markSpan(span, origin = "+input") {
    this.addToHistory({type: "span", added: [span], removed: [], origin});
    span.applyMark(this);
  }

  mark(from, to, source) {
    let spanClass = TypeToSpanType[source.type] || Span;
    let span = new spanClass(this, from, to, source)
    this._markSpan(span);
    this.queueUpdate();
    return span;
  }

  marksByType(type, from, to) {

  }

  visibleHeading(span: HeadingSpan) {
    span.active = true;
    let headings = getMarksByType(this.editor, "heading");
    let self = this;
    let {history, editor} = this;
    let last = {line: 0, ch: 0};
    editor.operation(function() {
      history.transitioning = true;
      let elisions = getMarksByType(editor, "elision");
      for(let elision of elisions) {
        elision.span.clear();
      }
      for(let heading of headings) {
        let loc = heading.span.find();
        if(!last && !heading.span.active) {
          last = loc.from;
        }
        if(last && heading.span.active) {
          self.mark(last, loc.from, {type: "elision"});
          last = null;
        }
      }
      if(last) {
        // self.mark(last, {line: editor.lineCount() - 1, ch: 0}, {type: "elision"});
      }
      history.transitioning = false;
    });
  }

  clearElisions() {
    let {history, editor} = this;
    let elisions = getMarksByType(this.editor, "elision");
    editor.operation(function() {
      history.transitioning = true;
      for(let elision of elisions) {
        elision.span.clear();
      }
      history.transitioning = false;
    });
  }

  dom() {
    return this.editor.getWrapperElement();
  }

  refresh() {
    this.editor.refresh();
  }

  focus() {
    this.editor.focus();
  }

  queueUpdate() {
    let self = this;
    if(!this.queued) {
      this.queued = true;
      setTimeout(function() {
        renderEve();
        self.sendParse();
        self.queued = false;
      }, 1);
    }
  }

  sendParse() {
    sendParse(toMarkdown(this.editor));
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
  editor = editor.markdownEditor || editor;
  sendSwap(editor.getMarkdown());
}

export function doSave() {
  sendSave(codeEditor.getMarkdown());
}

export function handleEditorParse(parse) {
  console.log(parse);
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
      let startMarker = editor.mark(loc.from, selection.from, source);
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
  editor.finalizeLastHistoryEntry();
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
    editor.finalizeLastHistoryEntry();
  });
}

function doLineFormat(editor, source) {
  let cm = editor.editor;
  editor.finalizeLastHistoryEntry();
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
    editor.finalizeLastHistoryEntry();
    editor.refresh();
  });
}

// @TODO: formatting shouldn't apply in codeblocks.
function formatBold(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  doFormat(editor, "strong");
  editor.focus();
}

function formatItalic(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  doFormat(editor, "emph");
  editor.focus();
}

function formatCode(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  doFormat(editor, "code");
  editor.focus();
}

function formatHeader(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  doLineFormat(editor, {type: "heading", level: "1"});
  editor.focus();
}

function formatList(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  doLineFormat(editor, {type: "item", _listData: {type: "bullet"}});
  editor.focus();
}

function formatCodeBlock(editor) {
  editor = (editor && editor.markdownEditor) || codeEditor;
  let cm = editor.editor;
  editor.finalizeLastHistoryEntry();
  cm.operation(function() {
    let cursor = cm.getCursor("from");
    let to = {line: cursor.line, ch: 0};
    let text = cm.getLine(cursor.line);
    if(text !== "") {
      to.line += 1;
    }
    editor.mark({line: cursor.line, ch: 0}, to, {type: "code_block"});
    editor.finalizeLastHistoryEntry();
  });
  editor.focus();
}

function getMarksByType(editor, type, start?, stop?, inclusive?) {
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

export function setKeyMap(event) {
  codeEditor.editor.setOption("keyMap", event.currentTarget.value);
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

export function CodeMirrorNode(info) {
  info.postRender = injectCodeMirror;
  info.c = "cm-container";
  return info;
}

export function toolbar() {
  let toolbar = {c: "md-toolbar", children: [
    {c: "bold", text: "B", click: formatBold},
    {c: "italic", text: "I", click: formatItalic},
    {c: "header", text: "H1", click: formatHeader},
    {c: "list", text: "List", click: formatList},
    {c: "inline-code", text: "Inline code", click: formatCode},
    {c: "code-block", text: "Code block", click: formatCodeBlock},
    {c: "run", text: "Run", click: compileAndRun},
  ]};
  return toolbar;
}

function gotoOutlineItem(event, elem) {
  let span = elem.span as HeadingSpan;
  let loc = span.find();
  if(loc) {
    if(event.shiftKey) {
      span.active = true;
      codeEditor.visibleHeading(span);
    } else {
      let coords = codeEditor.editor.charCoords(loc.from, "local");
      codeEditor.editor.scrollTo(null, coords.top - 50);
      codeEditor.focus();
      codeEditor.clearElisions();
      let headings = getMarksByType(codeEditor.editor, "heading");
      for(let heading of headings) {
        heading.span.active = false;
      }
    }
  }
  renderEve();
}

export function outline() {
  if(!codeEditor) return;
  let contents = [];
  let cm = codeEditor.editor;
  let headings = getMarksByType(cm, "heading");
  for(let heading of headings) {
    let loc = heading.span.find();
    let text = cm.getRange(loc.from, {line: loc.from.line + 1, ch: 0});
    contents.push({c: `heading heading-level-${heading.span.source.level}`, text, span: heading.span, click: gotoOutlineItem});
  }
  return {c: "outline", children: contents};
}

export function comments() {
  if(!codeEditor) return;
  let comments = [];
  let cm = codeEditor.editor;
  let blocks = getCodeBlocks(codeEditor);
  let scroll = cm.getScrollInfo();
  for(let block of blocks) {
    let loc = block.find();
    let coords = codeEditor.editor.charCoords(loc.from || loc, "local");
    let text = `This line says I should search for a tag with the value "session-connect",
  but since it's not in an object, I don't know what it applies to.

  If you wrap it in square brackets, that tells me you're looking
  for an object with that tag.`
    comments.push({c: "comment", top: coords.top, width: 260, height: 20, text});

  }
  let height = scroll.top + codeEditor.editor.charCoords({line: codeEditor.editor.lineCount() - 1, ch: 0}).bottom;
  return {c: "comments",  width: 290, children: comments, postRender: function(node) {
    document.querySelector(".CodeMirror-sizer").appendChild(node);
  }}
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
