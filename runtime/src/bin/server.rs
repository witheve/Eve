#![feature(fs_walk)]
#![feature(slice_patterns)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions};

use eve::server::*;

#[allow(dead_code)]
fn main() {
    let args = env::args().collect::<Vec<String>>();
    let borrowed_args = args.iter().map(|s| &s[..]).collect::<Vec<&str>>();
    match &borrowed_args[..] {
        [_, filename] => run(filename),
        other => panic!("Bad arguments (look at src/bin/server.rs for correct usage): {:?}", &other[1..]),
    }
}