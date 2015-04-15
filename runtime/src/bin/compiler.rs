extern crate eve;

use eve::value::*;
use eve::index::*;
use eve::compiler::*;

use std::cell::RefCell;

fn main() {
    let schemas = vec![
    ("edge_schema",),
    ("path_schema",),
    ("next_step_schema",),
    ("first_step_schema",),
    ];
    let fields = vec![
    ("edge_schema", 0.0, "edge_from", "string"),
    ("edge_schema", 1.0, "edge_to", "string"),
    ("path_schema", 0.0, "path_from", "string"),
    ("path_schema", 1.0, "path_to", "string"),
    ("next_step_schema", 0.0, "next_step_edge", "tuple"),
    ("next_step_schema", 1.0, "next_step_path", "tuple"),
    ("first_step_schema", 0.0, "first_step_edge", "tuple"),
    ];
    let views = vec![
    ("edge", "edge_schema", "input"),
    ("path", "path_schema", "union"),
    ("next_step", "next_step_schema", "query"),
    ("first_step", "first_step_schema", "query"),
    ("upstream", "--none--", "input"),
    ("schedule", "--none--", "input"),
    ];
    let sources = vec![
    ("next_step", 0.0, "next_step_edge", ("view", "edge").to_tuple(), "get-tuple"),
    ("next_step", 1.0, "next_step_path", ("view", "path").to_tuple(), "get-tuple"),
    ("first_step", 0.0, "first_step_edge", ("view", "edge").to_tuple(), "get-tuple"),
    ];
    let constraints = vec![
    (("column", "next_step_path", "path_from").to_tuple(), "=", ("column", "next_step_edge", "edge_to").to_tuple()),
    ];
    let view_mappings = vec![
    ("next_step_mapping", "next_step", "path"),
    ("first_step_mapping", "first_step", "path"),
    ];
    let field_mappings = vec![
    ("next_step_mapping", "next_step_edge", "edge_from", "path_from"),
    ("next_step_mapping", "next_step_path", "path_to", "path_to"),
    ("first_step_mapping", "first_step_edge", "edge_from", "path_from"),
    ("first_step_mapping", "first_step_edge", "edge_to", "path_to"),
    ];
    let edges = vec![("a","b"), ("b", "c"), ("c", "d"), ("d", "b")];
    let mut world = World{
        views: vec![
        ("schema".to_string(), RefCell::new(schemas.to_relation())),
        ("field".to_string(), RefCell::new(fields.to_relation())),
        ("view".to_string(), RefCell::new(views.to_relation())),
        ("source".to_string(), RefCell::new(sources.to_relation())),
        ("constraint".to_string(), RefCell::new(constraints.to_relation())),
        ("view-mapping".to_string(), RefCell::new(view_mappings.to_relation())),
        ("field-mapping".to_string(), RefCell::new(field_mappings.to_relation())),
        ("upstream".to_string(), RefCell::new(Index::new())),
        ("schedule".to_string(), RefCell::new(Index::new())),
        ("edge".to_string(), RefCell::new(edges.to_relation())),
        ("path".to_string(), RefCell::new(Index::new())),
        ("next_step".to_string(), RefCell::new(Index::new())),
        ("first_step".to_string(), RefCell::new(Index::new())),
        ].into_iter().collect()
    };
    let mut flow = compile(&mut world);
    flow.run();
    println!("{:?}", flow);
}