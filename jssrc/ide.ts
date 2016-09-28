import {Renderer, Element as Elem, RenderHandler} from "microReact";
import * as  CodeMirror from "codemirror";
import {debounce} from "./util";

type Range = CodeMirror.Range;
type Position = CodeMirror.Position;

function isRange(loc:any): loc is Range {
  return loc.from !== undefined || loc.to !== undefined;
}

export var renderer = new Renderer();
document.body.appendChild(renderer.content);

//---------------------------------------------------------
// Navigator
//---------------------------------------------------------
/* - Document Pseudo-FS
 * - Table of Contents
 * - Separate detail levels to control indentation / info overload
 * - 2nd priority on width
 * - Collapsible
 * - Elision
 */

interface TreeNode {
  name: string,
  type: string,
  children?: string[],
  open?: boolean,

  hidden?: boolean
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
// Editor
//---------------------------------------------------------
/* - Exactly 700px
 * - Display cardinality badges
 * - Show related (at least action -> EAV / EAV -> DOM
 * - Syntax highlighting
 * - Autocomplete (at least language constructs, preferably also expression schemas and known tags/names/attributes)
 */
interface EditorNode extends HTMLElement { cm?: CodeMirror.Editor }

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
    lineNumbers: true,
    extraKeys: ctrlify({
      "Cmd-Enter": () => console.log("sup dawg")
    })
  };

  cm:CodeMirror.Editor;

  constructor(public ide:IDE) {
    this.cm = CodeMirror(() => undefined, this.defaults);

    let str = "";
    for(let i = 0; i < 50; i++) {
      let len = i % 7;
      for(let j = 0; j < len; j++)
        str += "foo bar baz bat quux ";
      str += "\n";
    }
    this.cm.setValue(str); // @FIXME
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

  refresh() {
    if(this.cm) {
      this.cm.refresh();
    }
  }

  render() {
    return {c: "editor-pane",  postRender: this.injectCodeMirror};
  }
}

//---------------------------------------------------------
// Comments
//---------------------------------------------------------
/* - Last priority on width
 * - Icons below min width
 * - Soak up extra space
 * - Filters (?)
 * - Quick actions
 * - Count indicator (?)
 * - Scrollbar minimap
 * - Condensed, unattached console view
 * - Comment types:
 *   - Errors
 *   - Warnings
 *   - View results
 *   - Live docs
 *   - User messages / responses
 * - Comments are tagged by a Position or a Range which CM will track
 * - Hovering a comment will highlight its matching Position or Range
 * - Clicking a comment will  scroll its location into view
 * - Comments are collapsed by the callback that moves them into position by doing so in order
 * - Hovering a quick action whill display a transient tooltip beneath the action bar describing the impact of clicking it
 * - All QAs must be undo-able
 */

type CommentType = "error"|"warning"|"info"|"comment"|"result";
interface Comment {
  loc: Position|Range,
  type: CommentType,
  title?: string,
  description?: string,
  actions?: string[],
  replies?: string[],

  marker?: CodeMirror.TextMarker
}
interface CommentMap {[id:string]: Comment}
interface Action {
  name: string,
  description: (comment:Comment) => string,
  run: (event:Event, {commentId:string}) => void
}

class Comments {
  ordered:string[];

  rootNode?:HTMLElement;
  _currentWidth?:number;

  constructor(public ide:IDE, public comments: CommentMap) {
    this.ordered = Object.keys(this.comments);
    this.ordered.sort(this.commentComparator);

    window.addEventListener("resize", this.resizeComments);
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
  }, 32, true);

  wangjangle:RenderHandler = (node, elem) => {
    if(!node["_injected"]) {
      let wrapper = this.ide.editor.cm.getWrapperElement();
      wrapper.querySelector(".CodeMirror-sizer").appendChild(node);
      node["_injected"] = true;
    }
    this.rootNode = node;
    this.resizeComments();
  }

  highlight = (event, {commentId}) => {
    let comment = this.comments[commentId];
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

  unhighlight = (event, {commentId}) => {
    let comment = this.comments[commentId];
    if(!comment.marker) return;
    comment.marker.clear();
    comment.marker = undefined;
  }

  goTo = (event, {commentId}) => {
    let comment = this.comments[commentId];
    let cm = this.ide.editor.cm;
    cm.scrollIntoView(isRange(comment.loc) ? comment.loc.from : comment.loc, 20);
  }

  render():Elem { // @FIXME: I'm here, just hidden by CodeMirror and CM scroll
    let children:Elem[] = [];
    for(let commentId of this.ordered) {
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

      let elem = {
        c: `comment ${comment.type}`, commentId,
        mouseover: this.highlight, mouseleave: this.unhighlight, click: this.goTo,
        children: [
          comment.title ? {c: "label", text: comment.title} : undefined,
          comment.description ? {c: "description", text: comment.description} : undefined,
          actions.length ? {c: "quick-actions", children: actions} : undefined,
        ]};
      children.push(elem);
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

var fakeNodes:TreeMap = {
  root: {name: "hello tree", type: "folder", open: true, children: ["bob", "janet", "bar"]},
  bob: {name: "bobby", type: "folder", children: ["jess"]},
  bar: {name: "bar", type: "document"},
  janet: {name: "Jay", type: "document", children: ["h1", "h22"]},
  h1: {name: "JANET", type: "section", children: ["h2", "h3"]},
  h2: {name: "The Making Of", type: "section"},
  h22: {name: "The Man; The Legend", type: "section"},
  h3: {name: "wjut", type: "section", children: ["h4"]},
  h4: {name: "k i am a really long name", type: "section"}
};

var fakeComments:CommentMap = {
  foo: {loc: {line: 2, ch: 3}, type: "error", title: "Unassigned if", description: "You can only assign an if to a block or an identifier"},
  bar: {loc: {from: {line: 8, ch: 0}, to: {line: 8, ch: 12}}, type: "warning", title: "Unmatched pattern", description: "No records currently in the database match this pattern, and no blocks are capable of providing one", actions: ["create it", "fake it", "dismiss"]},
  catbug: {loc: {from: {line: 11, ch: 18}, to: {line: 12, ch: 0}}, type: "error", title: "mega error", description: "This is a pretty big description of how badly you fucked", actions: ["fix it"]},
  dankeykang: {loc: {from: {line: 11, ch: 0}, to: {line: 12, ch: 50}}, type: "warning", title: "dankey warning", description: "how did you even manage to mess up dk", actions: ["dismiss"]},
};

class IDE {
  navigator:Navigator = new Navigator(this, "root", fakeNodes);
  editor:Editor = new Editor(this);
  comments:Comments = new Comments(this, fakeComments);

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
