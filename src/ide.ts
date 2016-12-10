import {Renderer, Element as Elem, RenderHandler} from "microReact";
import {Parser as MDParser} from "commonmark";
import * as CodeMirror from "codemirror";
import {debounce, uuid, unpad, Range, Position, isRange, compareRanges, comparePositions, samePosition, whollyEnclosed, adjustToWordBoundary, writeToGist, readFromGist} from "./util";

import {Span, SpanMarker, isSpanMarker, isEditorControlled, spanTypes, compareSpans, SpanChange, isSpanChange, HeadingSpan, CodeBlockSpan, DocumentCommentSpan} from "./ide/spans";
import * as Spans from "./ide/spans";

import {activeElements} from "./renderer";
import {client, indexes} from "./client";

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

  loadDialogOpen = false;
  loadDialogValue:string;

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
    let root:TreeNode = this.nodes[id] = {id, name, type: "folder", open: true};

    let parent = root;
    for(let curId in files) {
      let node:TreeNode = {id: curId, name: curId.split("/").pop(), type: "document"};
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
    if(!root) {
      //console.error("Cannot load non-existent document.");
      //return;

      root = this.nodes[id] = {id, type: "document", name};
    }
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
        node.hidden = span.isHidden();

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
      this.nodes[nodeId] = {id: nodeId, name: doc.getLine(loc.from.line), type: "section", level: span.source.level, span, open: true, hidden: span.isHidden()};
    }
  }

  updateElision() {
    let sections:{nodeId: string, hidden: boolean, range:Range}[] = [];

    for(let nodeId in this.nodes) {
      let node = this.nodes[nodeId];
      if(!node || node.type !== "section") continue;

      let heading = node.span as HeadingSpan;
      let range = heading.getSectionRange();
      sections.push({nodeId, hidden: node.hidden, range});
    }

    if(!sections.length) {
      // Only one source can be safely eliding at any given time.
      for(let span of this.ide.editor.getAllSpans("elision")) {
        span.clear();
      }
      return;
    }

    sections.sort((a, b) => {
      let fromDir = comparePositions(a.range.from, b.range.from);
      if(fromDir) return fromDir;
      return comparePositions(a.range.to, b.range.to);
    });

    let visibleRanges:Range[] = [];
    let currentRange:Range|undefined;
    for(let section of sections) {
      if(!section.hidden) {
        if(!currentRange) currentRange = {from: section.range.from, to: section.range.to};
        else currentRange.to = section.range.to;

      } else {
        if(currentRange) {
          if(comparePositions(section.range.from, currentRange.to) < 0) {
            currentRange.to = section.range.from;
          }
          visibleRanges.push(currentRange);
          currentRange = undefined;
        }
      }
    }

    if(currentRange) {
      visibleRanges.push(currentRange);
    }

    let editor = this.ide.editor;
    let doc = editor.cm.getDoc();
    // Capture the current topmost un-elided line in the viewport. We'll use this to maintain your scroll state (to some extent) when elisions are nuked.
    // Only one source can be safely eliding at any given time.
    let topVisible:number|undefined;
    for(let span of editor.getAllSpans("elision")) {
      let loc = span.find();
      if(loc && (!topVisible || loc.to.line < topVisible)) {
        topVisible = loc.to.line;
      }
      span.clear();
    }

    if(visibleRanges.length) {
      editor.markBetween(visibleRanges, {type: "elision"});
    } else {
      editor.markSpan({line: 0, ch: 0}, {line: doc.lineCount(), ch: 0}, {type: "elision"});
    }

    if(visibleRanges.length === 1 && topVisible) {
      let firstRange = visibleRanges[0];
      if(firstRange.from.line === 0 && firstRange.to.line >= doc.lastLine()) {
        editor.scrollToPosition({line: topVisible + 1, ch: 0});
      }
    }
  }

  isFocused() {
    return this.ide.editor.getAllSpans("elision").length;
  }

  // Event Handlers
  togglePane = (event:MouseEvent, elem) => {
    this.open = !this.open;
    this.ide.render();
    event.stopPropagation();
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

  _inheritParentElision = (nodeId: string, parentId?: string) => {
    let node = this.nodes[nodeId];
    let parent = this.nodes[parentId];
    if(!node || !parent) return;
    node.hidden = parent.hidden;
  }

  toggleElision = (event, {nodeId}) => {
    let node = this.nodes[nodeId];
    if(!node) return;
    this.ide.editor.cm.operation( () => {
      node.hidden = !node.hidden;
      this.walk(nodeId, this._inheritParentElision);
      this.updateElision();
    });

    this.ide.render();
    event.stopPropagation();
  }

  toggleInspectorFocus = () => {
    if(this.isFocused()) {
      client.sendEvent([{tag: ["inspector",  "unfocus-current"]}]);
      for(let nodeId in this.nodes) {
        let node = this.nodes[nodeId];
        if(!node) continue;
        if(node.hidden) node.hidden = false;
      }
      this.updateElision();
    } else {
      client.sendEvent([{tag: ["inspector",  "focus-current"]}]);
    }
  }

  createDocument = (event:MouseEvent, {nodeId}) => {
    // @FIXME: This needs to be keyed off nodeId, not name for multi-level workspaces.
    // Top level node id is currently hardwired for what I imagine seemed like a good reason at the time.
    let node = this.nodes[nodeId];
    if(!node) return;
    this.ide.createDocument(node.name);
    node.name
  }

  openLoadDialog = () => {
    this.loadDialogOpen = true;
    this.ide.render();
  }

  loadDialogInput = (event) => {
    let input = event.target as HTMLInputElement;
    this.loadDialogValue = input.value;
  }

  loadFromDialog = (event) => {
    if(event instanceof KeyboardEvent) {
      if(event.keyCode === 27) { // Escape
        this.loadDialogValue = undefined;
        this.loadDialogOpen = false;
        this.ide.render();
      }
      if(event.keyCode !== 13) return; // Enter
    }
    this.ide.loadFromGist(this.loadDialogValue);
    this.loadDialogValue = undefined;
    this.loadDialogOpen = false;
    this.ide.render();
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
          subtree ? {c: "new-btn ion-ios-plus-empty", nodeId, click: this.createDocument} : undefined,
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

    if(node.type === "document") {
      return {c: `tree-item ${nodeId === this.rootId ? "root" : ""} ${node.type}`, nodeId, children: [
      subtree
    ]};
    }

    return {c: `tree-item ${subtree ? "branch" : "leaf"} ${nodeId === this.rootId ? "root" : ""} ${node.type}  item-level-${node.level} ${subtree && !node.open ? "collapsed" : ""} ${node.hidden ? "hidden" : ""}`, nodeId, children: [
      {c: "flex-row", children: [
        {c: `label ${subtree && !node.level ? "ion-ios-arrow-down" : "no-icon"}`, text: node.name, nodeId, click: node.span ? this.gotoSpan : undefined}, // icon should be :before
        {c: "controls", children: [
          {c: `elide-btn ${node.hidden ? "ion-android-checkbox-outline-blank" : "ion-android-checkbox-outline"}`, nodeId, click: this.toggleElision},
        ]}
      ]},
      subtree
    ]};
  }

  inspectorControls():Elem {
    return {c: "inspector-controls", children: [
      {t: "button", c: "inspector-hide", text: this.isFocused() ? "Show all" : "Filter to selected", click: this.toggleInspectorFocus}
    ]};
  }

  header():Elem {
    let type = this.currentType();
    return {c: "navigator-header", children: [
      {c: "controls", children: [
        this.open ? {c: `up-btn flex-row  ${(this.currentId === this.rootId) ? "disabled" : ""}`, click: this.navigate, children: [
          {c:  "up-icon ion-android-arrow-up"},
          {c: "label", text: "examples"}
        ]} : undefined,
        {c: "flex-spacer"},

        this.open ? {c: "ion-ios-cloud-upload-outline btn", title: "Save to Gist", click: () => this.ide.saveToGist()} : undefined,
        this.open ? {c: "ion-ios-cloud-download-outline btn", title: "Load from Gist", click: this.openLoadDialog} : undefined,

        {c: `${this.open ? "expand-btn" : "collapse-btn"} ion-ios-arrow-back btn`, title: this.open ? "Expand" : "Collapse", click: this.togglePane},
      ]},
      this.ide.inspecting ? this.inspectorControls() : {c: "inspector-controls"},
    ]};
  }

  loadDialog():Elem {
    return {c: "load-dialog flex-row", children: [
      {t: "input", c: "flex-spacer", type: "url", autofocus: true, placeholder: "Enter gist url to load...", input: this.loadDialogInput, keydown: this.loadFromDialog},
      {c: "btn load-btn ion-arrow-right-b", style: "padding: 0 10", click: this.loadFromDialog}
    ]};
  }

  render():Elem {
    let nodeId = this.currentId;
    let root = this.nodes[nodeId];
    if(!root) return {c: "navigator-pane", children: [
      {c: "navigator-pane-inner", children: [
        this.header(),
        this.loadDialogOpen ? this.loadDialog() : undefined,
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
        this.loadDialogOpen ? this.loadDialog() : undefined,
        tree
      ]}
    ]};
  }
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

type FormatType = "strong"|"emph"|"code"|"code_block";
type FormatLineType = "heading"|"item"|"elision";
type FormatAction = "add"|"remove"|"split";

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

export class Change implements CodeMirror.EditorChange {
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


export class ChangeCancellable extends Change {
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
export class Editor {
  defaults:CodeMirror.EditorConfiguration = {
    scrollPastEnd: true,
    scrollbarStyle: "simple",
    tabSize: 2,
    lineWrapping: true,
    lineNumbers: false,
    extraKeys: ctrlify({
      "Cmd-Enter": () => this.ide.eval(true),
      "Shift-Cmd-Enter": () => this.ide.eval(false),
      "Alt-Enter": () => this.ide.tokenInfo(),
      "Cmd-B": () => this.format({type: "strong"}),
      "Cmd-I": () => this.format({type: "emph"}),
      "Cmd-Y": () => this.format({type: "code"}),
      "Cmd-K": () => this.format({type: "code_block"}),
      "Cmd-1": () => this.format({type: "heading", level: 1}),
      "Cmd-2": () => this.format({type: "heading", level: 2}),
      "Cmd-3": () => this.format({type: "heading", level: 3}),
      "Cmd-L": () => this.format({type: "item"}),
      "Tab": (cm) => {
        if (cm.somethingSelected()) {
          cm.indentSelection("add");
        } else {
          cm.replaceSelection(cm.getOption("indentWithTabs")? "\t":
          Array(cm.getOption("indentUnit") + 1).join(" "), "end", "+input");
        }
      }
    })
  };

  cm:CMEditor;

  /** Whether the editor has changed since the last update. */
  dirty = false;

  /** Whether the editor is being externally updated with new content. */
  reloading = false;

  /** Formatting state for the editor at the cursor. */
  formatting:{[formatType:string]: FormatAction} = {};

  /** Whether the editor is currently processing CM change events */
  changing = false;
  /** Cache of the spans affected by the current set of changes */
  changingSpans?:Span[];
  /** Cache of spans currently in a denormalized state. So long as this is non-empty, the editor may not sync with the language service. */
  denormalizedSpans:Span[] = [];

  /** Undo history state */
  history:{position:number, transitioning:boolean, items: HistoryItem[]} = {position: 0, items: [], transitioning: false};

  /** Whether to show the new block button at the cursor. */
  protected showNewBlockBar = false;
  protected newBlockBar:EditorBarElem;

  /** Whether to show the format bar at the cursor. */
  protected showFormatBar = false;

  constructor(public ide:IDE) {
    this.cm = CodeMirror(() => undefined, this.defaults);
    this.cm.editor = this;
    this.cm.on("beforeChange", (editor, rawChange) => this.onBeforeChange(rawChange));
    this.cm.on("change", (editor, rawChange) => this.onChange(rawChange));
    this.cm.on("changes", (editor, rawChanges) => this.onChanges(rawChanges));
    this.cm.on("cursorActivity", this.onCursorActivity);
    this.cm.on("scroll", this.onScroll);

    this.newBlockBar = {editor: this, active: false};
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
    this.dirty = false;
  }

  // This is an update to an existing document, so we need to figure out what got added and removed.
  updateDocument(packed:any[], attributes:{[id:string]: any|undefined}) {
    if(packed.length % 4 !== 0) throw new Error("Invalid span packing, unable to load.");

    let addedDebug = [];
    let removedDebug = [];

    this.cm.operation(() => {
      this.reloading = true;
      let doc = this.cm.getDoc();

      let cursorLine = doc.getCursor().line;

      // Find all runtime-controlled spans (e.g. syntax highlighting, errors) that are unchanged and mark them as such.
      // Unmarked spans will be swept afterwards.
      // Set editor-controlled spans aside. We'll match them up to maintain id stability afterwards
      let controlledOffsets = {};
      let touchedIds = {};
      for(let i = 0; i < packed.length; i += 4) {
        // if(isEditorControlled(packed[i + 2]))
        //   console.info(packed[i + 2], debugTokenWithContext(doc.getValue(), packed[i], packed[i + 1]));


        let start = packed[i];
        let type = packed[i + 2];
        if(isEditorControlled(type)) {
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
          if(type === "document_comment") {
            source.delay = 1000;
          }

          let spans = this.findSpansAt(from, type);
          let unchanged = false;
          for(let span of spans) {
            let loc = span.find();
            if(loc && samePosition(to, loc.to) && span.sourceEquals(source)) {
              span.source = source;
              if(span.refresh) span.refresh();
              if(type === "document_comment") {
                (span as any).updateWidget();
              }
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
        let spans = this.getAllSpans(type);
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
        if(span.isEditorControlled()) continue; // If the span is editor controlled, it's not our business.
        if(touchedIds[span.id]) continue; // If the span was added or updated, leave it be.
        removedDebug.push(span);
        span.clear();
      }
    });

    //console.log("updated:", this.getAllSpans().length, "added:", addedDebug, "removed:", removedDebug);
    this.reloading = false;
  }

    // This is an update to an existing document, so we need to figure out what got added and removed.
  injectSpans(packed:any[], attributes:{[id:string]: any|undefined}) {
    if(packed.length % 4 !== 0) throw new Error("Invalid span packing, unable to load.");

    this.cm.operation(() => {
      this.reloading = true;
      let doc = this.cm.getDoc();

      let controlledOffsets = {};
      let touchedIds = {};
      for(let i = 0; i < packed.length; i += 4) {
        if(isEditorControlled(packed[i + 2]))
          console.info(packed[i + 2], debugTokenWithContext(doc.getValue(), packed[i], packed[i + 1]));

        let start = packed[i];
        let type = packed[i + 2];
        if(isEditorControlled(type)) {
          throw new Error(`The parser may not inject editor controlled spans of type '${type}'`);
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
              if(span.refresh) span.refresh();
              unchanged = true;
              break;
            }
          }

          if(!unchanged) {
            let span = this.markSpan(from, to, source);
          }
        }
      }
    });

    this.reloading = false;
  }

  toMarkdown() {
    let cm = this.cm;
    let doc = cm.getDoc();
    let spans = this.getAllSpans();
    let fullText = cm.getValue();
    let markers:{pos: number, start?:boolean, isBlock?:boolean, isLine?:boolean, source:any, span?:Span}[] = [];
    for(let span of spans) {
      let loc = span.find();
      if(!loc) continue;
      markers.push({pos: doc.indexFromPos(loc.from), start: true, isBlock: span.isBlock(), isLine: span.isLine(), source: span.source, span});
      markers.push({pos: doc.indexFromPos(loc.to), start: false, isBlock: span.isBlock(), isLine: span.isLine(), source: span.source, span});
    }
    markers.sort((a, b) => {
      let delta = a.pos - b.pos;
      if(delta !== 0) return delta;
      if(a.isBlock && !b.isBlock) return -1;
      if(b.isBlock && !a.isBlock) return 1;
      if(a.isLine && !b.isLine) return -1;
      if(b.isLine && !a.isLine) return 1;
      if(a.start && !b.start) return 1;
      if(b.start && !a.start) return -1;
      if(a.source.type === b.source.type) return 0;
      else if(a.source.type === "link") return a.start ? 1 : -1;
      else if(b.source.type === "link") return b.start ? -1 : 1;
      return 0;
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
      } else if(type == "link" && !mark.start) {
        pieces.push(`](${mark.source.destination})`);
      } else if(type === "emph") {
        pieces.push("*");
      } else if(type == "strong") {
        pieces.push("**");
      } else if(type == "code") {
        pieces.push("`");
      } else if(type == "code_block" && mark.start) {
        pieces.push("```" + (mark.source.info || "") + "\n");

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

  queueUpdate = debounce((shouldEval = false) => {
    if(!this.reloading && this.denormalizedSpans.length === 0) this.ide.queueUpdate(shouldEval);
  }, 0);

  jumpTo(id:string) {
    for(let span of this.getAllSpans()) {
      if(span.source.id === id) {
        let loc = span.find();
        if(!loc) break;
        this.cm.scrollIntoView(loc, 20);
        break;
      }
    }
  }

  scrollToPosition(position:Position) {
    let top = this.cm.cursorCoords(position, "local").top;
    this.cm.scrollTo(0, Math.max(top - 100, 0));
  }

  //-------------------------------------------------------
  // Spans
  //-------------------------------------------------------

  getSpanBySourceId(id:string):Span|undefined {
    for(let span of this.getAllSpans()) {
      if(span.source.id === id) return span;
    }
  }

  getAllSpans(type?:string):Span[] {
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

  findSpans(start:Position, stop:Position, type?:string):Span[] {
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

  findSpansAt(pos:Position, type?:string):Span[] {
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
    let SpanClass:(typeof Span) = spanTypes[source.type] || spanTypes["default"];
    let span = new SpanClass(this, from, to, source);
    return span;
  }

  /** Create new Spans wrapping the text between each given span id or range. */
  markBetween(idsOrRanges:(string[]|Range[]), source:any, bounds?:Range): Span[] {
    return this.cm.operation(() => {
      if(!idsOrRanges.length) return [];
      let ranges:Range[];

      if(typeof idsOrRanges[0] === "string") {
        let ids:string[] = idsOrRanges as string[];
        ranges = [];
        let spans:Span[];
        if(bounds) {
          spans = this.findSpansAt(bounds.from).concat(this.findSpans(bounds.from, bounds.to));
        } else {
          spans = this.getAllSpans();
        }
        for(let span of spans) {
          if(ids.indexOf(span.source.id) !== -1) {
            let loc = span.find();
            if(!loc) continue;
            if(span.isLine()) {
              loc = {from: loc.from, to: {line: loc.from.line + 1, ch: 0}};
            }
            ranges.push(loc);
          }
        }
      } else {
        ranges = idsOrRanges as Range[];
      }

      if(!ranges.length) return;

      let doc = this.cm.getDoc();
      ranges.sort(compareRanges);

      let createdSpans:Span[] = [];

      let start = bounds && bounds.from || {line: 0, ch: 0};
      for(let range of ranges) {
        let from = doc.posFromIndex(doc.indexFromPos(range.from) - 1);
        if(comparePositions(start, from) < 0) {
          createdSpans.push(this.markSpan(start, {line: from.line,  ch: 0}, source));
        }

        start = doc.posFromIndex(doc.indexFromPos(range.to) + 1);
      }

      let last = ranges[ranges.length - 1];
      let to = doc.posFromIndex(doc.indexFromPos(last.to) + 1);
      let end = bounds && bounds.to || doc.posFromIndex(doc.getValue().length);
      if(comparePositions(to, end) < 0) {
        createdSpans.push(this.markSpan(to, end, source));
      }

      for(let range of ranges) {
        for(let span of this.findSpans(range.from, range.to)) {
          span.unhide();
          if(span.refresh) span.refresh();

        }
      }
      this.queueUpdate();
      return createdSpans;
    });
  }

  clearSpans(type: string, bounds?:Range) {
    this.cm.operation(() => {
      let spans:Span[];
      if(bounds) spans = this.findSpans(bounds.from, bounds.to, type);
      else spans = this.getAllSpans(type);

      for(let span of spans) {
        span.clear();
      }
    });
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

  inCodeBlock(pos:Position) {
    let inCodeBlock = false;
    for(let span of this.getAllSpans("code_block")) {
      let loc = span.find();
      if(!loc) continue;
      if(loc.from.line <= pos.line && comparePositions(loc.to, pos) > 0) {
        return true;
      }
    }
  }

  /** Create a new span representing the given source, collapsing and splitting existing spans as required to maintain invariants. */
  formatSpan(from:Position, to:Position, source:any):Span[] {
    let selection = {from, to};

    let spans = this.findSpans(from, to, source.type);
    let formatted = false;
    let neue:Span[] = [];
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
        if(!samePosition(loc.from, from)) neue.push(this.markSpan(loc.from, from, source));
        if(!samePosition(to, loc.to)) neue.push(this.markSpan(to, loc.to, source));
        span.clear();
        formatted = true;

        // If the formatted range intersects the end of a span of the same type, clear the intersection.
      } else if(comparePositions(loc.to, from) > 0) {
        neue.push(this.markSpan(loc.from, from, source));
        span.clear();

        // If the formatted range intersects the start of a span of the same type, clear the intersection.
      } else if(comparePositions(loc.from, to) < 0) {
        neue.push(this.markSpan(to, loc.to, source));
        span.clear();
      }
    }

    // If we haven't already formatted by removing existing span(s) then we should create a new span
    if(!formatted) {
      neue.push(this.markSpan(from, to, source));
    }

    for(let span of neue) {
      this.trackDenormalized(span);
    }

    return neue;
  }

  format(source:{type:string, level?: number, listData?: {type:"ordered"|"bullet", start?: number}}, refocus = false) {
    let SpanClass:(typeof Span) = spanTypes[source.type] || spanTypes["default"];

    let style = SpanClass.style();
    if(style === "inline") {
      this.formatInline(source);

    } else if(style === "line") {
      this.formatLine(source);

    } else if(style === "block") {
      this.formatBlock(source);
    }

    if(refocus) this.cm.focus();
    this.newBlockBar.active = false;

    this.queueUpdate();
  }

  formatInline(source:{type:string}) {
    this.finalizeLastHistoryEntry();
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      let from = doc.getCursor("from");
      from = {line: from.line, ch: adjustToWordBoundary(from.ch, doc.getLine(from.line), "left")};

      // If we have a selection, format it, expanded to the nearest word boundaries.
      // Or, if we're currently in a word, format the word.
      if(doc.somethingSelected() || from.ch !== doc.getCursor("from").ch) {
        let to = doc.getCursor("to");
        to = {line: to.line, ch: adjustToWordBoundary(to.ch, doc.getLine(to.line), "right")};

        // No editor-controlled span may be created within a codeblock.
        // @NOTE: This feels like a minor layor violation.
        if(from.line !== to.line && this.findSpans(from, to, "code_block").length || this.findSpansAt(from, "code_block").length) return;

        this.formatSpan(from, to, source)

        // Otherwise we want to change our current formatting state.
      } else {
        let action:FormatAction = "add"; // By default, we just want our following changes to be bold
        let cursor = doc.getCursor("from");

        let spans = this.findSpansAt(cursor);
        for(let span of spans) {
          if(!span.isInline()) continue;
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

  formatLine(source:{type:string, level?:number, listData?: {type:"ordered"|"bullet", start?: number}}) {
    this.finalizeLastHistoryEntry();
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      let from = doc.getCursor("from");
      let to = doc.getCursor("to");

      // No editor-controlled span may be created within a codeblock.
      // @NOTE: This feels like a minor layor violation.
      if(from.line !== to.line && this.findSpans(from, to, "code_block").length || this.findSpansAt(from, "code_block").length) return;

      let existing:Span[] = [];
      let formatted = false;
      for(let line = from.line, end = to.line; line <= end; line++) {
        let cur = {line, ch: 0};

        // Line formats are exclusive, so we clear intersecting line spans of other types.
        let spans = this.findSpansAt(cur);
        for(let span of spans) {
          if(span.isLine() && span.source.type !== source.type) {
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

  formatBlock(source:{type:string}) {
    this.finalizeLastHistoryEntry();
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      let from = {line: doc.getCursor("from").line, ch: 0};
      let to = {line: doc.getCursor("to").line + 1, ch: 0};

      if(doc.getLine(to.line) !== "") {
        let cursor = doc.getCursor();
        doc.replaceRange("\n", to, to, "+normalize");
        doc.setCursor(cursor);
      }

      // Determine if a block span in this range already exists.
      let exists:Span|undefined;
      let existing = this.findSpansAt(from, source.type);
      for(let span of existing) {
        let loc = span.find();
        if(!loc) continue;
        exists = span;
        break;
      }

      // If the span already exists, we mean to clear it.
      if(exists) {
        exists.clear();

        // We're creating a new span.
      } else {

        // Block formats are exclusive, so we clear intersecting spans of other types.
        let spans = this.findSpans(doc.posFromIndex(doc.indexFromPos(from) - 1), to);
        for(let span of spans) {
          if(span.isEditorControlled()) {
            span.clear();
          }
        }

        this.formatSpan(from, to, source);
      }
    });
  }

  trackDenormalized(span:Span) {
    if(span.isDenormalized) {
      let denormalized = span.isDenormalized();
      let existingIx = this.denormalizedSpans.indexOf(span);
      if(denormalized && existingIx === -1) {
        this.denormalizedSpans.push(span);
      } else if(!denormalized && existingIx !== -1) {
        this.denormalizedSpans.splice(existingIx, 1);
      }
    }
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
            removed.span.clear("+mdundo");
          }
          for(let added of change.added) {
            added.span.apply(added.from, added.to, "+mdundo");
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
    this.dirty = true;
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
        if(maybeLineSpan.isLine() && spans.indexOf(maybeLineSpan) === -1) {
          spans.push(maybeLineSpan);
        }
      }
    }

    for(let span of spans) {
      let loc = span.find();
      if(!loc) {
        span.clear();
        return;
      }

      if(span.onBeforeChange) {
        span.onBeforeChange(change);
      }

      // If we clear the span lazily, we can't capture it's position for undo/redo
      if(span.isInline() && comparePositions(change.from, loc.from) <= 0 && comparePositions(change.to, loc.to) >= 0) {
        span.clear(change.origin);
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
    let doc = this.cm.getDoc();
    this.cm.operation(() => {
      let lastLine = doc.lastLine();
      let pos = CodeMirror.Pos(lastLine + 1, 0);
      if(doc.getLine(lastLine) !== "") {
        let cursor = doc.getCursor();
        doc.replaceRange("\n", pos, pos, "+normalize");
        doc.setCursor(cursor);
      }
    });

    let change = new ChangeLinkedList(raw);
    let spans = this.changingSpans || [];
    if(change.origin === "+mdredo" || change.origin === "+mdundo") {
      for(let span of spans) {
        if(span.refresh) span.refresh();
      }
      return;
    }

    // Collapse multiline changes into their own undo step
    if(change.text.length > 1) this.finalizeLastHistoryEntry();


    let cur:ChangeLinkedList|undefined = change;
    let affectedLines = {};
    while(cur) {
      affectedLines[cur.from.line] = true;
      affectedLines[cur.to.line] = true;
      affectedLines[cur.final.line] = true;

      this.addToHistory(cur);
      cur = cur.next();
    }
    for(let l in affectedLines) {
      let line = +l;
      let text = doc.getLine(line);
      if(!text) continue;
      let pos = {line, ch: 0};
      if((text[0] === " " || text[text.length - 1] === " ") && !this.inCodeBlock(pos)) {
        let handled = false;
        for(let span of this.findSpansAt(pos)) {
          if(span.isLine()) {
            handled = true;
            break;
          }
        }
        if(!handled) {
          let span = this.markSpan(pos, pos, {type: "whitespace"});
          this.denormalizedSpans.push(span);
        }
      }
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

    for(let span of spans) {
      this.trackDenormalized(span);
    }

    if(change.origin !== "+normalize") {
      for(let format in this.formatting) {
        let action = this.formatting[format];
        if(action === "add") {
          let span = this.markSpan(change.from, change.final, {type: format});
          this.trackDenormalized(span);
        }
      }
    }

    // We need to refresh in on change because line measurement information will get cached by CM before we hit onChanges.
    // If we see lots of slowness when typing, this is a probable culprit and we can get smarter about this.
    if(change.isNewlineChange()) {
      for(let span of this.changingSpans) {
        if(span.refresh) span.refresh();
      }
    }
  }

  onChanges = (raws:CodeMirror.EditorChangeLinkedList[]) => {
    if(this.changingSpans) {
      for(let span of this.changingSpans) {
        if(span.refresh) span.refresh();
      }
    }
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

    // If any spans are currently denormalized, attempt to normalize them if they're not currently being edited.
    if(this.denormalizedSpans.length) {
      console.log("Denormalized:", this.denormalizedSpans.length);
      for(let ix = 0; ix < this.denormalizedSpans.length;) {
        let span = this.denormalizedSpans[ix];
        let loc = span.find();
        if(!loc) span.clear();

        // If the span is Inline or Block and our cursor is before or after it, we're clear to normalize.
        else if((span.isInline() || span.isBlock()) &&
                (comparePositions(cursor, loc.from) < 0 || comparePositions(cursor, loc.to) > 0)) {
          span.normalize()

          // If the span is a Line and our cursor is on a different line, we're clear to normalize.
        } else if(span.isLine() && cursor.line !== loc.from.line) {
          span.normalize();

          // Otherwise the span remains denormalized.
        } else {
          ix++;
          continue;
        }

        console.log("- normalized", span);
        if(this.denormalizedSpans.length > 1) {
          this.denormalizedSpans[ix] = this.denormalizedSpans.pop();
        } else {
          this.denormalizedSpans.pop();
        }
      }

      // If everybody is normalized now, we can queue an update to resync immediately.
      if(!this.denormalizedSpans.length) {
        this.queueUpdate();
      }
    }

    this.updateFormatters();
  }

  onScroll = () => {
    this.updateFormatters();
  }

  updateFormatters = debounce(() => {
    let doc = this.cm.getDoc();
    let cursor = doc.getCursor();

    // If we're outside of a codeblock, display our rich text controls.
    let codeBlocks = this.findSpansAt(cursor, "code_block");

    //If the cursor is at the beginning of a new line, display the new block button.
    let old = this.showNewBlockBar;
    this.showNewBlockBar = (!codeBlocks.length &&
                            cursor.ch === 0 &&
                            doc.getLine(cursor.line) === "");

    if(this.showNewBlockBar !== old) {
      this.newBlockBar.active = false;
      this.queueUpdate();
    } if(this.showNewBlockBar) {
      this.queueUpdate();
    }

    // Otherwise if there's a selection, show the format bar.
    let inputState = this.ide.inputState;
    let modifyingSelection = inputState.mouse["1"] || inputState.keyboard.shift;
    codeBlocks = this.findSpans(doc.getCursor("from"), doc.getCursor("to"), "code_block");

    old = this.showFormatBar;
    this.showFormatBar = (!modifyingSelection && !codeBlocks.length && doc.somethingSelected());
    if(this.showFormatBar !== old || this.showFormatBar) this.queueUpdate();
  }, 30);

  // Elements

  // @NOTE: Does this belong in the IDE?
  controls() {
    let inspectorButton:Elem = {c: "inspector-button ion-wand", text: "", title: "Inspect", click: () => this.ide.toggleInspecting()};
    if(this.ide.inspectingClick) inspectorButton.c += " waiting";
    else if(this.ide.inspecting) inspectorButton.c += " inspecting";

    return {c: "flex-row controls", children: [
      {c: "ion-refresh", title: "Reset (⌃⇧⏎ or ⇧⌘⏎ )", click: () => this.ide.eval(false)},
      {c: "ion-ios-play", title: "Run (⌃⏎ or ⌘⏎)", click: () => this.ide.eval(true)},
      inspectorButton
    ]};
  }

  render() {
    return {c: "editor-pane",  postRender: this.injectCodeMirror, children: [
      this.controls(),
      this.showNewBlockBar ? newBlockBar(this.newBlockBar) : undefined,
      this.showFormatBar ? formatBar({editor: this}) : undefined
    ]};
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
  comments:{[id:string]: DocumentCommentSpan} = {};
  ordered:string[];

  active?:string;
  rootNode?:HTMLElement;
  _currentWidth?:number;

  constructor(public ide:IDE) {
    this.update();
  }

  collapsed() {
    return this._currentWidth <= 300;
  }

  update() {
    let touchedIds = {};
    for(let span of this.ide.editor.getAllSpans("document_comment") as DocumentCommentSpan[]) {
      let commentId = span.id;
      touchedIds[commentId] = true;
      if(this.comments[commentId]) continue;
      this.comments[commentId] = span;
    }

    for(let commentId in this.comments) {
      if(!touchedIds[commentId]) {
        this.comments[commentId].clear();
        delete this.comments[commentId];
      }
    }

    this.ordered = Object.keys(this.comments);
    this.ordered.sort((a, b) => compareSpans(this.comments[a], this.comments[b]));
  }

  highlight = (event:MouseEvent, {commentId}) => {
    let comment = this.comments[commentId];
    this.active = commentId;
    let loc = comment.find();
    if(!loc) return;

    // @TODO: Separate highlighted span
  }

  unhighlight = (event:MouseEvent, {commentId}) => {
    let comment = this.comments[commentId];
    this.active = undefined;
    let loc = comment.find();
    if(!loc) return;

    // @TODO: Remove separate highlighted span.
  }

  goTo = (event, {commentId}) => {
    let comment = this.comments[commentId];
    let cm = this.ide.editor.cm;
    let loc = comment.find();
    if(!loc) return;
    cm.scrollIntoView(loc, 20);
  }

  openComment = (event, {commentId}) => {
    this.active = commentId;
    this.ide.render();
  }

  closeComment = (event, {commentId}) => {
    this.active = undefined;
    this.ide.render();
  }

  inject = (node:HTMLElement, elem:Elem) => {
    let {commentId} = elem;
    let comment = this.comments[commentId];

    if(comment.commentElem) {
      comment.commentElem.appendChild(node);
    }
  }

  comment(commentId:string):Elem {
    let comment = this.comments[commentId];
    if(!comment) return;
    let actions:Elem[] = [];

    return {
      c: `comment ${comment.kind}`, commentId, dirty: true,
      postRender: this.inject,
      mouseover: this.highlight, mouseleave: this.unhighlight, click: this.goTo,
      children: [
        {c: "comment-inner", children: [
          comment.message ? {c: "message", text: comment.message} : undefined,
          actions.length ? {c: "quick-actions", children: actions} : undefined,
        ]}
      ]};
  }

  render():Elem { // @FIXME: I'm here, just hidden by CodeMirror and CM scroll
    let children:Elem[] = [];
    for(let commentId of this.ordered) {
      children.push(this.comment(commentId));
    }
    return {c: "comments-pane", children};
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

interface EditorBarElem extends Elem { editor: Editor, active?: boolean }

function formatBar({editor}:EditorBarElem):Elem {
  let doc = editor.cm.getDoc();
  let cursor = doc.getCursor("to");
  let bottom = editor.cm.cursorCoords(cursor, undefined).bottom;
  let left = editor.cm.cursorCoords(cursor, "local").left;

  return {id: "format-bar", c: "format-bar", top: bottom, left: left, children: [
    {text: "B", click: () => editor.format({type: "strong"}, true)},
    {text: "I", click: () => editor.format({type: "emph"}, true)},
    {text: "code", click: () => editor.format({type: "code"}, true)},
    {text: "H1", click: () => editor.format({type: "heading", level: 1}, true)},
    {text: "H2", click: () => editor.format({type: "heading", level: 2}, true)},
    {text: "H3", click: () => editor.format({type: "heading", level: 3}, true)},
    {text: "block", click: () => editor.format({type: "code_block"}, true)},
  ]};
}

//---------------------------------------------------------
// New Block
//---------------------------------------------------------

/* - Button in left margin
 * - Only appears on blank lines with editor focused
 * - Text: Block / List / Quote / H(?)
 */

function newBlockBar(elem:EditorBarElem):Elem {
  let {editor, active} = elem;
  let doc = editor.cm.getDoc();
  let cursor = doc.getCursor();
  let top = editor.cm.cursorCoords(cursor, undefined).top;
  let left = 0;

  return {id: "new-block-bar", c: `new-block-bar ${active ? "active" : ""}`, top, left, children: [
    {c: "new-block-bar-toggle ion-plus", click: () => {
      elem.active = !elem.active;
      editor.cm.focus();
      editor.queueUpdate();
    }},
    {c: "flex-row controls", children: [
      {text: "block", click: () => editor.format({type: "code_block"}, true)},
      {text: "list", click: () => editor.format({type: "item"}, true)},
      {text: "H1", click: () => editor.format({type: "heading", level: 1}, true)},
      {text: "H2", click: () => editor.format({type: "heading", level: 2}, true)},
      {text: "H3", click: () => editor.format({type: "heading", level: 3}, true)}
    ]}
  ]};
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

type ElemGen = () => Elem;

//---------------------------------------------------------
// Root
//---------------------------------------------------------

export class IDE {
  protected _fileCache:{[fileId:string]: string} = {};

  /** The id of the active document. */
  documentId?:string;
  /** Whether the active document has been loaded. */
  loaded = false;
  /** Whether the IDE is currently loading a new document. */
  loading = false;

  /** When attempting to overwrite an existing document with a new one, the ID of the document to overwrite. */
  overwriteId:string;

  /** The current editor generation. Used for imposing a relative ordering on parses. */
  generation = 0;
  /** Whether the currently open document is a modified version of an example. */
  modified = false;
  /** Whether or not files are stored and operated on purely locally */
  local = false;

  /** Whether the inspector is currently active. */
  inspecting = false;

  /** Whether the next click should be an inspector click automatically (as opposed to requiring Cmd or Ctrl modifiers. */
  inspectingClick = false;

  renderer:Renderer = new Renderer();

  notices:{message: string|ElemGen, type: string, time: number}[] = [];

  languageService:LanguageService = new LanguageService();
  navigator:Navigator = new Navigator(this);
  editor:Editor = new Editor(this);
  comments:Comments = new Comments(this);

  constructor( ) {
    document.body.appendChild(this.renderer.content);
    this.renderer.content.classList.add("ide-root");

    this.enableInspector();
    this.monitorInputState();
  }

  elem() {
    return {c: `editor-root`, children: [
      this.navigator.render(),
      {c: "main-pane", children: [
        this.noticesElem(),
        this.editor.render(),
        this.overwriteId ? this.overwritePrompt() : undefined,
      ]},
      this.comments.render()
    ]};
  }

  noticesElem() {
    let items = [];
    for(let notice of this.notices) {
      let time = new Date(notice.time);
      let formattedMinutes = time.getMinutes() >= 10 ? time.getMinutes() : `0${time.getMinutes()}`;
      let formattedSeconds = time.getSeconds() >= 10 ? time.getMinutes() : `0${time.getSeconds()}`;
      items.push({c: `notice ${notice.type} flex-row`, children: [
        {c: "time", text: `${time.getHours()}:${formattedMinutes}:${formattedSeconds}`},
        {c: "message", children: [(typeof notice.message === "function") ? notice.message() : {text: notice.message}]},
        {c: "flex-spacer"},
        {c: "dismiss-btn ion-close-round", notice, click: (event, elem) => this.dismissNotice(elem.notice)}
      ]});
    }
    if(items.length) {
      return {c: "notices", children: items};
    }
  }

  overwritePrompt():Elem {
    return {c: "modal-overlay", children: [
      {c: "modal-window", children: [
        {t: "h3", text: "Overwrite existing copy?"},
        {c: "flex-row controls", children: [
          {c: "btn load-btn", text: "load existing", click: this.loadExisting},
          {c: "btn danger overwrite-btn", text: "overwrite", click: this.overwriteDocument},
        ]}
      ]}
    ]};
  }

  loadExisting = () => {
    let id = this.overwriteId;
    this.overwriteId = undefined;
    this.loadFile(id);
    this.render();
  }

  overwriteDocument = () => {
    let id = this.overwriteId;
    this.overwriteId = undefined;
    this.cloneDocument(id);
    this.render();
  }

  promptOverwrite(neueId:string) {
    this.overwriteId = neueId;
    this.render();
  }

  render() {
    // Update child states as necessary
    this.renderer.render([this.elem()]);
  }

  queueUpdate = debounce((shouldEval = false) => {
    if(this.editor.dirty) {
      this.generation++;
      if(this.onChange) this.onChange(this);
      this.editor.dirty = false;

      client.sendEvent([{tag: ["inspector", "clear"]}]);
      this.saveDocument();

      if(shouldEval) {
        if(this.documentId === "quickstart.eve") {
          this.eval(false);
        } else {
          this.eval(true);
        }
      }
    }
    this.render();
  }, 1, true);

  loadFile(docId:string, content?:string) {
    if(!docId) return false;
    if(docId === this.documentId) return false;

    // We're loading from a remote gist
    if(docId.indexOf("gist:") === 0 && !content) {
      let gistId = docId.slice(5);
      if(gistId.indexOf("-") !== -1) gistId = gistId.slice(0, gistId.indexOf("-"));
      let gistUrl = `https://gist.githubusercontent.com/raw/${gistId}`;
      this.loadFromGist(gistUrl);
      return true;
    }

    if(content !== undefined) {
      // @FIXME: It's bad. I know. It will be better when I can swap it all out for the global FileStore guy. I promise.
      // If we're running locally, we may need to ignore the content the server sends us, since our local content is fresher.
      if(this.local && this._fileCache[docId]) {
        content = this._fileCache[docId];
      }
      this.documentId = docId;
      this._fileCache[docId] = content;
      this.editor.reset();
      this.notices = [];
      this.loading = true;
      this.loaded = false;
      this.onLoadFile(this, docId, content);
      return true;
    } else if(this.loading || this.documentId === docId) {
      return false;
    }

    // Otherwise find the content locally.
    let code;
    if(this.local) {
      let saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
      code = saves[docId];
      if(code) {
        this.modified = true;
      }
    }
    if(!code) {
      code = this._fileCache[docId];
      this.modified = false;
    }
    if(code === undefined) {
      console.error(`Unable to load uncached file: '${docId}'`);
      return false;
    }
    this.loaded = false;
    this.documentId = docId;
    this.editor.reset();
    this.notices = [];
    this.loading = true;
    this.onLoadFile(this, docId, code);

    return true;
  }

  loadWorkspace(directory:string, files:{[filename:string]: string}) {
    // @FIXME: un-hardcode root to enable multiple WS's.
    this._fileCache = files;
    if(this.local) {
      // Mix in any saved documents in localStorage.
      let saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
      for(let save in saves) {
        files[save] = saves[save];
      }
    }
    this.navigator.loadWorkspace("root", directory, files);
  }

  loadDocument(generation:number, text:string, packed:any[], attributes:{[id:string]: any|undefined}) {
    if(generation < this.generation && generation !== undefined) return;
    if(this.loaded) {
      this.editor.updateDocument(packed, attributes);
    } else {
      this.editor.loadDocument(this.documentId, text, packed, attributes);
      this.loaded = true;
      this.loading = false;
    }

    if(this.documentId) {
      let name = this.documentId; // @FIXME
      this.navigator.loadDocument(this.documentId, name);
      this.navigator.currentId = this.documentId;
      this.comments.update();
    } else {
      // Empty file
    }

    this.render();
  }

  saveDocument() {
    if(!this.documentId || !this.loaded) return;

    // When we try to edit a gist-backed file we need to fork it and save the new file to disk.
    // @FIXME: This is all terribly hacky, and needs to be cleaned up as part of the FileStore rework.
    if(this.documentId.indexOf("gist:") === 0) {
      let oldId = this.documentId;

      let neueId = oldId.slice(5);
      neueId = neueId.slice(0, 7) + neueId.slice(32);
      neueId = `/root/${neueId}`;

      if(this._fileCache[neueId]) {
        return this.promptOverwrite(neueId);
      } else {
        return this.cloneDocument(neueId);
      }
    }

    let md = this.editor.toMarkdown();
    let isDirty = md !== this._fileCache[this.documentId];

    // @NOTE: We sync this here to prevent a terrible reload bug that occurs when saving to the file system.
    // This isn't really the right fix, but it's a quick one that helps prevent lost work in trivial cases
    // like navigating the workspace.
    // @TODO: This logic needs ripped out entirely and replaced with a saner abstraction that keeps the
    // file system and workspace in sync.
    // @TODO: localStorage also needs to get synced and cleared lest it permanently overrule other sources of truth.
    this._fileCache[this.documentId] = md;

    // if we're not local, we notify the outside world that we're trying
    // to save
    if(!this.local) {
      return this.onSaveDocument(this, this.documentId, md);
    }

    // othewise, save it to local storage
    let saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
    if(isDirty) {
      saves[this.documentId] = md;
      this.modified = true;
    } else {
      this.modified = false;
      saves[this.documentId] = undefined;
    }
    localStorage.setItem("eve-saves", JSON.stringify(saves));
  }

  revertDocument() {
    if(!this.documentId || !this.loaded) return;
    let docId = this.documentId;
    let saves = JSON.parse(localStorage.getItem("eve-saves") || "{}");
    delete saves[docId];
    localStorage.setItem("eve-saves", JSON.stringify(saves));
    this.documentId = undefined;
    this.loadFile(docId);
  }

  cloneDocument(neueId:string) {
    let oldId = this.documentId;
    this.documentId = neueId;

    let navNode = this.navigator.nodes[oldId];
    if(navNode) {
      let neueNode:TreeNode = {} as any;
      for(let attr in navNode) {
        neueNode[attr] = navNode[attr];
      }
      neueNode.id = neueId;
      neueNode.children = [];
      this.navigator.nodes[neueId] = neueNode;
    }

    if(this.navigator.currentId === oldId) this.navigator.currentId = neueId;

    let currentHashChunks = location.hash.split("#").slice(1);
    let modified = neueId;
    if(currentHashChunks[1]) {
      modified += `/#` + currentHashChunks[1];
    }
    location.hash = modified;

    this.saveDocument();
  }

  saveToGist() {
    // @FIXME: We really need a display name setup for documents.
    let savingNotice = this.injectNotice("info", "Saving...");
    writeToGist(this.documentId || "Untitled.eve", this.editor.toMarkdown(), (err, url) => {
      this.dismissNotice(savingNotice);
      if(err) {
        this.injectNotice("error", "Unable to save file to gist. Check the developer console for more information.");
        console.error(err);
      } else {
        this.injectNotice("info", () => ({c: "flex-row", children: [{text: "Saved to", style: "padding-right: 5px;"}, {t: "a", href: url, target: "_blank", text: "gist"}]}));
      }
    });
  }

  loadFromGist(url:string) {
    if(!url) {
      this.injectNotice("warning", "Unable to open gist: No URL provided.");
      return;
    }
    readFromGist(url, (err, gist) => {
      if(err) {
        this.injectNotice("error", "Unable to read gist. Check the developer console for more information.");
        console.error(err);
      } else {
        //console.log(content);
        // @FIXME: Need the filename metadata here.
        // @FIXME: Should really be more flexible and provide all the files attached (can load a workspace from gist).
        for(let filename in gist.files) {
          let content = gist.files[filename].content;
          let docId = `gist:${gist.id}-${filename}`;
          this.loadFile(docId, content);
        }
      }
    });
  }

  createDocument(folder:string) {
    let newId:string|undefined;
    let ix = 0;
    while(!newId) {
      newId = `/${folder}/untitled${ix ? "-" + ix : ""}.eve`;
      if(this._fileCache[newId]) newId = undefined;
    }
    let emptyTemplate = `# Untitled`;
    this._fileCache[newId] = emptyTemplate;
    // @FIXME: Need a way to side-load a single node that isn't hardwired to a span.
    // Split the current updateNode up.
    // @FIXME: This won't work with multiple workspaces obviously.
    this.loadWorkspace("examples", this._fileCache);
    if(this.onSaveDocument) this.onSaveDocument(this, newId, emptyTemplate);
    this.loadFile(newId);
  }

  injectSpans(packed:any[], attributes:{[id:string]: any|undefined}) {
    this.editor.injectSpans(packed, attributes);
    this.comments.update();
    this.render();
  }

  injectNotice(type:string, message:string|ElemGen) {
    let time = Date.now();
    let existing;
    for(let notice of this.notices) {
      if(notice.type === type && notice.message === message) {
        existing = notice;
        existing.time = time;
        break;
      }
    }
    if(!existing) {
      existing = {type, message, time};
      this.notices.push(existing);
    }
    this.render();
    this.editor.cm.refresh();
    return existing;
  }

  dismissNotice(notice) {
    let ix = this.notices.indexOf(notice);
    if(ix === -1) return;
    this.notices.splice(ix, 1);
    this.render();
    this.editor.cm.refresh();
  }

  eval(persist?: boolean) {
    if(this.notices.length) {
      this.notices = [];
      this.render();
      this.editor.cm.refresh();
    }
    if(this.onEval) this.onEval(this, persist);
  }

  tokenInfo() {
    let doc = this.editor.cm.getDoc();
    let cursor = doc.getCursor();
    let spans = this.editor.findSpansAt(cursor).filter((span) => span instanceof Spans.ParserSpan);
    if(spans.length && this.onTokenInfo) {
      this.onTokenInfo(this, spans[0].source.id);
    }
  }

  monitorInputState() {
    window.addEventListener("mousedown", this.updateMouseInputState);
    window.addEventListener("mouseup", this.updateMouseInputState);
    window.addEventListener("keydown", this.updateKeyboardInputState);
    window.addEventListener("keyup", this.updateKeyboardInputState);
  }

  inputState = {
    mouse: {1: false},
    keyboard: {shift: false}
  }
  updateMouseInputState = (event:MouseEvent) => {
    let mouse = this.inputState.mouse;
    let neue = !!(event.buttons & 1);
    if(!neue && mouse["1"]) this.editor.updateFormatters();
    mouse["1"] = neue;
  }
  updateKeyboardInputState = (event:KeyboardEvent) => {
    let keyboard = this.inputState.keyboard;
    let neue = event.shiftKey;
    if(!neue && keyboard.shift) this.editor.updateFormatters();
    keyboard.shift = neue;
  }

  //-------------------------------------------------------
  // Actions
  //-------------------------------------------------------

  activeActions:{[recordId:string]: any} = {};

  actions = {
    insert: {
      "mark-between": (action) => {
        let source = {type: action.type[0]};
        for(let attribute in action) {
          if(action[attribute] === undefined) continue;
          source[attribute] = action[attribute].length === 1 ? action[attribute][0] : action[attribute];
        }

        if(action.span) {
          action.spans = this.editor.markBetween(action.span, source, action.bounds);
        }

        if(action.range) {
          let doc = this.editor.cm.getDoc();
          action.spans = action.spans || [];
          let ranges:Range[] = [];
          for(let rangeId of action.range) {
            let rangeRecord = indexes.records.index[rangeId];
            if(!rangeRecord || !rangeRecord.start || !rangeRecord.stop) continue;

            ranges.push({from: doc.posFromIndex(rangeRecord.start[0]), to: doc.posFromIndex(rangeRecord.stop[0])});
          }
          action.spans.push.apply(action.spans, this.editor.markBetween(ranges, source, action.bounds));
        }
      },

      "mark-span": (action) => {
        action.spans = [];

        let ranges:Range[] = [];
        if(action.span) {
          for(let spanId of action.span) {
            let span = this.editor.getSpanBySourceId(spanId);
            let range = span && span.find();
            if(span.isBlock() && action.type[0] === "document_widget") { // @FIXME: This is a horrible hack to deal with blocks ending on the next line.
              range = {from: range.from, to: {line: range.to.line - 1, ch: 0}};
            }
            if(range) ranges.push(range);
          }
        }

        let source = {type: action.type[0]};
        for(let attribute in action) {
          if(action[attribute] === undefined) continue;
          source[attribute] = action[attribute].length === 1 ? action[attribute][0] : action[attribute];
        }

        for(let range of ranges) {
          action.spans.push(this.editor.markSpan(range.from, range.to, source));
        }
      },

      "mark-range": (action) => {
        let source = {type: action.type[0]};
        for(let attribute in action) {
          let value = action[attribute];
          if(value === undefined) continue;
          source[attribute] = value.length === 1 ? value[0] : value;
        }

        let doc = this.editor.cm.getDoc();
        let start = doc.posFromIndex(action.start[0]);
        let stop = doc.posFromIndex(action.stop[0]);
        action.span = this.editor.markSpan(start, stop, source);
      },

      "jump-to": (action) => {
        let from:Position;

        if(action.position) {
          let doc = this.editor.cm.getDoc();
          let min = Infinity;
          for(let index of action.position) {
            if(index < min) min = index;
          }
          from = doc.posFromIndex(min)
        }

        if(action.span) {
          for(let spanId of action.span) {
            let span = this.editor.getSpanBySourceId(spanId);
            if(!span) continue;
            let loc = span.find();
            if(!loc) continue;
            if(!from || comparePositions(loc.from, from) < 0) from = loc.from;
          }
        }

        if(from) {
          this.editor.scrollToPosition(from);
        }
      },

      "find-section": (action, actionId) => {
        let doc = this.editor.cm.getDoc();
        let records = [];
        if(action.position) {
          for(let index of action.position) {
            let pos = doc.posFromIndex(index);
            let heading = this.editor.findHeadingAt(pos);
            if(heading) {
              let range = heading.getSectionRange();
              records.push({tag: ["section", "editor"], position: index, heading: heading.source.id, start: doc.indexFromPos(range.from), stop: doc.indexFromPos(range.to)});
            } else {
              records.push({tag: ["section", "editor"], position: index, start: 0, stop: doc.getValue().length});
            }
          }
        }
        if(action.span) {
          for(let spanId of action.span as string[]) {
            let span = this.editor.getSpanBySourceId(spanId);
            if(!span) continue;
            let loc = span.find();
            if(!loc) continue;

            let pos = loc.from;
            let heading = this.editor.findHeadingAt(pos);
            if(heading) {
              let range = heading.getSectionRange();
              records.push({tag: ["section", "editor"], span: spanId, heading: heading.source.id, start: doc.indexFromPos(range.from), stop: doc.indexFromPos(range.to)});
            } else {
              records.push({tag: ["section", "editor"], span: spanId, start: 0, stop: doc.getValue().length});
            }
          }
        }

        if(records.length) {
          for(let record of records) {
            record.action = actionId;
          }
          client.sendEvent(records);
        }
      },

      "elide-between-sections": (action, actionId) => {
        let doc = this.editor.cm.getDoc();

        let visibleHeadings:HeadingSpan[] = [];
        if(action.position) {
          for(let index of action.position) {
            let pos = doc.posFromIndex(index);
            let heading = this.editor.findHeadingAt(pos);
            if(heading) visibleHeadings.push(heading);
          }
        }
        if(action.span) {
          for(let spanId of action.span as string[]) {
            let span = this.editor.getSpanBySourceId(spanId);
            if(!span) continue;
            let loc = span.find();
            if(!loc) continue;

            let pos = loc.from;
            let heading = this.editor.findHeadingAt(pos);
            if(heading) visibleHeadings.push(heading);
          }
        }

        let headings = this.editor.getAllSpans("heading") as HeadingSpan[];
        for(let heading of headings) {
          if(visibleHeadings.indexOf(heading) === -1) {
            heading.hide();
          } else {
            heading.unhide();
          }
        }
        this.navigator.updateElision();
      },

      "find-source": (action, actionId) => {
        let record = action.record && action.record[0];
        let attribute = action.attribute && action.attribute[0];
        let span = action.span && action.span[0];
        this.languageService.findSource({record, attribute, span}, this.languageService.unpackSource((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-related": (action, actionId) => {
        this.languageService.findRelated({span: action.span, variable: action.variable}, this.languageService.unpackRelated((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-value": (action, actionId) => {
        let given;
        if(action.given) {
          given = {};
          for(let avId of action.given) {
            let av = indexes.records.index[avId];
            given[av.attribute] = av.value;
          }
        }

        this.languageService.findValue({variable: action.variable, given}, this.languageService.unpackValue((records) => {
          let doc = this.editor.cm.getDoc();
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-cardinality": (action, actionId) => {
        this.languageService.findCardinality({variable: action.variable}, this.languageService.unpackCardinality((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-affector": (action, actionId) => {
        this.languageService.findAffector(
          {
            record: action.record && action.record[0],
            attribute: action.attribute && action.attribute[0],
            span: action.span && action.span[0]
          },
          this.languageService.unpackAffector((records) => {
            for(let record of records) {
              record.tag.push("editor");
              record["action"] = actionId;
            }
            client.sendEvent(records);
          }));
      },

      "find-failure": (action, actionId) => {
        this.languageService.findFailure({block: action.block}, this.languageService.unpackFailure((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-root-drawers": (action, actionId) => {
        this.languageService.findRootDrawer(null, this.languageService.unpackRootDrawer((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "find-performance": (action, actionId) => {
        this.languageService.findPerformance(null, this.languageService.unpackPerformance((records) => {
          for(let record of records) {
            record.tag.push("editor");
            record["action"] = actionId;
          }
          client.sendEvent(records);
        }));
      },

      "inspector": (action, actionId) => {
        this.inspecting = true;
        let inspectorElem:HTMLElement = activeElements[actionId] as any;
        if(!inspectorElem) return;
        if(action["in-editor"]) this.editor.cm.getWrapperElement().appendChild(inspectorElem);

        if(action.x && action.y) {
          inspectorElem.style.position = "absolute";
          inspectorElem.style.left = action.x[0];
          inspectorElem.style.top = action.y[0];
        }
        this.queueUpdate();
      }
    },

    remove: {
      "mark-between": (action) => {
        if(!action.spans) return;
        for(let span of action.spans) {
          span.clear();
        }
      },

      "mark-span": (action) => {
        if(!action.spans) return;
        for(let span of action.spans) {
          span.clear();
        }
      },

      "mark-range": (action) => {
        if(!action.span) return;
        action.span.clear();
      },

      "elide-between-sections": (action, actionId) => {
        for(let span of this.editor.getAllSpans("elision")) {
          span.clear();
        }
      },

      "inspector": (action, actionId) => {
        this.inspecting = false;
        this.queueUpdate();
      }
    },
  };

  updateActions(inserts: string[], removes: string[], records) {
    this.editor.cm.operation(() => {
      for(let recordId of removes) {
        let action = this.activeActions[recordId];
        if(!action) return;
        let run = this.actions.remove[action.tag];
        //console.log("STOP", action.tag, recordId, action, !!run);
        if(run) run(action);
        delete this.activeActions[recordId];
      }

      for(let recordId of inserts) {
        let record = records[recordId];
        let bounds:Range|undefined;
        if(record.within) {
          let span = this.editor.getSpanBySourceId(record.within[0]);
          if(span) bounds = span.find();
        }

        let action:any = {bounds};
        for(let tag of record.tag) {
          if(tag in this.actions.insert || tag in this.actions.remove) {
            action.tag = tag;
            break;
          }
        }
        if(!action.tag) continue;

        for(let attr in record) {
          if(!action[attr]) action[attr] = record[attr];
        }
        this.activeActions[recordId] = action;

        let run = this.actions.insert[action.tag];
        //console.log("START", action.tag, recordId, action, !!run);
        if(!run) console.warn(`Unable to run unknown action type '${action.tag}'`, recordId, record);
        else run(action, recordId);
      }
    });
  }

  //-------------------------------------------------------
  // Views
  //-------------------------------------------------------
  activeViews:any = {};

  updateViews(inserts: string[], removes: string[], records) {
    for(let recordId of removes) {
      let view = this.activeViews[recordId];
      if(!view) continue;
      // Detach view
      if(view.widget) view.widget.clear();
      view.widget = undefined;
    }

    for(let recordId of inserts) {
      // if the view already has a parent, leave it be.
      if(indexes.byChild.index[recordId]) continue;

      // If the view is already active, he doesn't need inserted again.
      if(this.activeViews[recordId] && this.activeViews[recordId].widget) continue;

      // Otherwise, we'll grab it and attach it to its creator in the editor.
      let record = records[recordId];
      let view = this.activeViews[recordId] = this.activeViews[recordId] || {record: recordId, container: document.createElement("div")};
      view.container.className = "view-container";

      //this.attachView(recordId, record.node)
      // Find the source node for this view.
      if(record.span) {
        this.attachView(recordId, record.span[0]);
      } else if(record.node) {
        client.send({type: "findNode", recordId, node: record.node[0]});
      } else {
        console.warn("Unable to parent view that doesn't provide its origin node  or span id", record);
      }

    }
  }

  attachView(recordId:string, spanId:string) {
    let view = this.activeViews[recordId];

    // @NOTE: This isn't particularly kosher.
    let node = activeElements[recordId];
    if(!node) return;
    if(node !== view.container.firstChild) {
      view.container.appendChild(node);
    }

    let sourceSpan:Span|undefined = view.span;
    if(spanId !== undefined) {
      sourceSpan = this.editor.getSpanBySourceId(spanId);
    }

    if(!sourceSpan) return;
    view.span = sourceSpan;

    let loc = sourceSpan.find();
    if(!loc) return;
    let line = loc.to.line;
    if(sourceSpan.isBlock()) line -= 1;

    if(view.widget && line === view.line) return;

    if(view.widget) {
      view.widget.clear();
    }

    view.line = line;
    view.widget = this.editor.cm.addLineWidget(line, view.container);
  }

  //-------------------------------------------------------
  // Inspector
  //-------------------------------------------------------

  findPaneAt(x: number, y: number):"editor"|"application"|undefined {
    let editorContainer = this.editor.cm.getWrapperElement();
    let editor = editorContainer && editorContainer.getBoundingClientRect();
    let appContainer = document.querySelector(".application-container")
    let app = appContainer && appContainer.getBoundingClientRect(); // @FIXME: Not particularly durable
    if(editor && x >= editor.left && x <= editor.right &&
       y >= editor.top && y <= editor.bottom) {
      return "editor";
    } else if(app && x >= app.left && x <= app.right &&
              y >= app.top && y <= app.bottom) {
      return "application";
    }
  }

  enableInspector() {
    //window.addEventListener("mouseover", this.updateInspector);
    window.addEventListener("click", this.updateInspector, true);
  }

  disableInspector() {
    //window.removeEventListener("mouseover", this.updateInspector);
    window.removeEventListener("click", this.updateInspector, true);
  }

  toggleInspecting() {
    if(this.inspecting) {
      client.sendEvent([{tag: ["inspector", "clear"]}]);
    } else {
      this.inspectingClick = true;
    }
    this.queueUpdate();
  }

  updateInspector = (event:MouseEvent) => {
    let pane = this.findPaneAt(event.pageX, event.pageY);
    if(!(event.ctrlKey || event.metaKey || this.inspectingClick)) return;
    this.inspectingClick = false;
    let events = [];
    if(pane === "editor") {
      let pos = this.editor.cm.coordsChar({left: event.pageX, top: event.pageY});
      let spans = this.editor.findSpansAt(pos).sort(compareSpans);

      let editorContainer = this.editor.cm.getWrapperElement();
      let bounds = editorContainer.getBoundingClientRect();
      let x = event.clientX - bounds.left;
      let y = event.clientY - bounds.top;

      while(spans.length) {
        let span = spans.shift();
        if(!span.isEditorControlled() || span.type === "code_block") {
          events.push({tag: ["inspector", "inspect", spans.length === 0 ? "direct-target" : undefined], target: span.source.id, type: span.source.type, x, y});
        }
      }

    } else if(pane === "application") {
      let appContainer = document.querySelector(".application-root > .application-container > .program") as HTMLElement;
      let x = event.clientX - appContainer.offsetLeft;
      let y = event.clientY - appContainer.offsetTop;
      let current:any = event.target;
      while(current && current.entity) {
        events.push({tag: ["inspector", "inspect", current === event.target ? "direct-target" : undefined], target: current.entity, type: "element", x, y});
        current = current.parentNode;
      }

      // If we didn't click on an element, inspect the root.
      if(events.length === 0) {
        events.push({tag: ["inspector", "inspect", "direct-target"], type: "root", x, y});
      }
    }

    this.queueUpdate();
    if(events.length) {
      client.sendEvent(events);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  onChange?:(self:IDE) => void
  onEval?:(self:IDE, persist?: boolean) => void
  onLoadFile?:(self:IDE, documentId:string, code:string) => void
  onTokenInfo?:(self:IDE, tokenId:string) => void
  onSaveDocument?:(self:IDE, documentId:string, code:string) => void
}

type FindSourceArgs = {record?: string, attribute?: string, span?:string|string[], source?: {block?: string[], span?: string[]}[]};
type SourceRecord = {tag: string[], record?: string, attribute?: string, span: string[], block: string[]};
type FindRelatedArgs = {span?: string[], variable?: string[]};
type RelatedRecord = {tag: string[], span: string, variable: string[]};
type FindValueArgs = {variable: string[], given: {[attribute: string]: any}, rows?: any[][], totalRows?: number, variableMappings?: {[span: string]: number}, variableNames?: {[span: string]: string}};
type ValueRecord = {tag: string[], variable: string, value: any, row: number, name: string, register: number}
type FindCardinalityArgs = {variable: string[], cardinality?: {[variable: string]: number}};
type CardinalityRecord = {tag: string[], variable: string, cardinality: number};
type FindAffectorArgs = {record?: string, attribute?: string, span?: string, affector?: {block?: string[], action: string[]}[]};
type AffectorRecord = {tag: string[], record?: string, attribute?: string, span?: string, block: string[], action: string[]};
type FindFailureArgs = {block: string[], span?: {block: string, start: number, stop: number}[]};
type FailureRecord = {tag: string[], block: string, start: number, stop: number};
type FindRootDrawerArgs = {drawers?: {id: string, start: number, stop: number}[]};
type RootDrawerRecord = {tag: string[], span: string, start: number, stop: number};
type FindPerformanceArgs = {blocks?: {[blockId:string]: {avg: number, calls: number, color: string, max: number, min: number, percentFixpoint: number, time: number}}, fixpoint: {avg: number, count: number, time: number}};
type PerformanceRecord = {tag: string[], block: string, average: number, calls: number, color: string, max: number, min: number, percent: number, total: number};

class LanguageService {
  protected static _requestId = 0;

  protected _listeners:{[requestId:number]: (args:any) => void} = {};

  findSource(args:FindSourceArgs, callback:(args:FindSourceArgs) => void) {
    this.send("findSource", args, callback);
  }

  unpackSource(callback:(args:SourceRecord[]) => void) {
    return (message:FindSourceArgs) => {
      let records:SourceRecord[] = [];
      for(let source of message.source) {
        let span:any = message.span || source.span;
        records.push({tag: ["source"], record: message.record, attribute: message.attribute, span, block: source.block});
      }
      callback(records);
    };
  }

  findRelated(args:FindRelatedArgs, callback:(args:FindRelatedArgs) => void) {
    this.send("findRelated", args, callback);
  }

  unpackRelated(callback:(args:RelatedRecord[]) => void) {
    return (message:FindRelatedArgs) => {
      let records:RelatedRecord[] = [];
      // This isn't really correct, but we're rolling with it for now.
      for(let span of message.span) {
        records.push({tag: ["related"], span, variable: message.variable});
      }
      callback(records);
    };
  }

  findValue(args:FindValueArgs, callback:(args:FindValueArgs) => void) {
    this.send("findValue", args, callback);
  }

  unpackValue(callback:(args:ValueRecord[]) => void) {
    return (message:FindValueArgs) => {
      if(message.totalRows > message.rows.length) {
        // @TODO: Turn this into a fact.
        console.warn(`Too many possible values, showing {{message.rows.length}} of {{message.totalRows}}`);
      }
      let mappings = message.variableMappings;
      let names = message.variableNames;
      let records:ValueRecord[] = [];
      for(let rowIx = 0, rowCount = message.rows.length; rowIx < rowCount; rowIx++) {
        let row = message.rows[rowIx];
        for(let variable in mappings) {
          let register = mappings[variable];
          records.push({tag: ["value"], row: rowIx + 1, variable, value: row[register], register, name: names[variable]});
        }
      }
      callback(records);
    };
  }

  findCardinality(args:FindCardinalityArgs, callback:(args:FindCardinalityArgs) => void) {
    this.send("findCardinality", args, callback);
  }

  unpackCardinality(callback:(args:CardinalityRecord[]) => void) {
    return (message:FindCardinalityArgs) => {
      let records:CardinalityRecord[] = [];
      for(let variable in message.cardinality) {
        records.push({tag: ["cardinality"], variable, cardinality: message.cardinality[variable]});
      }
      callback(records);
    };
  }

  findAffector(args:FindAffectorArgs, callback:(args:FindAffectorArgs) => void) {
    this.send("findAffector", args, callback);
  }

  unpackAffector(callback:(args:AffectorRecord[]) => void) {
    return (message:FindAffectorArgs) => {
      let records:AffectorRecord[] = [];
      for(let affector of message.affector) {
        records.push({tag: ["affector"], record: message.record, attribute: message.attribute, span: message.span, block: affector.block, action: affector.action});
      }
      callback(records);
    };
  }

  findFailure(args:FindFailureArgs, callback:(args:FindFailureArgs) => void) {
    this.send("findFailure", args, callback);
  }

  unpackFailure(callback:(args:FailureRecord[]) => void) {
    return (message:FindFailureArgs) => {
      let records:FailureRecord[] = [];
      for(let failure of message.span) {
        records.push({tag: ["failure"], block: failure.block, start: failure.start, stop: failure.stop});
      }
      callback(records);
    };
  }

  findRootDrawer(args:any, callback:(args:FindRootDrawerArgs) => void) {
    this.send("findRootDrawers", args || {}, callback);
  }

  unpackRootDrawer(callback:(args:RootDrawerRecord[]) => void) {
    return (message:FindRootDrawerArgs) => {
      let records:RootDrawerRecord[] = [];
      for(let drawer of message.drawers) {
        records.push({tag: ["root-drawer"], span: drawer.id, start: drawer.start, stop: drawer.stop});
      }
      callback(records);
    };
  }

  findPerformance(args:any, callback:(args:FindPerformanceArgs) => void) {
    this.send("findPerformance", args || {}, callback);
  }

  unpackPerformance(callback:(args:PerformanceRecord[]) => void) {
    return (message:FindPerformanceArgs) => {
      let records:PerformanceRecord[] = [];
      for(let blockId in message.blocks) {
        let block = message.blocks[blockId];
        records.push({tag: ["performance"], block: blockId, average: block.avg, calls: block.calls, color: block.color, max: block.max, min: block.min, percent: block.percentFixpoint, total: block.time});
      }
      callback(records);
    };
  }

  send(type:string, args:any, callback:any) {
    let id = LanguageService._requestId++;
    args.requestId = id;
    this._listeners[id] = callback;
    args.type = type;
    //console.log("SENT", args);
    client.send(args);
  }

  handleMessage = (message) => {
    let type = message.type;
    if(type === "findSource" || type === "findRelated" || type === "findValue" || type === "findCardinality" || type === "findAffector" || type === "findFailure" || type === "findRootDrawers" || type === "findPerformance") {
      let id = message.requestId;
      let listener = this._listeners[id];
      if(listener) {
        listener(message);
        return true;
      }
    }
    return false;
  }
}
