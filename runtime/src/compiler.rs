use value::{Value, Tuple, Relation, ToTuple};
use index::{Index};
use query::{Ref, ConstraintOp, Constraint, Source, Expression, Clause, Query, Call, CallArg, Match};
use interpreter::{EveFn,Pattern};
use flow::{View, Union, Node, Flow};

use std::collections::{BitSet};
use std::cell::{RefCell};
use std::num::ToPrimitive;

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

// TODO
// check schema, field, view
// check schemas on every view
// check every view has a schema
// check every non-empty view is a view with kind=input
// fill in missing views with empty indexes
// check upstream etc are empty
// gather function refs
// poison rows in rounds until changes stop
//   foreign keys don't exist or are poisoned
//   ixes are not 0-n

static COMPILER_VIEWS: [&'static str; 7] =
["view", "source", "constraint", "view-mapping", "field-mapping", "schedule", "upstream"];

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
static FIELDMAPPING_SOURCEFIELD: usize = 1;
static FIELDMAPPING_SOURCECOLUMN: usize = 2;
static FIELDMAPPING_SINKFIELD: usize = 3;

static CALL_FUN: usize = 1;
static CALL_ARGS: usize = 2;

static MATCH_INPUT: usize = 1;
static MATCH_PATTERNS: usize = 2;
static MATCH_HANDLES: usize = 3;

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
}

