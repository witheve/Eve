import {Renderer, Element as Elem} from "microReact";
import {Position, Range} from "CodeMirror";

export var renderer = new Renderer();
document.body.appendChild(renderer.content);


function render() {
  renderer.render([editorRoot(magicalEditorState)]);
}


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
}
interface DocumentNode extends TreeNode { hidden?: boolean }
interface TreeMap {[id:string]: TreeNode|undefined}

interface TreeControlElem extends Elem {
  nodeId: string
  nodes: TreeMap
}
interface TreeItemElem extends Elem {
  nodeId: string,
  nodes: TreeMap,
  leaf?: boolean,
  label?: Elem,
  controls?: Elem[],

  decorate?: (elem:TreeItemElem) => void
}
interface NavigatorState {
  open?: boolean
  rootId: string
  currentId?: string
  nodes: TreeMap
}

// Handlers
function toggleNavigatorPane(event:MouseEvent, elem) {
  let state = magicalEditorState.navigator;
  state.open = !state.open;
  render();
  event.stopPropagation();
}

function navigate(event, elem:{nodeId:string}) {
  let state = magicalEditorState.navigator;
  state.currentId = elem.nodeId;
  render();
}



function toggleTreeBranch(event:MouseEvent, elem:TreeControlElem) {
  let node = elem.nodes[elem.nodeId];
  if(!node) return;
  node.open = !node.open;
  render();
  event.stopPropagation();
}

function toggleElision(event, elem:TreeControlElem) {
  let node:DocumentNode|undefined = elem.nodes[elem.nodeId];
  if(!node) return;
  node.hidden = !node.hidden;
  if(node.children) {
    let descendents = node.children.slice();
    while(descendents.length) {
      let child:DocumentNode|undefined = elem.nodes[descendents.shift()!];
      if(!child) continue;
      child.hidden = node.hidden;
      if(child.children) descendents.push.apply(descendents, child.children);
    }
  }
  render();
  event.stopPropagation();
}

// Elements
function navTree(elem:TreeItemElem):TreeItemElem {
  let {nodes, nodeId, decorate} = elem;
  let node = nodes[nodeId];
  if(!node) return elem;

  if(!elem.controls) elem.controls = [];
  if(!elem.label) elem.label = {c: "label", text: node.name, nodeId, nodes};
  elem.c = elem.c ? `${elem.c} tree-item ${node.type}` : `tree-item ${node.type}`;
  elem.children = [
    {c: "controls", children: elem.controls},
    elem.label

  ];

  elem.leaf = !node.children;
  if(decorate) decorate(elem);

  if(elem.leaf || !node.children) {
    elem.c += " tree-leaf";
  } else if(!node.open) {
    elem.c += " tree-branch tree-collapsed";
    elem.children.unshift({c: "expand-btn ion-ios-arrow-right", nodeId, nodes, click: toggleTreeBranch});
  } else {
    elem.c += " tree-branch tree-expanded";
    elem.children.unshift({c: "collapse-btn ion-ios-arrow-right", nodeId, nodes, click: toggleTreeBranch});

    let items:(Elem|undefined)[] = [];
    for(let childId of node.children) {
      items.push(navTree({nodeId: childId, nodes, decorate}));
    }

    elem.children.push({c: "tree-items", children: items});
  }

  return elem;
}

function decorateFolderItems(elem:TreeItemElem) {
  let {nodes, nodeId, decorate} = elem;
  let node = nodes[nodeId];
  if(!node) return elem;

  if(node.type === "folder") {
    elem.controls!.push({c: "new-btn ion-ios-plus-empty", click: () => console.log("new folder or document")});
    elem.label!.click = toggleTreeBranch;
  } else {
    elem.leaf = true;
    elem.label!.click = navigate;
  }
  elem.controls!.push({c: "delete-btn ion-ios-close-empty", click: () => console.log("delete folder or document w/ confirmation")});
}

