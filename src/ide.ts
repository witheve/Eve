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

//---------------------------------------------------------
// Navigator
//---------------------------------------------------------
/* - [x] Document Pseudo-FS
 * - [x] Table of Contents
 * - [x] Separate detail levels to control indentation / info overload
 * - [x] 2nd priority on width
 * - [x] Collapsible
 * - [x] Elision (in ToC)
 * - [x] Elision (in editor)
 */

interface TreeNode {
  id?: string,
  name: string,
  type: string,
  children?: string[],
  open?: boolean,
  span?: Span,

  hidden?: boolean,
  elisionSpan?: Span,
  level?: number
}
interface TreeMap {[id:string]: TreeNode|undefined}

class Navigator {
  labels = {
    folder: "Workspace",
    document: "Table of Contents"
  };
  open: boolean = true;

  constructor(public ide:IDE, public rootId = "root", public nodes:TreeMap = {root: {type: "folder", name: "/", children: []}}, public currentId:string = rootId) {}

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


  loadWorkspace(id:string, name:string, files:{[filename:string]: string}, parentId = this.rootId) {
    let root:TreeNode = this.nodes[id] = {id, name, type: "folder"};

    let parent = root;
    for(let curId in files) {
      let node:TreeNode = {id: curId, name: curId, type: "document"};
      this.nodes[curId] = node;
      if(!parent.children) parent.children = [curId];
      else parent.children.push(curId);
    }

    if(id !== this.rootId) {
      parent = this.nodes[parentId];
      if(!parent) throw new Error(`Unable to load document into non-existent folder ${parentId}`);
      if(!parent.children) parent.children = [];
      if(parent.children.indexOf(id) === -1) {
        parent.children.push(id);
      }
    }
  }

  loadDocument(id:string, name:string) {
    let editor = this.ide.editor;
    let doc = editor.cm.getDoc();
    let headings = editor.getAllSpans("heading") as HeadingSpan[];
    headings.sort(compareSpans);

    let root:TreeNode = this.nodes[id];
    if(!root) throw new Error("Cannot load non-existent document.");
    root.open = true;
    root.children = undefined;

    let stack:TreeNode[] = [root];
    for(let heading of headings) {
      let curId = heading.id;
      let loc = heading.find();
      if(!loc) continue;

      while((stack.length > 1) && heading.source.level <= stack[stack.length - 1].level) stack.pop();
      let parent = stack[stack.length - 1];
      if(!parent.children) parent.children = [curId];
      else parent.children.push(curId);

      let old = this.nodes[curId];
      let node:TreeNode = {id: curId, name: doc.getLine(loc.from.line), type: "section", level: heading.source.level, span: heading, open: old ? old.open : true, hidden: old ? old.hidden : false, elisionSpan: old ? old.elisionSpan : undefined};
      stack.push(node);
      this.nodes[curId] = node;
    }

    this.nodes[id] = root;
  }

  updateNode(span:HeadingSpan) {
    if(this.currentType() !== "document") return;

    let nodeId = span.id;
    let node = this.nodes[nodeId];

    let loc = span.find();
    if(node && !loc) {
      if(node.elisionSpan) node.elisionSpan.clear();
      this.nodes[nodeId] = undefined;

    } else if(node) {
      // @NOTE: we intentionally don't handle this case currently since updating here would conflict with the parser updates

    } else if(!node && loc) {
      let cur = loc.from;
      let parentId:string;
      let siblingId:string|undefined;
      do {
        let parentSpan = this.ide.editor.findHeadingAt(cur);
        let parentLoc = parentSpan && parentSpan.find();
        cur = parentLoc ? parentLoc.from : {line: 0, ch: 0};
        siblingId = parentId;
        parentId = parentSpan ? parentSpan.id : this.currentId;

      } while(parentId !== this.currentId && this.nodes[parentId]!.level >= span.source.level);

      let parentNode = this.nodes[parentId]!;
      if(!parentNode.children) parentNode.children = [nodeId];
      else {
        let ix = parentNode.children.length;
        if(siblingId) {
          ix = parentNode.children.indexOf(siblingId);
          ix = (ix === -1) ? parentNode.children.length : ix;
        }
        parentNode.children.splice(ix, 0, nodeId);
      }
      let doc = this.ide.editor.cm.getDoc();
      this.nodes[nodeId] = {id: nodeId, name: doc.getLine(loc.from.line), type: "section", level: span.source.level, span, open: true, hidden: false};
    }
  }

