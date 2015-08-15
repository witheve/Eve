# Eve architecture overview

Eve currently consists of a runtime written in Rust and a UI written in TypeScript.

## Runtime

The runtime contains a database, a compiler, and a query interpreter all written in Rust.

### value.rs

Deals with individual Eve values and coercions between different types.

### relation.rs

True [relations](https://en.wikipedia.org/wiki/Relation_%28database%29) - unordered sets of tuples with unordered fields. By varying the order in which fields and rows are stored these will also act as indexes, although the current join algorithm doesn't make use of ordering.

### map.rs

An experimental perstent set, intended to eventually replace BTreeSet in relation.rs.

### primitive.rs

Handles primitive Eve views such as addition. Currently primitives are run row-at-a-time and return sets of results. Errors are handled by returning an empty set and appending a message to the error table.

### view.rs

Calculates the value of views. Joins are implemented using a naive backtracking search. Unions simply append source relations into a single output relation.

### flow.rs

Manages the dataflow graph that ties views together. Tracks changes to individual views and ensures that downstream views are up to date. Also tracks total changes since previous versions so we can send diffs between different Eve processes.

### compiler.rs

Responsible for building a new flow whenever the underlying code changes and for preserving as much state as possible across compiles. Most of the decision making is intended to be bootstrapped and is currently written using a set of macros that mimic Eve joins.

### login.rs

Experimental support for authentication using [AuthRocket](https://authrocket.com/). Also serves static files used by the editor, since some browsers have restricted access to the filesystem.

### server.rs

Manages the [sync protocol](./io.md#communication) by which Eve processes communicate with each other and with the editor.

## UI

The UI is a browser-based IDE that talks to the runtime over a websocket. The main entry point into it is `editor.ts`, which contains the bulk of the IDE, but before we dive into there, we should talk about a few of the things we built to support it.

### microReact.ts

The UI is written using a very simple virtual-dom library called microReact, which evolved out of performance and debugging issues we had with React coupled with the fact that our data is stored in normalized tables, which makes using things like `shouldComponentUpdate` very unnatural. In microReact, we us regular JS objects to represent DOM nodes, which look like so:

```javascript
{
    t: "span", // the tag type, if none is specified, "div" is assumed. We use "div" for almost everything.
    c: "flow-right", // className
    text: "Hello world!", // text content of this element
    children: [{...}], // an array of more microReact nodes that are children
    // style-related attributes are just on the node, e.g:
    top: 10,
    width: 100,
    // event handlers are passed at the root-level too
    click: doSomething,
    // you can use SVG properties by setting svg: true
    svg: true,
    cx: 5,
    cy: 5,
    // you can also be notified when you are rendered. This function is called both on insertion and update.
    postRender: doSomeScaryDomManipulation
}
```

We made microReact specifically for the UI challenges we were facing in Eve, it's likely missing many things you may be used to or doesn't do certain things you want. We don't mean for it to be general purpose and we're making no claims about whether or not it's any good - it just happens to fit our somewhat unusual requirements.

### indexer.ts

Because all of our data/code is stored in a relational database, we need a nice way to index into that data. The indexer provides a simple api to grab rows out of a table that match some specific set of equality constraints. To make this efficient, it builds indexes on the fly based on the way you ask for data.

```javascript
var ixer = new Indexing.Indexer();
ixer.select("users", {name: "foo"});
```

Right now the indexer contains a bunch of complexity as a result of migrating rows being arrays to rows being objects, so it's a bit messier than we'd like, though that'll be going away soon. The indexer is updated via diffs that determine which rows should be inserted or removed. Every update from the server goes through that mechanism and the UI pulls data out of the updated indexes as it's needed to redraw.

### api.ts

This contains the write-API we use to generate diffs in the system. The API validates that you have all the fields you need and generally makes sure you don't mess up the format of the diffs.

```javascript
api.insert("user", {name: "chris", age: 28});
api.remove("user", {name: "joe"}); // this will find any user that matches the pattern and remove them
```

This file also contains some other general methods that are used in lots of places as well as constants like keyCode mappings.

### client.ts

This file handles the connection between the UI and the server via websocket.

### glossary.ts

This file contains a couple of objects that contain all the descriptions we use for the various terms in the system.

### layout.ts

This file contains the simple stochastic graph-layout algorithm that we use to place nodes on the canvas in the query editor.

### tableEditor.ts

This is mostly a vestige of previous versions and now only contains the code used to render a table of values. This is used in the current editor to draw results tables and to show entries in data tables.

### editor.ts

This is where all the magic happens. It follows the unidirectional dataflow approach by using a giant dispatch function. Every possible event in the system goes through the `dispatch` function, which makes it possible to stick a single `console.log` in the code to see the complete flow through any part of the IDE. While in dispatch, a set of diffs is built up and then passed off to be applied both locally to the indexer and sent to the server. After which, render is called and we build up a set of microReact elements that get passed off to be rendered into the DOM. All DOM changes are currently batched, so anything that might cause faster-than-framepaint updates is throttled appropriately.

Client-only state is stored in a global localState object. This is used for tracking things like current drag position or intermediate states of edits that we don't want to pollute the real data. While we don't think this is the best solution, it's worked out well for us so far.