#![feature(fs_walk)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions, walk_dir};
use std::io::prelude::*;
use rustc_serialize::json::Json;

use eve::server::*;
use eve::value::*;
use eve::flow::Flow;

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