  // Event Handlers
  togglePane = (event:MouseEvent, elem) => {
    this.open = !this.open;
    this.ide.render();
    event.stopPropagation();
    // @FIXME: This is kinda hacky, but we'd have to have a full on animation system for better.
    setTimeout(this.ide.resize, 100);
    setTimeout(this.ide.resize, 200);
    setTimeout(this.ide.resize, 300);
  }

  navigate = (event, elem:{nodeId:string}) => {
    this.currentId = elem.nodeId || this.rootId;
    let node = this.nodes[elem.nodeId];
    if(node && node.type === "document") {
      this.ide.loadFile(elem.nodeId);
    }
    this.ide.render();
  }

  toggleBranch = (event:MouseEvent, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    node.open = !node.open;
    this.ide.render();
    event.stopPropagation();
  }

  gotoSpan = (event:MouseEvent, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    let loc = node.span.find();
    if(!loc) return;
    if(node.span.constructor === HeadingSpan) {
      let heading = node.span as HeadingSpan;
      loc = heading.getSectionRange() || loc;
    }
    this.ide.editor.cm.scrollIntoView(loc, 20);
  }

  doElide(nodeId: string,  elide: boolean) {
    let node = this.nodes[nodeId];
    if(!node) return;
    if(elide && !node.hidden) {
      let heading = node.span as HeadingSpan;
      let sectionRange = heading.getSectionRange();
      if(sectionRange) {
        node.elisionSpan = this.ide.editor.markSpan(sectionRange.from, sectionRange.to, {type: "elision"});
      }
    } else if(!elide && node.elisionSpan) {
      node.elisionSpan.clear();
      node.elisionSpan = undefined;
    }
    node.hidden = elide;
  }

  _inheritParentElision = (nodeId: string, parentId?: string) => {
    if(parentId) this.doElide(nodeId, this.nodes[parentId]!.hidden);
  }

