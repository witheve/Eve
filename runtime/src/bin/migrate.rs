#![feature(fs_walk)]
#![feature(slice_patterns)]
#![feature(drain)]

extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::{OpenOptions, walk_dir};
use std::io::prelude::*;
use rustc_serialize::json::{ToJson, Json};

use eve::server::*;
use eve::flow::*;
use eve::compiler::*;

fn migrate_file<F>(filename: &str, migrate: &F) where F: Fn(&mut Vec<Event>) {
    let mut old_events_string = String::new();
    {
        let mut old_events_file = OpenOptions::new().create(true).open(&filename).unwrap();
        old_events_file.read_to_string(&mut old_events_string).unwrap();
    }
    let mut events = old_events_string.lines().map(|line|
        FromJson::from_json(&Json::from_str(&line).unwrap())
        ).collect();
    migrate(&mut events);
    let mut new_events_file = OpenOptions::new().truncate(true).write(true).open(&filename).unwrap();
    for event in events {
        new_events_file.write_all(format!("{}", event.to_json()).as_bytes()).unwrap();
        new_events_file.write_all("\n".as_bytes()).unwrap();
    }
}

fn migrate_all<F>(migrate: &F) where F: Fn(&mut Vec<Event>) {
    for entry in walk_dir("./test-inputs").unwrap() {
        let filename = entry.unwrap().path().to_str().unwrap().to_owned();
        migrate_file(&filename[..], &migrate)
    }
    for entry in walk_dir("./examples").unwrap() {
        let filename = entry.unwrap().path().to_str().unwrap().to_owned();
        migrate_file(&filename[..], &migrate)
    }
    migrate_file("./events", &migrate);
    migrate_file("./bootstrap", &migrate);
}

fn remove_view(id: &str, events: &mut Vec<Event>) {
    for event in events.iter_mut() {
        event.changes.retain(|&(ref change_id, _)| change_id != id);
    }
}

fn reset_compiler(events: &mut Vec<Event>) {
    let compiler_schema = compiler_schema();
    for event in events.iter_mut() {
        event.changes.retain(|&(ref change_id, _)|
            !compiler_schema.iter().any(|&(ref id, _)| change_id == id)
            );
    }
}

fn compact(events: &mut Vec<Event>) {
    let mut flow = Flow::new();
    for event in events.drain(..) {
        flow = flow.quiesce(event.changes);
    }
    // TODO session is blank which doesn't seem to matter because it is never used
    events.push(Event{changes: flow.as_changes(), session: "".to_owned()})
}

fn main() {
    let args = env::args().collect::<Vec<String>>();
    let borrowed_args = args.iter().map(|s| &s[..]).collect::<Vec<&str>>();
    match &borrowed_args[..] {
        [_, "remove_view", id] => migrate_all(&|events| remove_view(id, events)),
        [_, "compact", filename] => migrate_file(filename, &compact),
        [_, "reset_compiler"] => migrate_all(&reset_compiler),
        other => panic!("Bad arguments (look at src/bin/migrate.rs for correct usage): {:?}", &other[1..]),
    }
}