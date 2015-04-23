use value::{Id, Tuple, Relation};
use index;
use index::Index;
use query::Query;

use std::cell::{RefCell, Ref, RefMut};
use std::collections::BitSet;

#[derive(Clone, Debug)]
pub struct Union{
    // TODO mappings is messy - will be fixed if we unify unions and queries
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

pub type Changes = Vec<(Id, index::Changes<Tuple>)>;

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
    pub states: Vec<RefCell<Relation>>,
    pub dirty: BitSet,
    pub changes: Changes,
}

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
    pub fn new() -> Flow {
        Flow {
            nodes: Vec::new(),
            states: Vec::new(),
            dirty: BitSet::new(),
            changes: Vec::new(),
        }
    }

    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn get_state(&self, id: &str) -> Ref<Relation> {
        self.states[self.get_ix(id).unwrap()].borrow()
    }

    pub fn get_state_mut(&self, id: &str) -> RefMut<Relation> {
        self.states[self.get_ix(id).unwrap()].borrow_mut()
    }

    pub fn ensure_input_exists(&mut self, id: &str) {
        match self.get_ix(id) {
            Some(ix) => {
                let node = &self.nodes[ix];
                assert!(match node.view {View::Input => true, _ => false});
            }
            None => {
                self.nodes.push(Node{
                    id: id.to_string(),
                    view: View::Input,
                    upstream: vec![],
                    downstream: vec![],
                });
                self.states.push(RefCell::new(Index::new()))
            }
        }
    }

    pub fn change(&mut self, changes: Changes) {
        for (id, changes) in changes.into_iter() {
            self.ensure_input_exists(&id);
            self.get_state_mut(&id).change(changes.clone());
            self.changes.push((id, changes));
        }
    }

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
                    let mut old_state = self.states[ix].borrow_mut();
                    if new_state != *old_state {
                        for dix in node.downstream.iter() {
                            self.dirty.insert(*dix);
                        }
                        let changes = new_state.changes_since(&*old_state);
                        self.changes.push((node.id.clone(), changes));
                    }
                    *old_state = new_state;
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
            match before.get_ix(id) {
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
            match after.get_ix(id) {
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