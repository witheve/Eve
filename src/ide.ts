import {Renderer, Element as Elem, RenderHandler} from "microReact";
import {Parser as MDParser} from "commonmark";
import * as CodeMirror from "codemirror";
import {debounce, uuid, unpad} from "./util";

type Range = CodeMirror.Range;
type Position = CodeMirror.Position;

function isRange(loc:any): loc is Range {
  return loc.from !== undefined || loc.to !== undefined;
}

function comparePositions(a:Position, b:Position) {
  if(a.line === b.line && a.ch === b.ch) return 0;
  if(a.line > b.line) return 1;
  if(a.line === b.line && a.ch > b.ch) return 1;
  return -1;
}

function samePosition(a:Position, b:Position) {
  return comparePositions(a, b) === 0;
}

function whollyEnclosed(inner:Range, outer:Range) {
  let left = comparePositions(inner.from, outer.from);
  let right = comparePositions(inner.to, outer.to);
  return (left === 1 || left === 0) && (right === -1 || right === 0);
}

export var renderer = new Renderer();
document.body.appendChild(renderer.content);

//---------------------------------------------------------
// Navigator
//---------------------------------------------------------
/* - [x] Document Pseudo-FS
 * - [x] Table of Contents
 * - [x] Separate detail levels to control indentation / info overload
 * - [x] 2nd priority on width
 * - [x] Collapsible
 * - [x] Elision (in ToC)
 * - [ ] Elision (in editor)
 */

interface TreeNode {
  name: string,
  type: string,
  children?: string[],
  open?: boolean,
  span?: Span,

  hidden?: boolean,
  level?: number
}
interface TreeMap {[id:string]: TreeNode|undefined}

class Navigator {
  labels = {
    folder: "Workspace",
    document: "Table of Contents"
  };
  open: boolean = true;

  constructor(public ide:IDE, public rootId, public nodes:TreeMap, public currentId:string = rootId) {}

  currentType():string {
    let node = this.nodes[this.currentId];
    return node && node.type || "folder";
  }

  walk(rootId:string, callback:(nodeId:string, parentId?:string) => void, parentId?:string) {
    let node = this.nodes[rootId];
    if(!node) return;
    callback(rootId, parentId);

    if(node.children) {
      for(let childId of node.children) {
        this.walk(childId, callback, rootId);
      }
    }
  }

  loadDocument(editor:Editor) {
    let doc = editor.cm.getDoc();
    let headings = editor.getAllSpans("heading");
    headings.sort((a, b) => {
      let aLoc = a.find();
      let bLoc = b.find();
      if(!aLoc && !bLoc) return 0;
      if(!aLoc) return -1;
      if(!bLoc) return 1;
      if(aLoc.from.line === bLoc.from.line) return 0;
      return aLoc.from.line < bLoc.from.line ? -1 : 1;
    });

    this.nodes = {};
    let rootId = "root";
    let root = this.nodes[rootId] = {name, type: "document", open: true};
    let stack:TreeNode[] = [root];
    for(let heading of headings) {
      let loc = heading.find();
      if(!loc) continue;

      while((stack.length > 1) && heading.source.level <= stack[stack.length - 1].level) stack.pop();
      let parent = stack[stack.length - 1];
      if(!parent.children) parent.children = [heading.source.id];
      else parent.children.push(heading.source.id);

      let node:TreeNode = {name: doc.getLine(loc.from.line), type: "section", level: heading.source.level, open: true, span: heading};
      stack.push(node);
      this.nodes[heading.source.id] = node;
    }

    this.nodes[rootId] = root;
    this.rootId = rootId;
  }

  // Event Handlers
  togglePane = (event:MouseEvent, elem) => {
    this.open = !this.open;
    render();
    event.stopPropagation();
    // @FIXME: This is kinda hacky, but we'd have to have a full on animation system for better.
    setTimeout(this.ide.resize, 100);
    setTimeout(this.ide.resize, 200);
    setTimeout(this.ide.resize, 300);
  }

  navigate = (event, elem:{nodeId:string}) => {
    this.currentId = elem.nodeId || this.rootId;
    render();
  }

  toggleBranch = (event:MouseEvent, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    node.open = !node.open;
    render();
    event.stopPropagation();
  }

  _inheritParentElision = (nodeId: string, parentId?: string) => {
    if(parentId) this.nodes[nodeId]!.hidden = this.nodes[parentId]!.hidden;
  }

  toggleElision = (event, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    node.hidden = !node.hidden;
    this.walk(nodeId, this._inheritParentElision);
    render();
    event.stopPropagation();
  }

  // Elements
  workspaceItem(nodeId:string):Elem {
    let node = this.nodes[nodeId];
    if(!node) return {c: "tree-item", nodeId};

    let subtree:Elem|undefined;
    if(node.type === "folder") {
      let items:(Elem|undefined)[] = [];
      if(node.open) {
        for(let childId of node.children || []) {
          items.push(this.workspaceItem(childId));
        }
      }
      subtree = {c: "tree-items", children: items};
    }

    return {c: `tree-item ${subtree ? "branch" : "leaf"} ${node.type} ${subtree && !node.open ? "collapsed" : ""}`, nodeId, children: [
      {c: "flex-row", children: [
        {c: `label ${subtree ? "ion-ios-arrow-down" : "no-icon"}`, text: node.name, nodeId, click: subtree ? this.toggleBranch : this.navigate}, // icon should be :before
        {c: "controls", children: [
          subtree ? {c: "new-btn ion-ios-plus-empty", click: () => console.log("new folder or document")} : undefined,
          {c: "delete-btn ion-ios-close-empty", click: () => console.log("delete folder or document w/ confirmation")}
        ]}
      ]},
      subtree
    ]};
  }

