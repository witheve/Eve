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

    return {c: `tree-item ${subtree ? "branch" : "leaf"} ${node.type} ${subtree && !node.open ? "collapsed" : ""} ${node.hidden ? "hidden" : ""}`, nodeId, children: [
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

  id: number = Span._nextId++;
  editor: Editor;
  marker?: SpanMarker;

  protected _attributes:CodeMirror.TextMarkerOptions;

  lineTextClass?: string;
  lineBackgroundClass?: string;

  constructor(protected _from:Position, protected _to:Position, protected _source:any) {}

  find():Range {
    if(!this.marker) return {from: this._from, to: this._to};

    let loc = this.marker.find();
    if(!loc) throw new Error("Could not find marker");
    if(isRange(loc)) return loc;
    return {from: loc, to: loc};
  }

  attached() {
    return this.marker && this.find();
  }

  clone<T extends Span>(this:T):T {
    let loc = this.find();
    return new (this.constructor as any)(loc.from, loc.to, this._source);
  }

  applyMark(editor:Editor) {
    let cm = editor.cm;
    let doc = cm.getDoc();
    let {_from, _to} = this;
    if(!samePosition(_from, _to)) {
      this.marker = doc.markText(_from, _to, this._attributes);
    } else {
      this.marker = doc.setBookmark(_from, {});
    }
    this.marker.span = this;

    if(this.lineTextClass || this.lineBackgroundClass) {
      let end = _from.line != _to.line ? _to.line : _to.line + 1;
      for(let line = _from.line; line < end; line++) {
        if(this.lineBackgroundClass) cm.addLineClass(line, "background", this.lineBackgroundClass);
        if(this.lineTextClass) cm.addLineClass(line, "text", this.lineTextClass);
      }
    }
  }

  clear(origin = "+delete") {
    if(!this.marker) return;
    let cm = this.editor.cm;

    let loc = this.find();
    let _from = this._from = loc.from;
    let _to = this._to = loc.to;
    this.editor.clearSpan(this, origin);
    this.marker.clear();
    this.marker.span = undefined;
    this.marker = undefined;

    if(this.lineTextClass || this.lineBackgroundClass) {
      let end = _from.line != _to.line ? _to.line : _to.line + 1;
      for(let line = _from.line; line < end; line++) {
        if(this.lineBackgroundClass) cm.removeLineClass(line, "background", this.lineBackgroundClass);
        if(this.lineTextClass) cm.removeLineClass(line, "text", this.lineTextClass);
      }
    }
  }

  // Handlers
  refresh(change:CodeMirror.EditorChangeCancellable) {}
  onBeforeChange(change:CodeMirror.EditorChangeCancellable) {}
  onChange(change:CodeMirror.EditorChangeCancellable) {}
}

class CodeBlockSpan extends Span {
  lineBackgroundClass = "CODE";
}

var spanTypes:{[type:string]: (typeof Span)} = {
  code_block: CodeBlockSpan,
  "default": Span
}


//---------------------------------------------------------
// Editor
//---------------------------------------------------------
/* - [x] Exactly 700px
 * - [ ] Syntax highlighting
   * - [ ] Add missing span types
   * - [ ] Event handlers e.g. onChange, etc.
   * - [ ] Get spans updating again
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

class Editor {
  defaults:CodeMirror.EditorConfiguration = {
    tabSize: 2,
    lineWrapping: true,
    lineNumbers: false,
    extraKeys: ctrlify({
      "Cmd-Enter": () => console.log("sup dawg")
    })
  };

  cm:CodeMirror.Editor;

  constructor(public ide:IDE, protected _value:string = "") {
    this.cm = CodeMirror(() => undefined, this.defaults);
    this.loadMarkdown(_value);
  }

  loadMarkdown(value:string) {
    let {text, spans} = parseMarkdown(value);
    this._value = text;
    this.cm.operation(() => {
      this.cm.setValue(text);
      let doc = this.cm.getDoc();
      for(let [start, end, source] of spans) {
        this.markSpan(doc.posFromIndex(start), doc.posFromIndex(end), source);
      }
    });
  }

  markSpan(frm:Position, to:Position, source:any) {
    let SpanClass = spanTypes[source.type] || spanTypes["default"];
    let span = new SpanClass(frm, to, source);
    span.applyMark(this);
    console.log("Marking", frm, to, source);
  }

  clearSpan(span:Span, origin = "+delete") {
    console.log("@TODO: Implement me!");
  }

  refresh() {
    this.cm.refresh();
  }

  // handlers
  injectCodeMirror:RenderHandler = (node:EditorNode, elem) => {
    if(!node.cm) {
      node.cm = this.cm;
      node.appendChild(this.cm.getWrapperElement());
    }
    this.cm.refresh();
    render();
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
  bar: {loc: {from: {line: 21, ch: 15}, to: {line: 21, ch: 26}}, type: "error", title: "Invalid tag location", actions: ["fix it"], description: unpad(`
        '#department' tells me to search for a record tagged "department", but since it's not in a record, I don't know the full pattern to look for.

        If you wrap it in square brackets, that tells me you're looking for a record with just that tag.`)},

  catbug: {loc: {from: {line: 22, ch: 13}, to: {line: 22, ch: 52}}, type: "warning", title: "Unmatched pattern", actions: ["create it", "fake it", "dismiss"], description: unpad(`
           No records currently in the database match this pattern, and no blocks are capable of providing one.

           I can create a new block for you to produce records shaped like this; or add some fake records that match that pattern for testing purposes.`)},
  dankeykang: {loc: {from: {line: 34, ch: 17}, to: {line: 34, ch: 21}}, type: "error", title: "Unbound variable", description: unpad(`
               The variable 'nqme' was not bound in this block. Did you mean 'name'?
               `)},
};

class IDE {
  navigator:Navigator = new Navigator(this, "root", fakeNodes);
  editor:Editor = new Editor(this, fakeText);
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
}

let _ide = new IDE();
function render() {
  renderer.render([_ide.render()]);
}

//// DEBUG
render();
