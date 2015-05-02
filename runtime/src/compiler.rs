use value::{Value, Tuple, Relation};
use index::{Index, Changes};
use query::{Ref, ConstraintOp, Constraint, Source, Clause, Query};
use interpreter::{EveFn,Pattern};
use interpreter;
use flow::{View, Union, Node, Flow};

use std::collections::{BitSet};
use std::cell::{RefCell};

impl Index<Tuple> {
    pub fn find_all(&self, ix: usize, value: &Value) -> Vec<&Tuple> {
        self.iter().filter(|t| &t[ix] == value).collect()
    }

    pub fn find_one(&self, ix: usize, value: &Value) -> &Tuple {
        match &*self.find_all(ix, value) {
            [] => panic!("No tuples with tuple[{}] = {:?}", ix, value),
            [t] => t,
            _ => panic!("Multiple tuples with tuple[{}] = {:?}", ix, value),
        }
    }
}

static COMPILER_VIEWS: [&'static str; 9] = [
    "schema", "field", "view",
    "source", "constraint",
    "view-mapping", "field-mapping",
    "schedule", "upstream"
    ];

static VIEW_ID: usize = 0;
static VIEW_SCHEMA: usize = 1;
static VIEW_KIND: usize = 2;

static FIELD_SCHEMA: usize = 0;
static FIELD_IX: usize = 1;
static FIELD_ID: usize = 2;

static SOURCE_VIEW: usize = 0;
static SOURCE_IX: usize = 1;
static SOURCE_ID: usize = 2;
static SOURCE_DATA: usize = 3;
static SOURCE_ACTION: usize = 4;

static CONSTRAINT_LEFT: usize = 0;
static CONSTRAINT_OP: usize = 1;
static CONSTRAINT_RIGHT: usize = 2;

static VIEWMAPPING_ID: usize = 0;
static VIEWMAPPING_SOURCEVIEW: usize = 1;
static VIEWMAPPING_SINKVIEW: usize = 2;

static FIELDMAPPING_VIEWMAPPING: usize = 0;
static FIELDMAPPING_SOURCEREF: usize = 1;
static FIELDMAPPING_SINKFIELD: usize = 2;

static CALL_FUN: usize = 1;
static CALL_ARGS: usize = 2;

static MATCH_INPUT: usize = 1;
static MATCH_PATTERNS: usize = 2;
static MATCH_HANDLES: usize = 3;

static VARIABLE_NAME: usize = 1;

static COLUMN_SOURCE_ID: usize = 1;
static COLUMN_FIELD_ID: usize = 2;

static SCHEDULE_IX: usize = 0;
static SCHEDULE_VIEW: usize = 1;

static UPSTREAM_DOWNSTREAM: usize = 0;
static UPSTREAM_IX: usize = 1;
static UPSTREAM_UPSTREAM: usize = 2;

struct Compiler {
    flow: Flow,
    upstream: Relation,
    schedule: Relation,
    ordered_constraint: Relation,
}

fn create_upstream(flow: &Flow) -> Relation {
    let mut upstream = Index::new();
    for view in flow.get_output("view").iter() {
        let downstream_id = &view[VIEW_ID];
        let kind = &view[VIEW_KIND];
        let mut ix = 0.0;
        match kind.as_str() {
            "input" => (),
            "query" => {
                for source in flow.get_output("source").find_all(SOURCE_VIEW, downstream_id) {
                    let data = &source[SOURCE_DATA];
                    if data[0].as_str() == "view"  {
                        let upstream_id = &data[1];
                        upstream.insert(vec![
                            downstream_id.clone(),
                            Value::Float(ix),
                            upstream_id.clone(),
                            ]);
                        ix += 1.0;
                    }
                }
            }
            "union" => {
                for view_mapping in flow.get_output("view-mapping").find_all(VIEWMAPPING_SINKVIEW, downstream_id) {
                    let upstream_id = &view_mapping[VIEWMAPPING_SOURCEVIEW];
                        upstream.insert(vec![
                            downstream_id.clone(),
                            Value::Float(ix),
                            upstream_id.clone(),
                            ]);
                    ix += 1.0;
                }
            }
            other => panic!("Unknown view kind: {}", other)
        }
    }
    upstream
}

