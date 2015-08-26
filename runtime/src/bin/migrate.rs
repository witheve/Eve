#![feature(fs_walk)]
#![feature(slice_patterns)]

extern crate rustc_serialize;
extern crate time;
extern crate eve;

use std::env;
use std::fs::{OpenOptions, walk_dir};
use std::path::{Path, PathBuf};
use std::io::prelude::*;
use rustc_serialize::json::{ToJson, Json};

use eve::server::*;
use eve::flow::*;
use eve::compiler::*;
use eve::value::*;

fn read_events<P: AsRef<Path>>(filename: P) -> Vec<Event> {
    let mut events_string = String::new();
    {
        let mut events_file = OpenOptions::new().create(true).open(&filename).unwrap();
        events_file.read_to_string(&mut events_string).unwrap();
    }
    events_string.lines().map(|line|
        FromJson::from_json(&Json::from_str(&line).unwrap())
        ).collect()
}

fn write_events<P: AsRef<Path>>(filename: P, events: &[Event]) {
    let mut new_events_file = OpenOptions::new().create(true).truncate(true).write(true).open(&filename).unwrap();
    for event in events.iter() {
        new_events_file.write_all(format!("{}", event.to_json()).as_bytes()).unwrap();
        new_events_file.write_all("\n".as_bytes()).unwrap();
    }
}

fn all_paths() -> Vec<PathBuf> {
    let mut filenames = vec![];
    for entry in walk_dir("./test-inputs").unwrap() {
        filenames.push(entry.unwrap().path());
    }
    for entry in walk_dir("./test-outputs").unwrap() {
        filenames.push(entry.unwrap().path());
    }
    for entry in walk_dir("../example data").unwrap() {
        let path = entry.unwrap().path();
        if path.extension().unwrap().to_str().unwrap() == "eve" {
            filenames.push(path);
        }
    }
    filenames
}

fn remove_view(view: &str) {
    for path in all_paths().iter() {
        let mut events = read_events(path);
        for event in events.iter_mut() {
            event.changes.retain(|&(ref change_view, _)| change_view != view);
        }
        write_events(path, &events[..]);
    }
}

fn remove_row(view: &str, row: Vec<Value>) {
    for path in all_paths().iter() {
        let mut events = read_events(path);
        for event in events.iter_mut() {
            for &mut (ref change_view, ref mut change) in event.changes.iter_mut() {
                if change_view == view {
                    change.insert.retain(|insert_row| *insert_row != row)
                }
            }
        }
        write_events(path, &events[..]);
    }
}

fn reset_internal_views() {
    let compiler_schema = compiler_schema();
    let client_schema = client_schema();
    for path in all_paths().iter() {
        let mut events = read_events(path);
        for event in events.iter_mut() {
            event.changes.retain(|&(ref change_id, _)|
                !compiler_schema.iter().chain(client_schema.iter()).any(|&(ref id, _)| change_id == id)
                );
        }
        write_events(path, &events[..]);
    }
}

fn compact(filename: &str) {
    let mut flow = Flow::new();
    for event in read_events(filename).into_iter() {
        flow.quiesce(event.changes);
    }
    write_events(filename, &[Event{changes: flow.as_changes(), commands: vec![]}]);
}

fn make_bug_test() {
    let events = read_events("./autosave");
    let time = time::get_time().sec;
    let input_filename = format!("./test-inputs/bug-{}", time);
    let output_filename = format!("./test-outputs/bug-{}", time);
    write_events(&input_filename[..], &events[..]);
    write_events(&output_filename[..], &[]);
}

fn make_regression_test() {
    let mut flow = Flow::new();
    for event in read_events("./autosave").into_iter() {
        flow.quiesce(event.changes);
    }
    let time = time::get_time().sec;
    let input_filename = format!("./test-inputs/regression-{}", time);
    let output_filename = format!("./test-outputs/regression-{}", time);
    write_events(&input_filename[..], &[Event{changes: flow.as_changes(), commands: vec![]}]);
    write_events(&output_filename[..],  &[Event{changes: flow.as_changes(), commands: vec![]}]);
}

#[test]
fn test_regressions() {
    let inputs = walk_dir("./test-inputs").unwrap().collect::<Vec<_>>();
    let outputs = walk_dir("./test-outputs").unwrap().collect::<Vec<_>>();
    assert_eq!(inputs.len(), outputs.len());
    for (input_entry, output_entry) in inputs.into_iter().zip(outputs.into_iter()) {
        let input_path = input_entry.unwrap().path();
        let output_path = output_entry.unwrap().path();
        println!("Testing {:?} against {:?}", input_path, output_path);

        let mut input_flow = Flow::new();
        for event in read_events(input_path).into_iter() {
            input_flow.quiesce(event.changes);
        }

        let mut output_flow = Flow::new();
        for event in read_events(output_path).into_iter() {
            output_flow.change(event.changes);
        }

        let schema = schema();
        for output_cell in output_flow.outputs.iter() {
            let output = output_cell.borrow();
            // ignore internal views
            if !schema.iter().any(|&(ref id, _)| **id == *output.view) {
                let input = input_flow.get_output(&output.view[..]);
                assert_eq!((&output.view, &output.index), (&input.view, &input.index));
            }
        }
    }
}

#[test]
fn test_examples() {
    for entry in walk_dir("../example data").unwrap() {
        let path = entry.unwrap().path();
        if path.extension().unwrap().to_str().unwrap() == "eve" {
            let mut flow = Flow::new();
            for event in read_events(path).into_iter() {
                flow.quiesce(event.changes);
            }
            // if we haven't crashed yet, we're good :)
        }
    }
}

#[allow(dead_code)]
fn main() {
    let args = env::args().collect::<Vec<String>>();
    let borrowed_args = args.iter().map(|s| &s[..]).collect::<Vec<&str>>();
    match &borrowed_args[..] {
        [_, "remove_view", view] => remove_view(view),
        [_, "remove_row", view, row] => remove_row(view, FromJson::from_json(&Json::from_str(&row).unwrap())),
        [_, "reset_internal_views"] => reset_internal_views(),
        [_, "compact", filename] => compact(filename),
        [_, "make_bug_test"] => make_bug_test(),
        [_, "make_regression_test"] => make_regression_test(),
        other => panic!("Bad arguments (look at src/bin/migrate.rs for correct usage): {:?}", &other[1..]),
    }
}
