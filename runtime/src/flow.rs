use value::{Id, Relation};
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
}

#[derive(Clone, Debug)]
pub struct FlowState {
    pub outputs: Vec<RefCell<Relation>>,
    pub dirty: BitSet,
}

impl Union {
    fn run(&self, inputs: Vec<&Relation>) -> Relation {
        assert_eq!(inputs.len(), self.mappings.len());
        let mut index = Index::new();
        for (input, &(max_len, ref mapping)) in inputs.iter().zip(self.mappings.iter()) {
            for tuple in input.iter() {
                // TODO this ugliness is due to storing backtrack info inline with results
                if tuple.len() == max_len {
                    let mut output = Vec::with_capacity(mapping.len());
                    for &(outer, inner) in mapping.iter() {
                        output.push(tuple[outer][inner].clone());
                    }
                    index.insert(output);
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
    pub fn run(&self, state: &mut FlowState) {
        loop {
            match state.dirty.iter().next() {
                Some(ix) => {
                    state.dirty.remove(&ix);
                    let node = &self.nodes[ix];
                    let new_output = {
                        let upstream = node.upstream.iter().map(|uix| state.outputs[*uix].borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|output_ref| &**output_ref).collect();
                        node.view.run(inputs)
                    };
                    if new_output != *state.outputs[ix].borrow() {
                        for dix in node.downstream.iter() {
                            state.dirty.insert(*dix);
                        }
                    }
                    *state.outputs[ix].borrow_mut() = new_output;
                    continue;
                }
                None => {
                    break;
                }
            }
        }
    }
}