fn create_schedule(flow: &Flow) -> Relation {
    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut schedule = Index::new();
    let mut ix = 0.0;
    for view in flow.get_output("view").iter() {
        let view_id = &view[VIEW_ID];
        schedule.insert(vec![Value::Float(ix), view_id.clone()]);
        ix += 1.0;
    }
    schedule
}

// hackily reorder constraints to match old assumptions in create_constraint
fn create_ordered_constraint(flow: &Flow) -> Relation {
    let mut ordered_constraint = Index::new();
    for constraint in flow.get_output("constraint").iter() {
        let left = constraint[CONSTRAINT_LEFT].clone();
        let op = constraint[CONSTRAINT_OP].clone();
        let right = constraint[CONSTRAINT_RIGHT].clone();
        assert!((left[0].as_str() != "constant") || (right[0].as_str() != "constant"));
        if get_ref_ix(flow, &left) >= get_ref_ix(flow, &right) {
            ordered_constraint.insert(vec![left, op, right]);
        } else {
            ordered_constraint.insert(vec![right, op, left]);
        }
    }
    ordered_constraint
}

fn get_view_ix(schedule: &Relation, view_id: &Value) -> usize {
    schedule.find_one(SCHEDULE_VIEW, view_id)[SCHEDULE_IX].to_usize().unwrap()
}

fn get_source_ix(flow: &Flow, source_id: &Value) -> usize {
    flow.get_output("source").find_one(SOURCE_ID, source_id)[SOURCE_IX].to_usize().unwrap()
}

fn get_field_ix(flow: &Flow, field_id: &Value) -> usize {
    flow.get_output("field").find_one(FIELD_ID, field_id)[FIELD_IX].to_usize().unwrap()
}

fn get_num_fields(flow: &Flow, view_id: &Value) -> usize {
    let schema_id = flow.get_output("view").find_one(VIEW_ID, view_id)[VIEW_SCHEMA].clone();
    flow.get_output("field").find_all(FIELD_SCHEMA, &schema_id).len()
}

fn get_ref_ix(flow: &Flow, reference: &Value) -> i64 {
    match reference[0].as_str() {
        "constant" => -1, // constants effectively are calculated before any sources
        "column" => get_source_ix(flow, &reference[1]) as i64,
        other => panic!("Unknown ref type: {:?}", other),
    }
}

fn create_reference(compiler: &Compiler, reference: &Value) -> Ref {
    match reference[0].as_str() {
        "constant" => {
            let value = reference[1].clone();
            Ref::Constant{
                value: value,
            }
        }
        "column" => {
            let other_source_id = &reference[COLUMN_SOURCE_ID];
            let other_field_id = &reference[COLUMN_FIELD_ID];
            let other_source_ix = get_source_ix(&compiler.flow, other_source_id);
            let other_field_ix = get_field_ix(&compiler.flow, other_field_id);
            Ref::Value{
                clause: other_source_ix,
                column: other_field_ix,
            }
        }
        other => panic!("Unknown ref kind: {}", other)
    }
}

fn create_constraint(compiler: &Compiler, constraint: &Vec<Value>) -> Constraint {
    let my_column = get_field_ix(&compiler.flow, &constraint[CONSTRAINT_LEFT][2]);
    let op = match constraint[CONSTRAINT_OP].as_str() {
        "<" => ConstraintOp::LT,
        "<=" => ConstraintOp::LTE,
        "=" => ConstraintOp::EQ,
        "!=" => ConstraintOp::NEQ,
        ">" => ConstraintOp::GT,
        ">=" => ConstraintOp::GTE,
        other => panic!("Unknown constraint op: {}", other),
    };
    let other_ref = create_reference(compiler, &constraint[CONSTRAINT_RIGHT]);
    Constraint{
        my_column: my_column,
        op: op,
        other_ref: other_ref,
    }
}

