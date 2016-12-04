import * as CodeMirror from "codemirror";
import {Editor, Change, ChangeCancellable} from "../ide";
import {Range, Position, isRange, comparePositions, samePosition, whollyEnclosed, debounce} from "../util";

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
  if(start === end) {
    let line = start
    let info = cm.lineInfo(line);
    if(lineBackgroundClass && (!info || !info.bgClass || info.bgClass.indexOf(lineBackgroundClass) === -1)) {
      cm.addLineClass(line, "background", lineBackgroundClass);
    }
    if(lineTextClass && (!info || !info.textClass || info.textClass.indexOf(lineTextClass) === -1)) {
      cm.addLineClass(line, "text", lineTextClass);
    }
  }
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
  if(start === end) {
    let line = start;
    if(lineBackgroundClass) cm.removeLineClass(line, "background", lineBackgroundClass);
    if(lineTextClass) cm.removeLineClass(line, "text", lineTextClass);
  }
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
  return spanTypes[type] && spanTypes[type]["_editorControlled"] || false;
}

export function compareSpans(a, b) {
  let aLoc = a.find();
  let bLoc = b.find();
  if(!aLoc && !bLoc) return 0;
  if(!aLoc) return -1;
  if(!bLoc) return 1;
  if(aLoc.from.line === bLoc.from.line) {
    if(aLoc.from.ch === bLoc.from.ch) return 0;
    return aLoc.from.ch < bLoc.from.ch ? -1 : 1;
  }
  return aLoc.from.line < bLoc.from.line ? -1 : 1;
}

export class Span {
  protected static _nextId = 0;

  protected static _editorControlled = true;
  protected _editorControlled = true;
  protected static _spanStyle:"inline"|"line"|"block";
  protected _spanStyle:"inline"|"line"|"block";

  /** Whether the span is currently elided. */
  protected hidden = false;

  id: string;
  editor: Editor;
  marker?: SpanMarker;

  type: string;

  protected _attributes:CodeMirror.TextMarkerOptions&{widget?: HTMLElement} = {};

  constructor(editor:Editor, from:Position, to:Position, public source:SpanSource, origin = "+input") {
    this.editor = editor;
    if(!source.type) throw new Error("Unable to initialize Span without a type.");
    this.type = source.type;
    this.id = `${this.type}_${Span._nextId++}`;
    this.apply(from, to, origin);
  }

  apply(from:Position, to:Position, origin = "+input") {
    if(this.marker) {
      let loc = this.find();
      if(!loc || !samePosition(from, loc.from) || !samePosition(to, loc.to)) {
        this.marker.clear();
        this.marker = this.marker.span = undefined;
      } else {
        // Nothing has changed.
        return;
      }
    }
    this._attributes.className = this._attributes.className || this.type;
    let doc = this.editor.cm.getDoc();
    if(samePosition(from, to)) {
      this.marker = doc.setBookmark(from, this._attributes);
    } else {
      this.marker = doc.markText(from, to, this._attributes);
    }
    this.marker.span = this;
    if(this.refresh) this.refresh();

    if(this.isEditorControlled()) {
      let spanRange = this.spanRange();
      if(spanRange) {
        this.editor.addToHistory(new SpanChange([spanRange], [], origin));
      }
    }
  }

  clear(origin = "+delete") {
    if(!this.marker) return;

    let loc = this.find();
    if(this.isEditorControlled()) {
      let spanRange = this.spanRange();
      if(spanRange) {
        this.editor.addToHistory(new SpanChange([], [spanRange], origin));
      }
    }

    this.marker.clear();
    this.marker = this.marker.span = undefined;
    this.editor.queueUpdate();
  }

  find():Range|undefined {
    if(!this.marker) return undefined;
    let loc = this.marker.find();
    if(!loc) return;
    if(isRange(loc)) return loc;
    return {from: loc, to: loc};
  }

  spanRange():SpanRange|undefined {
    let loc = this.find();
    if(!loc) return;
    return {from: loc.from, to: loc.to, span: this};
  }

  hide() {
    if(!this.hidden) {
      this.hidden = true;
      if(this.refresh) this.refresh();
    }
  }
  unhide() {
    if(this.hidden) {
      this.hidden = false;
      if(this.refresh) this.refresh();
    }
  }

