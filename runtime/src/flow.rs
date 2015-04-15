use value::{Id, Tuple, Relation};
use index;
use index::Index;
use query::Query;

use std::cell::RefCell;
use std::collections::BitSet;

#[derive(Clone, Debug)]
pub struct Union{
    // max_len, vec[(column_ix, tuple_ix)]
    pub mappings: Vec<(usize, Vec<(usize, usize)>)>,
}

#[derive(Clone, Debug)]
pub enum View {
    Input,
    Query(Query),
    Union(Union),
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub view: View,
    pub upstream: Vec<usize>,
    pub downstream: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
    pub states: Vec<RefCell<Relation>>,
    pub dirty: BitSet,
}

pub type Changes = Vec<(Id, index::Changes<Tuple>)>;

impl Union {
    fn run(&self, inputs: Vec<&Relation>) -> Relation {
        assert_eq!(inputs.len(), self.mappings.len());
        let mut index = Index::new();
        for (input, &(max_len, ref mapping)) in inputs.iter().zip(self.mappings.iter()) {
            for tuple in input.iter() {
                // TODO this ugliness is due to storing backtrack info inline with results
                if tuple.len() == max_len {
                    let mut state = Vec::with_capacity(mapping.len());
                    for &(outer, inner) in mapping.iter() {
                        state.push(tuple[outer][inner].clone());
                    }
                    index.insert(state);
                }
            }
        }
        index
    }
}

impl View {
    fn run(&self, inputs: Vec<&Relation>) -> Relation {
        match *self {
            View::Input => panic!("Input should never be dirty"),
            View::Query(ref query) => query.iter(inputs).collect(),
            View::Union(ref union) => union.run(inputs),
        }
    }
}

impl Flow {
    pub fn run(&mut self) {
        loop {
            match self.dirty.iter().next() {
                Some(ix) => {
                    self.dirty.remove(&ix);
                    let node = &self.nodes[ix];
                    let new_state = {
                        let upstream = node.upstream.iter().map(|uix| self.states[*uix].borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|state_ref| &**state_ref).collect();
                        node.view.run(inputs)
                    };
                    if new_state != *self.states[ix].borrow() {
                        for dix in node.downstream.iter() {
                            self.dirty.insert(*dix);
                        }
                    }
                    *self.states[ix].borrow_mut() = new_state;
                    continue;
                }
                None => {
                    break;
                }
            }
        }
    }

    pub fn changes_since(&self, before: &Flow) -> Changes {
        let after = self;
        let mut changes = Vec::new();
        for (after_ix, after_node) in after.nodes.iter().enumerate() {
            let id = &after_node.id;
            match before.nodes.iter().position(|before_node| before_node.id == *id) {
                Some(before_ix) => {
                    let after_state = after.states[after_ix].borrow();
                    let before_state = before.states[before_ix].borrow();
                    changes.push((id.clone(), after_state.changes_since(&*before_state)));
                }
                None => {
                    let after_state = after.states[after_ix].borrow();
                    let inserted = after_state.iter().map(|t| t.clone()).collect();
                    changes.push((id.clone(), index::Changes{inserted: inserted, removed: Vec::new()}));
                }
            }
        }
        for (before_ix, before_node) in before.nodes.iter().enumerate() {
            let id = &before_node.id;
            match after.nodes.iter().position(|after_node| after_node.id == *id) {
                Some(_) => (), // already handled above
                None => {
                    let before_state = before.states[before_ix].borrow();
                    let removed = before_state.iter().map(|t| t.clone()).collect();
                    changes.push((id.clone(), index::Changes{inserted: Vec::new(), removed: removed}));
                }
            }
        }
        changes
    }
}