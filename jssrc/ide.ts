import {Renderer, Element as Elem, RenderHandler} from "microReact";
import * as  CodeMirror from "codemirror";

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
    lineNumbers: false,
    extraKeys: ctrlify({
      "Cmd-Enter": () => console.log("sup dawg")
    })
  };

  cm:CodeMirror.Editor;

  constructor(public ide:IDE) {
    this.cm = CodeMirror(() => undefined, this.defaults);

    let str = "";
    for(let i = 0; i < 20; i++) str += "foo\nbar\nbaz\nbat\nquux\n";
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

  replies?: string[]
}
interface CommentMap {[id:string]: Comment}
interface Action {
  name: string,
  description: (comment:Comment) => string,
  run: (event:Event, {commentId:string}) => void
}

class Comments {
  constructor(public ide:IDE, public comments: CommentMap) {}

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

  injectIntoCM:RenderHandler = (node, elem) => {
    let wrapper = this.ide.editor.cm.getWrapperElement();
    wrapper.querySelector(".CodeMirror-sizer").appendChild(node);
  }

  render():Elem { // @FIXME: I'm here, just hidden by CodeMirror and CM scroll
    let cm = this.ide.editor.cm;

    let children:Elem[] = [];
    for(let commentId in this.comments) {
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

      let start = isRange(comment.loc) ? comment.loc.from : comment.loc;
      let coords = cm.charCoords(start, "local");

      let elem = {c: `comment ${comment.type}`, top: coords.top, commentId, children: [
        comment.title ? {c: "label", text: comment.title} : undefined,
        comment.description ? {c: "description", text: comment.description} : undefined,
        actions.length ? {c: "quick-actions", children: actions} : undefined,
      ]};
      children.push(elem);
    }

    return {c: "comments-pane", postRender: this.injectIntoCM, children: [
      {c: "comments-pane-inner", children}
    ]};
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
  foo: {loc: {line: 2, ch: 8}, type: "error", title: "Unassigned if", description: "You can only assign an if to a block or an identifier"},
  bar: {loc: {line: 12, ch: 0}, type: "warning", title: "Unmatched pattern", description: "No records currently in the database match this pattern, and no blocks are capable of providing one", actions: ["create it", "fake it", "dismiss"]},
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
