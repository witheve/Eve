extern crate eve;

use eve::solver::*;
use eve::solver::Value::*;

fn main() {
    let a = vec![
        vec![Float(0.0), Float(1.0), Float(2.0)],
        vec![Float(4.0), Float(5.0), Float(6.0)]
    ];
    let b = vec![
        vec![Float(-0.0), Float(-1.0), Float(-2.0)],
        vec![Float(-4.0), Float(-5.0), Float(-6.0)]
    ];
    let query = Query{sources: vec![Source{relation: a}, Source{relation: b}]};
    for result in query.iter() {
        println!("{:?}", result);
    }
}