fn create_upstream(flow: &Flow) -> Relation {
    let mut upstream = Index::new();
    for view in flow.get_state("view").iter() {
        let downstream_id = &view[VIEW_ID];
        let kind = &view[VIEW_KIND];
        let mut ix = 0.0;
        match &*kind.to_string() {
            "input" => (),
            "query" => {
                for source in flow.get_state("source").find_all(SOURCE_VIEW, downstream_id) {
                    let data = &source[SOURCE_DATA];
                    if &*data[0].to_string() == "view"  {
                        let upstream_id = &data[1];
                        upstream.insert((downstream_id.clone(), ix, upstream_id.clone()).to_tuple());
                        ix += 1.0;
                    }
                }
            }
            "union" => {
                for view_mapping in flow.get_state("view-mapping").find_all(VIEWMAPPING_SINKVIEW, downstream_id) {
                    let upstream_id = &view_mapping[VIEWMAPPING_SOURCEVIEW];
                    upstream.insert((downstream_id.clone(), ix, upstream_id.clone()).to_tuple());
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
    for view in flow.get_state("view").iter() {
        let view_id = &view[VIEW_ID];
        schedule.insert((ix, view_id.clone()).to_tuple());
        ix += 1.0;
    }
    schedule
}

fn get_view_ix(compiler: &Compiler, view_id: &Value) -> usize {
    let schedule = compiler.schedule.find_one(SCHEDULE_VIEW, view_id).clone();
    schedule[SCHEDULE_IX].to_usize().unwrap()
}

fn get_source_ix(compiler: &Compiler, source_id: &Value) -> usize {
    let source = compiler.flow.get_state("source").find_one(SOURCE_ID, source_id).clone();
    source[SOURCE_IX].to_usize().unwrap()
}

fn get_field_ix(compiler: &Compiler, field_id: &Value) -> usize {
    let field = compiler.flow.get_state("field").find_one(FIELD_ID, field_id).clone();
    field[FIELD_IX].to_usize().unwrap()
}

fn get_num_fields(compiler: &Compiler, view_id: &Value) -> usize {
    let view = compiler.flow.get_state("view").find_one(VIEW_ID, view_id).clone();
    let schema_id = &view[VIEW_SCHEMA];
    compiler.flow.get_state("field").find_all(FIELD_SCHEMA, schema_id).len()
}

fn create_constraint(compiler: &Compiler, constraint: &Vec<Value>) -> Constraint {
    let my_column = get_field_ix(compiler, &constraint[CONSTRAINT_LEFT][2]);
    let op = match &*constraint[CONSTRAINT_OP].to_string() {
          "<" => ConstraintOp::LT,
          "<=" => ConstraintOp::LTE,
          "=" => ConstraintOp::EQ,
          "!=" => ConstraintOp::NEQ,
          ">" => ConstraintOp::GT,
          ">=" => ConstraintOp::GTE,
          other => panic!("Unknown constraint op: {}", other),
    };
    let constraint_right = &constraint[CONSTRAINT_RIGHT];
    let other_ref = match &*constraint_right[0].to_string() {
        "column" => {
            let other_source_id = &constraint_right[COLUMN_SOURCE_ID];
            let other_field_id = &constraint_right[COLUMN_FIELD_ID];
            let other_source_ix = get_source_ix(compiler, other_source_id);
            let other_field_ix = get_field_ix(compiler, other_field_id);
            Ref::Value{
                clause: other_source_ix,
                column: other_field_ix,
            }
        }
        "constant" => {
            let value = constraint_right[1].clone();
            Ref::Constant{
                value: value,
            }
        }
        other => panic!("Unknown ref kind: {}", other)
    };
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
    let constraints = compiler.flow.get_state("constraint").iter().filter(|constraint| {
        constraint[CONSTRAINT_LEFT][1] == *source_id
    }).map(|constraint| {
        create_constraint(compiler, constraint)
    }).collect::<Vec<_>>();
    Source{
        relation: other_view_ix.to_usize().unwrap(),
        constraints: constraints,
    }
}

fn create_expression(compiler: &Compiler, expression: &Value) -> Expression {
    match &*expression[0].to_string() {
        "call" => Expression::Call(create_call(compiler,&expression[CALL_FUN],&expression[CALL_ARGS])),
        "match" => Expression::Match(create_match(compiler,&expression[MATCH_INPUT],&expression[MATCH_PATTERNS],&expression[MATCH_HANDLES])),
        other => panic!("Unknown expression type: {:?}", other),
    }
}

fn create_clause(compiler: &Compiler, source: &Vec<Value>) -> Clause {
    let source_data = &source[SOURCE_DATA];
    match &*source_data[0].to_string() {
        "view" => {
            match &*source[SOURCE_ACTION].to_string() {
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

fn create_match(compiler: &Compiler, uiinput: &Value, uipatterns: &Value, uihandles: &Value) -> Match {

	// Create the input
	let match_input = create_call_arg(compiler,uiinput.to_tuple());

	// Create the pattern vector
	let match_patterns = uipatterns.to_tuple()
							 .iter()
							 .map(|arg| Pattern::Constant(arg.clone()))
							 .collect();

    // Create handles vector
	let match_handles = uihandles.to_tuple()
							.iter()
							.map(|arg| create_call_arg(compiler,arg.to_tuple()))
							.collect();

	// Compile the call
	Match{input: match_input, patterns: match_patterns, handlers: match_handles}
}

fn create_call(compiler: &Compiler, uifun: &Value, uiargvec: &Value) -> Call {

    // Match the uifun with an EveFn...
    let evefn = match uifun.to_string().as_ref() {
        "+"   => EveFn::Add,
        "-"   => EveFn::Subtract,
        "*"   => EveFn::Multiply,
        "/"   => EveFn::Divide,
        "sum" => EveFn::Sum,
        _     => panic!("Unknown Function Call: {:?}",uifun),
    };

    let args = uiargvec.to_tuple()
                       .iter()
                       .map(|arg| create_call_arg(compiler, arg.to_tuple()))
                       .collect();

    Call{fun: evefn, args: args}
}

fn create_call_arg(compiler: &Compiler, arg: Tuple) -> CallArg {

    match arg[0].to_string().as_ref() {
        "constant" => {
            assert_eq!(arg.len(),2 as usize);
            CallArg::Ref(Ref::Constant{value: arg[1].clone()})
        },
        "column" => {
            assert_eq!(arg.len(),3 as usize);
            let other_source_id = &arg[COLUMN_SOURCE_ID];
            let other_field_id = &arg[COLUMN_FIELD_ID];
            let other_source_ix = get_source_ix(compiler, other_source_id);
            let other_field_ix = get_field_ix(compiler, other_field_id);

            CallArg::Ref(Ref::Value{ clause: other_source_ix, column: other_field_ix })
        },
        "call" => CallArg::Call(create_call(compiler,&arg[CALL_FUN],&arg[CALL_ARGS])),
        other  => panic!("Unhandled ref kind: {:?}", other),
    }
}

fn create_query(compiler: &Compiler, view_id: &Value) -> Query {
    // arrives in ix order
    let clauses = compiler.flow.get_state("source")
                       .find_all(SOURCE_VIEW, view_id)
                       .iter()
                       .map(|source| create_clause(compiler, source))
                       .collect();
    Query{clauses: clauses}
}

fn create_union(compiler: &Compiler, view_id: &Value) -> Union {
    let num_sink_fields = get_num_fields(compiler, view_id);
    let mut view_mappings = Vec::new();
    for upstream in compiler.upstream.find_all(UPSTREAM_DOWNSTREAM, view_id) { // arrives in ix order
        let source_view_id = &upstream[UPSTREAM_UPSTREAM];
        let view_mapping = compiler.flow.get_state("view-mapping").find_one(VIEWMAPPING_SOURCEVIEW, source_view_id).clone();
        let view_mapping_id = &view_mapping[VIEWMAPPING_ID];
        let invalid = ::std::usize::MAX;
        let mut field_mappings = vec![(invalid, invalid); num_sink_fields];
        for field_mapping in compiler.flow.get_state("field-mapping").find_all(FIELDMAPPING_VIEWMAPPING, &view_mapping_id) {
            let source_field_id = &field_mapping[FIELDMAPPING_SOURCEFIELD];
            let source_field_ix = get_field_ix(compiler, source_field_id);
            let source_column_id = &field_mapping[FIELDMAPPING_SOURCECOLUMN];
            let source_column_ix = get_field_ix(compiler, source_column_id);
            let sink_field_id = &field_mapping[FIELDMAPPING_SINKFIELD];
            let sink_field_ix = get_field_ix(compiler, sink_field_id);
            field_mappings[sink_field_ix] = (source_field_ix, source_column_ix);
        }
        let num_source_fields = get_num_fields(compiler, source_view_id);
        view_mappings.push((num_source_fields, field_mappings));
    }
    Union{mappings: view_mappings}
}

fn create_node(compiler: &Compiler, view_id: &Value, view_kind: &Value) -> Node {
    let view = match &*view_kind.to_string() {
        "input" => View::Input,
        "query" => View::Query(create_query(compiler, view_id)),
        "union" => View::Union(create_union(compiler, view_id)),
        other => panic!("Unknown view kind: {}", other)
    };
    let upstream = compiler.upstream.find_all(UPSTREAM_DOWNSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(compiler, &upstream[UPSTREAM_UPSTREAM])
    }).collect(); // arrives in ix order so it will match the arg order selected by create_query/union
    let downstream = compiler.upstream.find_all(UPSTREAM_UPSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(compiler, &upstream[UPSTREAM_DOWNSTREAM])
    }).collect();
    Node{
        id: view_id.to_string(),
        view: view,
        upstream: upstream,
        downstream: downstream,
    }
}

fn create_flow(compiler: Compiler) -> Flow {
    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut states: Vec<Option<RefCell<Relation>>> = Vec::new();

    // compile nodes
    for (ix, schedule) in compiler.schedule.iter().enumerate() { // arrives in ix order
        let view_id = &schedule[SCHEDULE_VIEW];
        let view = compiler.flow.get_state("view").find_one(VIEW_ID, view_id).clone();
        let view_kind = &view[VIEW_KIND];
        let node = create_node(&compiler, view_id, view_kind);
        match node.view {
            View::Input => (),
            _ => {
                dirty.insert(ix);
            },
        }
        nodes.push(node);
        states.push(None);
    }

    // grab state from old flow
    let Compiler{flow, upstream, schedule} = compiler;
    match nodes.iter().position(|node| &node.id[..] == "upstream") {
        Some(ix) => states[ix] = Some(RefCell::new(upstream)),
        None => (),
    }
    match nodes.iter().position(|node| &node.id[..] == "schedule") {
        Some(ix) => states[ix] = Some(RefCell::new(schedule)),
        None => (),
    }
    let Flow{nodes: old_nodes, states: old_states, changes, ..} = flow;
    for (old_node, old_state) in old_nodes.iter().zip(old_states.into_iter()) {
        if (old_node.id != "upstream") || (old_node.id != "schedule") {
            match nodes.iter().position(|node| node.id == old_node.id) {
                Some(ix) => states[ix] = Some(old_state),
                None => (),
            }
        }
    }

    // fill in state for new nodes
    let states = states.map_in_place(|state_option| match state_option {
        Some(state) => state,
        None => RefCell::new(Index::new()),
    });

    Flow{
        nodes: nodes,
        dirty: dirty,
        states: states,
        changes: changes,
    }
}

pub fn compile(mut flow: Flow) -> Flow {
    for view in COMPILER_VIEWS.iter() {
        flow.ensure_input_exists(view);
    }
    let upstream = create_upstream(&flow);
    let schedule = create_schedule(&flow);
    let compiler = Compiler{
        flow: flow,
        upstream: upstream,
        schedule: schedule,
    };
    create_flow(compiler)
}