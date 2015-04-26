use value::{Id, Tuple, Relation};
use index;
use index::Index;
use query::{Ref, Query};

use std::cell;
use std::collections::BitSet;
use std::mem::replace;

#[derive(Clone, Debug)]
pub struct Union{
    pub mappings: Vec<(usize, Vec<Ref>)>,
}

#[derive(Clone, Debug)]
pub enum View {
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
    pub inputs: Vec<cell::RefCell<Relation>>,
    pub outputs: Vec<cell::RefCell<Relation>>,
    pub dirty: BitSet,
    pub changes: Changes,
}

impl Union {
    fn run(&self, old_input: &Relation, inputs: Vec<&Relation>) -> Relation {
        assert_eq!(inputs.len(), self.mappings.len());
        let mut output = old_input.clone();
        for (input, &(max_len, ref references)) in inputs.iter().zip(self.mappings.iter()) {
            for tuple in input.iter() {
                // TODO this ugliness is due to storing backtrack info inline with results
                if tuple.len() == max_len {
                    let mut mapped_tuple = Vec::with_capacity(references.len());
                    for reference in references.iter() {
                        mapped_tuple.push(reference.resolve(tuple, None).clone());
                    }
                    output.insert(mapped_tuple);
                }
            }
        }
        output
    }
}

impl View {
    fn run(&self, old_input: &Relation, inputs: Vec<&Relation>) -> Relation {
        match *self {
            View::Query(ref query) => query.iter(inputs).collect(),
            View::Union(ref union) => union.run(old_input, inputs),
        }
    }
}

impl Flow {
    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn get_input_mut(&self, id: &str) -> cell::RefMut<Relation> {
        self.inputs[self.get_ix(id).unwrap()].borrow_mut()
    }

    pub fn get_output(&self, id: &str) -> cell::Ref<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow()
    }

    pub fn ensure_union_exists(&mut self, id: &str) {
        match self.get_ix(id) {
            Some(ix) => {
                let node = &self.nodes[ix];
                assert!(match node.view {View::Union(_) => true, _ => false});
            }
            None => {
                self.nodes.push(Node{
                    id: id.to_string(),
                    view: View::Union(Union{mappings: vec![]}),
                    upstream: vec![],
                    downstream: vec![],
                });
                self.inputs.push(cell::RefCell::new(Index::new()));
                self.outputs.push(cell::RefCell::new(Index::new()));
            }
        }
    }

    pub fn change(&mut self, changes: Changes) {
        for (id, changes) in changes.into_iter() {
            self.ensure_union_exists(&id);
            let ix = self.get_ix(&id).unwrap();
            self.inputs[ix].borrow_mut().change(changes.clone());
            self.dirty.insert(ix);
        }
    }

    pub fn run(&mut self) {
        loop {
            match self.dirty.iter().next() {
                Some(ix) => {
                    self.dirty.remove(&ix);
                    let node = &self.nodes[ix];
                    let new_output = {
                        let old_input = self.inputs[ix].borrow();
                        let upstream = node.upstream.iter().map(|uix| self.outputs[*uix].borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|output_ref| &**output_ref).collect();
                        node.view.run(&*old_input, inputs)
                    };
                    let mut old_output = self.outputs[ix].borrow_mut();
                    if new_output != *old_output {
                        for dix in node.downstream.iter() {
                            self.dirty.insert(*dix);
                        }
                        let changes = new_output.changes_since(&*old_output);
                        self.changes.push((node.id.clone(), changes));
                    }
                    *old_output = new_output;
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
                    let after_output = after.outputs[after_ix].borrow();
                    let before_output = before.outputs[before_ix].borrow();
                    changes.push((id.clone(), after_output.changes_since(&*before_output)));
                }
                None => {
                    let after_output = after.outputs[after_ix].borrow();
                    let inserted = after_output.iter().map(|t| t.clone()).collect();
                    changes.push((id.clone(), index::Changes{inserted: inserted, removed: Vec::new()}));
                }
            }
        }
        for (before_ix, before_node) in before.nodes.iter().enumerate() {
            let id = &before_node.id;
            match after.get_ix(id) {
                Some(_) => (), // already handled above
                None => {
                    let before_output = before.outputs[before_ix].borrow();
                    let removed = before_output.iter().map(|t| t.clone()).collect();
                    changes.push((id.clone(), index::Changes{inserted: Vec::new(), removed: removed}));
                }
            }
        }
        changes
    }

    pub fn take_changes(&mut self) -> Changes {
        let &mut Flow {ref mut changes, ..} = self;
        replace(changes, Vec::new())
    }
}