  isHidden() {
    return this.hidden;
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
    return this._editorControlled;
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
    let loc = this.find();
    if(!loc) return;
    let intersecting = this.editor.findSpansAt(loc.from);
    for(let span of intersecting) {
      // If the space between this span and a preceding inline span is removed
      // delete this span and extend that one to contain it.
      if(span.isInline() && span.isEditorControlled()) {
        let otherLoc = span.find();
        if(!otherLoc) continue;
        // If this is another span on the same word, ignore it.
        if(samePosition(otherLoc.to, loc.to)) continue;
        this.clear();
        span.clear();
        this.editor.markSpan(otherLoc.from, loc.to, span.source);
        return;
      }
    }

    if(change.origin === "+input") {
      let action = this.editor.formatting[this.type];
      formattingChange(this, change, action);
    }
  }

  isDenormalized() {
    let loc = this.find();
    if(!loc) return;
    let doc = this.editor.cm.getDoc();
    let fromLine = doc.getLine(loc.from.line);
    let toLine = doc.getLine(loc.to.line);

    // Inline spans may not have internal leading or trailing whitespace.
    if(loc.from.ch < fromLine.length && fromLine[loc.from.ch].search(/\s/) === 0) return true;
    if(loc.to.ch - 1 < toLine.length && loc.to.ch - 1 >= 0 && toLine[loc.to.ch - 1].search(/\s/) === 0) return true;
  }

  normalize() {
    let loc = this.find();
    if(!loc) return this.clear();
    let doc = this.editor.cm.getDoc();
    let cur = doc.getRange(loc.from, loc.to);

    // Remove leading and trailing whitespace.
    // Because trimLeft/Right aren't standard, we kludge a bit.
    let adjustLeft = cur.length - (cur + "|").trim().length + 1;
    let adjustRight = cur.length - ("|" + cur).trim().length + 1;

    let from = {line: loc.from.line, ch: loc.from.ch + adjustLeft};
    let to = {line: loc.to.line, ch: loc.to.ch - adjustRight};
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
    if(!loc) return;

    let end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
    if(!this.hidden) {
      updateLineClasses(loc.from.line, end, this.editor, this);
    } else {
      clearLineClasses(loc.from.line, end, this.editor, this);
    }
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

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;

    // If we're normalizing to put some space between the line and another span, make sure the span tracks its content.
    if(change.origin === "+normalize" && samePosition(loc.from, change.from) && samePosition(loc.from, change.to)) {
      this.editor.markSpan(change.final, change.final, this.source);
      this.clear();
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
    if(!loc) return;

    if(!this.hidden) {
      updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
    } else {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
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

    // Absorb local changes around a block.
    let from = {line: loc.from.line, ch: 0};
    let to = {line: loc.to.line, ch: 0};
    if(loc.to.ch !== 0) {
      to.line += 1;
    }

    // If new text has been inserted left of the block, absorb it
    // If the block's end has been removed, re-align it to the beginning of the next line.
    if(comparePositions(change.final, change.to) >= 0) {
      from.line = Math.min(loc.from.line, change.from.line);
      to.line = Math.max(loc.to.line, change.to.line);
      if(to.line === change.to.line && change.to.ch !== 0) {
        to.line += 1;
      }
    }


    if(!samePosition(from, loc.from) || !samePosition(to, loc.to)) {
      this.clear();
      this.editor.markSpan(from, to, this.source);
    }
  }
}

//---------------------------------------------------------
// Special Spans
//---------------------------------------------------------

interface ListItemSpanSource extends SpanSource {level: number, listData: {start?: number, type:"ordered"|"bullet"}}
class ListItemSpan extends LineSpan {
  source:ListItemSpanSource
  bulletElem:HTMLElement;

  apply(from:Position, to:Position, origin = "+input") {
    let source = this.source;
    source.listData = source.listData || {type: "bullet"};
    source.level = source.level || 1;

    if(!this.bulletElem) {
      this.bulletElem = document.createElement("span");
    }
    this.bulletElem.style.paddingRight = ""+10;
    this.bulletElem.style.paddingLeft = ""+(20 * (source.level - 1));
    this._attributes.widget = this.bulletElem;

    if(source.listData.type === "bullet") {
      this.bulletElem.textContent = "-";
    } else {
      this.bulletElem.textContent = `${source.listData.start !== undefined ? source.listData.start : 1}.`;
    }

    this.lineTextClass = `ITEM ${this.source.listData.type} level-${this.source.level} start-${this.source.listData.start}`;
    super.apply(from, to, origin);
  }

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;
    // If enter is pressed, continue the list
    if(loc.from.line === change.from.line && change.isNewlineChange()) {
      let next = change.final;
      let src = this.source;
      let ix = src.listData.start !== undefined ? src.listData.start + 1 : undefined;
      let newSource = {type: src.type, level: src.level, listData: {type: src.listData.type, start: ix}};
      this.editor.markSpan(next, next, newSource);
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
    let headings = this.editor.findSpans(from, to, "heading") as HeadingSpan[];

    if(headings.length) {
      headings.sort(compareSpans);
      let nextIx = 0;
      let next = headings[nextIx++];
      while(next && next.source.level > this.source.level) {
        next = headings[nextIx++];
      }

      if(next) {
        let nextLoc = next.find();
        if(nextLoc) return {from: loc.from, to: nextLoc.from};
      }
    }

    return {from: loc.from, to: {line: to.line - 1, ch: 0}};
  }
}

class ElisionSpan extends BlockSpan {
  protected element:HTMLElement;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "elision";
    this.element = document.createElement("div");
    this.element.className = "elision-marker";
    this._attributes.replacedWith = this.element;
    if(from.ch !== 0) from = {line: from.line, ch: 0};
    if(to.ch !== 0) to = {line: to.line, ch: 0};
    super.apply(from, to, origin);

    let doc = this.editor.cm.getDoc();

    for(let span of this.editor.findSpansAt(from).concat(this.editor.findSpans(from, to))) {
      if(span === this) continue;
      span.hide();
    }
  }

  clear(origin = "+delete") {
    let loc = this.find();
    super.clear(origin);
    if(loc) {
      for(let span of this.editor.findSpansAt(loc.from).concat(this.editor.findSpans(loc.from, loc.to))) {
        if(span === this) continue;
        span.unhide();
      }
    }
  }
}

interface CodeBlockSpanSource extends SpanSource { disabled?: boolean, info?: string }
export class CodeBlockSpan extends BlockSpan {
  source: CodeBlockSpanSource;
  protected disabled:boolean;

