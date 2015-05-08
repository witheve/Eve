use std::collections::BitSet;
use std::mem::replace;
use std::ops::IndexMut;
use std::cell::RefCell;

use value::Id;
use relation;
use relation::Relation;
use view::{View, Table};
use compiler::compiler_schema;

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub view: View,
    pub upstream: Vec<usize>,
    pub downstream: Vec<usize>,
}

pub type Changes = Vec<(Id, relation::Changes)>;

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
//    pub outputs: Vec<RefCell<Relation>>,
    pub changes: Changes,
    pub dirty: BitSet,
}

impl Flow {
    pub fn new() -> Self {
        let mut flow = Flow {
            nodes: Vec::new(),
            changes: Vec::new(),
            dirty: BitSet::new(),
        };
        for (id, unique_fields, other_fields) in compiler_schema().into_iter() {
            let fields = unique_fields.iter().chain(other_fields.iter())
                .map(|&field| field.to_owned()).collect();
            let relation = Relation::with_fields(fields);
            let view = View::Table(Table{relation: RefCell::new(relation)});
            let node = Node{
                id: id.to_owned(),
                view: view,
                upstream: Vec::new(),
                downstream: Vec::new(),
            };
            flow.nodes.push(node);
        }
        // TODO insert compiler_schema as view / field
        flow
    }

    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn change(&mut self, changes: Changes) {
        for (id, changes) in changes.into_iter() {
            match self.get_ix(&*id) {
                Some(ix) => match self.nodes.index_mut(ix).view {
                    View::Table(ref mut table) => {
                        table.relation.borrow_mut().change(&changes);
                        self.dirty.insert(ix);
                        self.changes.push((id, changes));
                    }
                    // _ => panic!("Tried to insert into a non-table view with id: {:?}", id),
                },
                None => panic!("Tried to insert into a non-existent view with id: {:?}", id),
            }
        }
    }

    pub fn as_changes(&self) -> Changes {
        self.nodes.iter().map(|node| (node.id.clone(), node.view.as_changes())).collect()
    }

    pub fn take_changes(&mut self) -> Changes {
        let &mut Flow {ref mut changes, ..} = self;
        replace(changes, Vec::new())
    }
}