  tocItem(nodeId:string):Elem {
    let node = this.nodes[nodeId];
    if(!node) return {c: "tree-item", nodeId};

    let subtree:Elem|undefined;
    if(node.children) {
      let items:(Elem|undefined)[] = [];
      if(node.open) {
        for(let childId of node.children) {
          items.push(this.tocItem(childId));
        }
      }
      subtree = {c: "tree-items", children: items};
    }

    return {c: `tree-item ${subtree ? "branch" : "leaf"} ${nodeId === this.rootId ? "root" : ""} ${node.type} ${subtree && !node.open ? "collapsed" : ""} ${node.hidden ? "hidden" : ""}`, nodeId, children: [
      {c: "flex-row", children: [
        {c: `label ${subtree ? "ion-ios-arrow-down" : "no-icon"}`, text: node.name, nodeId, click: subtree ? this.toggleBranch : undefined}, // icon should be :before
        {c: "controls", children: [
          {c: `elide-btn ${node.hidden ? "ion-eye-disabled" : "ion-eye"}`, nodeId, click: this.toggleElision},
        ]}
      ]},
      subtree
    ]};
  }

  header():Elem {
    let type = this.currentType();
    return {c: "navigator-header", children: [
      {c: "label", text: this.labels[type], click: this.togglePane},
      {c: "flex-spacer"},
      {c: "controls", children: [
        this.open ? {c: `up-btn ion-ios-arrow-up ${(type === "folder") ? "disabled" : ""}`, click: this.navigate} : undefined,
        {c: `${this.open ? "expand-btn" : "collapse-btn"} ion-ios-arrow-left`, click: this.togglePane},
      ]}
    ]};
  }

  render():Elem {
    let nodeId = this.currentId;
    let root = this.nodes[nodeId];
    if(!root) return {c: "navigator-pane", children: [
      {c: "navigator-pane-inner", children: [
        this.header(),
        {c: "new-btn ion-ios-plus-empty", click: () => console.log("new folder or document")}
      ]}
    ]};

    let tree:Elem|undefined;
    if(root.type === "folder") {
      tree = this.workspaceItem(nodeId);
    } else if(root.type === "document") {
      tree = this.tocItem(nodeId);
    }
    return {c: `navigator-pane ${this.open ? "" : "collapsed"}`, click: this.open ? undefined : this.togglePane, children: [
      {c: "navigator-pane-inner", children: [
        this.header(),
        tree
      ]}
    ]};
  }
}


//---------------------------------------------------------
// Spans
//---------------------------------------------------------
interface SpanMarker extends CodeMirror.TextMarker {
  span?: Span,
  active?: boolean,
  source?: any
}

function isSpanMarker(x:CodeMirror.TextMarker): x is SpanMarker {
  return x && x["span"];
}

class Span {
  protected static _nextId = 0;
  isLine = false;

  id: number = Span._nextId++;
  editor: Editor;
  marker?: SpanMarker;

  protected _attributes:CodeMirror.TextMarkerOptions = {};
  type:SpanType = "default";

  constructor(protected _from:Position, protected _to:Position, public source:any) {
    this._attributes.className = source.type;
  }

  find():Range|undefined {
    if(!this.marker) return {from: this._from, to: this._to};

    let loc = this.marker.find();
    if(!loc) return;
    if(isRange(loc)) return loc;
    return {from: loc, to: loc};
  }

  attached() {
    return this.marker && this.find();
  }

  clone<T extends Span>(this:T):T {
    let loc = this.find();
    if(!loc) throw new Error("Could not find marker");
    return new (this.constructor as any)(loc.from, loc.to, this.source);
  }

  applyMark(editor:Editor) {
    this.editor = editor;
    let cm = editor.cm;
    let doc = cm.getDoc();
    let {_from, _to} = this;
    if(!samePosition(_from, _to)) {
      this.marker = doc.markText(_from, _to, this._attributes);
    } else {
      this.marker = doc.setBookmark(_from, {});
    }
    this.marker.span = this;
  }

  clear(origin = "+delete") {
    if(!this.marker) return;
    let cm = this.editor.cm;

    this.editor.clearSpan(this, origin);
    this.marker.clear();
    this.marker.span = undefined;
    this.marker = undefined;
  }

  // Handlers
  refresh(change:Change) {}
  onBeforeChange(change:ChangeCancellable) {}

  // Every span that doesn't have its own onChange logic wants to do this...
  onChange(change:Change) {
    if(change.origin === "+input") {
      let action = this.editor.formatting[this.type];
      formattingChange(this, change, action);
    }
  }
}

class LineSpan extends Span {
  isLine = true;
  lineTextClass?: string;
  lineBackgroundClass?: string;

  applyMark(editor:Editor) {
    super.applyMark(editor);

    let cm = this.editor.cm;
    let end = this._to.line + ((this._from.line === this._to.line) ? 1 : 0);
    for(let line = this._from.line; line < end; line++) {
      if(this.lineBackgroundClass) cm.addLineClass(line, "background", this.lineBackgroundClass);
      if(this.lineTextClass) cm.addLineClass(line, "text", this.lineTextClass);
    }
  }

  clear(origin?:string) {
    super.clear(origin);

    let cm = this.editor.cm;
    let loc = this.find()
    if(!loc) return;
    let end = loc.to.line + ((loc.from.line === loc.to.line) ? 1 : 0);
    for(let line = loc.from.line; line < end; line++) {
      if(this.lineBackgroundClass) cm.removeLineClass(line, "background", this.lineBackgroundClass);
      if(this.lineTextClass) cm.removeLineClass(line, "text", this.lineTextClass);
    }
  }