  protected widgetLine:number;
  protected widget:CodeMirror.LineWidget;
  protected widgetElem:HTMLElement;
  protected languageLabelElem:HTMLElement;
  protected enableToggleElem:HTMLElement;

  protected footerWidgetLine:number;
  protected footerWidget:CodeMirror.LineWidget;
  protected footerWidgetElem:HTMLElement;

  syntax() : string {
    return this.source.info ? this.source.info.toLowerCase().split(" ")[0] : "eve";
  }

  syntaxHighlight() : string {
    // provide codemirror syntax highlight indications for css blocks only
    return this.syntax() === "css" ? "cm-s-default" : "";
  }

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "code " + this.syntax();
    this.lineTextClass = "code-text " + this.syntaxHighlight();
    if(this.source.disabled) this.disabled = this.source.disabled;
    else this.disabled = false;
    super.apply(from, to, origin);

    if(!this.widget) this.createWidgets();
  }

  clear(origin = "+delete") {
    this.clearWidgets();

    let loc = this.find();
    super.clear(origin);

    // Nuke all parser spans that were in this range.
    // Since the parser isn't stateful, it won't send us removals for them.
    if(loc) {
      for(let span of this.editor.findSpans(loc.from, loc.to)) {
        if(span.isEditorControlled()) continue;
        span.clear();
      }
    }
  }

  refresh() {
    super.refresh();
    this.updateWidgets();
  }

  disable() {
    if(!this.disabled) {
      this.source.info = this.syntax() + " disabled";
      // @FIXME: We don't currently style this because of a bug in updateLineClasses.
      // It's unable to intelligently remove unsupported classes, so we'd have to manually clear line classes.
      // We can come back to this later if we care.
      // this.lineBackgroundClass = "code code-disabled";
      // this.lineTextClass = "code-text code-disabled";
      this.disabled = true;
      this.refresh();

      this.editor.dirty = true;
      this.editor.queueUpdate(true);
    }
  }

