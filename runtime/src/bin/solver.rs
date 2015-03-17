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
        Clause::Tuple(Source{relation: a}),
        Clause::Tuple(Source{relation: b}),
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
        Clause::Relation(Source{relation: a}),
        Clause::Tuple(Source{relation: b}),
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
        Clause::Tuple(Source{relation: a}),
        Clause::Relation(Source{relation: b}),
    ]};
    for result in query.iter() {
        println!("{:?}", result);
    }
    println!("");
}