  onBeforeChange(change:ChangeCancellable) {
    let doc = this.editor.cm.getDoc();
    let loc = this.find();
    if(!loc || loc.from.line !== change.from.line) return;

    // If we're deleting at the start of a line-formatted line, we need to remove the line formatting too.
    if(change.origin === "+delete" && change.from.ch === 0) {
      this.clear();
    }
    // If we're adding a newline with nothing on the current line, we're really removing the formatting of the current line.
    let isEmpty = doc.getLine(change.from.line).trim() === "";
    if(change.origin === "+input" && change.isNewlineChange() && isEmpty) {
      this.clear();
      change.cancel();
    }
  }

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;
    // If the change starts exclusively outside of the list, ignore it.
    if(loc.from.line > change.from.line || loc.to.line < change.from.line) return;

    // If we're adding a newline at the end of a list item, we're adding a new list item on the next line.
    if(change.isNewlineChange()) {
      let nextLine = {line: change.from.line + 1, ch: 0};
      this.editor.markSpan(nextLine, nextLine, this.source);
    }
  }
}
function isLineSpan(span:Span): span is LineSpan {
  return span.isLine;
}

class HeadingSpan extends LineSpan {
  type:SpanType = "heading";
  constructor(_from:Position, _to:Position, source:any) {
    super(_from, _to, source);
    if(!this.source.level) {
      this.source.level = 1;
    }
    let cls =  "HEADING" + this.source.level;
    this.lineTextClass = cls;
    this.lineBackgroundClass = cls;
    this._attributes.className = cls;
  }

  onBeforeChange() {}
  onChange(change:Change) {
    if(change.origin === "+delete") {
      let loc = this.find();
      if(!loc || samePosition(loc.from, change.to)) {
        this.clear();
      }
    }
  }
}

class ListItemSpan extends LineSpan {
  type:SpanType = "item";
  lineTextClass = "ITEM";
}

// Code Blocks are an odd bird. They need the utilities of a Line Span but the logic of a regular span.
class CodeBlockSpan extends LineSpan {
  type:SpanType = "code_block";
  isLine = false;
  lineBackgroundClass = "CODE";

  onBeforeChange(change:ChangeCancellable) {
    if(change.origin === "+delete") {
      let loc = this.find();
      if(!loc) return;
      if(samePosition(loc.from, change.to)) {
        this.clear();
        change.cancel();
      }
    }
  }
  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;

    // We've added a new line and need to expand the block.
    // @FIXME: I have no idea why this is the logic to do that.
    if(change.from.line < loc.from.line || (change.from.line === loc.from.line && loc.from.ch !== 0) || samePosition(loc.from, loc.to)) {
      this.clear();
      // If the change is before the block, we're extending the beginning of the block.
      let newFrom = {line: change.from.line, ch: 0};
      // If the change is after the block, we're extending the end.
      let newTo = {line: loc.to.line > loc.from.line ? loc.to.line : change.from.line + 1, ch: 0};
      this.editor.markSpan(newFrom, newTo, this.source);

      // If the end of the span is no longer at the beginning of the next line, fix it.
    } if(loc.to.ch !== 0) {
      this.clear();
      this.editor.markSpan(loc.from, {line: change.from.line + 1, ch: 0}, this.source);
    }

    this.refresh(change);
  }

  refresh(change:Change) {
    let loc = this.find();
    if(!loc) return;
    let cm = this.editor.cm;
    for(let line = loc.from.line; line < loc.to.line || line === loc.from.line; line++) {
      let info = cm.lineInfo(line);
      if(!info || !info.bgClass || info.bgClass.indexOf(this.lineBackgroundClass) === -1) {
        cm.addLineClass(line, "background", this.lineBackgroundClass);
      }
    }
  }
}

class ElisionSpan extends LineSpan {
  type:SpanType = "elision";
  lineBackgroundClass = "elision";
  protected element = document.createElement("div");

  constructor(_from:Position, _to:Position, source:any) {
    super(_from, _to, source);
    this.element.className = "elision-marker";
    this._attributes.replacedWith = this.element;
  }
}

class StrongSpan extends Span {
  type:SpanType = "strong";
}

class EmphasisSpan extends Span {
  type:SpanType = "emph";
}

type FormatType = "strong"|"emph"|"code"|"code_block";
type FormatLineType = "heading"|"item"|"elision";
type FormatAction = "add"|"remove"|"split";
type SpanType = FormatType|FormatLineType|"default";

var spanTypes:{[type:string]: (typeof Span)} = {
  heading: HeadingSpan,
  item: ListItemSpan,
  code_block: CodeBlockSpan,
  elision: ElisionSpan,
  strong: StrongSpan,
  emph: EmphasisSpan,
  "default": Span
}


//---------------------------------------------------------
// Editor
//---------------------------------------------------------
/* - [x] Exactly 700px
 * - [ ] Markdown styling
   * - [x] Add missing span types
   * - [x] Event handlers e.g. onChange, etc.
   * - [x] Get spans updating again
   * - [ ] BUG: Formatting selected too inclusive: |A*A|A* -Cmd-Bg-> AAA
   * - [ ] BUG: code spans continue onto next line
 * - [ ] Syntax highlighting
 * - [ ] Display cardinality badges
 * - [ ] Show related (at least action -> EAV / EAV -> DOM
 * - [ ] Autocomplete (at least language constructs, preferably also expression schemas and known tags/names/attributes)
 * - [ ] Undo
 */
interface EditorNode extends HTMLElement { cm?: CodeMirror.Editor }
type MDSpan = [number, number, commonmark.Node];

let _mdParser = new MDParser();
function parseMarkdown(input:string):{text: string, spans: MDSpan[]} {
  let parsed = _mdParser.parse(input);
  let walker = parsed.walker();
  var cur:commonmark.NodeWalkingStep;
  var text:string[] = [];
  var pos = 0;
  var lastLine = 1;
  var spans:MDSpan[] = [];
  var context:{node: commonmark.Node, start: number}[] = [];
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
      if(!info) throw new Error("Invalid context stack while parsing markdown");
      if(node.type == "emph" || node.type == "strong" || node.type == "link") {
        spans.push([info.start, pos, node]);
      } else if(node.type == "heading" || node.type == "item") {
        spans.push([info.start, info.start, node]);
      }
    }
  }
  return {text: text.join(""), spans};
}

