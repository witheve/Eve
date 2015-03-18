extern crate eve;

use eve::solver::*;
use eve::solver::Value::*;

fn main() {
    println!("Yo");
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(-0.0), Float(-1.0), Float(-2.0)],
        vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    ];
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: a, constraints: vec![]}),
        Clause::Tuple(Source{relation: b, constraints: vec![]}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");


    println!("Yo");
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(-0.0), Float(-1.0), Float(-2.0)],
        vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    ];
    let query = Query{clauses: vec![
        Clause::Relation(Source{relation: a, constraints: vec![]}),
        Clause::Tuple(Source{relation: b, constraints: vec![]}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");

    println!("Yo");
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(-0.0), Float(-1.0), Float(-2.0)],
        vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    ];
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: a, constraints: vec![]}),
        Clause::Relation(Source{relation: b, constraints: vec![]}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");

    println!("Yo");
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b0_lt_a0 = Constraint{
        my_column: 0,
        op: ConstraintOp::LT,
        other_ref: Ref::Value{
            clause: 0,
            column: 0,
        }
    };
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: a, constraints: vec![]}),
        Clause::Tuple(Source{relation: b, constraints: vec![b0_lt_a0]}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");

    println!("Yo");
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(-0.0), Float(-1.0), Float(-2.0)],
        vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    ];
    fn add(args: Vec<Value>) -> Value {
        match &*args {
            [Float(a), Float(b)] => Float(a+b),
            _ => panic!("Can't add these"),
        }
    }
    let a0 = Ref::Value{clause: 0, column: 0};
    let b2 = Ref::Value{clause: 1, column: 2};
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: a, constraints: vec![]}),
        Clause::Tuple(Source{relation: b, constraints: vec![]}),
        Clause::Call(Call{fun: add, arg_refs: vec![a0, b2]}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");
}