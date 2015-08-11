#![feature(fs_walk)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions};

use eve::server::*;

#[allow(dead_code)]
fn main() {
    for argument in env::args() {
        match &*argument {
            "clean" => {
                OpenOptions::new().create(true).truncate(true).open("./autosave").unwrap();
                ()
            },
            _ => continue,
        }
    }

    run()
}