class Change implements CodeMirror.EditorChange {
  type?:string

  constructor(protected _raw:CodeMirror.EditorChange) {}

  /** String representing the origin of the change event and whether it can be merged with history. */
  get origin() { return this._raw.origin; }
  /** Lines of text that used to be between from and to, which is overwritten by this change. */
  get text() { return this._raw.text; }
  /** Lines of text that used to be between from and to, which is overwritten by this change. */
  get removed() { return this._raw.removed; }
  /** Position (in the pre-change coordinate system) where the change started. */
  get from() { return this._raw.from; }
  /** Position (in the pre-change coordinate system) where the change ended. */
  get to() { return this._raw.to; }
  /** Position (in the post-change coordinate system) where the change eneded. */
  get final() {
    let {from, to, text} = this._raw;
    let final = {line: from.line + (text.length - 1), ch: text[text.length - 1].length};
    if(text.length == 1) {
      final.ch += from.ch;
    }
    return final;
  }

  /** String of all text added in the change. */
  get addedText() { return this._raw.text.join("\n"); }
  /** String of all text removed in the change. */
  get removedText() { return this._raw.removed.join("\n"); }

  /** Whether this change just a single enter. */
  isNewlineChange() {
  return this.text.length == 2 && this.text[1] == "";
}

}

class ChangeLinkedList extends Change {
  constructor(protected _raw:CodeMirror.EditorChangeLinkedList) {
    super(_raw);
  }

  /** Next change object in sequence, if any. */
  next() {
    return this._raw.next && new ChangeLinkedList(this._raw.next);
  }
}

class ChangeCancellable extends Change {
  constructor(protected _raw:CodeMirror.EditorChangeCancellable) {
    super(_raw);
  }

  get canceled() { return this._raw.canceled; }

  update(from?:Position, to?:Position, text?:string) {
    return this._raw.update(from, to, text);
  }

  cancel() {
    return this._raw.cancel();
  }
}

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

interface HistoryItem { finalized?: boolean, changes:ChangeLinkedList[] }

class Editor {
  defaults:CodeMirror.EditorConfiguration = {
    tabSize: 2,
    lineWrapping: true,
    lineNumbers: true,
    extraKeys: ctrlify({
      "Cmd-Enter": () => console.log("sup dawg"),
      "Cmd-B": () => this.format({type: "strong"}),
      "Cmd-I": () => this.format({type: "emph"}),
      "Cmd-L": () => this.format({type: "code"}),
      "Cmd-K": () => this.format({type: "code_block"}),
      "Cmd-E": () => this.formatLine({type: "heading", level: 1}),
      "Cmd-Y": () => this.formatLine({type: "item"})
    })
  };

  cm:CodeMirror.Editor;

  /** The current editor generation. Used for imposing a relative ordering on parses. */
  generation = 0;

  /** Formatting state for the editor at the cursor. */
  formatting:{[formatType:string]: FormatAction} = {};

  /** Whether the editor is currently processing CM change events */
  changing = false;
  /** Cache of the spans affected by the current set of changes */
  changingSpans?:Span[];

  /** Undo history state */
  history:{position:number, transitioning:boolean, items: HistoryItem[]} = {position: 0, items: [], transitioning: false};

  constructor(public ide:IDE) {
    this.cm = CodeMirror(() => undefined, this.defaults);
    this.cm.on("beforeChange", (editor, rawChange) => this.onBeforeChange(rawChange));
    this.cm.on("change", (editor, rawChange) => this.onChange(rawChange));
    this.cm.on("changes", (editor, rawChanges) => this.onChanges(rawChanges));
    this.cm.on("cursorActivity", this.onCursorActivity);
  }

  loadSpans(text:string, packed:any[], attributes:{[id:string]: any|undefined}) {
    this.cm.operation(() => {
      this.cm.setValue(text);
      let doc = this.cm.getDoc();
      if(packed.length % 4 !== 0) throw new Error("Invalid span packing, unable to load.");
      for(let i = 0; i < packed.length; i += 4) {
        let from = doc.posFromIndex(packed[i]);
        let to = doc.posFromIndex(packed[i + 1]);
        let type = packed[i + 2];
        let id = packed[i + 3];

        let source = attributes[id] || {};
        source.type = type;
        source.id = id;
        this.markSpan(from, to, source);

      }
    });
  }

  refresh() {
    this.cm.refresh();
  }

  queueUpdate = debounce(() => {
    render();
    this.generation++;
  }, 1, true);

  //-------------------------------------------------------
  // Spans
  //-------------------------------------------------------

  getAllSpans(type?:SpanType):Span[] {
    let doc = this.cm.getDoc();
    let marks:SpanMarker[] = doc.getAllMarks();
    let spans:Span[] = [];
    for(let mark of marks) {
      if(mark.span && (!type || mark.span.source.type === type)) {
        spans.push(mark.span);
      }
    }
    return spans;
  }

  findSpans(start:Position, stop:Position, type?:SpanType):Span[] {
    let doc = this.cm.getDoc();
    let marks:SpanMarker[] = doc.findMarks(start, stop);
    let spans:Span[] = [];
    for(let mark of marks) {
      if(mark.span && (!type || mark.span.source.type === type)) {
        spans.push(mark.span);
      }
    }
    return spans;
  }

