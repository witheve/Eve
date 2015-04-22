extern crate eve;

use eve::value::*;
use eve::index::*;
use eve::flow::Flow;
use eve::compiler::*;

#[allow(dead_code)]
fn main() {
    let mut flow = Flow::new();
    flow.change(vec![
        ("schema".to_string(), Changes{
            inserted: vec![
            ("edge_schema",).to_tuple(),
            ("path_schema",).to_tuple(),
            ("next_step_schema",).to_tuple(),
            ("first_step_schema",).to_tuple(),
            ],
            removed: vec![]}),
        ("field".to_string(), Changes{
            inserted: vec![
            ("edge_schema", 0.0, "edge_from", "string").to_tuple(),
            ("edge_schema", 1.0, "edge_to", "string").to_tuple(),
            ("path_schema", 0.0, "path_from", "string").to_tuple(),
            ("path_schema", 1.0, "path_to", "string").to_tuple(),
            ("next_step_schema", 0.0, "next_step_edge", "tuple").to_tuple(),
            ("next_step_schema", 1.0, "next_step_path", "tuple").to_tuple(),
            ("first_step_schema", 0.0, "first_step_edge", "tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("view".to_string(), Changes{
            inserted: vec![
            ("edge", "edge_schema", "input").to_tuple(),
            ("path", "path_schema", "union").to_tuple(),
            ("next_step", "next_step_schema", "query").to_tuple(),
            ("first_step", "first_step_schema", "query").to_tuple(),
            ("upstream", "--none--", "input").to_tuple(),
            ("schedule", "--none--", "input").to_tuple(),
            ],
            removed: vec![]}),
        ("source".to_string(), Changes{
            inserted: vec![
            ("next_step", 0.0, "next_step_edge", ("view", "edge").to_tuple(), "get-tuple").to_tuple(),
            ("next_step", 1.0, "next_step_path", ("view", "path").to_tuple(), "get-tuple").to_tuple(),
            ("first_step", 0.0, "first_step_edge", ("view", "edge").to_tuple(), "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("constraint".to_string(), Changes{
            inserted: vec![
            (("column", "next_step_path", "path_from").to_tuple(), "=", ("column", "next_step_edge", "edge_to").to_tuple()).to_tuple(),
            ],
            removed: vec![]}),
        ("view-mapping".to_string(), Changes{
            inserted: vec![
            ("next_step_mapping", "next_step", "path").to_tuple(),
            ("first_step_mapping", "first_step", "path").to_tuple(),
            ],
            removed: vec![]}),
        ("field-mapping".to_string(), Changes{
            inserted: vec![
            ("next_step_mapping", "next_step_edge", "edge_from", "path_from").to_tuple(),
            ("next_step_mapping", "next_step_path", "path_to", "path_to").to_tuple(),
            ("first_step_mapping", "first_step_edge", "edge_from", "path_from").to_tuple(),
            ("first_step_mapping", "first_step_edge", "edge_to", "path_to").to_tuple(),
            ],
            removed: vec![]}),
        ("edge".to_string(), Changes{
            inserted: vec![
            ("a","b").to_tuple(),
            ("b", "c").to_tuple(),
            ("c", "d").to_tuple(),
            ("d", "b").to_tuple(),
            ],
            removed: vec![]}),
        ]);
    let mut flow = compile(flow);
    flow.run();
    println!("{:?}", flow.changes);
    println!("{:?}", flow.get_state("path"));
}