function decorateDocumentItems(elem:TreeItemElem) {
  let {nodes, nodeId, decorate} = elem;
  let node:DocumentNode|undefined = nodes[nodeId];
  if(!node) return elem;

  if(node.type === "section" || node.type === "document") {
    if(node.hidden) elem.c += " hidden";
    elem.controls!.push({c: `elide-btn ${node.hidden ? "ion-eye-disabled" : "ion-eye"}`, nodeId: elem.nodeId, nodes: elem.nodes, click: toggleElision});
    if(!elem.leaf) elem.label!.click = toggleTreeBranch;
  }
}

function navigatorHeader({mode, open}:{mode:string, open?:boolean}):Elem {
  return {c: "navigator-header", children: [
    {c: "label", text: mode, click: toggleNavigatorPane},
    {c: "flex-spacer"},
    {c: "controls", children: [
      open ? {c: `up-btn ion-ios-arrow-up ${(mode === "Workspace") ? "disabled" : ""}`, click: navigate} : undefined,
      {c: `${open ? "expand-btn" : "collapse-btn"} ion-ios-arrow-left`, click: toggleNavigatorPane},
    ]}
  ]};
}

function navigatorPane(state:NavigatorState):Elem {
  let nodeId = state.currentId || state.rootId
  let root = state.nodes[nodeId];
  if(!root) return {c: "navigator-pane", children: [
    {c: "navigator-pane-inner", children: [
      navigatorHeader({mode: "Workspace", open: state.open}),
      {c: "new-btn ion-ios-plus-empty", click: () => console.log("new folder or document")}
    ]}
  ]};

  let decorate;
  let mode = "Workspace";
  if(root.type === "folder") {
    decorate = decorateFolderItems;
  } else if(root.type === "document") {
    decorate = decorateDocumentItems;
    mode = "Table of Contents";
  }
  return {c: `navigator-pane ${state.open ? "" : "collapsed"}`, click: state.open ? undefined : toggleNavigatorPane, children: [
    {c: "navigator-pane-inner", children: [
      navigatorHeader({mode, open: state.open}),
      navTree({nodeId, nodes: state.nodes, decorate})
    ]}
  ]};
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

function injectCodeMirror() {
}

interface EditorState {
}
function editorPane(state:EditorState):Elem {
  return {c: "editor-pane",  postRender: injectCodeMirror
  };
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
 */

type CommentType = "error"|"warning"|"info"|"comment"|"result";
interface Comment {
  loc: Position|Range,
  type: CommentType,
  title?: string,
  description?: string,
  actions?: string[]
}
interface CommentsState {
  comments:Comment[]
}

interface CommentElem extends Elem {}

function commentsPane(state:CommentsState):Elem {
  // takes a list of comments
  // splits them by type
  // each comment is tagged with a CodeMirror Position or Range

  let children:CommentElem[] = [];
  for(let comment of state.comments) {
    let actions = [];
    if(comment.actions) {
      for(let action of comment.actions) {
        let elem = {c: `comment-action`, text: action, comment};
      }
    }

    let elem = {c: `comment ${comment.type}`, children: [
      comment.title ? {c: "label", text: comment.title} : undefined,
      comment.description ? {c: "description", text: comment.description} : undefined,
      actions.length ? {c: "quick-actions", children: actions} : undefined,
    ]};
  }

  return {c: "comments-pane", children};
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
// New Block
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

var fakeComments:Comment[] = [
];

interface IDEState {
  navigator:NavigatorState,
  editor:EditorState,
  comments:CommentsState
}
let magicalEditorState:IDEState = {
  navigator: {open: true, rootId: "root", nodes: fakeNodes},
  editor: {},
  comments: {comments: fakeComments}
};

function editorRoot(state:IDEState):Elem {
  // Update child states as necessary

  return {c: `editor-root`, children: [
    navigatorPane(state.navigator),
    editorPane(state.editor),
    commentsPane(state.comments)
  ]};
}

//// DEBUG
render();
