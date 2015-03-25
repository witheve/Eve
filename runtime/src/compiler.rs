use value::Relation;
use index::Index;

// TODO
// check schema table
// check schemas on every table
// check every input is a view with kind=input
// gather function refs (change function to take ixes?)
// poison rows in rounds until changes stop
//   foreign keys don't exist or are poisoned
//   ixes are not 0-n
// order upstream deps
// gather downstream deps
// stratify and schedule (warn about cycles through aggregates)