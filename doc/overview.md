# A very simple and incomplete overview of Eve

Eve is currently written in JavaScript with a couple of sweet.js macros that are degined in src/macros.sjs. To start the server and get going you'll need node and npm installed, and then run:

```shell
npm install
npm run dev
```

Then open http://localhost:3000 in a browser.

# Vocabulary

* **System** - The structure that holds all the views in the database and is resonsible for turning code into a plan for execution.
* **Memory** - The structure that holds the values of a view in the database. These are copy-on-write.
* **View** - A table in the database that may either be constant or built from queries.
* **Field** - A column in a view
* **Query** - A view can be populated by a query (a set of relational algebra operations) or even multiple queries (this is how recursion works). Queries are what "code" in Eve is attached to.
* **ConstantConstraint** - Ensures that the value of a column is the given constant. This is how you would create a column with a constant value, as well as create a filter for a column that is populated by something else.
* **ViewConstraint** - You can think of this as a "FROM" in SQL. It defines that a query is going to pull from some other view.
* **ViewConstraintBinding** - These define the fields of the ViewConstraint that you want to pull into this view and what local fields should be populated with their values.
* **FunctionConstraint** - Defines a fuction that will be computed and which field that value should be placed in.
* **FunctionConstraintInput** - Defines the fields that should be passed to the given function and what their names should be.
* **AggregateConstraint** - Defines a function that will aggregate over the given view and what field the result should be placed in.
* **AggregatConstraintBinding** - Allows you to bind local fields to fields in the table that is being aggregated over. This is how groups work.
* **AggregateConstraintSolverInput** - Allows you to reference local fields in the aggregate function
* **AggregateConstraintAggregateInput** - Defines the fields of the view currently being aggregated over that should be available in the aggregate function.

# Code breakdown

Due to the iterative nature of how we work on Eve, the code is likely unusual compared to what you're used to and it isn't designed in such a way that it might fit the "best practices" the industry often takes. As such, if it seems obtuse, it's definitely not you; it's us.

##Eve runtime

The Eve runtime is defined in src/eve.js. This code will be hard to follow and is fairly unusual as it implements a relational engine and the structures in which data lives. It currently evaluates queries via a constraint solver that treats the problem geometrically, where you can think of joining as systematically reducing the space of all possible combinations to only ones where values intersect. If you're particularly interested in this bit, it's probably easier to just talk with us about it.

##Eve editor

That vast majority of the code in the codebase revolves around making the editor. The editor relies on the runtime as we use an eve system to store information about the program as well as the UI. That sysetm receives diffs from an Eve program that is running in a webworker and then draws the UI based on the diffs it sees. This editor is built on react, though the running Eve program uses a different mechanism to render itself (found in IncrementalUI.js). The flow of information is basically:

1) Start a webworker that runs an Eve program via bootstrap.js and worker.js
2) As new information is materialized in the worker, diffs are sent from the worker to the editor (in ide.js)
3) Those diffs are applied to the editor's system and the UI is redrawn.
4) As input happens in the editor, events are translated into diffs to the editor's system and applied. (every event is handled by `dispatch()` in ide.js)
5) If those editor diffs would change something about the running program, they are forwarded to the worker.

As such, it's based on single direction data flow, where the editor system is the source of all truth for the UI and for the code that ends up running in the webworker.

* **editor/bootstrap.js** - initial setup of examples, and creates the first webworker for the editor
* **editor/worker.js** - the code that runs Eve in a worker
* **editor/ide.js** - the rendering and event handling code for the UI
* **editor/grid.js** - simple utility to start handling the grid layout we want for tiles in the editor
* **editor/indexer.js** - utility for creating and maintaining indexes of the information in the editor's copy of a system
* **editor/jsml.js** - utility for generating UI from an array-based DSL

##Eve Server

The server used to do more interesting things and ran a copy of Eve itself, but now it is just there to serve the examples.