  findSpansAt(pos:Position, type?:SpanType):Span[] {
    let doc = this.cm.getDoc();
    let marks:SpanMarker[] = doc.findMarksAt(pos);
    let spans:Span[] = [];
    for(let mark of marks) {
      if(mark.span && (!type || mark.span.source.type === type)) {
        spans.push(mark.span);
      }
    }
    return spans;
  }

  clearSpan(span:Span, origin = "+delete") {
    console.warn("@FIXME: history integration");
    //this.addToHistory({type: "span", added: [], removed: [span], origin});
    this.queueUpdate();
  }

  /** Create a new Span representing the given source in the document. */
  markSpan(from:Position, to:Position, source:any) {
    let SpanClass = spanTypes[source.type] || spanTypes["default"];
    let span = new SpanClass(from, to, source);
    span.applyMark(this);
    return span;
  }

  //-------------------------------------------------------
  // Formatting
  //-------------------------------------------------------

  /** Create a new span representing the given source, collapsing and splitting existing spans as required to maintain invariants. */
  formatSpan(from:Position, to:Position, source:any) {
    let selection = {from, to};
    let spans = this.findSpans(from, to, source.type);
    let formatted = false;
    for(let span of spans) {
      let loc = span.find();
      if(!loc) continue;

      // If the formatted range matches an existing span of the same type, clear it.
      if(samePosition(loc.from, from) && samePosition(loc.to, to)) {
        span.clear();
        formatted = true;

        // If formatted range wholly encloses a span of the same type, clear it.
      } else if(whollyEnclosed(loc, selection)) {
        span.clear();

        // If the formatted range is wholly enclosed in a span of the same type, split the span around it.
      } else if(whollyEnclosed(selection, loc)) {
        this.markSpan(loc.from, from, source);
        this.markSpan(to, loc.to, source);
        span.clear();
        formatted = true;

        // If the formatted range intersects the end of a span of the same type, clear the intersection.
      } else if(comparePositions(loc.to, from) > 0) {
        this.markSpan(loc.from, from, source);
        span.clear();

        // If the formatted range intersects the start of a span of the same type, clear the intersection.
      } else if(comparePositions(loc.from, to) < 0) {
        this.markSpan(to, loc.to, source);
        span.clear();
      }
    }

    // If we haven't already formatted by removing existing span(s) then we should create a new span
    if(!formatted) {
      this.markSpan(from, to, source);
    }
  }

  format(source:{type:FormatType}) {
    this.finalizeLastHistoryEntry();
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      // If we have a selection, format it.
      if(doc.somethingSelected()) {
        this.formatSpan(doc.getCursor("from"), doc.getCursor("to"), source)

        // Otherwise we want to change our current formatting state.
      } else {
        let action:FormatAction = "add"; // By default, we just want our following changes to be bold
        let cursor = doc.getCursor("from");
        let spans = this.findSpansAt(cursor, source.type);
        for(let span of spans) {
          let loc = span.find();
          if(!loc) continue;
          // If we're at the end of a bold span, we want to stop bolding.
          if(samePosition(loc.to, cursor)) action = "remove";
          // If we're at the start of a bold span, we want to continue bolding.
          if(samePosition(loc.from, cursor)) action = "add";
          // Otherwise we're somewhere in the middle, and want to insert some unbolded text.
          else action = "split";
        }
        this.formatting[source.type] = action;
      }
      this.finalizeLastHistoryEntry();
    });
  }

  formatLine(source:{type:FormatLineType, level?:number}) {
    this.finalizeLastHistoryEntry();
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      let from = doc.getCursor("from");
      let to = doc.getCursor("to");

      let existing:LineSpan[] = [];
      let formatted = false;
      for(let line = from.line, end = to.line; line <= end; line++) {
        let cur = {line, ch: 0};

        // Line formats are exclusive, so we clear intersecting line spans of other types.
        let spans = this.findSpansAt(cur);
        for(let span of spans) {
          if(isLineSpan(span) && span.source.type !== source.type) {
            span.clear();
          }
        }

        spans = this.findSpansAt(cur, source.type);
        // If this line isn't already formatted to this type, format it.
        if(!spans.length) {
          this.formatSpan(cur, cur, source);
          formatted = true;
          // Otherwise store the span. We may need to clear them if we intend to unformat the selection.
        } else {
          existing.push.apply(existing, spans);
        }
      }

      // If no new lines were formatted, we mean to clear the existing format.
      if(!formatted) {
        for(let span of existing) {
          span.clear();
        }
      }

      this.finalizeLastHistoryEntry();
      this.refresh();
    });
  }

  //-------------------------------------------------------
  // Undo History
  //-------------------------------------------------------

  addToHistory(change:Change) {
    console.warn("@TODO: Implement me!");
  }

  finalizeLastHistoryEntry() {
    console.warn("@TODO: Implement me!");
  }

  //-------------------------------------------------------
  // Handlers
  //-------------------------------------------------------

  injectCodeMirror:RenderHandler = (node:EditorNode, elem) => {
    if(!node.cm) {
      node.cm = this.cm;
      node.appendChild(this.cm.getWrapperElement());
    }
    this.cm.refresh();
    render();
  }

  onBeforeChange = (raw:CodeMirror.EditorChangeCancellable) => {
    let doc = this.cm.getDoc();
    let change = new ChangeCancellable(raw);
    let {from, to} = change;
    let spans:Span[];
    if(samePosition(from, to)) {
      spans = this.findSpansAt(from);
    } else {
      let inclusiveFrom = doc.posFromIndex(doc.indexFromPos(from) - 1);
      let inclusiveTo = doc.posFromIndex(doc.indexFromPos(to) + 1);
      spans = this.findSpans(inclusiveFrom, inclusiveTo);
    }

    // Grab all of the line spans intersecting this change too.
    for(let line = from.line, end = to.line; line <= end; line++) {
      let maybeLineSpans = this.findSpansAt({line, ch: 0});
      for(let maybeLineSpan of maybeLineSpans) {
        if(maybeLineSpan.isLine && spans.indexOf(maybeLineSpan) === -1) {
          spans.push(maybeLineSpan);
        }
      }
    }

    for(let span of spans) {
      if(span.onBeforeChange) {
        if(!span.find()) span.clear();
        else span.onBeforeChange(change);
      }
    }

    if(!change.canceled) {
      this.changing = true;
      if(this.changingSpans) {
        this.changingSpans.push.apply(this.changingSpans, spans);
      } else {
        this.changingSpans = spans;
      }
    }
  }

  onChange = (raw:CodeMirror.EditorChangeLinkedList) => {
    let change = new ChangeLinkedList(raw);
    let spans = this.changingSpans || [];
    if(change.origin === "+mdredo" || change.origin === "+mdundo") {
      for(let span of spans) {
        if(!span.refresh) continue;

        let cur:ChangeLinkedList|undefined = change;
        while(cur) {
          span.refresh(cur);
          cur = cur.next();
        }
      }
      return;
    }

    // Collapse multiline changes into their own undo step
    if(change.text.length > 1) this.finalizeLastHistoryEntry();

    this.addToHistory(change);
    for(let span of spans) {
      if(!span.onChange) continue;

      if(!span.find()) span.clear();
      else {
        let cur:ChangeLinkedList|undefined = change;
        while(cur) {
          span.onChange(cur);
          cur = cur.next();
        }
      }
    }

    for(let format in this.formatting) {
      let action = this.formatting[format];
      if(action === "add") {
        this.markSpan(change.from, change.final, {type: format});
      }
    }
  }

  onChanges = (raws:CodeMirror.EditorChangeLinkedList[]) => {
    this.changingSpans = undefined;
    this.changing = false;
    this.history.transitioning = false;
    this.formatting = {};
    this.queueUpdate();
  }

  onCursorActivity = () => {
    if(!this.changing) {
      this.finalizeLastHistoryEntry();
    }
    // Remove any formatting that may have been applied
    this.formatting = {};
  }

  // Elements

  render() {
    return {c: "editor-pane",  postRender: this.injectCodeMirror};
  }
}

