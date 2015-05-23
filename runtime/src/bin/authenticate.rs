extern crate eve;

use std::env;
use eve::authenticate::*;
use std::fs::OpenOptions;

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