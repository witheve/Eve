extern crate eve;

use std::env;
use std::fs::OpenOptions;

use eve::server::*;
use eve::value::*;

#[test]
fn test_add() {
    let flow = load("tests/add-events");
    assert_eq!(
        flow.get_output("2e0bc048-c3c6-4170-a0b6-61edee68ee12").index.iter().collect::<Vec<_>>(),
        vec![
            &vec![Value::Float(2.0)],
            &vec![Value::Float(4.0)],
            &vec![Value::Float(6.0)],
        ]
    );
}

#[allow(dead_code)]
fn main() {

	for argument in env::args() {
    	match &*argument {
    		"clean" => {
    			OpenOptions::new().create(true).truncate(true).open("./events").unwrap();
    			()
    		},
    		_ => continue,
    	}
	}

    run()
}