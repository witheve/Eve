#![feature(fs_walk)]
#![feature(slice_patterns)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions, walk_dir};
use std::io::prelude::*;
use rustc_serialize::json::{ToJson, Json};

use eve::server::*;
use eve::value::*;

fn migrate_file<F>(filename: String, migrate: &F) where F: Fn(&mut Event) {
    let mut new_events = Vec::new();
    {
        let mut old_events_file = OpenOptions::new().create(true).open(&filename).unwrap();
        let mut old_events = String::new();
        old_events_file.read_to_string(&mut old_events).unwrap();
        for line in old_events.lines() {
            let json = Json::from_str(&line).unwrap();
            let mut event: Event = FromJson::from_json(&json);
            migrate(&mut event);
            new_events.push(event);
        }
    }
    let mut new_events_file = OpenOptions::new().truncate(true).write(true).open(&filename).unwrap();
    for event in new_events {
        new_events_file.write_all(format!("{}", event.to_json()).as_bytes()).unwrap();
        new_events_file.write_all("\n".as_bytes()).unwrap();
    }
}

#[allow(dead_code)]
fn migrate_all<F>(migrate: F) where F: Fn(&mut Event) {
    for entry in walk_dir("./test-inputs").unwrap() {
        let filename = entry.unwrap().path().to_str().unwrap().to_owned();
        migrate_file(filename, &migrate)
    }
    for entry in walk_dir("./examples").unwrap() {
        let filename = entry.unwrap().path().to_str().unwrap().to_owned();
        migrate_file(filename, &migrate)
    }
    migrate_file("./events".to_string(), &migrate)
}

#[allow(dead_code)]
fn remove_view(id: &str) {
    migrate_all(|event| {
        event.changes.retain(|&(ref change_id, _)| change_id != id);
    });
}

fn main() {
    let args = env::args().collect::<Vec<String>>();
    let borrowed_args = args.iter().map(|s| &s[..]).collect::<Vec<&str>>();
    match &borrowed_args[..] {
        [_, "remove_view", id] => remove_view(id),
        other => panic!("Bad arguments (look at src/bin/migrate.rs for correct usage): {:?}", &other[1..]),
    }
}