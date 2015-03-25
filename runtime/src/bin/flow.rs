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
    let flow = Flow{
        nodes: vec![
            Node{
                id: "edge".to_string(),
                view: View::Input(edges),
                upstream: vec![],
                downstream: vec![2,3],
            },
            Node{
                id: "path".to_string(),
                view: View::Union(path_union),
                upstream: vec![2,3],
                downstream: vec![2],
            },
            Node{
                id: "next_step".to_string(),
                view: View::Query(next_step_query),
                upstream: vec![0,1],
                downstream: vec![1],
            },
            Node{
                id: "first_step".to_string(),
                view: View::Query(first_step_query),
                upstream: vec![0],
                downstream: vec![1],
            },
        ]
    };
    let old_state = FlowState{
        outputs: (0..4).map(|_| RefCell::new(Index::new())).collect(),
        dirty: vec![0].into_iter().collect(),
    };
    let new_state = flow.run(&old_state);
    println!("{:?}", old_state);
    println!("{:?}", new_state);
}