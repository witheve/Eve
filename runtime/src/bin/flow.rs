extern crate eve;

use eve::index::Index;
use eve::value::ToRelation;
use eve::value::Value::*;
use eve::query::*;
use eve::flow::*;

use std::cell::RefCell;

fn main() {
    let edges = vec![("a","b"), ("b", "c"), ("c", "d"), ("d", "b")];
    let path_union = Union{
        mappings: vec![(2, vec![(0, 0), (1, 1)]), (1, vec![(0, 0), (0, 1)])],
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
    let mut flow = Flow{
        nodes: vec![
            Node{
                id: "edge".to_string(),
                view: View::Input,
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
        ],
        states: vec![
            RefCell::new(edges.to_relation()),
            RefCell::new(Index::new()),
            RefCell::new(Index::new()),
            RefCell::new(Index::new()),
            ],
        dirty: vec![1,2,3].into_iter().collect(),
    };
    flow.run();
    println!("{:?}", flow.states[1]);
}