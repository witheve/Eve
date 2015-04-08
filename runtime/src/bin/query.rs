#![feature(test)]
#![feature(slice_patterns)]
#![feature(core)]
#![allow(unused_imports)]

extern crate rand;
extern crate time;
extern crate core;
#[macro_use]
extern crate eve;
extern crate test;

use rand::distributions::{IndependentSample, Range};

use eve::query::*;
use eve::value::*;
use eve::value::Value::*;
use eve::interpreter::EveFn;
use core::num::ToPrimitive;

fn main() {

    let c0 = Call{fun: EveFn::Add, arg_refs: vec![1.to_constref(),2.to_constref()]};

    // Build the query
    let query = Query{clauses: clausevec![c0]};

    for result in query.iter(vec![]) {
        println!("{:?}",result);
    }

	/*
 	let a = vec![(0.0, 1.0, 2.0), (5.0, 6.0, 6.0), (7.0, 8.0, 9.0)].to_relation();
    let b = vec![(-7.0,), (8.0,), (10.0,)].to_relation();
    let a0_lt_b0 = Constraint{
        my_column: 0,
        op: ConstraintOp::LT,
        other_ref: 1.to_constref(),
    };

    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![a0_lt_b0]}),
    ]};

 	let mut resultvec = Vec::new();

    for result in query.iter(vec![&a]) {
    	println!("--------------------------------");
    	println!("{:?}",result);
    	println!("--------------------------------");
        resultvec.push(result);
    }
    */

	// Build the correct answer
    //let e1 = ((0.0,1.0,2.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    //let e2 = ((4.0,5.0,6.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    //let e3 = ((4.0,5.0,6.0).to_tuple(),(0.0,-1.0,-2.0).to_tuple()).to_tuple();
    //let correct = vec![e1,e2,e3];
    
/*
    let a = vec![(0.0, 1.0, 2.0), (4.0, 5.0, 6.0)].to_relation();
    let b = vec![(-0.0, -1.0, -2.0), (-4.0, -5.0, -6.0)].to_relation();
    let query = Query{clauses: vec![
        Clause::Relation(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![]}),
    ]};
    for result in query.iter(vec![&a, &b]) {
        println!("{:?}", result);
    }
    println!("");
*/

/*
    let a = vec![(0.0, 1.0, 2.0), (4.0, 5.0, 6.0)].to_relation();
    let b = vec![(-0.0, -1.0, -2.0), (-4.0, -5.0, -6.0)].to_relation();
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Relation(Source{relation: 1, constraints: vec![]}),
    ]};
    for result in query.iter(vec![&a, &b]) {
        println!("{:?}", result);
    }
    println!("");
*/

}

#[test]
fn test1() {

	let a = vec![(0.0, 1.0, 2.0), (4.0, 5.0, 6.0)].to_relation();
    let b = vec![(-0.0, -1.0, -2.0), (-4.0, -5.0, -6.0)].to_relation();
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![]}),
    ]};

 	let mut resultvec = Vec::new();

    for result in query.iter(vec![&a, &b]) {
        resultvec.push(result);
    }

    // Build the correct answer
    let e1 = ((0.0,1.0,2.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    let e2 = ((0.0,1.0,2.0).to_tuple(),(0.0,-1.0,-2.0).to_tuple()).to_tuple();
    let e3 = ((4.0,5.0,6.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    let e4 = ((4.0,5.0,6.0).to_tuple(),(0.0,-1.0,-2.0).to_tuple()).to_tuple();
    let correct = vec![e1,e2,e3,e4];

    // Test correctness
    assert_eq!(resultvec,correct);
}


#[test]
fn constrainttest() {

    let a = vec![(0.0, 1.0, 2.0), (4.0, 5.0, 6.0)].to_relation();
    let b = vec![(-0.0, -1.0, -2.0), (-4.0, -5.0, -6.0)].to_relation();
    let b0_lt_a0 = Constraint{
        my_column: 0,
        op: ConstraintOp::LT,
        other_ref: (0,0).to_valref(),
    };
    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![b0_lt_a0]}),
    ]};

 	let mut resultvec = Vec::new();

    for result in query.iter(vec![&a, &b]) {
        resultvec.push(result);
    }

	// Build the correct answer
    let e1 = ((0.0,1.0,2.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    let e2 = ((4.0,5.0,6.0).to_tuple(),(-4.0,-5.0,-6.0).to_tuple()).to_tuple();
    let e3 = ((4.0,5.0,6.0).to_tuple(),(0.0,-1.0,-2.0).to_tuple()).to_tuple();
    let correct = vec![e1,e2,e3];
    
    // Test correctness
    assert_eq!(resultvec,correct);
}

#[test]
fn stringtest() {

	let a = vec![("Andy Warhol",), ("Leonardo da Vinci",)].to_relation();
	let c0 = Call{fun: EveFn::StrUpper, arg_refs: vec![(0,0).to_valref()]};
	let c1 = Call{fun: EveFn::StrSplit, arg_refs: vec![1.to_callref()]};

	// Query takes a relation and nested function calls on a set of strings
	let query = Query{clauses: clausevec![
		Clause::Tuple(Source{relation: 0, constraints: vec![]}),
		c0,c1]
	};

 	let mut resultvec = Vec::new();

    for result in query.iter(vec![&a]) {
        resultvec.push(result);
    }

    let s0 = ("ANDY","WARHOL").to_tuple();
    let s1 = ("LEONARDO","DA","VINCI").to_tuple();
    
    // Test equality hack
	assert_eq!(resultvec[0][2][0],s0[0]); // ANDY
	assert_eq!(resultvec[0][2][1],s0[1]); // WARHOL
    assert_eq!(resultvec[1][2][0],s1[0]); // LEONARDO
    assert_eq!(resultvec[1][2][1],s1[1]); // DA
    assert_eq!(resultvec[1][2][2],s1[2]); // VINCI
}

#[bench]
fn userip(b: &mut test::Bencher) {

    let bench_size = 1000;
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

    //println!("index: {}s", end - start);

    let user_eq_user = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: (0,0).to_valref(),
    };
    
    let ip_eq_ip = Constraint{
        my_column: 0,
        op: ConstraintOp::EQ,
        other_ref: (1,1).to_valref(),
    };

    let query = Query{clauses: vec![
        Clause::Tuple(Source{relation: 0, constraints: vec![]}),
        Clause::Tuple(Source{relation: 1, constraints: vec![user_eq_user]}),
        Clause::Tuple(Source{relation: 2, constraints: vec![ip_eq_ip]}),
    ]};

    b.iter(|| {
        query.iter(vec![&users, &logins, &bans]).count()
    });

    //let start = time::precise_time_s();
    //drop(query);
    //let end = time::precise_time_s();
    //println!("erase: {}s", end - start);
}


