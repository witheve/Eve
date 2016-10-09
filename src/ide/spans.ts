import * as CodeMirror from "codemirror";
import {Editor, Change, ChangeCancellable} from "../ide";
import {Range, Position, isRange, comparePositions, samePosition, whollyEnclosed} from "../util";

type FormatAction = "add"|"remove"|"split"

function formattingChange(span:Span, change:Change, action?:FormatAction) {
  let editor = span.editor;
  let loc = span.find();
  if(!loc) return;
  // Cut the changed range out of a span
  if(action == "split") {
    let final = change.final;
    editor.markSpan(loc.from, change.from, span.source);
    // If the change is within the right edge of the span, recreate the remaining segment
    if(comparePositions(final, loc.to) === -1) {
      editor.markSpan(final, loc.to, span.source);
    }
    span.clear();

  } else if(!action) {
    // If we're at the end of the span, expand it to include the change
    if(samePosition(loc.to, change.from)) {
      span.clear();
      editor.markSpan(loc.from, change.final, span.source);
    }
  }
}

interface LineStyle { lineBackgroundClass?: string, lineTextClass?: string }

function updateLineClasses(start:number, end:number, editor:Editor, {lineBackgroundClass, lineTextClass}:LineStyle) {
  let cm = editor.cm;
  for(let line = start; line < end; line++) {
    let info = cm.lineInfo(line);
    if(lineBackgroundClass && (!info || !info.bgClass || info.bgClass.indexOf(lineBackgroundClass) === -1)) {
      cm.addLineClass(line, "background", lineBackgroundClass);
    }
    if(lineTextClass && (!info || !info.textClass || info.textClass.indexOf(lineTextClass) === -1)) {
      cm.addLineClass(line, "text", lineTextClass);
    }
  }
}

function clearLineClasses(start:number, end:number, editor:Editor, {lineBackgroundClass, lineTextClass}:LineStyle) {
  let cm = editor.cm;
  for(let line = start; line < end; line++) {
    if(lineBackgroundClass) cm.removeLineClass(line, "background", lineBackgroundClass);
    if(lineTextClass) cm.removeLineClass(line, "text", lineTextClass);
  }
}
//---------------------------------------------------------
// Generic Spans
//---------------------------------------------------------

/** A SpanSource is the underlying representation of the span shared by the parser service and editor. */
interface SpanSource {
  /** One of the managed editor types (e.g. "strong") or an arbitrary other type managed by the parser service. */
  type: string,
  /** The source id is the mapped token id used by the parser. */
  id: string
}

/** A SpanMarker is a monkey-patched TextMarker that references its parent. */
export interface SpanMarker extends CodeMirror.TextMarker {
  span?: Span
}

export function isSpanMarker(x:CodeMirror.TextMarker): x is SpanMarker {
  return x && x["span"];
}

export function isEditorControlled(type:string) {
  return !!spanTypes[type];
}

export function compareSpans(a, b) {
  let aLoc = a.find();
  let bLoc = b.find();
  if(!aLoc && !bLoc) return 0;
  if(!aLoc) return -1;
  if(!bLoc) return 1;
  if(aLoc.from.line === bLoc.from.line) return 0;
  return aLoc.from.line < bLoc.from.line ? -1 : 1;
}

export class Span {
  protected static _nextId = 0;

  protected static _spanStyle:"inline"|"line"|"block";
  protected _spanStyle:"inline"|"line"|"block";


  id: string;
  editor: Editor;
  marker?: SpanMarker;

  type: string;

  protected _attributes:CodeMirror.TextMarkerOptions = {};

  constructor(editor:Editor, from:Position, to:Position, public source:SpanSource, origin = "+input") {
    this.editor = editor;
    if(!source.type) throw new Error("Unable to initialize Span without a type.");
    this.type = source.type;
    this.id = `${this.type}_${Span._nextId++}`;
    this.apply(from, to, origin);
  }

  apply(from:Position, to:Position, origin = "+input") {
    this._attributes.className = this._attributes.className || this.type;
    let doc = this.editor.cm.getDoc();
    if(samePosition(from, to)) {
      this.marker = doc.setBookmark(from, to);
    } else {
      this.marker = doc.markText(from, to, this._attributes);
    }
    this.marker.span = this;
    if(this.refresh) this.refresh();

    //this.editor.queueUpdate(); // @NOTE: This wasn't present before.

    // @FIXME: History integration.
  }

  clear(origin = "+delete") {
    if(!this.marker) return;

    this.marker.clear();
    this.marker = this.marker.span = undefined;
    this.editor.queueUpdate();

    // @FIXME: History integration.
  }

  find():Range|undefined {
    if(!this.marker) return undefined;
    let loc = this.marker.find();
    if(!loc) return;
    if(isRange(loc)) return loc;
    return {from: loc, to: loc};
  }

