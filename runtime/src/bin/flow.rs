extern crate eve;

use eve::value::Value::*;
use eve::index::*;
use eve::query::*;
use eve::flow::*;

use std::rc::Rc;
use std::cell::RefCell;

fn main() {
    let edges = vec![
        vec![String("a".to_string()), String("b".to_string())],
        vec![String("b".to_string()), String("c".to_string())],
        vec![String("c".to_string()), String("d".to_string())],
        vec![String("d".to_string()), String("b".to_string())],
    ].into_iter().collect();
    let path_union = Union{
        mappings: vec![(1, vec![(0, 0), (0, 1)]), (2, vec![(0, 0), (1, 1)])],
    };
    let first_step_query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
    ]};
    let from_eq_to = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: Ref::Value{
            clause: 0,
            column: 1,
        }
    };
    let next_step_query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![from_eq_to]}),
    ]};
    let edge_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: true,
    }));
    let path_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: false,
    }));
    let first_step_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: false,
    }));
    let next_step_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: false,
    }));
    let flow = Flow{
        nodes: vec![
            Node{
                id: "edge".to_string(),
                view: View::Input(edges),
                state: edge_state.clone(),
                upstream: vec![],
                downstream: vec![first_step_state.clone(), next_step_state.clone()],
            },
            Node{
                id: "path".to_string(),
                view: View::Union(path_union),
                state: path_state.clone(),
                upstream: vec![first_step_state.clone(), next_step_state.clone()],
                downstream: vec![next_step_state.clone()],
            },
            Node{
                id: "next_step".to_string(),
                view: View::Query(next_step_query),
                state: next_step_state.clone(),
                upstream: vec![edge_state.clone(), path_state.clone()],
                downstream: vec![path_state.clone()],
            },
            Node{
                id: "first_step".to_string(),
                view: View::Query(first_step_query),
                state: first_step_state.clone(),
                upstream: vec![edge_state.clone()],
                downstream: vec![path_state.clone()],
            },
        ]
    };
    flow.run();
    println!("{:?}", flow.nodes[0].state.borrow());
    println!("{:?}", flow.nodes[1].state.borrow());
    println!("{:?}", flow.nodes[2].state.borrow());
    println!("{:?}", flow.nodes[3].state.borrow());
}