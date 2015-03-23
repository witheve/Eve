#![feature(test)]

extern crate rand;
extern crate time;
extern crate eve;
extern crate test;

use rand::distributions::{IndependentSample, Range};

use eve::solver::*;
use eve::solver::Value::*;

fn main() {
    // println!("Yo");
    // let a = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b = vec![
    //     vec![Float(-0.0), Float(-1.0), Float(-2.0)],
    //     vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    // ];
    // let query = Query{clauses: vec![
    //     Clause::Tuple(Source{relation: a, constraints: vec![]}),
    //     Clause::Tuple(Source{relation: b, constraints: vec![]}),
    // ]};
    // for result in query.iter() {
    //     println!("{:?}", result);
    // }
    // println!("");


    // println!("Yo");
    // let a = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b = vec![
    //     vec![Float(-0.0), Float(-1.0), Float(-2.0)],
    //     vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    // ];
    // let query = Query{clauses: vec![
    //     Clause::Relation(Source{relation: a, constraints: vec![]}),
    //     Clause::Tuple(Source{relation: b, constraints: vec![]}),
    // ]};
    // for result in query.iter() {
    //     println!("{:?}", result);
    // }
    // println!("");

    // println!("Yo");
    // let a = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b = vec![
    //     vec![Float(-0.0), Float(-1.0), Float(-2.0)],
    //     vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    // ];
    // let query = Query{clauses: vec![
    //     Clause::Tuple(Source{relation: a, constraints: vec![]}),
    //     Clause::Relation(Source{relation: b, constraints: vec![]}),
    // ]};
    // for result in query.iter() {
    //     println!("{:?}", result);
    // }
    // println!("");

    // println!("Yo");
    // let a = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b0_lt_a0 = Constraint{
    //     my_column: 0,
    //     op: ConstraintOp::LT,
    //     other_ref: Ref::Value{
    //         clause: 0,
    //         column: 0,
    //     }
    // };
    // let query = Query{clauses: vec![
    //     Clause::Tuple(Source{relation: a, constraints: vec![]}),
    //     Clause::Tuple(Source{relation: b, constraints: vec![b0_lt_a0]}),
    // ]};
    // for result in query.iter() {
    //     println!("{:?}", result);
    // }
    // println!("");

    // println!("Yo");
    // let a = vec![
    //     vec![Float(0.0), Float(1.0), Float(2.0)],
    //     vec![Float(4.0), Float(5.0), Float(6.0)]
    // ];
    // let b = vec![
    //     vec![Float(-0.0), Float(-1.0), Float(-2.0)],
    //     vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    // ];
    // fn add(args: Vec<Value>) -> Value {
    //     match &*args {
    //         [Float(a), Float(b)] => Float(a+b),
    //         _ => panic!("Can't add these"),
    //     }
    // }
    // let a0 = Ref::Value{clause: 0, column: 0};
    // let b2 = Ref::Value{clause: 1, column: 2};
    // let query = Query{clauses: vec![
    //     Clause::Tuple(Source{relation: a, constraints: vec![]}),
    //     Clause::Tuple(Source{relation: b, constraints: vec![]}),
    //     Clause::Call(Call{fun: add, arg_refs: vec![a0, b2]}),
    // ]};
    // for result in query.iter() {
    //     println!("{:?}", result);
    // }
    // println!("");

    let bench_size = 10000;
    let between = Range::new(0, bench_size);
    let mut rng = rand::thread_rng();

    let mut users = vec![];
    let mut logins = vec![];
    let mut bans = vec![];

    for i in (0..bench_size) {
        users.push(vec![String(format!("email{}", i)), String(format!("user{}", i))]);
    }

    for i in (0..bench_size) {
        let user = between.ind_sample(&mut rng);
        logins.push(vec![String(format!("user{}", user)), String(format!("ip{}", i))]);
    }

    for i in (0..bench_size) {
        bans.push(vec![String(format!("ip{}", i))]);
    }

    let start = time::precise_time_s();
    let users = users.into_iter().collect();
    let logins = logins.into_iter().collect();
    let bans = bans.into_iter().collect();
    let end = time::precise_time_s();
    println!("index: {}s", end - start);

    let user_eq_user = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: Ref::Value{
            clause: 0,
            column: 0,
        }
    };
    let ip_eq_ip = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: Ref::Value{
            clause: 1,
            column: 1,
        }
    };
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: users, constraints: vec![]}),
        Clause::Tuple(Source{relation: logins, constraints: vec![user_eq_user]}),
        Clause::Tuple(Source{relation: bans, constraints: vec![ip_eq_ip]}),
    ]};

    let start = time::precise_time_s();
    println!("{:?} results", query.iter().count());
    // for result in query.iter().enumerate() {
    //     println!("{:?}", result);
    // }
    let end = time::precise_time_s();
    println!("solve: {}s", end - start);

    let start = time::precise_time_s();
    drop(query);
    let end = time::precise_time_s();
    println!("erase: {}s", end - start);
}