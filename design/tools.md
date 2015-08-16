## Item selector

The item selector shows all views in the system along with a snapshot of their internal logic. The toolbar allows searching for existing views, creating/importing new views or deleting views. Clicking on a view selects it. Double-clicking on a view opens it.

Clicking the magnifying glass brings up Eve's universal search, allowing you to filter and search for individual items by name. Clicking on a result in the search will open it, or pressing enter will open the bottom-most result. The search also contains two different filters at the moment: `[field: *]` and `[tag: *]` which will limit the search to items that either contain a specific field or tag. For example: `[field: place]` will show me all views that have a `place` field or `[tag: editor] [tag: hidden]` will show me all the views that are tagged as both hidden and editor.

Search works well when you know what you are looking for. Exploring larger programs would benefit from structure though. (Roadmap: view tagging, dependency graph)

* __Ctrl-f/Cmd-f__ search

## Data editor

The toolbar has buttons for adding and removing entries and fields. The main panel has a form for adding/editing entries. Pressing enter while in a field will submit the entry. You can also modify the name of this data set, the description, or any of the field names by clicking on them. Clicking on an entry in the table at the bottom will select it and allow you to modify or delete it.

While we could have removed the top panel and allowed directly editing the table, Eve tables are unordered sets whereas our testers expected grid-like interfaces to preserve ordering and allow duplicates. The separation of grid and editor and the use of highlighting during data entry is intended to draw attention to this potentially counter-intuitive behaviour. We also found that people really liked having a nice form to insert entries with. (Roadmap: more sophisticated form fields (e.g. image entry, maps, etc), multi-entry editing)

* __Ctrl-f/Cmd-f__ search
* __Backspace__ delete
* __Enter__ submit entry
* __Tab__ goto next field

## Query editor

The query editor represents queries as graphs.

The top panel is the main workspace. The title and description at the top are editable. Use the universal search to pull existing views into the graph as sources. Dragging fields on top of eachother will join them. If you click on a source, we show a 'peek' of the contents of that view, which allows you to quickly see the bits of data that are being worked with. Double-clicking on a view navigates into it. You can Shift-click and drag-click to select groups of nodes.

All other actions are triggered from the toolbar. The tooltip on each button explains what it does and if it's disabled why it cannot be used with the given selection.

The bottom panel shows the results of the query in a table. The field names of the table are editable and mirror the names of the nodes they represent on the canvas.

* __Ctrl-f/Cmd-f__ search
* __Backspace__ delete

## Union editor

(Roadmap: union editor)

## Errors

Compiler errors, editor errors and runtime errors are all displayed in a red bubble in the top-right corner. Clicking on an error navigates to the culprit. For common compiler errors (such as deleting a field that is in use elsewhere) the error is also highlighted with options for automatically fixing it (eg remove this use of the field). (Roadmap: better info from compiler, readable messages for more errors, refactoring tool)

Views which produce compiler errors are frozen until they are fixed. Currently not all errors are viewable in the view finder. (Roadmap: highlight disable views)

Runtime errors (eg 0 + "foo") are only shown for the current state. There are no tools for tracking and handling to errors for programs with internal mutable state but the error table can be queried like any other view. (Roadmap: decide how to manage runtime errors)

## Version control

Eve uses [event sourcing](http://www.confluent.io/blog/making-sense-of-stream-processing/) for persistence. Every change event received from the editor or clients is appended to eve/runtime/autosave. From the settings menu you can save and load events files.

The editor also maintains it's own internal [event tree](http://www.emacswiki.org/emacs/UndoTree). Undo moves the up the tree and sends an reversed event to the server (swapping inserts and deletes). Redo moves down the tree and sends the original event to the server again. Other actions start a new branch from the current node.

Both of these are temporary solutions. (Roadmap: [version control](http://incidentalcomplexity.com/2015/04/22/version-control/), state timeline)

## Debugging

The editor can show the current state of any view. The join editor also shows 'peek' views when a source is selected. Making temporary joins is fairly effective for answering [specific questions](http://www.cs.cmu.edu/~NatProg/papers/MyersICPC2013NatProg.pdf) about the current state (eg are there any accounts that are not shown in the final report?).

The program itself and the internal state of the compiler are stored in tables which can be seen by checking 'show hidden' in the settings menu. These are useful for debugging internal errors or for understanding scheduling decisions.

Areas to improve:

* It can be difficult to figure out where results are getting lost in large queries. (Roadmap: extend peek to handle arbitrary selections)
* The existing tools can't debug infinite loops because the server never returns. (Roadmap: incremental results, interrupts)
* There are no tools for debugging internal mutable state. (Roadmap: state timeline)
* Following data backwards through views to find out where it came from is possible but tedious. (Roadmap: [provenance debugger](http://yanniss.github.io/DeclarativeDebugging.pdf))
* There is no way to find out why a program is running slowly. (Roadmap: [reflected runtime data](http://www.neilconway.org/docs/booma_eurosys2010.pdf), profiling tool)