  enable() {
    if(this.disabled) {
      this.source.info = this.syntax();
      this.disabled = false;
      this.refresh();

      this.editor.dirty = true;
      this.editor.queueUpdate(true);
    }
  }

  isDisabled() {
    return this.disabled;
  }

  createWidgets() {
    if(this.widget) this.widget.clear();
    if(this.footerWidget) this.footerWidget.clear();

    this.widgetElem = document.createElement("div");
    this.widgetElem.className = "code-controls-widget";

    if (this.syntax() !== "eve") {
      this.languageLabelElem = document.createElement("div");
      this.languageLabelElem.className = "code-language-label";
      this.languageLabelElem.textContent = this.syntax().toUpperCase();
      this.widgetElem.appendChild(this.languageLabelElem);
    }

    this.enableToggleElem = document.createElement("div");
    this.enableToggleElem.classList.add("enable-btn");
    this.enableToggleElem.onclick = () => {
      if(this.disabled)
        this.enable();
      else
        this.disable();
    };
    this.widgetElem.appendChild(this.enableToggleElem);

    this.footerWidgetElem = document.createElement("div");
    this.footerWidgetElem.className = "code-footer-widget";

    this.updateWidgets();
  }

  clearWidgets() {
    this.widget.clear();
    this.footerWidget.clear();
    this.widget = this.widgetElem = this.widgetLine = undefined;
    this.footerWidget = this.footerWidgetElem = this.footerWidgetLine = undefined;
  }

  updateWidgets() {
    if(!this.widgetElem) return;

    if(this.disabled) {
      this.enableToggleElem.classList.remove("ion-android-checkbox-outline");
      this.enableToggleElem.classList.add("disabled", "ion-android-checkbox-outline-blank");
    } else {
      this.enableToggleElem.classList.remove("disabled", "ion-android-checkbox-outline-blank");
      this.enableToggleElem.classList.add("ion-android-checkbox-outline");
    }

    let loc = this.find();
    if(loc) {
      if(this.widgetLine !== loc.from.line) {
        this.widgetLine = loc.from.line;
        if(this.widget) this.widget.clear();
        this.widget = this.editor.cm.addLineWidget(this.widgetLine, this.widgetElem, {above: true});
      }
      if(this.footerWidgetLine !== loc.to.line - 1) {
        this.footerWidgetLine = loc.to.line - 1;
        if(this.footerWidget) this.footerWidget.clear();
        this.footerWidget = this.editor.cm.addLineWidget(this.footerWidgetLine, this.footerWidgetElem);
      }
    }
  }
}

class WhitespaceSpan extends LineSpan {
  normalize() {
    super.normalize();
    this.clear();
  }
}

export class BlockAnnotationSpan extends BlockSpan {
  source:DocumentCommentSpanSource;
  annotation?: CodeMirror.AnnotateScrollbar.Annotation;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "annotated annotated_" + this.source.kind;
    this._attributes.className = null;
    super.apply(from, to, origin);
  }

  clear(origin:string = "+delete") {
    if(this.annotation) {
      this.annotation.clear();
      this.annotation = undefined;
    }
    if(!this.marker) return;
    let loc = this.find();
    if(loc) {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
    super.clear(origin);
  }

  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();

    if(!this.annotation) {
      this.annotation = this.editor.cm.annotateScrollbar({className: `scrollbar-annotation ${this.source.kind}`});
    }
    if(loc) {
      this.annotation.update([loc]);
      if(!this.hidden) {
        updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
      } else {
        clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
      }
    }
  }
}

export class AnnotationSpan extends Span {
  lineTextClass?:string
  lineBackgroundClass?:string

  source:DocumentCommentSpanSource;
  annotation?: CodeMirror.AnnotateScrollbar.Annotation;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "annotated annotated_" + this.source.kind;
    this._attributes.className = null;
    super.apply(from, to, origin);
  }

  clear(origin:string = "+delete") {
    if(this.annotation) {
      this.annotation.clear();
      this.annotation = undefined;
    }
    if(!this.marker) return;
    let loc = this.find();
    if(loc) {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
    super.clear(origin);
  }

  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();

    if(!this.annotation) {
      this.annotation = this.editor.cm.annotateScrollbar({className: `scrollbar-annotation ${this.source.kind}`});
    }
    if(loc) {
      this.annotation.update([loc]);
      if(!this.hidden) {
        updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
      } else {
        clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
      }
    }
  }
}

