use value::{Id, Value, Tuple, Relation, ToTuple};
use index::{Index};
use query::{Ref, ConstraintOp, Constraint, Source, Clause, Query, Call};
use interpreter::EveFn;
use flow::{Changes, View, Union, Node, Flow};

use std::collections::{HashMap, BitSet};
use std::cell::{RefCell, RefMut};
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
            let other_source_id = &constraint_right[1];
            let other_field_id = &constraint_right[2];
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

fn create_clause(compiler: &Compiler, source: &Vec<Value>) -> Clause {
    let source_id = &source[SOURCE_ID];
    let source_view_id = &source[SOURCE_VIEW];
    let source_data = &source[SOURCE_DATA];
    if source_data[0].to_string() == "view" {
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
        match &*source[SOURCE_ACTION].to_string() {
            "get-tuple" => {
                Clause::Tuple(Source{
                    relation: other_view_ix.to_usize().unwrap(),
                    constraints: constraints,
                })
            }
            "get-relation" => {
                Clause::Relation(Source{
                    relation: other_view_ix.to_usize().unwrap(),
                    constraints: constraints,
                })
            }
            other => panic!("Unknown view action: {}", other)
        }
    } else if source_data[0].to_string() == "call"  {

        Clause::Call(create_call(compiler,&source_data[CALL_FUN],&source_data[CALL_ARGS]))

    } else if source_data[0].to_string() == "column" {

        Clause::Call(Call{fun: EveFn::None, arg_refs: vec![]})

    } else {

        panic!("Can't compile {:?} yet",source_data[0].to_string())
    }

}

fn create_call(compiler: &Compiler, uifun: &Value, uiargvec: &Value) -> Call {

    // Match the uiop with an EveFn...
    // TODO Do some type checking here?
    let evefn = match uifun.to_string().as_ref() {
        "+" => EveFn::Add,
        "-" => EveFn::Subtract,
        "*" => EveFn::Multiply,
        "/" => EveFn::Divide,
        _ => unimplemented!(),
    };

    // Collect arguments from the UI in a vector for the clause
    let mut argvec = Vec::new();
    for arg in uiargvec.to_tuple() {

        let argt = arg.to_tuple();

        // TODO super hacky. Should check arg number and type as prescribed by EveFn
        match argt[0].to_string().as_ref() {
            "constant" => {
                assert_eq!(argt.len(),2 as usize);
                argvec.push(Ref::Constant{value: argt[1].clone()});
            },
            "column" => {
                assert_eq!(argt.len(),3 as usize);
                let other_source_id = &argt[1];
                let other_field_id = &argt[2];
                let other_source_ix = get_source_ix(compiler, other_source_id);
                let other_field_ix = get_field_ix(compiler, other_field_id);

                argvec.push( Ref::Value{ clause: other_source_ix, column: other_field_ix } );
            },
            other => panic!("Unhandled ref kind: {}", other),
        }
    }

    if argvec.len() == 2 {
        Call{fun: evefn, arg_refs: argvec}
    } else {
       // Return a stupid dummy function if the call is not fully formed.
       // There needs to be a discussion about this: e.g. why are we sending malformed calls (i.e. missing arguments) to the runtime?
       Call{fun: EveFn::None, arg_refs: vec![]}
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

fn create_flow(compiler: &Compiler) -> Flow {
    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut states = Vec::new();
    for (ix, schedule) in compiler.schedule.iter().enumerate() { // arrives in ix order
        let view_id = &schedule[SCHEDULE_VIEW];
        let view = compiler.flow.get_state("view").find_one(VIEW_ID, view_id).clone();
        let view_kind = &view[VIEW_KIND];
        let node = create_node(compiler, view_id, view_kind);
        let state = match &view_id.to_string()[..] {
            "upstream" => RefCell::new(compiler.upstream.clone()),
            "schedule" => RefCell::new(compiler.schedule.clone()),
            _ => compiler.flow.get_ix(&node.id).map_or_else(
                || RefCell::new(Index::new()),
                |ix| compiler.flow.states[ix].clone()
                )
        };
        let is_calculated = match node.view {View::Input => false, _ => true};
        nodes.push(node);
        states.push(state);
        if is_calculated { dirty.insert(ix); }
    }
    Flow{
        nodes: nodes,
        dirty: dirty,
        states: states,
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
    create_flow(&compiler)
}