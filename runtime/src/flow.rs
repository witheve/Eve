use solver::{Value, Tuple, Relation, Query};

use std::rc::Rc;
use std::cell::RefCell;

#[derive(Clone, Debug)]
pub enum View {
    Input(Relation),
    Query(Query),
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

impl View {
    fn run(&self, inputs: Vec<&Relation>) -> Vec<Tuple> {
        match *self {
            View::Input(ref relation) => relation.iter().map(|tuple| tuple.clone()).collect(),
            View::Query(ref query) => query.iter(inputs).collect(),
        }
    }
}

impl Flow {
    pub fn run(&self) -> Self {
        let flow = self.clone();
        loop {
            match flow.nodes.iter().find(|node_ref| node_ref.state.borrow().dirty) {
                Some(node) => {
                    let new_value = {
                        let upstream = node.upstream.iter().map(|state| state.borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|node| &node.value).collect();
                        node.view.run(inputs).into_iter().collect()
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