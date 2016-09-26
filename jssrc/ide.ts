import {Renderer} from "microReact";


type Elem = any;

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
interface NavigatorState {
}
function navigatorPane(state:NavigatorState):Elem {

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

interface EditorState {
}
function editorPane(state:EditorState):Elem {
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

interface CommentsState {
}
function commentsPane(state:CommentsState):Elem {
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
}

//---------------------------------------------------------
// New Block
//---------------------------------------------------------

/* - Button in left margin
 * - Only appears on blank lines with editor focused
 * - Text: Block / List / Quote / H(?)
 */

function newBlockBar():Elem {
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
}


//---------------------------------------------------------
// Root
//---------------------------------------------------------

interface IDEState {
  navigator:NavigatorState,
  editor:EditorState,
  comments:CommentsState
}
let magicalEditorState:IDEState = {};

function editorRoot(state:EditorState):Elem {
  // Update child states as necessary

  return {c: `editor-root` children: [
    navigatorPane(state.navigator),
    editorPane(state.editor),
    commentsPane(state.comments)
  ]};
}
