use std::collections::BitSet;
use std::mem::replace;
use std::cell::{RefCell, Ref, RefMut};

use value::Id;
use relation::{Change, Relation};
use view::{View, Table};
use compiler;

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub view: View,
    pub upstream: Vec<usize>,
    pub downstream: Vec<usize>,
}

pub type Changes = Vec<(Id, Change)>;

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
    pub outputs: Vec<RefCell<Relation>>,
    pub dirty: BitSet,
}

impl Flow {
    pub fn new() -> Self {
        let mut flow = Flow {
            nodes: Vec::new(),
            outputs: Vec::new(),
            dirty: BitSet::new(),
        };
        for (id, unique_fields, other_fields) in compiler::schema().into_iter() {
            let node = Node{
                id: id.to_owned(),
                view: View::Table(Table),
                upstream: Vec::new(),
                downstream: Vec::new(),
            };
            let fields = unique_fields.iter().chain(other_fields.iter())
                .map(|&field| field.to_owned()).collect();
            let relation = RefCell::new(Relation::with_fields(fields));
            flow.nodes.push(node);
            flow.outputs.push(relation);
        }
        // TODO insert compiler_schema as view / field
        flow
    }

    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn get_output(&self, id: &str) -> Ref<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow()
    }

    pub fn get_output_mut(&self, id: &str) -> RefMut<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow_mut()
    }

    pub fn set_output(&mut self, id: &str, output: RefCell<Relation>) {
        let ix = self.get_ix(id).unwrap();
        self.outputs[ix] = output;
    }

    pub fn change(&mut self, changes: &Changes) {
        for &(ref id, ref changes) in changes.iter() {
            match self.get_ix(&*id) {
                Some(ix) => match self.nodes[ix].view {
                    View::Table(_) => {
                        self.outputs[ix].borrow_mut().change(changes);
                        self.dirty.insert(ix);
                    }
                    // _ => panic!("Tried to insert into a non-table view with id: {:?}", id),
                },
                None => panic!("Tried to insert into a non-existent view with id: {:?}", id),
            }
        }
    }

    pub fn as_changes(&self) -> Changes {
        (0..self.nodes.len()).map(|ix|
            (
                self.nodes[ix].id.clone(),
                self.outputs[ix].borrow().as_insert()
            )
        ).collect()
    }

    pub fn recalculate(&mut self, changes: &mut Changes) {
        // TODO
    }

    pub fn tick(&mut self, changes: &mut Changes) {
        // TODO
    }

    pub fn quiesce(mut self, mut changes: Changes) -> (Self, Changes) {
        self.change(&changes);
        let mut changes_seen = changes.len();
        loop {
            if compiler::needs_recompile(&changes[changes_seen..]) {
                self = compiler::recompile(self, &mut changes);
            }
            self.recalculate(&mut changes);
            self.tick(&mut changes);
            if changes.len() == changes_seen {
                break;
            } else {
                changes_seen = changes.len();
            }
        }
        (self, changes)
    }
}