  sourceEquals(other:SpanSource) {
    return this.source.type = other.type;
  }

  isInline(): this is InlineSpan {
    return this._spanStyle == "inline";
  }
  isLine(): this is LineSpan {
    return this._spanStyle == "line";
  }
  isBlock(): this is BlockSpan {
    return this._spanStyle == "block";
  }
  isEditorControlled() {
    return !!spanTypes[this.type];
  }

  static style() {
    return this._spanStyle;
  }
}

// Optional life cycle methods for Span-derivatives..
export interface Span {
  refresh?(): void,
  onBeforeChange?(change:ChangeCancellable): void
  onChange?(change:Change): void

  normalize?(): void
  isDenormalized?(): boolean
}

export class InlineSpan extends Span {
  static _spanStyle:"inline" = "inline";
  _spanStyle:"inline" = "inline";

  apply(from:Position, to:Position, origin = "+input") {
    if(samePosition(from, to)) throw new Error("Unable to create zero-width InlineSpan. Maybe you meant to use LineSpan?");
    super.apply(from, to, origin);
  }

  // Handlers
  onChange(change:Change) {
    if(change.origin === "+input") {
      let action = this.editor.formatting[this.type];
      formattingChange(this, change, action);
    }
  }

  isDenormalized() {
    // Inline spans may not have leading or trailing whitespace.
    let loc = this.find();
    if(!loc) return;
    let doc = this.editor.cm.getDoc();
    if(doc.getLine(loc.from.line)[loc.from.ch].search(/\s/) === 0) return true;
    if(doc.getLine(loc.to.line)[loc.to.ch - 1].search(/\s/) === 0) return true;
  }

  normalize() {
    let loc = this.find();
    if(!loc) return this.clear();
    let doc = this.editor.cm.getDoc();
    let cur = doc.getRange(loc.from, loc.to);

    // Because trimLeft/Right aren't standard, we kludge a bit.
    let reduceLeft = cur.length - (cur + "|").trim().length + 1;
    let reduceRight = cur.length - ("|" + cur).trim().length + 1;

    let from = {line: loc.from.line, ch: loc.from.ch + reduceLeft};
    let to = {line: loc.to.line, ch: loc.to.ch - reduceRight};
    this.clear("+normalize");
    this.editor.markSpan(from, to, this.source);
  }
}

export class LineSpan extends Span {
  static _spanStyle:"line" = "line";
  _spanStyle:"line" = "line";

  lineTextClass?: string;
  lineBackgroundClass?: string;

  apply(from:Position, to:Position, origin = "+input") {
    if(!samePosition(from, to)) throw new Error("Unable to create non-zero-width LineSpan. Maybe you meant to use BlockSpan?");
    if(from.ch !== 0) throw new Error(`Unable to create LineSpan in middle of line at (${from.line}, ${from.ch})`);
    super.apply(from, to, origin);
  }

  clear(origin = "+delete") {
    if(!this.marker) return;

    // If the line is still in the document, clear its classes.
    let loc = this.find();
    if(loc) {
      let end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
      clearLineClasses(loc.from.line, end, this.editor, this);
    }
    super.clear(origin);
  }

  // Handlers
  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();

    let end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
    updateLineClasses(loc.from.line, end, this.editor, this);
  }

  onBeforeChange(change:ChangeCancellable) {
    let loc = this.find();
    if(!loc) return;
    let doc = this.editor.cm.getDoc();
    let isEmpty = doc.getLine(loc.from.line) === "";
    //If we're at the beginning of an empty line and delete we mean to remove the span.
    if(samePosition(loc.from, change.to) && isEmpty && change.origin === "+delete") {
      this.clear();
      change.cancel();

      // If we're at the beginning of line and delete into a non-empty line we remove the span too.
    } else if(samePosition(loc.from, change.to) &&
              doc.getLine(change.from.line) !== "" &&
              change.origin === "+delete") {
      this.clear();
      change.cancel();

      // Similarly, if we're at the beginning of an empty line and hit enter
      // we mean to remove the formatting.
    } else if(samePosition(loc.from, change.from) && change.isNewlineChange() && isEmpty) {
      this.clear();
      change.cancel();
    }
  }

  isDenormalized() {
    // Line spans may not have leading or trailing whitespace.
    let loc = this.find();
    if(!loc) return;
    let doc = this.editor.cm.getDoc();
    let line = doc.getLine(loc.from.line);
    if(!line) return;
    if(line[0].search(/\s/) === 0 || line[line.length - 1].search(/\s/) === 0) return true;
  }

  normalize() {
    let loc = this.find();
    if(!loc) return this.clear();
    let doc = this.editor.cm.getDoc();

    let to = doc.posFromIndex(doc.indexFromPos({line: loc.to.line + 1, ch: 0}) - 1);
    let cur = doc.getRange(loc.from, to);
    doc.replaceRange(cur.trim(), loc.from, to, "+normalize");
  }
}