  toggleElision = (event, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    this.ide.editor.cm.operation( () => {
      this.doElide(nodeId, !node.hidden);
      this.walk(nodeId, this._inheritParentElision);
    })
    this.ide.render();
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
        {c: `label ${subtree ? "ion-ios-arrow-down" : "no-icon"}`, text: node.name, nodeId, click: node.span ? this.gotoSpan : undefined}, // icon should be :before
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

function compareSpans(a, b) {
  let aLoc = a.find();
  let bLoc = b.find();
  if(!aLoc && !bLoc) return 0;
  if(!aLoc) return -1;
  if(!bLoc) return 1;
  if(aLoc.from.line === bLoc.from.line) return 0;
  return aLoc.from.line < bLoc.from.line ? -1 : 1;
}

interface SpanSource { type: string, id: string }

class Span {
  static isEditorControlled = false;

  protected static _nextId = 0;
  isLine = false;

  id: string;
  editor: Editor;
  marker?: SpanMarker;

  protected _attributes:CodeMirror.TextMarkerOptions = {};
  type:SpanType = "default";

  constructor(protected _from:Position, protected _to:Position, public source:SpanSource) {
    this.id = `${this.source.type || "span"}${Span._nextId++}`;
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

  applyMark(editor:Editor, origin:string = "+input") {
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
    editor.addToHistory(new SpanChange([this], [], origin));
  }

  clear(origin = "+delete") {
    if(!this.marker) return;
    let cm = this.editor.cm;

    this.marker.clear();
    this.marker.span = undefined;
    this.marker = undefined;

    this.editor.addToHistory(new SpanChange([], [this], origin));
    this.editor.queueUpdate();
  }

  sourceEquals(other:SpanSource) {
    return other && this.source.type === other.type;
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

  constructor(_from:Position, _to:Position, source:SpanSource) {
    super(_from, _to, source);
    if(_from.ch !== 0 || _to.ch !== 0) {
      throw new Error(`Invalid lineSpan range (${_from.line}, ${_from.ch}) to (${_to.line}, ${_to.ch})`);
    }
  }

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
    if(!loc || !samePosition(loc.from, change.from)) return;

    // If we're deleting at the start of a line-formatted line, we need to remove the line formatting too.
    if(change.origin === "+delete") {
      this.clear();
    }
    // If we're adding a newline with nothing on the current line, we're really removing the formatting of the current line.
    let isEmpty = doc.getLine(change.from.line) === "";
    if(change.origin === "+input" && change.isNewlineChange() && isEmpty) {
      this.clear();
      change.cancel();
    }
  }

  onChange(change:Change) {
    let loc = this.find();
    if(!loc) return;
    // If the change starts exclusively outside of the list, ignore it.
    //if(loc.from.line > change.from.line || loc.to.line < change.from.line) return;
    if(!samePosition(loc.from, change.from)) return;

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

interface HeadingSpanSource extends SpanSource { level: number }
class HeadingSpan extends LineSpan {
  static isEditorControlled = true;
  type:SpanType = "heading";

  constructor(_from:Position, _to:Position, public source:HeadingSpanSource) {
    super(_from, _to, source);
    if(!this.source.level) {
      this.source.level = 1;
    }
    let cls =  "HEADING" + this.source.level;
    this.lineTextClass = cls;
    this.lineBackgroundClass = cls;
    this._attributes.className = cls;
  }

  applyMark(editor:Editor) {
    super.applyMark(editor);
    editor.ide.navigator.updateNode(this);
  }
  clear(origin?:string) {
    super.clear(origin);
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


  onChange(change:Change) {
    let loc = this.find();
    if(change.origin === "+delete" || change.origin === "+normalize") return;
    if(loc && loc.from.line === change.to.line) {
      this.editor.inHeading = this;
    }
  }
}

interface ListItemSpanSource extends SpanSource {level: number, listData: {start: number, type:"ordered"|"unordered"}}
class ListItemSpan extends LineSpan {
  static isEditorControlled =true;
  type:SpanType = "item";
  lineTextClass = "ITEM";

  constructor(_from:Position, _to:Position, public source:ListItemSpanSource) {
    super(_from, _to, source);
  }
}

// Code Blocks are an odd bird. They need the utilities of a Line Span but the logic of a regular span.
class CodeBlockSpan extends LineSpan {
  static isEditorControlled = true;
  type:SpanType = "code_block";
  isLine = false;
  lineBackgroundClass = "CODE";
  lineTextClass = "CODE-TEXT";

  constructor(_from:Position, _to:Position, source:SpanSource) {
    super(_from, (_to.ch === 0) ? _to : {line: _to.line + 1, ch: 0}, source);
  }

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
    } else if(loc.to.ch !== 0) {
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
  static isEditorControlled = true;
  type:SpanType = "elision";
  lineBackgroundClass = "elision";
  protected element = document.createElement("div");

  constructor(_from:Position, _to:Position, source:any) {
    super(_from, _to, source);
    this.element.className = "elision-marker";
    this._attributes.replacedWith = this.element;
  }
}

class CodeSpan extends Span {
  static isEditorControlled = true;
  type:SpanType = "code";
}


class StrongSpan extends Span {
  static isEditorControlled = true;
  type:SpanType = "strong";
}

class EmphasisSpan extends Span {
  static isEditorControlled = true;
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
  code: CodeSpan,
  "default": Span
}


//---------------------------------------------------------
// Editor
//---------------------------------------------------------
/* - [x] Exactly 700px
 * - [x] Markdown styling
   * - [x] Add missing span types
   * - [x] Event handlers e.g. onChange, etc.
   * - [x] Get spans updating again
   * - [x] BUG: Formatting selected too inclusive: |A*A|A* -Cmd-Bg-> AAA
 * - [x] Syntax highlighting
 * - [x] Live parsing
 * - [x] Undo
 * - [ ] Display cardinality badges
 * - [ ] Show related (at least action -> EAV / EAV -> DOM
 * - [ ] Autocomplete (at least language constructs, preferably also expression schemas and known tags/names/attributes)
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
  type:string = "range";

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
    let {from, to, text} = this;
    let final = {line: from.line + (text.length - 1), ch: text[text.length - 1].length};
    if(text.length == 1) {
      final.ch += from.ch;
    }
    return final;
  }

  /** String of all text added in the change. */
  get addedText() { return this.text.join("\n"); }
  /** String of all text removed in the change. */
  get removedText() { return this.removed.join("\n"); }

  /** Whether this change just a single enter. */
  isNewlineChange() {
    return this.text.length == 2 && this.text[1] == "";
  }

  /** Inverts a change for undo. */
  invert() { return new ChangeInverted(this._raw) as Change; }
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
function isRangeChange(x:Change|SpanChange): x is Change {
  return x && x.type === "range";
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

class ChangeInverted extends Change {
  /** Lines of text that used to be between from and to, which is overwritten by this change. */
  get text() { return this._raw.removed; }
  /** Lines of text that used to be between from and to, which is overwritten by this change. */
  get removed() { return this._raw.text; }
  /** Inverts a change for undo. */
  invert() { return new Change(this._raw); }
}

class SpanChange {
  type: string = "span";
  constructor(public added:Span[] = [], public removed:Span[] = [], public origin:string = "+input") {}
  /** Inverts a change for undo. */
  invert() { return new SpanChange(this.removed, this.added, this.origin); }
}
function isSpanChange(x:Change|SpanChange): x is SpanChange {
  return x && x.type === "span";
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

// Register static commands
let _rawUndo = CodeMirror.commands["undo"];
CodeMirror.commands["undo"] = function(cm:CMEditor) {
  if(!cm.editor) _rawUndo.apply(this, arguments);
  else cm.editor.undo();
}
let _rawRedo = CodeMirror.commands["redo"];
CodeMirror.commands["redo"] = function(cm:CMEditor) {
  if(!cm.editor) _rawRedo.apply(this, arguments);
  else cm.editor.redo();
}

function debugTokenWithContext(text:string, start:number, end:number):string {
  let lineStart = text.lastIndexOf("\n", start) + 1;
  let lineEnd = text.indexOf("\n", end);
  if(lineEnd === -1) lineEnd = undefined;
  let tokenStart = start - lineStart;
  let tokenEnd = end - lineStart;
  let line = text.substring(lineStart, lineEnd);

  return line.substring(0, tokenStart) + "|" + line.substring(tokenStart, tokenEnd) + "|" + line.substring(tokenEnd);
}

interface HistoryItem { finalized?: boolean, changes:(Change|SpanChange)[] }
interface CMEditor extends CodeMirror.Editor {
  editor?:Editor
}
class Editor {
  defaults:CodeMirror.EditorConfiguration = {
    tabSize: 2,
    lineWrapping: true,
    lineNumbers: false,
    extraKeys: ctrlify({
      "Cmd-Enter": () => this.ide.eval(true),
      "Shift-Cmd-Enter": () => this.ide.eval(false),
      "Cmd-B": () => this.format({type: "strong"}),
      "Cmd-I": () => this.format({type: "emph"}),
      "Cmd-Y": () => this.format({type: "code"}),
      "Cmd-K": () => this.format({type: "code_block"}),
      "Cmd-1": () => this.formatLine({type: "heading", level: 1}),
      "Cmd-2": () => this.formatLine({type: "heading", level: 2}),
      "Cmd-3": () => this.formatLine({type: "heading", level: 3}),
      "Cmd-L": () => this.formatLine({type: "item"})
    })
  };

  cm:CMEditor;

  /** The current editor generation. Used for imposing a relative ordering on parses. */
  generation = 0;
  /** Whether the editor is being externally updated with new content. */
  reloading = false;

  /** Formatting state for the editor at the cursor. */
  formatting:{[formatType:string]: FormatAction} = {};

  // @NOTE: Workaround for Commonmark trimming headers causing desynchronization
  // We hold off on updates until the user leaves the heading and we can renormalize
  /** Whether the cursor is currently on a heading */
  inHeading?:HeadingSpan;

  /** Whether the editor is currently processing CM change events */
  changing = false;
  /** Cache of the spans affected by the current set of changes */
  changingSpans?:Span[];

  /** Undo history state */
  history:{position:number, transitioning:boolean, items: HistoryItem[]} = {position: 0, items: [], transitioning: false};

  /** New block button element */
  protected _newBlockElem:HTMLElement;
  /** Format bar element */
  protected _formatBarElem:HTMLElement;

  constructor(public ide:IDE) {
    this._newBlockElem = Renderer.compile(newBlockBar()) as HTMLElement;
    this._formatBarElem = Renderer.compile(formatBar()) as HTMLElement;

    this.cm = CodeMirror(() => undefined, this.defaults);
    this.cm.editor = this;
    this.cm.on("beforeChange", (editor, rawChange) => this.onBeforeChange(rawChange));
    this.cm.on("change", (editor, rawChange) => this.onChange(rawChange));
    this.cm.on("changes", (editor, rawChanges) => this.onChanges(rawChanges));
    this.cm.on("cursorActivity", this.onCursorActivity);
  }

  reset() {
    this.history.position = 0;
    this.history.items = [];
    this.history.transitioning = true;
    this.reloading = true;
    this.cm.setValue("");
    for(let span of this.getAllSpans()) {
      span.clear();
    }
    this.reloading = false;
    this.history.transitioning = false;
  }

  // This is a new document and we need to rebuild it from scratch.
  loadDocument(id:string, text:string, packed:any[], attributes:{[id:string]: any|undefined}) {
    // Reset history and suppress storing the load as a history step.
    this.history.position = 0;
    this.history.items = [];
    this.history.transitioning = true;

    if(packed.length % 4 !== 0) throw new Error("Invalid span packing, unable to load.");
    this.cm.operation(() => {
      this.reloading = true;

      // this is a new document and we need to rebuild it from scratch.
      this.cm.setValue(text);
      let doc = this.cm.getDoc();

      for(let i = 0; i < packed.length; i += 4) {
        let from = doc.posFromIndex(packed[i]);
        let to = doc.posFromIndex(packed[i + 1]);
        let type = packed[i + 2];
        let id = packed[i + 3];

        //console.info(type, debugTokenWithContext(text, packed[i], packed[i + 1]));

        let source = attributes[id] || {};
        source.type = type;
        source.id = id;
        this.markSpan(from, to, source);
      }
    });
    this.reloading = false;
    this.history.transitioning = false;
    //console.log(this.toMarkdown())
  }

  // This is an update to an existing document, so we need to figure out what got added and removed.
  updateDocument(packed:any[], attributes:{[id:string]: any|undefined}) {
    if(packed.length % 4 !== 0) throw new Error("Invalid span packing, unable to load.");

    let addedDebug = [];
    let removedDebug = [];

    this.cm.operation(() => {
      this.reloading = true;
      let doc = this.cm.getDoc();

      // Find all runtime-controlled spans (e.g. syntax highlighting, errors) that are unchanged and mark them as such.
      // Unmarked spans will be swept afterwards.
      // Set editor-controlled spans aside. We'll match them up to maintain id stability afterwards
      let controlledOffsets = {};
      let touchedIds = {};
      for(let i = 0; i < packed.length; i += 4) {
        let start = packed[i];
        let type = packed[i + 2];
        if(spanTypes[type] && spanTypes[type].isEditorControlled) {
          if(!controlledOffsets[type]) controlledOffsets[type] = [i];
          else controlledOffsets[type].push(i);
        } else {
          let from = doc.posFromIndex(packed[i]);
          let to = doc.posFromIndex(packed[i + 1]);
          let type = packed[i + 2];
          let id = packed[i + 3];

          let source = attributes[id] || {};
          source.type = type;
          source.id = id;

          let spans = this.findSpansAt(from, type);
          let unchanged = false;
          for(let span of spans) {
            let loc = span.find();
            if(loc && samePosition(to, loc.to) && span.sourceEquals(source)) {
              span.source = source;
              touchedIds[span.id] = true;
              unchanged = true;
              break;
            }
          }

          if(!unchanged) {
            let span = this.markSpan(from, to, source);
            touchedIds[span.id] = true;
            addedDebug.push(span);
          }
        }
      }

      for(let type in controlledOffsets) {
        let offsets = controlledOffsets[type];
        let spans = this.getAllSpans(type as SpanType);
        if(offsets.length !== spans.length) {
          throw new Error(`The runtime may not add, remove, or move editor controlled spans of type '${type}'. Expected ${spans.length} got ${offsets.length}`);
        }
        spans.sort(compareSpans);

        for(let spanIx = 0; spanIx < spans.length; spanIx++) {
          let span = spans[spanIx];
          let offset = offsets[spanIx];

          let id = packed[offset + 3];
          span.source.id = id;
        }
      }

      // Nuke untouched spans
      for(let span of this.getAllSpans()) {
        if(spanTypes[span.type] && spanTypes[span.type].isEditorControlled) continue; // If the span is editor controlled, it's not our business.
        if(touchedIds[span.id]) continue; // If the span was added or updated, leave it be.
        removedDebug.push(span);
        span.clear();
      }
    });

    //console.log("updated:", this.getAllSpans().length, "added:", addedDebug, "removed:", removedDebug);
    this.reloading = false;
  }


  toMarkdown() {
    let cm = this.cm;
    let doc = cm.getDoc();
    let spans = this.getAllSpans();
    let fullText = cm.getValue();
    let markers:{pos: number, start?:boolean, isLine?:boolean, source:any}[] = []
    for(let span of spans) {
      let loc = span.find();
      if(!loc) continue;
      markers.push({pos: doc.indexFromPos(loc.from), start: true, isLine: span.isLine, source: span.source});
      markers.push({pos: doc.indexFromPos(loc.to), start: false, isLine: span.isLine, source: span.source});
    }
    markers.sort((a, b) => {
      let delta = a.pos - b.pos;
      if(delta !== 0) return delta;
      if(a.isLine === b.isLine) return 0;
      if(a.isLine) return -1;
      return 1;
    });

    let pos = 0;
    let pieces:string[] = [];
    for(let mark of markers) {
      if(!mark.source) continue;

      // If the cursor isn't at this mark yet, push the range between and advance the cursor.
      if(pos !== mark.pos) {
        pieces.push(fullText.substring(pos, mark.pos));
        pos = mark.pos;
      }

      // Break each known span type out into its markdown equivalent.
      let type = mark.source.type;
      if(type === "heading" && mark.start) {
        for(let ix = 0; ix < mark.source.level; ix++) {
          pieces.push("#");
        }
        pieces.push(" ");
      } else if(type === "emph") {
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
      } else if(type == "item" && mark.start && mark.source.listData.type == "bullet") {
        pieces.push("- ");
      } else if(type == "item" && mark.start && mark.source.listData.type == "ordered") {
        pieces.push(`${mark.source.listData.start}. `);
      } else if(type == "link" && mark.start) {
        pieces.push("[");
      } else if(type == "link" && !mark.start) {
        pieces.push(`](${mark.source.destination})`);
      }
    }

    // If there's any text after all the markers have been processed, glom that on.
    if(pos < fullText.length) {
      pieces.push(fullText.substring(pos));
    }

    return pieces.join("");
  }

  refresh() {
    this.cm.refresh();
  }

  queueUpdate  = () => {
    if(!this.reloading && !this.inHeading) this.ide.queueUpdate();
  }

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

  /** Create a new Span representing the given source in the document. */
  markSpan(from:Position, to:Position, source:any) {
    let SpanClass = spanTypes[source.type] || spanTypes["default"];
    let span = new SpanClass(from, to, source);
    span.applyMark(this);
    return span;
  }

  findHeadingAt(pos:Position):HeadingSpan|undefined {
    let from = {line: 0, ch: 0};
    let headings = this.findSpans(from, pos, "heading") as HeadingSpan[];
    if(!headings.length) return undefined;

    headings.sort(compareSpans);
    let next = headings[headings.length - 1];
    return next;
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
  undo = () => {
    let history = this.history;
    // We're out of undo steps.
    if(history.position === 0) return;
    this.finalizeLastHistoryEntry(); // @FIXME: wut do?
    history.position--;
    let changeSet = history.items[history.position]
    this._historyDo(changeSet, true);
  }

  redo = () => {
    let history = this.history;
    // We're out of redo steps.
    if(history.position > history.items.length - 1) return;
    let changeSet = history.items[history.position]
    history.position++;
    this._historyDo(changeSet);
  }

  protected _historyDo(changeSet:HistoryItem, invert:boolean = false) {
    this.history.transitioning = true;
    let noRangeChanges = true;
    this.cm.operation(() => {
      let doc = this.cm.getDoc();
      for(let ix = 0, len = changeSet.changes.length; ix < len; ix++) {
        let change = changeSet.changes[invert ? len - ix - 1 : ix];
        if(invert) change = change.invert();
        if(isRangeChange(change)) {
          noRangeChanges = false;
          let removedPos = doc.posFromIndex(doc.indexFromPos(change.from) + change.removedText.length);
          doc.replaceRange(change.addedText, change.from, removedPos);
        } else if(isSpanChange(change)) {
          for(let removed of change.removed) {
            removed.clear("+mdundo");
          }
          for(let added of change.added) {
            added.applyMark(this, "+mdundo");
          }
        }
      }
    });

    // Because updating the spans doesn't trigger a change, we can't rely on the changes handler to
    // clear the transitioning state for us if we don't have any range changes.
    if(noRangeChanges) {
      this.history.transitioning = false;
    }
  }

  addToHistory(change:Change|SpanChange) {
    let history = this.history;
    // Bail if we're currently doing an undo or redo
    if(history.transitioning) return;

    // Truncate the history tree to ancestors of the current state.
    // @NOTE: In a fancier implementation we could maintain branching history instead.
    if(history.items.length > history.position) {
      history.items.length = history.position;
    }
    let changeSet:HistoryItem;
    // If the last history step hasn't been finalized, we want to keep glomming onto it.
    let last = history.items[history.items.length - 1];
    if(last && !last.finalized) changeSet = last;
    else changeSet = {changes: []};

    // @FIXME: Is this check still necessary with history.transitioning?
    if(change.origin !== "+mdundo" && change.origin !== "+mdredo") {
      changeSet.changes.push(change);
    }
    // Finally add the history step to the history stack (if it's not already in there).
    if(changeSet !== last) {
      history.position++;
      history.items.push(changeSet);
    }
  }

  finalizeLastHistoryEntry() {
    let history = this.history;
    if(!history.items.length) return;
    history.items[history.items.length - 1].finalized = true;
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
    this.ide.render();
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
    this.cm.operation(() => {
      let doc = this.cm.getDoc();
      let lastLine = doc.lastLine();
      let pos = CodeMirror.Pos(lastLine + 1, 0);
      if(doc.getLine(lastLine) !== "") {
        let cursor = doc.getCursor();
        doc.replaceRange("\n", pos, pos, "+ghostLine");
        doc.setCursor(cursor);
      }
    });

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


    let cur:ChangeLinkedList|undefined = change;
    while(cur) {
      this.addToHistory(cur);
      cur = cur.next();
    }

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

    if(change.origin !== "+ghostLine") {
      for(let format in this.formatting) {
        let action = this.formatting[format];
        if(action === "add") {
          this.markSpan(change.from, change.final, {type: format});
        }
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
    let doc = this.cm.getDoc();
    let cursor = doc.getCursor();

    if(!this.changing) {
      this.finalizeLastHistoryEntry();
    }
    // Remove any formatting that may have been applied
    this.formatting = {};

    // If we were in a heading and no longer are, normalize the heading and release the lock
    // on syncing with the server.
    if(this.inHeading) {
      let heading = this.inHeading;
      let loc = heading.find();

      if(!loc) {
        this.inHeading = undefined;
        this.queueUpdate();
      } else if(cursor.line !== loc.from.line) {
        this.inHeading = undefined;
        let to = doc.posFromIndex(doc.indexFromPos({line: loc.to.line + 1, ch: 0}) - 1);
        let cur = doc.getRange(loc.from, to);
        doc.replaceRange(cur.trim(), loc.from, to, "+normalize");
        this.queueUpdate();
      }
    }

    // If we're outside of a codeblock, display our rich text controls.
    let codeBlocks = this.findSpansAt(cursor, "code_block");

    //If the cursor is at the beginning of a new line, display the new block button.
    if(!codeBlocks.length && cursor.ch === 0 && doc.getLine(cursor.line) === "") {
      this.cm.addWidget(cursor, this._newBlockElem, false);
    } else if(this._newBlockElem.parentNode) {
      this._newBlockElem.parentNode.removeChild(this._newBlockElem);
    }

    // Otherwise if there's a selection, show the format bar.
    if(!codeBlocks.length && doc.somethingSelected()) {
      this.cm.addWidget(doc.getCursor("from"), this._formatBarElem, true);
    } else if(this._formatBarElem.parentNode) {
      this._formatBarElem.parentNode.removeChild(this._formatBarElem);
    }
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
 *   - [x] BUG: Mouse left of comments-panel in icon popout causes popout to close
 *   - [ ] BUG: Display popout above instead of below when below would push it off the screen
 * - [ ] inline comments for narrow screens
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
      if(inner.offsetWidth <= 150) {
        this.rootNode.classList.add("collapse-2");
        this.rootNode.classList.remove("collapse-1");
      } else if(inner.offsetWidth <= 300) {
        this.rootNode.classList.add("collapse-1");
        this.rootNode.classList.remove("collapse-2");
      } else {
        this.rootNode.classList.remove("collapse-1", "collapse-2");
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
    this.ide.render();
  }

  closeComment = (event, {commentId}) => {
    this.active = undefined;
    this.ide.render();
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

    return {c: "comments-pane collapsed collapsed-is-hardcoded", postRender: this.wangjangle, children: [{c: "comments-pane-inner", children}]};
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
  return {id: "format-bar", c: "format-bar"};
}

//---------------------------------------------------------
// New Block
//---------------------------------------------------------

/* - Button in left margin
 * - Only appears on blank lines with editor focused
 * - Text: Block / List / Quote / H(?)
 */

function newBlockBar():Elem {
  return {id: "new-block-btn", c: "new-block-btn"};
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
  protected _fileCache:{[fileId:string]: string} = {};

  /** The id of the active document. */
  documentId?:string;
  /** Whether the active document has been loaded. */
  loaded:boolean = false;

  renderer:Renderer = new Renderer();

  navigator:Navigator = new Navigator(this);
  editor:Editor = new Editor(this);
  comments:Comments = new Comments(this, fakeComments);

  constructor( ) {
    window.addEventListener("resize", this.resize);
    document.body.appendChild(this.renderer.content);
    this.renderer.content.classList.add("ide-root");
  }

  resize = debounce(() => {
    this.comments.resizeComments();
  }, 16, true);

  elem() {
    return {c: `editor-root`, children: [
      this.navigator.render(),
      this.editor.render(),
      this.comments.render()
    ]};
  }

  render() {
    // Update child states as necessary
    this.renderer.render([this.elem()]);
  }

  queueUpdate = debounce(() => {
    this.render();
    if(this.onChange) this.onChange(this);
  }, 1, true);

  loadFile(docId:string) {
    if(this.documentId === docId) return;
    let code = this._fileCache[docId];
    if(!code) throw new Error(`Unable to load uncached file: '${docId}'`);
    this.loaded = false;
    this.documentId = docId;
    this.editor.reset();
    this.onLoadFile(this, docId, code);
  }

  loadWorkspace(directory:string, files:{[filename:string]: string}) {
    this._fileCache = files;
    this.navigator.loadWorkspace("root", directory, files);
  }

  loadDocument(generation:number, text:string, packed:any[], attributes:{[id:string]: any|undefined}) {
    if(this.loaded) {
      this.editor.updateDocument(packed, attributes);
    } else {
      this.editor.loadDocument(this.documentId, text, packed, attributes);
      this.loaded = true;
    }

    let name = this.documentId; // @FIXME
    this.navigator.loadDocument(this.documentId, name);
    this.navigator.currentId = this.documentId;

    this.render();
  }

  eval(persist?: boolean) {
    if(this.onEval) this.onEval(this, persist);
  }

  onChange?:(self:IDE) => void
  onEval?:(self:IDE, persist?: boolean) => void
  onLoadFile?:(self:IDE, documentId:string, code:string) => void
}