//---------------------------------------------------------
// Comments
//---------------------------------------------------------
/* - [x] Comments are pinned to a range in the current CM editor
 *   - [x] Hovering (always?) a comment will highlight its matching Position or Range
 *   - [x] Clicking a comment will scroll its location into view
 *   - [x] Comments are collapsed by the callback that moves them into position by doing so in order
 * - [x] Last priority on width
 * - [x] Soak up left over space
 * - [x] Icons below min width
 *   - [x] Popout view on hover when iconified
 *   - [ ] BUG: Mouse left of comments-panel in icon popout causes popout to close
 *   - [ ] BUG: Display popout above instead of below when below would push it off the screen
 * - [ ] Condensed, unattached console view
 * - [ ] Count indicator (?)
 * - [x] Scrollbar minimap
 * - [ ] Filters (?)
 * - [ ] Quick actions
 *   - [x] Map of ids to QA titles, description templates, and executors
 *   - [ ] Hovering a quick action will display a transient tooltip beneath the action bar describing the impact of clicking it
 *   - [ ] All QAs must be undo-able
 * - [ ] AESTHETIC: selection goes under comments bar (instead of respecting line margins)
 * - Comment types:
 *   - Errors
 *   - Warnings
 *   - View results
 *   - Live docs
 *   - User messages / responses
 */

type CommentType = "error"|"warning"|"info"|"comment"|"result";
interface Comment {
  loc: Position|Range,
  type: CommentType,
  title?: string,
  description?: string,
  actions?: string[],
  replies?: string[],

  marker?: CodeMirror.TextMarker,
  annotation?: CodeMirror.AnnotateScrollbar.Annotation
}
interface CommentMap {[id:string]: Comment}
interface Action {
  name: string,
  description: (comment:Comment) => string,
  run: (event:Event, {commentId:string}) => void
}

class Comments {
  comments:CommentMap;
  ordered:string[];

  active?:string;
  rootNode?:HTMLElement;
  _currentWidth?:number;

  constructor(public ide:IDE, comments: CommentMap) {
    this.update(comments);
  }

  collapsed() {
    return this._currentWidth <= 300;
  }

  update(comments:CommentMap) {
    if(this.comments) {
      for(let commentId of this.ordered) {
        let comment = this.comments[commentId];
        if(comment.marker) comment.marker.clear();
        if(comment.annotation) comment.annotation.clear();
      }
    }
    this.comments = comments;
    this.ordered = Object.keys(this.comments);
    this.ordered.sort(this.commentComparator);

    this.annotateScrollbar();
  }

  annotateScrollbar = () => {
    let cm = this.ide.editor.cm;

    for(let commentId of this.ordered) {
      let comment = this.comments[commentId];
      if(!comment.annotation) comment.annotation = cm.annotateScrollbar({className: `scrollbar-annotation ${comment.type}`});
      comment.annotation.update([isRange(comment.loc) ? comment.loc : {from: comment.loc, to: comment.loc}]);
    }
  }

  commentComparator = (aId:string, bId:string) => {
    let a = this.comments[aId];
    let b = this.comments[bId];
    let aLine = isRange(a.loc) ? a.loc.from.line : a.loc.line;
    let bLine = isRange(b.loc) ? b.loc.from.line : b.loc.line;
    return aLine - bLine;
  }

