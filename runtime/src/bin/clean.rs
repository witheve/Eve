#![feature(fs_walk)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions, walk_dir};
use std::io::prelude::*;
use rustc_serialize::json::{ToJson, Json};

use eve::server::*;
use eve::value::*;

#[allow(dead_code)]
fn clean_examples<F>(clean: F) where F: Fn(&mut Event) {
    let inputs = walk_dir("./test-inputs").unwrap().collect::<Vec<_>>();
    for entry in inputs.into_iter() {
        let filename = entry.unwrap().path().to_str().unwrap().to_owned();
        let mut new_events = Vec::new();
        {
            let mut old_events_file = OpenOptions::new().create(true).open(&filename).unwrap();
            let mut old_events = String::new();
            old_events_file.read_to_string(&mut old_events).unwrap();
            for line in old_events.lines() {
                let json = Json::from_str(&line).unwrap();
                let mut event: Event = FromJson::from_json(&json);
                clean(&mut event);
                new_events.push(event);
            }
        }
        let mut new_events_file = OpenOptions::new().truncate(true).write(true).open(&filename).unwrap();
        for event in new_events {
            new_events_file.write_all(format!("{}", event.to_json()).as_bytes()).unwrap();
            new_events_file.write_all("\n".as_bytes()).unwrap();
        }
    }
}

#[allow(dead_code)]
fn clean_by_id(id: &str) {
    clean_examples(|event| {
        event.changes.retain(|&(ref change_id, _)| change_id != id);
    });
}

fn main() {
    let mut args = env::args();
    let _ = args.next().unwrap();
    let string = args.next().unwrap();
    println!("{:?}", string);
    clean_by_id(&string[..]);
}