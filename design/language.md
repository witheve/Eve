Eve is a variant of [Datalog](https://en.wikipedia.org/wiki/Datalog), based heavily on [Dedalus](http://www.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-173.html) and [Functional-Relational Programming](http://shaffner.us/cs/papers/tarpit.pdf). It is a general-purpose, data-centric, interactive language. Picture a relational spreadsheet with I/O.

## Views

An Eve program is made up of a set of __views__. Views exist in a single global namespace and are identified by [UUIDs](https://en.wikipedia.org/wiki/Universally_unique_identifier). Views are also given human-readable names and descriptions but these are used solely for the editor - the underlying code always refers directly to ids.

There are several types of views:

* __Tables__ contain data from the outside world. They can be modified by the user or by other programs.

* __Joins__ combine and filter data from multiple views. They can [join](https://en.wikipedia.org/wiki/Relational_algebra#Joins_and_join-like_operators), group, aggregate, sort, limit and filter relations.

* __Unions__ feed multiple views into a single point. (Roadmap: union editor)

* __Primitives__ represent built-in functions such as addition.

The websocket protocol described in [IO](./io.md#communication) allows other programs (including the Eve editor) to make changes to tables and to read data from any view. Whenever a view is changed, all the views that depend on it are updated, just like a spreadsheet.

## Data

The output of a view is a [relation](https://en.wikipedia.org/wiki/Relation_%28database%29). [Unlike SQL](http://airbladesoftware.com/notes/relational-databases-are-not-relational/) these are true relations - sets of tuples with unordered fields.

Relations contain __values__. Eve values are [stringly-typed](http://c2.com/cgi/wiki?StringlyTyped) ie from the point of view of the user everything is just text-in-a-box. Internally we store strings, floats, booleans and arrays and we coerce between these types as necessary. (Roadmap: strong typing, custom types).

## Joins

Roughly speaking, joins perform these steps:

* Grab the current relation for each source view
* Optionally: negate some relations
* Optionally: sort some relations and number the rows from 1..n
* Optionally: group some relations and collapse the non-grouped fields into array values
* Rename fields according to the list of variable bindings
* Filter rows which do not match the list of constants
* Take the [natural join](https://en.wikipedia.org/wiki/Relational_algebra#.E2.8B.88) of all the relations
* Drop fields that are not wanted in the output

The current implementation is a simple backtracking search. (Roadmap: fast joins once the language is settled)

Since primitives such as addition are infinite relations, we require that every input field must be joined against at least one finite relation. Similary, if a field of a negated source is joined at all, it must be joined against at least one finite relation. (The compiler is actually more allowing - it will allow any join for which it can find an execution order that is finite at every step).

Aggregation is currently handled using grouping and primitives. Grouping a relation turns the non-grouped fields into arrays of values. Primitives such as `count` and `sum` take arrays as inputs. We have been through countless different designs for grouping / sorting / aggregation and this is likely to change again in the future.

## Unions

Roughly speaking, unions perform these steps:

* Grab the current relation for each source view
* Optionally: negate some relations
* Insert constants and rename/drop fields according to the field mappings
* Take the [union](https://en.wikipedia.org/wiki/Union_%28set_theory%29) of all the relations

## Recursion

The graph of dependencies between views may contain cycles. Views can even depend on themselves. It is possible to write infinite loops and even contradictions (insert "foo" in x if x does not contain "foo"). For cycles that do not involve negation, grouping or sorting, if a finite answer exists then Eve will find it. For cycles that do involve negation, grouping or sorting the behaviour is currently undefined.

(Roadmap: [stratification](http://webdam.inria.fr/Alice/pdfs/Chapter-15.pdf))

## Time and state

The language described so far is surprisingly powerful. Addition, recursion and aggregates are enough to implement a Turing machine. [Edelweiss](http://db.cs.berkeley.edu/papers/vldb14-edelweiss.pdf) demonstrates that it is possible to write entire programs in this style - where inputs are appended to a table and the outputs are computed as pure views over the inputs.

Nethertheless, there are cases where we have found mutable state to be useful:

* Some programs are easier to express given some internal mutable state (eg it's much easier to describe the state of a stock exchange as a function of it's current state and a single message rather than as a function of all the messages ever received).

* Many programs can save memory by compacting or deleting old inputs (in some cases this may even be a legal requirement eg removing a user's personal info after they leave).

We are still experimenting with different ways to express mutable state. The most succesfull so far is emulating [Bloom](http://boom.cs.berkeley.edu/) by allowing unions to refer to their own previous state. This allows expressing updates such as new_foo = old_foo + stuff_to_remember - stuff_to_forget. We used this approach in our [foursquare clone](http://incidentalcomplexity.com/2015/07/02/march-april-may-june/).

The currently released version does not expose any mutable state. (Roadmap: history in unions again?).

## Error handling

Primitive views can cause errors (eg 1 + "foo", 1 / 0). Since we treat we treat primitive functions as relations, bad inputs simply don't have a corresponding output and don't produce a result. In practice though, bad inputs probably indicate user error so we additionally record the error in a special view which is displayed in the editor. The error view can be queried like any other view - we can use this to experiment with different strategies for reacting to runtime errors in larger applications.

## Code

The code for an Eve program is stored in tables in the program itself. Whenever the code tables change we recompile before recalculating. Just like a spreadsheet, we can recompile without losing the state of the program. (Roadmap: allow user-supplied migrations for tables).

Since Eve is an interactive language, the code may often be broken (eg referring to a view that no longer exists). Rather than waiting until every error has been fixed, we freeze any views that are broken and continue to run all the others. The editor provides warnings about disabled views and advice on how to fix them. This allows users to see the results of their changes immediately during exploratory programming.