use value::Relation;
use index::Index;
use query::Query;

use std::rc::Rc;
use std::cell::RefCell;

#[derive(Clone, Debug)]
pub struct Union{
    pub mappings: Vec<(usize, Vec<(usize, usize)>)>,
}

#[derive(Clone, Debug)]
pub enum View {
    Input(Relation),
    Query(Query),
    Union(Union),
}

#[derive(Clone, Debug)]
pub struct NodeState {
    pub value: Relation,
    pub dirty: bool,
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: String,
    pub view: View,
    pub state: Rc<RefCell<NodeState>>,
    pub upstream: Vec<Rc<RefCell<NodeState>>>,
    pub downstream: Vec<Rc<RefCell<NodeState>>>,
}

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
}

impl Union {
    fn run(&self, inputs: Vec<&Relation>) -> Relation {
        assert_eq!(inputs.len(), self.mappings.len());
        let mut index = Index::new();
        for (input, &(max_len, ref mapping)) in inputs.iter().zip(self.mappings.iter()) {
            for tuple in input.iter() {
                println!("{:?} {:?}", tuple, mapping);
                // TODO this ugliness is due to storing backtrack info inline with results
                if tuple.len() == max_len {
                    let mut output = Vec::with_capacity(mapping.len());
                    for &(outer, inner) in mapping.iter() {
                        output.push(tuple[outer][inner].clone());
                    }
                    index.insert(output, 1);
                }
            }
        }
        index
    }
}

impl View {
    fn run(&self, inputs: Vec<&Relation>) -> Relation {
        match *self {
            View::Input(ref relation) => relation.clone(),
            View::Query(ref query) => query.iter(inputs).collect(),
            View::Union(ref union) => union.run(inputs),
        }
    }
}

impl Flow {
    pub fn run(&self) -> Self {
        let flow = self.clone(); // TODO this does not actually clone the states :(
        loop {
            match flow.nodes.iter().find(|node_ref| node_ref.state.borrow().dirty) {
                Some(node) => {
                    let new_value = {
                        let upstream = node.upstream.iter().map(|state| state.borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|node| &node.value).collect();
                        node.view.run(inputs)
                    };
                    let changed = {
                        let mut state = node.state.borrow_mut();
                        let changed = state.value != new_value;
                        state.value = new_value;
                        state.dirty = false;
                        changed
                    };
                    if changed {
                        for state in node.downstream.iter() {
                            state.borrow_mut().dirty = true;
                        }
                    }
                    continue;
                }
                None => {
                    break;
                }
            }
        }
        flow
    }
}