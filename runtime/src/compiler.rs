use value::{Id, Relation};
use index::Index;

use std::collections::btree_map::{BTreeMap, Entry};
use std::cell::{RefCell, RefMut};

#[derive(Clone, Debug)]
struct World {
    views: BTreeMap<Id, RefCell<Relation>>,
}

impl World {
    fn view<Id: ToString>(&mut self, id: Id) -> RefMut<Relation> {
        match self.views.entry(id.to_string()) {
            Entry::Vacant(vacant) => {
                let relation = RefCell::new(Index::new());
                vacant.insert(relation).borrow_mut()
            }
            Entry::Occupied(occupied) => {
                occupied.into_mut().borrow_mut()
            }
        }
    }
}

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