  // handlers
  actions:{[id:string]: Action} = {
    "fix it": {
      name: "fix it",
      description: (comment) => ``,
      run: (event, {commentId}) => {
        console.log("fix it", commentId);
      }
    },
    "create it": {
      name: "create it",
      description: (comment) => `Create a new block that provides records like this`,
      run: (event, {commentId}) => {
        console.log("create it", commentId);
      }
    },
    "fake it": {
      name: "fake it",
      description: (comment) => `Make up some fake records shaped like this for testing`,
      run: (event, {commentId}) => {
        console.log("fake it", commentId);
      }
    },
    "dismiss": {
      name: "dismiss",
      description: (comment) => `Dismiss this warning`,
      run: (event, {commentId}) => {
        console.log("dismiss", commentId);
      }
    }
  };

  resizeComments = debounce(() => {
    if(!this.rootNode) return;

    let inner:HTMLElement = this.rootNode.children[0] as any;
    if(this._currentWidth && inner.offsetWidth === this._currentWidth) return;
    else {
      if(inner.offsetWidth <= 300) {
        this.rootNode.classList.add("collapsed");
      } else {
        this.rootNode.classList.remove("collapsed");
      }
      this._currentWidth = inner.offsetWidth;
    }

    let nodes:HTMLElement[] =  inner.children as any;
    let cm = this.ide.editor.cm;

    let ix = 0;
    let intervals:ClientRect[] = [];
    for(let commentId of this.ordered) {
      let comment = this.comments[commentId];
      let start = isRange(comment.loc) ? comment.loc.from : comment.loc;
      let coords = cm.charCoords(start, "local");

      let node = nodes[ix];
      node.style.top = ""+coords.top;
      for(let lvl = 1; lvl < 4; lvl++) {
        node.classList.remove("collapse-" + lvl);
      }
      intervals[ix] = node.getBoundingClientRect();
      ix++;
    }

    // Adjust pairs of comments until they no longer intersect.
    // @TODO: Never collapse the active comment!
    // @TODO: Uncollapse a newly active comment
    for(let ix = 0, length = intervals.length - 1; ix < length; ix++) {
      let prev:ClientRect|undefined = intervals[ix - 1];
      let cur = intervals[ix];
      let next = intervals[ix + 1];

      if(next.top > cur.bottom) {
        continue;
      }

      let curNode = nodes[ix];
      let nextNode = nodes[ix + 1];

      // Scoot the current comment up as much as possible without:
      // - Pushing the comment off the top of the screen
      // - Pushing it entirely off it's line
      // - Going any further than required to fit both comments
      // - Intersecting with the comment preceding it

      let intersect = cur.bottom - next.top;
      let oldTop = cur.top;
      let neueTop = Math.max(0, cur.top - cur.height, cur.top - intersect, prev && prev.bottom || 0);
      intersect -= cur.top - neueTop;
      curNode.style.top = ""+neueTop;
      cur = intervals[ix] = curNode.getBoundingClientRect();

      if(intersect == 0) continue;


      // Collapse the current comment:
      // Collapse rules are implemented in CSS, so we test height after each collapse to see if we've gone far enough
      // We want to ensure comments are always within one line of their parent line, so readjust the top if the comment is now too short
      // This can't possibly accomplish anything if both comments are meant to be on the same line, so we ignore it in that case
      if(oldTop !== next.top) {
        for(let lvl = 1; lvl < 3; lvl++) {
          let oldHeight = cur.height;
          curNode.classList.remove("collapse-" + (lvl - 1));
          curNode.classList.add("collapse-" + lvl);
          cur = intervals[ix] = curNode.getBoundingClientRect();
          intersect -= oldHeight - cur.height;

          if(cur.bottom < oldTop) {
            curNode.style.top = ""+(cur.top + oldTop - cur.bottom + 10);
            intersect += oldTop - cur.bottom;
            cur = intervals[ix] = curNode.getBoundingClientRect();
          }

          if(intersect <= 0) break;
        }
        if(intersect <= 0) continue;
      }

      // All the clever tricks have failed, so we push the next comment down the remainder of the intersection
      nextNode.style.top = ""+(next.top + intersect);
      next = intervals[ix + 1] = nextNode.getBoundingClientRect();
    }
  }, 16, true);

  wangjangle:RenderHandler = (node, elem) => {
    if(!node["_injected"]) {
      let wrapper = this.ide.editor.cm.getWrapperElement();
      wrapper.querySelector(".CodeMirror-sizer").appendChild(node);
      node["_injected"] = true;
    }
    this.rootNode = node;
    this.resizeComments();
  }

  highlight = (event:MouseEvent, {commentId}) => {
    let comment = this.comments[commentId];
    this.active = commentId;
    if(comment.marker) return;

    let cm = this.ide.editor.cm;
    let doc = cm.getDoc();

    if(isRange(comment.loc)) {
      comment.marker = doc.markText(comment.loc.from, comment.loc.to, {className: `comment-highlight ${comment.type} range`});
    } else {
      let to = {line: comment.loc.line, ch: comment.loc.ch + 1};
      comment.marker = doc.markText(comment.loc, to, {className: `comment-highlight ${comment.type} pos`});
    }
  }

  unhighlight = (event:MouseEvent, {commentId}) => {
    let comment = this.comments[commentId];
        this.active = undefined;
    if(!comment.marker) return;

    comment.marker.clear();
    comment.marker = undefined;
  }

  goTo = (event, {commentId}) => {
    let comment = this.comments[commentId];
    let cm = this.ide.editor.cm;
    cm.scrollIntoView(isRange(comment.loc) ? comment.loc.from : comment.loc, 20);
  }

  openComment = (event, {commentId}) => {
    this.active = commentId;
    render();
  }

  closeComment = (event, {commentId}) => {
    this.active = undefined;
    render();
  }