fn create_source(compiler: &Compiler, source: &Vec<Value>) -> Source {
    let source_id = &source[SOURCE_ID];
    let source_view_id = &source[SOURCE_VIEW];
    let source_data = &source[SOURCE_DATA];
    let other_view_id = &source_data[1];
    let upstream = compiler.upstream.iter().filter(|upstream| {
        (upstream[UPSTREAM_DOWNSTREAM] == *source_view_id) &&
        (upstream[UPSTREAM_UPSTREAM] == *other_view_id)
    }).next().unwrap();
    let other_view_ix = &upstream[UPSTREAM_IX];
    let constraints = compiler.ordered_constraint.iter().filter(|constraint| {
        constraint[CONSTRAINT_LEFT][1] == *source_id
    }).map(|constraint| {
        create_constraint(compiler, constraint)
    }).collect::<Vec<_>>();
    Source{
        relation: other_view_ix.to_usize().unwrap(),
        constraints: constraints,
    }
}

fn create_expression(compiler: &Compiler, expression: &Value) -> interpreter::Expression {
    match expression[0].as_str() {
        "call" => interpreter::Expression::Call(create_call(compiler,&expression[CALL_FUN],&expression[CALL_ARGS])),
        "match" => interpreter::Expression::Match(Box::new(create_match(compiler,&expression[MATCH_INPUT],&expression[MATCH_PATTERNS],&expression[MATCH_HANDLES]))),
        other => panic!("Unknown expression type: {:?}", other),
    }
}

fn create_clause(compiler: &Compiler, source: &Vec<Value>) -> Clause {
    let source_data = &source[SOURCE_DATA];
    match source_data[0].as_str() {
        "view" => {
            match source[SOURCE_ACTION].as_str() {
                "get-tuple" => Clause::Tuple(create_source(compiler, source)),
                "get-relation" => Clause::Relation(create_source(compiler, source)),
                other => panic!("Unknown view action: {}", other),
            }
        }
        "expression" => {
            Clause::Expression(create_expression(compiler, &source_data[1]))
        }
        other => panic!("Unknown clause type: {:?}", other)
    }
}


fn create_match(compiler: &Compiler, uiinput: &Value, uipatterns: &Value, uihandlers: &Value) -> interpreter::Match {

    // Create the input
    let match_input = create_call_arg(compiler,uiinput.as_slice());

    // Create the pattern vector
    let match_patterns = uipatterns.as_slice()
                        .iter()
                        .map(|arg| {
                            let call_arg = create_call_arg(compiler,arg.as_slice());
                            match call_arg {
                                interpreter::Expression::Ref(x) => Pattern::Constant(x),
                                interpreter::Expression::Variable(x) => Pattern::Variable(x),
                                _ => panic!("TODO"),
                                }
                            }
                        )
                        .collect();

    // Create handles vector
    let match_handlers = uihandlers.as_slice()
                            .iter()
                            .map(|arg| create_call_arg(compiler,arg.as_slice()))
                            .collect();

    // Compile the match
    interpreter::Match{input: match_input, patterns: match_patterns, handlers: match_handlers}
}

fn create_call(compiler: &Compiler, uifun: &Value, uiargvec: &Value) -> interpreter::Call {

    // Match the uifun with an EveFn...
    let evefn = match uifun.as_str() {
        "+"   => EveFn::Add,
        "-"   => EveFn::Subtract,
        "*"   => EveFn::Multiply,
        "/"   => EveFn::Divide,
        "sum" => EveFn::Sum,
        "prod" => EveFn::Prod,
        "max" => EveFn::Max,
        "min" => EveFn::Min,
        "limit" => EveFn::Limit,
        _     => panic!("Unknown Function Call: {:?}",uifun),
    };

    let args = uiargvec.as_slice()
                       .iter()
                       .map(|arg| create_call_arg(compiler, arg.as_slice()))
                       .collect();

    interpreter::Call{fun: evefn, args: args}
}

