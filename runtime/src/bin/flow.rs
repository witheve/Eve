extern crate eve;

use eve::solver::Value::*;
use eve::index::*;
use eve::solver::*;
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
    let paths = vec![
        vec![String("a".to_string()), String("c".to_string())],
        vec![String("b".to_string()), String("d".to_string())],
        vec![String("c".to_string()), String("b".to_string())],
        vec![String("d".to_string()), String("c".to_string())],
    ].into_iter().collect();
    let from_eq_to = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: Ref::Value{
            clause: 0,
            column: 1,
        }
    };
    let step_query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![from_eq_to]}),
    ]};
    let edge_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: true,
    }));
    let path_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: true,
    }));
    let step_state = Rc::new(RefCell::new(NodeState{
        value: Index::new(),
        dirty: true,
    }));
    let flow = Flow{
        nodes: vec![
            Node{
                id: "edge".to_string(),
                view: View::Input(edges),
                state: edge_state.clone(),
                upstream: vec![],
                downstream: vec![step_state.clone()],
            },
            Node{
                id: "path".to_string(),
                view: View::Input(paths),
                state: path_state.clone(),
                upstream: vec![],
                downstream: vec![step_state.clone()],
            },
            Node{
                id: "step".to_string(),
                view: View::Query(step_query),
                state: step_state.clone(),
                upstream: vec![edge_state.clone(), path_state.clone()],
                downstream: vec![],
            },
        ]
    };
    flow.run();
    println!("{:?}", flow.nodes[2].state.borrow());
}