export class ParserSpan extends Span {
  protected static _editorControlled = false;
  protected _editorControlled = false;
  static _spanStyle:"inline" = "inline";
  _spanStyle:"inline" = "inline";
}

interface DocumentCommentSpanSource extends SpanSource { kind: string, message: string, delay?: number }
export class DocumentCommentSpan extends ParserSpan {
  source:DocumentCommentSpanSource;

  lineBackgroundClass: string;
  annotation?: CodeMirror.AnnotateScrollbar.Annotation;

  widgetLine?: number;
  commentWidget?: CodeMirror.LineWidget;
  commentElem?: HTMLElement;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "COMMENT_" + this.kind;
    this._attributes.className = this.type + " " + this.kind;

    if(!this.commentElem) {
      this.commentElem = document.createElement("div");
    }

    this.commentElem.className = "comment-widget" + " " + this.kind;

    if(this.editor.inCodeBlock(to)) {
      this.commentElem.className += " code-comment-widget";
    }

    if(this.source.delay) {
      this["updateWidget"] = debounce(this.updateWidget, this.source.delay);
    }
    super.apply(from, to, origin);
  }

  clear(origin:string = "+delete") {
    if(!this.marker) return;

    // If the line is still in the document, clear its classes.
    let loc = this.find();
    if(loc) {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
    super.clear(origin);
    if(this.annotation) {
      this.annotation.clear();
      this.annotation = undefined;
    }

    if(this.commentWidget) {
      this.commentWidget.clear();
      this.commentElem.textContent = "";
    }
  }

  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();

    if(!this.annotation) {
      this.annotation = this.editor.cm.annotateScrollbar({className: `scrollbar-annotation ${this.kind}`});
    }
    if(loc) {
      this.annotation.update([loc]);
      if(!this.hidden) {
        updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
      } else {
        clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
      }

      if(loc.to.line !== this.widgetLine) {
        this.widgetLine = loc.to.line;
        if(this.commentWidget) this.commentWidget.clear();
        this.updateWidget();
      }
    }
  }

  updateWidget() {
    if(this.commentWidget) this.commentWidget.clear();
    let loc = this.find();
    if(!loc) return;
    this.widgetLine = loc.to.line;
    this.commentElem.textContent = this.message;
    this.commentWidget = this.editor.cm.addLineWidget(this.widgetLine, this.commentElem);
  }

  get kind() { return this.source.kind || "error"; }
  get message() { return this.source.message; }
}

export class DocumentWidgetSpan extends ParserSpan {
  source:DocumentCommentSpanSource;

  lineBackgroundClass: string;

  widgetLine?: number;
  commentWidget?: CodeMirror.LineWidget;
  commentElem?: HTMLElement;

  apply(from:Position, to:Position, origin = "+input") {
    this.lineBackgroundClass = "COMMENT_" + this.kind;
    this._attributes.className = this.type + " " + this.kind;

    if(!this.commentElem) {
      this.commentElem = document.createElement("div");
    }

    this.commentElem.className = "comment-widget" + " " + this.kind;

    if(this.editor.inCodeBlock(to)) {
      this.commentElem.className += " code-comment-widget";
    }

    if(this.source.delay) {
      this["updateWidget"] = debounce(this.updateWidget, this.source.delay);
    }
    super.apply(from, to, origin);
  }

  clear(origin:string = "+delete") {
    if(!this.marker) return;

    // If the line is still in the document, clear its classes.
    let loc = this.find();
    if(loc) {
      clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
    }
    super.clear(origin);

    if(this.commentWidget) {
      this.commentWidget.clear();
      this.commentElem.textContent = "";
    }
  }

  refresh() {
    let loc = this.find();
    if(!loc) return this.clear();

    if(loc) {
      if(!this.hidden) {
        updateLineClasses(loc.from.line, loc.to.line, this.editor, this);
      } else {
        clearLineClasses(loc.from.line, loc.to.line, this.editor, this);
      }

      if(loc.to.line !== this.widgetLine) {
        this.widgetLine = loc.to.line;
        if(this.commentWidget) this.commentWidget.clear();
        this.updateWidget();
      }
    }
  }