fn create_call_arg(compiler: &Compiler, arg: &[Value]) -> interpreter::Expression {

    match arg[0].as_str() {
        "constant" => {
            assert_eq!(arg.len(),2 as usize);
            interpreter::Expression::Ref(Ref::Constant{value: arg[1].clone()})
        },
        "column" => {
            assert_eq!(arg.len(),3 as usize);
            let other_source_id = &arg[COLUMN_SOURCE_ID];
            let other_field_id = &arg[COLUMN_FIELD_ID];
            let other_source_ix = get_source_ix(&compiler.flow, other_source_id);
            let other_field_ix = get_field_ix(&compiler.flow, other_field_id);

            interpreter::Expression::Ref(Ref::Value{ clause: other_source_ix, column: other_field_ix })
        },
        "variable" => {
            match &arg[VARIABLE_NAME] {
                &Value::String(ref s) => interpreter::Expression::Variable(interpreter::Variable{variable: s.clone()}),
                other => panic!("Could not compile variable with argument {:?}",other),
            }

        },
        "call" => interpreter::Expression::Call(create_call(compiler,&arg[CALL_FUN],&arg[CALL_ARGS])),
        "match" => interpreter::Expression::Match(Box::new(create_match(compiler,&arg[MATCH_INPUT],&arg[MATCH_PATTERNS],&arg[MATCH_HANDLES]))),
        other  => panic!("Unhandled ref kind: {:?}", other),
    }
}

fn create_query(compiler: &Compiler, view_id: &Value) -> Query {
    // arrives in ix order
    let clauses = compiler.flow.get_output("source")
                       .find_all(SOURCE_VIEW, view_id)
                       .iter()
                       .map(|source| create_clause(compiler, source))
                       .collect();
    Query{clauses: clauses}
}

fn create_union(compiler: &Compiler, view_id: &Value) -> Union {
    let num_sink_fields = get_num_fields(&compiler.flow, view_id);
    let mut view_mappings = Vec::new();
    for upstream in compiler.upstream.find_all(UPSTREAM_DOWNSTREAM, view_id) { // arrives in ix order
        let source_view_id = &upstream[UPSTREAM_UPSTREAM];
        let view_mapping = compiler.flow.get_output("view-mapping").find_one(VIEWMAPPING_SOURCEVIEW, source_view_id).clone();
        let view_mapping_id = &view_mapping[VIEWMAPPING_ID];
        let mut field_mappings = vec![None; num_sink_fields];
        for field_mapping in compiler.flow.get_output("field-mapping").find_all(FIELDMAPPING_VIEWMAPPING, &view_mapping_id) {
            let source_ref = create_reference(compiler, &field_mapping[FIELDMAPPING_SOURCEREF]);
            let sink_field_id = &field_mapping[FIELDMAPPING_SINKFIELD];
            let sink_field_ix = get_field_ix(&compiler.flow, sink_field_id);
            field_mappings[sink_field_ix] = Some(source_ref);
        }
        let num_source_fields = get_num_fields(&compiler.flow, source_view_id);
        // TODO this should be checked by the validator
        if field_mappings.iter().any(|reference| reference.is_none()) {
            println!("Warning, missing field mappings on view mapping: {:?}", view_mapping_id);
            view_mappings.push((num_source_fields, vec![])); // TODO total hack
        } else {
            let field_mappings = field_mappings.drain().map(|reference| reference.unwrap()).collect();
            view_mappings.push((num_source_fields, field_mappings));
        }
    }
    Union{mappings: view_mappings}
}

fn create_node(compiler: &Compiler, view_id: &Value, view_kind: &Value) -> Node {
    let view = match view_kind.as_str() {
        "query" => View::Query(create_query(compiler, view_id)),
        "union" => View::Union(create_union(compiler, view_id)),
        other => panic!("Unknown view kind: {}", other)
    };
    let upstream = compiler.upstream.find_all(UPSTREAM_DOWNSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(&compiler.schedule, &upstream[UPSTREAM_UPSTREAM])
    }).collect(); // arrives in ix order so it will match the arg order selected by create_query/union
    let downstream = compiler.upstream.find_all(UPSTREAM_UPSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(&compiler.schedule, &upstream[UPSTREAM_DOWNSTREAM])
    }).collect();
    Node{
        id: view_id.as_str().to_string(),
        view: view,
        upstream: upstream,
        downstream: downstream,
    }
}