#[bench]
fn simplemath(b: &mut test::Bencher) {

    // C0 = 1 + 2
    let c0 = Call{fun: EveFn::Add, arg_refs: vec![1.to_constref(),2.to_constref()]};

    // Build the query
    let query = Query{clauses: clausevec![c0]};

    b.iter(|| {
        query.iter(vec![]).count()
    });  
}

#[test]
fn opstest() {

	// General math with a relation (((1.3 + 2) * [1 2 3 4]) + (7 - 4) / 10) ^ 2
    let a = vec![(1.0,),(2.0,),(3.0,),(4.0,)].to_relation();
    let c0 = Call{fun: EveFn::Add, arg_refs: vec![1.3.to_constref(),2.to_constref()]};       // C0 = 1.3 + 2
    let c1 = Call{fun: EveFn::Multiply, arg_refs: vec![1.to_callref(),(0,0).to_valref()]};   // C1 = C0 * [1 2 3 4]
    let c2 = Call{fun: EveFn::Subtract, arg_refs: vec![7.to_constref(),4.to_constref()]};    // C2 = 7 - 4
    let c3 = Call{fun: EveFn::Divide, arg_refs: vec![3.to_callref(),10.to_constref()]};      // C3 = C2 / 10
    let c4 = Call{fun: EveFn::Add, arg_refs: vec![2.to_callref(),4.to_callref()]};           // C4 = C1 + C3
    let c5 = Call{fun: EveFn::Exponentiate, arg_refs: vec![5.to_callref(),2.to_constref()]}; // C5 = C4 ^ 2

    // Build the query
    let query = Query{clauses: clausevec![Clause::Tuple(Source{relation: 0, constraints: vec![]}),c0,c1,c2,c3,c4,c5]};

 	let mut resultvec = Vec::new();


    for result in query.iter(vec![&a]) {
        resultvec.push(result);
    }

   	// Test against the correct answer
	assert_eq!(resultvec[0][6].to_f64().unwrap() as f32, 12.96f32);
	assert_eq!(resultvec[1][6].to_f64().unwrap() as f32, 47.61f32);
	assert_eq!(resultvec[2][6].to_f64().unwrap() as f32, 104.04f32);
	assert_eq!(resultvec[3][6].to_f64().unwrap() as f32, 182.25f32);

}

#[bench]
fn opsbench(b: &mut test::Bencher) {

     // General math with a relation (((1.3 + 2) * [1 2 3 4]) + (7 - 4) / 10) ^ 2
    let a = vec![(1.0,),(2.0,),(3.0,),(4.0,)].to_relation();
    let c0 = Call{fun: EveFn::Add, arg_refs: vec![1.3.to_constref(),2.to_constref()]};       // C0 = 1.3 + 2
    let c1 = Call{fun: EveFn::Multiply, arg_refs: vec![1.to_callref(),(0,0).to_valref()]};   // C1 = C0 * [1 2 3 4]
    let c2 = Call{fun: EveFn::Subtract, arg_refs: vec![7.to_constref(),4.to_constref()]};    // C2 = 7 - 4
    let c3 = Call{fun: EveFn::Divide, arg_refs: vec![3.to_callref(),10.to_constref()]};      // C3 = C2 / 10
    let c4 = Call{fun: EveFn::Add, arg_refs: vec![2.to_callref(),4.to_callref()]};           // C4 = C1 + C3
    let c5 = Call{fun: EveFn::Exponentiate, arg_refs: vec![5.to_callref(),2.to_constref()]}; // C5 = C4 ^ 2

    // Build the query
    let query = Query{clauses: clausevec![Clause::Tuple(Source{relation: 0, constraints: vec![]}),c0,c1,c2,c3,c4,c5]};

    b.iter(|| {
        query.iter(vec![&a]).count();
    });
}