  updateWidget() {
    if(this.commentWidget) this.commentWidget.clear();
    let loc = this.find();
    if(!loc) return;
    this.widgetLine = loc.to.line;
    this.commentElem.textContent = this.message;
    this.commentWidget = this.editor.cm.addLineWidget(this.widgetLine, this.commentElem);
  }

  get kind() { return this.source.kind || "error"; }
  get message() { return this.source.message; }
}


interface BadgeSpanSource extends SpanSource { kind: string, message: "string" }
class BadgeSpan extends ParserSpan {
  source:BadgeSpanSource;

  badgeMarker:SpanMarker|undefined;
  badgeElem:HTMLElement;

  apply(from:Position, to:Position, origin = "+input") {
    this._attributes.className = `badge ${this.source.kind || ""}`;
    if(!this.badgeElem) {
      this.badgeElem = document.createElement("div");
      this.badgeElem.className = `badge-widget ${this.source.kind || ""}`;
    }

    this.badgeElem.textContent = this.source.message;

    super.apply(from, to, origin);

    let doc = this.editor.cm.getDoc();
    this.badgeMarker = doc.setBookmark(to, {widget: this.badgeElem});
    this.badgeMarker.span = this;
  }

  clear(origin = "+delete") {
    super.clear(origin);

    if(this.badgeMarker) this.badgeMarker.clear();

    if(this.badgeElem && this.badgeElem.parentNode) {
      this.badgeElem.parentNode.removeChild(this.badgeElem);
    }
    this.badgeElem = undefined;
  }
}

interface LinkSpanSource extends SpanSource { destination?: string; }
class LinkSpan extends InlineSpan {
  source:LinkSpanSource;

  linkWidget:HTMLAnchorElement;
  bookmark:CodeMirror.TextMarker;

  apply(from:Position, to:Position, origin = "+input") {
    if(this.bookmark) this.bookmark.clear();

    this.linkWidget = document.createElement("a");
    this.linkWidget.className = "ion-android-open link-widget";
    this.linkWidget.target = "_blank";
    this.linkWidget.href = this.source.destination;
    this.updateBookmark();

    super.apply(from, to, origin);
  }

  refresh() {
    this.updateBookmark();
  }

  updateBookmark() {
    let loc = this.find();
    if(!loc) return;
    let to = {line: loc.to.line, ch: loc.to.ch + 1};

    if(!this.bookmark) {
      this.bookmark = this.editor.cm.getDoc().setBookmark(to, {widget: this.linkWidget});
    } else {
      let bookmarkPos = this.bookmark.find() as Position;
      if(!loc || !bookmarkPos) return;
      if(!samePosition(bookmarkPos, to)) {
        this.bookmark.clear();
        this.bookmark = this.editor.cm.getDoc().setBookmark(to, {widget: this.linkWidget});
      }
    }
  }

  clear(origin = "+delete") {
    super.clear(origin);
    if(this.bookmark) this.bookmark.clear();
  }
}

//---------------------------------------------------------
// Span Types
//---------------------------------------------------------
export type InlineSpanType = "strong"|"emph"|"code";
export type LineSpanType = "heading"|"item"|"elision";
export type BlockSpanType = "code_block";
export type SpanType = InlineSpanType|LineSpanType|BlockSpanType|"default";

export var spanTypes = {
  whitespace: WhitespaceSpan,
  strong: InlineSpan,
  emph: InlineSpan,
  code: InlineSpan,
  link: LinkSpan,

  heading: HeadingSpan,
  item: ListItemSpan,
  elision: ElisionSpan,
  elision_transient: ElisionSpan,
  highlight: InlineSpan,
  shadow: InlineSpan,
  code_block: CodeBlockSpan,

  document_comment: DocumentCommentSpan,
  document_widget: DocumentWidgetSpan,
  annotation: AnnotationSpan,
  block_annotation: BlockAnnotationSpan,
  badge: BadgeSpan,
  "default": ParserSpan
}


export interface SpanRange {
  from: Position,
  to: Position,
  span: Span
}

export class SpanChange {
  type: string = "span";
  constructor(public added:SpanRange[] = [], public removed:SpanRange[] = [], public origin:string = "+input") {}
  /** Inverts a change for undo. */
  invert() { return new SpanChange(this.removed, this.added, this.origin); }
}
export function isSpanChange(x:Change|SpanChange): x is SpanChange {
  return x && x.type === "span";
}