export class BlockSpan extends Span {
  static _spanStyle:"block" = "block";
  _spanStyle:"block" = "block";

  lineTextClass?: string;
  lineBackgroundClass?: string;

  apply(from:Position, to:Position, origin = "+input") {
    if(samePosition(from, to)) throw new Error("Unable to create zero-width BlockSpan. Maybe you meant to use LineSpan?");
    if(from.ch !== 0) throw new Error(`Unable to create BlockSpan starting in middle of line at (${from.line}, ${from.ch})`);
    if(to.ch !== 0) throw new Error(`Unable to create BlockSpan ending in middle of line at (${to.line}, ${to.ch})`);
    super.apply(from, to, origin);
  }

 clear(origin = "+delete") {
    if(!this.marker) return;

    // If the line is still in the document, clear its classes.
    let loc = this.find();
    if(loc) {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
    super.clear(origin);
  }

  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();
    updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
  }

  onBeforeChange(change:ChangeCancellable) {
    let loc = this.find();
    if(!loc) return;
    let doc = this.editor.cm.getDoc();
    let isEmpty = doc.getLine(loc.from.line) === "";

    //If we're at the beginning of an empty block and delete we mean to remove the span.
    if(samePosition(loc.from, change.to) && isEmpty && change.origin === "+delete") {
      this.clear();
      change.cancel();
    }
  }

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;
    // If new text has been inserted left of the block, absorb it
    // If the block's end has been removed, re-align it to the beginning of the next line.
    if(loc.from.ch !== 0 || loc.to.ch !== 0) {
      this.clear();
      let from = {line: loc.from.line, ch: 0};
      let to = {line: loc.to.line, ch: 0};
      if(loc.to.ch !== 0) to.line += 1;
      this.editor.markSpan(from, to, this.source);
    }
  }
}

//---------------------------------------------------------
// Special Spans
//---------------------------------------------------------

interface ListItemSpanSource extends SpanSource {level: number, listData: {start: number, type:"ordered"|"unordered"}}
class ListItemSpan extends LineSpan {
  source:ListItemSpanSource;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineTextClass = "ITEM";
    super.apply(from, to, origin);
  }

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;
    // If enter is pressed, continue the list
    if(loc.from.line === change.from.line && change.isNewlineChange()) {
      let next = change.final;
      this.editor.markSpan(next, next, this.source);
    }
  }
}

interface HeadingSpanSource extends SpanSource { level: number }
export class HeadingSpan extends LineSpan {
  source:HeadingSpanSource;

  apply(from:Position, to:Position, origin = "+input") {
    this.source.level = this.source.level || 1;
    let cls =  "HEADING" + this.source.level;
    this.lineTextClass = cls;
    this.lineBackgroundClass = cls;

    super.apply(from, to, origin);
    this.editor.ide.navigator.updateNode(this);
  }

  clear(origin = "+delete") {
    super.clear(origin);
    this.editor.ide.navigator.updateNode(this);
  }

  refresh() {
    super.refresh();
    this.editor.ide.navigator.updateNode(this);
  }

  getSectionRange():Range|undefined {
    let loc = this.find();
    if(!loc) return;
    let from = {line: loc.from.line + 1, ch: 0};
    let to = {line: this.editor.cm.getDoc().lastLine() + 1, ch: 0};
    let headings = this.editor.findSpans(from, to, "heading");
    if(!headings.length) return {from: loc.from, to: {line: to.line - 1, ch: 0}};

    headings.sort(compareSpans);
    let next = headings[0];
    let nextLoc = next.find();
    if(!nextLoc) return {from: loc.from, to: {line: to.line - 1, ch: 0}};
    return {from: loc.from, to: nextLoc.from};
  }
}

class ElisionSpan extends LineSpan {
  protected element = document.createElement("div");

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "elision";
    this.element.className = "elision-marker";
    this._attributes.replacedWith = this.element;
    super.apply(from, to, origin);
  }
}

class CodeBlockSpan extends BlockSpan {
  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "CODE";
    this.lineTextClass = "CODE-TEXT";
    super.apply(from, to, origin);
  }
}

class ParserSpan extends InlineSpan {
  _editorControlled = false;
}

//---------------------------------------------------------
// Span Types
//---------------------------------------------------------
export type InlineSpanType = "strong"|"emph"|"code";
export type LineSpanType = "heading"|"item"|"elision";
export type BlockSpanType = "code_block";
export type SpanType = InlineSpanType|LineSpanType|BlockSpanType|"default";

export var spanTypes = {
  strong: InlineSpan,
  emph: InlineSpan,
  code: InlineSpan,

  heading: HeadingSpan,
  item: ListItemSpan,
  elision: ElisionSpan,

  code_block: CodeBlockSpan,

  "default": ParserSpan
}
