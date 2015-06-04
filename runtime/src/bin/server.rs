extern crate rustc_serialize;
extern crate eve;

use std::env;
use std::fs::OpenOptions;

use eve::server::*;

#[test]
fn test_examples() {
    let inputs = walk_dir("./test-inputs").unwrap().collect::<Vec<_>>();
    let outputs = walk_dir("./test-outputs").unwrap().collect::<Vec<_>>();
    assert_eq!(inputs.len(), outputs.len());
    for (input_entry, output_entry) in inputs.into_iter().zip(outputs.into_iter()) {
        let input_filename = input_entry.unwrap().path().to_str().unwrap().to_owned();
        let output_filename = output_entry.unwrap().path().to_str().unwrap().to_owned();
        println!("Testing {:?} against {:?}", input_filename, output_filename);
        let flow = load(&input_filename[..]);
        let mut output_string = String::new();
        let mut output_file = OpenOptions::new().open(output_filename).unwrap();
        output_file.read_to_string(&mut output_string).unwrap();
        let output = Json::from_str(&output_string).unwrap();
        for (view_id, json) in output.as_object().unwrap().iter() {
            let test_rows: Vec<Vec<Value>> = flow.get_output(&view_id[..]).index.clone().into_iter().collect();
            let output_rows: Vec<Vec<Value>> = FromJson::from_json(json);
            assert_eq!(test_rows, output_rows);
        }
    }
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