fn create_flow(compiler: Compiler) -> Flow {
    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut inputs: Vec<Option<RefCell<Relation>>> = Vec::new();
    let mut outputs: Vec<Option<RefCell<Relation>>> = Vec::new();

    // compile nodes
    for (ix, schedule) in compiler.schedule.iter().enumerate() { // arrives in ix order
        let view_id = &schedule[SCHEDULE_VIEW];
        let view = compiler.flow.get_output("view").find_one(VIEW_ID, view_id).clone();
        let view_kind = &view[VIEW_KIND];
        let node = create_node(&compiler, view_id, view_kind);
        nodes.push(node);
        dirty.insert(ix);
        inputs.push(None);
        outputs.push(None);
    }

    // grab state from old flow
    let Compiler{flow, upstream, schedule, ..} = compiler;
    match nodes.iter().position(|node| &node.id[..] == "upstream") {
        Some(ix) => outputs[ix] = Some(RefCell::new(upstream)),
        None => (),
    }
    match nodes.iter().position(|node| &node.id[..] == "schedule") {
        Some(ix) => outputs[ix] = Some(RefCell::new(schedule)),
        None => (),
    }
    let Flow{nodes: old_nodes, inputs: old_inputs, outputs: old_outputs, changes, ..} = flow;
    for ((old_node, old_input), old_output) in old_nodes.iter().zip(old_inputs.into_iter()).zip(old_outputs.into_iter()) {
        if (old_node.id != "upstream") || (old_node.id != "schedule") {
            match nodes.iter().position(|node| node.id == old_node.id) {
                Some(ix) => {
                    inputs[ix] = Some(old_input);
                    outputs[ix] = Some(old_output);
                }
                None => (),
            }
        }
    }

    // fill in input for new nodes
    let inputs = inputs.map_in_place(|input_option| match input_option {
        Some(input) => input,
        None => RefCell::new(Index::new()),
    });
    let outputs = outputs.map_in_place(|output_option| match output_option {
        Some(output) => output,
        None => RefCell::new(Index::new()),
    });

    Flow{
        nodes: nodes,
        dirty: dirty,
        inputs: inputs,
        outputs: outputs,
        changes: changes,
    }
}

impl Flow {
    pub fn new() -> Self {
        let mut flow =
            Flow {
                nodes: Vec::new(),
                inputs: Vec::new(),
                outputs: Vec::new(),
                dirty: BitSet::new(),
                changes: Vec::new(),
            };
        for view in COMPILER_VIEWS.iter() {
            flow.ensure_union_exists(view);
        }
        // TODO add schemas and fields as well
        flow.get_input_mut("view").change(
            Changes{
                inserted: COMPILER_VIEWS.iter().map(|id|
                    vec![
                        Value::String(id.to_string()),
                        Value::String(format!("{}-schema", id)),
                        Value::String("union".to_string()),
                    ]
                    ).collect(),
                removed: vec![],
            });
        flow
    }

    fn compiler_views_changed_since(&self, changes_seen: usize) -> bool {
        self.changes[changes_seen..].iter().any(|&(ref change_id, _)|
            COMPILER_VIEWS.iter().any(|view_id| *view_id == change_id)
            )
    }

    pub fn compile(self) -> Self {
        let upstream = create_upstream(&self);
        let schedule = create_schedule(&self);
        let ordered_constraint = create_ordered_constraint(&self);
        let compiler = Compiler{
            flow: self,
            upstream: upstream,
            schedule: schedule,
            ordered_constraint: ordered_constraint,
        };
        create_flow(compiler)
    }

    pub fn compile_and_run(self) -> Self {
        let mut flow = self;
        let mut changes_seen = 0;
        loop {
            flow.run();
            if flow.compiler_views_changed_since(changes_seen) {
                changes_seen = flow.changes.len();
                flow = flow.compile();
            } else {
                return flow;
            }
        }
    }
}