  comment(commentId:string):Elem {
    let comment = this.comments[commentId];
    let actions:Elem[] = [];
    if(comment.actions) {
      for(let actionId of comment.actions) {
        let action = this.actions[actionId];
        if(!action) {
          console.warn(`Unknown action id: '${actionId}'`);
          continue;
        }
        let elem = {c: `comment-action`, text: action.name, tooltip: action.description(comment), commentId, click: action.run};
        actions.push(elem);
      }
    }

    return {
      c: `comment ${comment.type}`, commentId,
      mouseover: this.highlight, mouseleave: this.unhighlight, click: this.goTo,
      children: [
        comment.title ? {c: "label", text: comment.title} : undefined,
        {c: "comment-inner", children: [
          comment.description ? {c: "description", text: comment.description} : undefined,
          actions.length ? {c: "quick-actions", children: actions} : undefined,
        ]}
      ]};
  }

  render():Elem { // @FIXME: I'm here, just hidden by CodeMirror and CM scroll
    let children:Elem[] = [];
    for(let commentId of this.ordered) {
      children.push(this.comment(commentId));
    }

    return {c: "comments-pane", postRender: this.wangjangle, children: [{c: "comments-pane-inner", children}]};
  }
}

//---------------------------------------------------------
// Format Bar
//---------------------------------------------------------

/* - Anchors under selection
 * - Suppressed by shift key (modifying selection)
 * - Text: B / I / H / Code
 * - Code: Something's wrong
 */

function formatBar():Elem {
  return {};
}

//---------------------------------------------------------
// New Block
//---------------------------------------------------------

/* - Button in left margin
 * - Only appears on blank lines with editor focused
 * - Text: Block / List / Quote / H(?)
 */

function newBlockBar():Elem {
  return {};
}

//---------------------------------------------------------
// Modals
//---------------------------------------------------------

/* - Transient
 * - Anchors to bottom of screen
 * - Scrolls targeted element back into view, if any
 * - Modals:
 *   - Something's wrong
 */

function modalWrapper():Elem {
  return {};
}


//---------------------------------------------------------
// Root
//---------------------------------------------------------

var fakeText = `# Department Costs

This application helps Accounting keep track of internal expenses

## Calculations

Calculate the cost of wages per department
 - **Engineering**
 - *Ops*
 - \`Magic\`

### Vuvuzela

Create the departments and employees.
\`\`\`
commit
  engineering = [#department @engineering]
  operations = [#department @operations]
  [#employee @josh department: engineering salary: 10]
  [#employee @chris department: engineering salary: 7]
  [#employee @rob department: operations salary: 7]
\`\`\`

To calculate the cost of a department, we sum the salaries of its employees.

\`\`\`
match
  department = #department
  employee = [#employee salary department seniority]
  cost = sum[value: salary, given: employee, per: department]
bind
  department.cost := cost
\`\`\`

## Visualizations

Finally, we visualize the costs

\`\`\`
match
  [#department name cost]
bind @browser
  [#div text: "{{nqme}} costs {{cost}}"]
\`\`\`

`;

function _addFakeDoc(name:string, text:string, nodes:TreeMap, parentId?:string) {
  let rootId = uuid();
  if(parentId && nodes[parentId]) {
    nodes[parentId]!.children!.push(rootId);
  }

  let root = nodes[rootId] = {name, type: "document", children: []};
  let stack:TreeNode[] = [root];
  for(let line of text.split("\n")) {
    if(line[0] == "#") {
      let id = uuid();

      let root = nodes[rootId] = {name, type: "document", children: []};
      let stack:TreeNode[] = [root];
      let level = 0;
      while(line[level] === "#") level++;
      while((stack.length > 1) && (level <= stack[stack.length - 1].level)) stack.pop();
      stack[stack.length - 1].children!.push(id);

      let node = {name: line.substring(level), type: "section", level, children: []};
      stack.push(node);
      nodes[id] = node;
    }
  }
}

var fakeNodes:TreeMap = {
  root: {name: "examples", type: "folder", open: true, children: ["department cost", "tic tac toe"]}
};
_addFakeDoc("Department Cost", fakeText, fakeNodes, "root");

var fakeComments:CommentMap = {
  bar: {loc: {from: {line: 24, ch: 15}, to: {line: 24, ch: 26}}, type: "error", title: "Invalid tag location", actions: ["fix it"], description: unpad(`
        '#department' tells me to search for a record tagged "department", but since it's not in a record, I don't know the full pattern to look for.

        If you wrap it in square brackets, that tells me you're looking for a record with just that tag.`)},

  catbug: {loc: {from: {line: 25, ch: 13}, to: {line: 25, ch: 52}}, type: "warning", title: "Unmatched pattern", actions: ["create it", "fake it", "dismiss"], description: unpad(`
           No records currently in the database match this pattern, and no blocks are capable of providing one.

           I can create a new block for you to produce records shaped like this; or add some fake records that match that pattern for testing purposes.`)},
  dankeykang: {loc: {from: {line: 37, ch: 17}, to: {line: 37, ch: 21}}, type: "error", title: "Unbound variable", description: unpad(`
               The variable 'nqme' was not bound in this block. Did you mean 'name'?
               `)},
};

export class IDE {
  navigator:Navigator = new Navigator(this, "root", {});
  editor:Editor = new Editor(this);
  comments:Comments = new Comments(this, fakeComments);

  constructor() {
    window.addEventListener("resize", this.resize);
  }

  resize = debounce(() => {
    this.comments.resizeComments();
  }, 16, true);

  render() {
    // Update child states as necessary

    return {c: `editor-root`, children: [
      this.navigator.render(),
      this.editor.render(),
      this.comments.render()
    ]};
  }

  loadSpans(text:string, packed:any[], attributes:{[id:string]: any|undefined}) {
    this.editor.loadSpans(text, packed, attributes);
    this.navigator.loadDocument(this.editor);
  }
}

export let _ide = new IDE();
function render() {
  renderer.render([_ide.render()]);
}

//// DEBUG
render();
