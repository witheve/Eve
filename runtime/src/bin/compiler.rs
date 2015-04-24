#![feature(test)]

extern crate eve;
extern crate test;

//use eve::value::*;
use eve::index::*;
use eve::flow::Flow;
use eve::compiler::*;
use eve::test::*;

#[allow(dead_code)]
fn main() {
    // c4 = prod(input.B)
    let c4 = ("call","sum",(("column", "rr", "B").to_tuple(),).to_tuple()).to_tuple();

    let mut flow = Flow::new();
    flow.change(vec![
        ("schema".to_string(), Changes{
            inserted: vec![
            ("input_schema",).to_tuple(),
            ],
            removed: vec![]}),
        ("field".to_string(), Changes{
            inserted: vec![
            ("input_schema", 0.0f64, "A", "tuple").to_tuple(),
            ("input_schema", 1.0f64, "B", "tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("view".to_string(), Changes{
            inserted: vec![
            ("input", "input_schema", "input").to_tuple(),
            ("agg_test", "input_schema", "query").to_tuple(),
            ],
            removed: vec![]}),
        ("source".to_string(), Changes{
            inserted: vec![
            ("agg_test", 0.0f64, "rr", ("view", "input").to_tuple(), "get-tuple").to_tuple(),
            ("agg_test", 1.0f64, "none", c4, "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("input".to_string(), Changes{
            inserted: vec![
            (1, 8).to_tuple(),
            (2, 7).to_tuple(),
            (3, 6).to_tuple(),
            (4, 5).to_tuple(),
            ],
            removed: vec![]}),
        ]);
    flow = flow.compile_and_run();

    // Test an aggregate
    let result = flow.get_state("agg_test");

    println!("{:?}",result);
}

#[test]
fn recursion_test() {
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
            ("edge_schema", 0.0f64, "edge_from", "string").to_tuple(),
            ("edge_schema", 1.0f64, "edge_to", "string").to_tuple(),
            ("path_schema", 0.0f64, "path_from", "string").to_tuple(),
            ("path_schema", 1.0f64, "path_to", "string").to_tuple(),
            ("next_step_schema", 0.0f64, "next_step_edge", "tuple").to_tuple(),
            ("next_step_schema", 1.0f64, "next_step_path", "tuple").to_tuple(),
            ("first_step_schema", 0.0f64, "first_step_edge", "tuple").to_tuple(),
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
            ("next_step", 0.0f64, "next_step_edge", ("view", "edge").to_tuple(), "get-tuple").to_tuple(),
            ("next_step", 1.0f64, "next_step_path", ("view", "path").to_tuple(), "get-tuple").to_tuple(),
            ("first_step", 0.0f64, "first_step_edge", ("view", "edge").to_tuple(), "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("constraint".to_string(), Changes{
            inserted: vec![
                (
                    ("column", "next_step_edge", "edge_to").to_tuple(),
                    "=",
                    ("column", "next_step_path", "path_from").to_tuple(),
                ).to_tuple()
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
            ("next_step_mapping", ("column", "next_step_edge", "edge_from").to_tuple(), "path_from").to_tuple(),
            ("next_step_mapping", ("column", "next_step_path", "path_to").to_tuple(), "path_to").to_tuple(),
            ("first_step_mapping", ("column", "first_step_edge", "edge_from").to_tuple(), "path_from").to_tuple(),
            ("first_step_mapping", ("column", "first_step_edge", "edge_to").to_tuple(), "path_to").to_tuple(),
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
    flow = flow.compile_and_run();
    assert_eq!(
        flow.get_state("path").iter().collect::<Vec<_>>(),
        vec![
            ("a", "b"), ("a", "c"), ("a", "d"),
            ("b", "b"), ("b", "c"), ("b", "d"),
            ("c", "b"), ("c", "c"), ("c", "d"),
            ("d", "b"), ("d", "c"), ("d", "d"),
        ].to_relation().iter().collect::<Vec<_>>());
}

#[test]
fn call_test() {

    // c1 = 10 + 20
    let c1 = ("call","+",(("constant",10f64).to_tuple(),("constant",20f64).to_tuple()).to_tuple()).to_tuple();
    // c2 = 10 * c1
    let c2 = ("call","*",(("constant",10f64).to_tuple(),c1.clone()).to_tuple()).to_tuple();
    // c3 = input.A = input.B
    let c3 = ("call","*",(("column", "qq", "A").to_tuple(),("column", "qq", "B").to_tuple()).to_tuple()).to_tuple();
    // c4 = prod(input.B)
    //let c4 = ("call","prod",(("column", "rr", "B").to_tuple(),).to_tuple()).to_tuple();

    let mut flow = Flow::new();
    flow.change(vec![
        ("schema".to_string(), Changes{
            inserted: vec![
            ("input_schema",).to_tuple(),
            ],
            removed: vec![]}),
        ("field".to_string(), Changes{
            inserted: vec![
            ("input_schema", 0.0f64, "A", "tuple").to_tuple(),
            ("input_schema", 1.0f64, "B", "tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("view".to_string(), Changes{
            inserted: vec![
            ("input", "input_schema", "input").to_tuple(),
            ("math_test", "input_schema", "query").to_tuple(),
            ("agg_test", "input_schema", "query").to_tuple(),
            ("simple_call_test", "", "query").to_tuple(),
            ("nested_call_test", "", "query").to_tuple(),
            ],
            removed: vec![]}),
        ("source".to_string(), Changes{
            inserted: vec![
            ("math_test", 0.0f64, "qq", ("view", "input").to_tuple(), "get-tuple").to_tuple(),
            ("math_test", 1.0f64, "none", ("expression",c3).to_tuple(), "get-tuple").to_tuple(),
            //("agg_test", 0.0f64, "rr", ("view", "input").to_tuple(), "get-tuple").to_tuple(),
            //("agg_test", 1.0f64, "none", c4, "get-tuple").to_tuple(),
            ("simple_call_test", 0.0f64, "none", ("expression",c1).to_tuple(), "get-tuple").to_tuple(),
            ("nested_call_test", 0.0f64, "none", ("expression",c2).to_tuple(), "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("input".to_string(), Changes{
            inserted: vec![
            (1, 8).to_tuple(),
            (2, 7).to_tuple(),
            (3, 6).to_tuple(),
            (4, 5).to_tuple(),
            ],
            removed: vec![]}),
        ]);
    flow = flow.compile_and_run();

    // Test simple addition of two constants
    let result = flow.get_state("simple_call_test");
    let answervec = vec![
                    vec![30f64.to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[0]==r[0] );
    assert_eq!(q,true);

    // Test nested call
    let result = flow.get_state("nested_call_test");
    let answervec = vec![
                    vec![300f64.to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[0]==r[0] );
    assert_eq!(q,true);

    // Test call over columns
    let result = flow.get_state("math_test");
    let answervec = vec![
                    vec![(1f64,8f64).to_tuple().to_value(),8f64.to_value()],
                    vec![(2f64,7f64).to_tuple().to_value(),14f64.to_value()],
                    vec![(3f64,6f64).to_tuple().to_value(),18f64.to_value()],
                    vec![(4f64,5f64).to_tuple().to_value(),20f64.to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[1]==r[1] );
    assert_eq!(q,true);

    // Test an aggregate
    /*
    let result = flow.get_state("agg_test");
    let answervec = vec![
                    vec![(1f64,8f64).to_tuple().to_value(),(1680f64,).to_tuple().to_value()],
                    vec![(2f64,7f64).to_tuple().to_value(),(1680f64,).to_tuple().to_value()],
                    vec![(3f64,6f64).to_tuple().to_value(),(1680f64,).to_tuple().to_value()],
                    vec![(4f64,5f64).to_tuple().to_value(),(1680f64,).to_tuple().to_value()],
                    ];

    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[1]==r[1] );
    assert_eq!(q,true);
    */
}


#[test]
fn match_test() {

    let i1 = ("constant",1f64).to_tuple();
    let i2 = ("call","+",(("constant",1f64).to_tuple(),("constant",1f64).to_tuple()).to_tuple()).to_tuple();
    let i3 = ("column", "qq", "A").to_tuple();

    let patterns = (("constant",1f64).to_tuple(),
                    ("constant",2f64).to_tuple(),
                    ("constant",3f64).to_tuple(),
                    ("constant",4f64).to_tuple(),
                    ).to_tuple();

    let handlers = (("constant","one").to_tuple(),
                    ("constant","two").to_tuple(),
                    ("constant","three").to_tuple(),
                    ("constant","four").to_tuple(),
                    ).to_tuple();

    let m1 = ("match",i1,patterns.clone(),handlers.clone()).to_tuple();
    let m2 = ("match",i2,patterns.clone(),handlers.clone()).to_tuple();
    let m3 = ("match",i3,patterns.clone(),handlers.clone()).to_tuple();

    let mut flow = Flow::new();
    flow.change(vec![
        ("schema".to_string(), Changes{
            inserted: vec![
            ("input_schema",).to_tuple(),
            ],
            removed: vec![]}),
        ("field".to_string(), Changes{
            inserted: vec![
            ("input_schema", 0.0f64, "A", "tuple").to_tuple(),
            ("input_schema", 1.0f64, "B", "tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("view".to_string(), Changes{
            inserted: vec![
            ("input", "input_schema", "input").to_tuple(),
            ("match_test", "input_schema", "query").to_tuple(),
            ("simple_match_test", "", "query").to_tuple(),
            ("simple_match_test2", "", "query").to_tuple(),
            ],
            removed: vec![]}),
        ("source".to_string(), Changes{
            inserted: vec![
            ("match_test", 0.0f64, "qq", ("view", "input").to_tuple(), "get-tuple").to_tuple(),
            ("match_test", 1.0f64, "none", ("expression",m3).to_tuple(), "get-tuple").to_tuple(),
            ("simple_match_test", 0.0f64, "none", ("expression",m1).to_tuple(), "get-tuple").to_tuple(),
            ("simple_match_test2", 0.0f64, "none", ("expression",m2).to_tuple(), "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("input".to_string(), Changes{
            inserted: vec![
            (1, 8).to_tuple(),
            (2, 7).to_tuple(),
            (3, 6).to_tuple(),
            (4, 5).to_tuple(),
            ],
            removed: vec![]}),
        ]);
    flow = flow.compile_and_run();

    // Test match with a constant input
    let result = flow.get_state("simple_match_test");
    let answervec = vec![
                    vec!["one".to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[0]==r[0] );
    assert_eq!(q,true);

    // Test match with a call input
    let result = flow.get_state("simple_match_test2");
    let answervec = vec![
                    vec!["two".to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[0]==r[0] );
    assert_eq!(q,true);

    // Test match with column input
    let result = flow.get_state("match_test");

    let answervec = vec![
                    vec![(1f64,8f64).to_tuple().to_value(),"one".to_value()],
                    vec![(2f64,7f64).to_tuple().to_value(),"two".to_value()],
                    vec![(3f64,6f64).to_tuple().to_value(),"three".to_value()],
                    vec![(4f64,5f64).to_tuple().to_value(),"four".to_value()],
                    ];
    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q[1]==r[1] );
    assert_eq!(q,true);

}

#[test]
fn constraint_test() {

    let mut flow = Flow::new();
    flow.change(vec![
        ("schema".to_string(), Changes{
            inserted: vec![
            ("input_schema",).to_tuple(),
            ],
            removed: vec![]}),
        ("field".to_string(), Changes{
            inserted: vec![
            ("input_schema", 0.0f64, "A", "tuple").to_tuple(),
            ("input_schema", 1.0f64, "B", "tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("view".to_string(), Changes{
            inserted: vec![
            ("constraint_test", "input_schema", "query").to_tuple(),
            ("input", "input_schema", "input").to_tuple(),
            ],
            removed: vec![]}),
        ("constraint".to_string(), Changes{
            inserted: vec![
            (("column", "qq", "A").to_tuple(), "=", ("column", "qq", "B").to_tuple()).to_tuple(),
            (("column", "qq", "A").to_tuple(), ">", ("constant", 1.0f64).to_tuple()).to_tuple(),
            (("column", "qq", "A").to_tuple(), "<", ("constant", 11.0f64).to_tuple()).to_tuple(),
            ],
            removed: vec![]}),
        ("source".to_string(), Changes{
            inserted: vec![
            ("constraint_test", 0.0f64, "qq", ("view", "input").to_tuple(), "get-tuple").to_tuple(),
            ],
            removed: vec![]}),
        ("input".to_string(), Changes{
            inserted: vec![
            (1, 1).to_tuple(),
            (3, 4).to_tuple(),
            (6, 6).to_tuple(),
            (7, 8).to_tuple(),
            (9, 9).to_tuple(),
            (10, 11).to_tuple(),
            (12, 12).to_tuple(),
            ],
            removed: vec![]}),
        ]);
    flow = flow.compile_and_run();

    // Test constraint where LHS and RHS tables are the same
    let result = flow.get_state("constraint_test");

    let answervec = vec![
                    vec![(6f64,6f64).to_tuple().to_value()],
                    vec![(9f64,9f64).to_tuple().to_value()],
                    ];

    let (result_length,_) = result.iter().size_hint();
    assert_eq!(result_length,answervec.len());

    let q = result.iter().zip(answervec.iter()).all(|(q,r)| q==r);
    assert_eq!(q,true);

}