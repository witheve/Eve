use value::{Id, Value, ToValue, Tuple, Relation, ToTuple};
use index::{Index};
use query::{Ref, ConstraintOp, Constraint, Source, Clause, Query, ToRef, Call};
use interpreter::EveFn;
use flow::{Changes, View, Union, Node, FlowState, Flow};

use std::collections::{HashMap, BitSet};
use std::cell::{RefCell, RefMut};
use std::num::ToPrimitive;

#[derive(Clone, Debug)]
pub struct World {
    pub views: HashMap<Id, RefCell<Relation>>,
}

impl World {
    pub fn get_or_create<Id: ToString>(&mut self, id: Id) -> &mut RefCell<Relation> {
        self.views.entry(id.to_string()).or_insert_with(|| RefCell::new(Index::new()))
    }

    pub fn change(&mut self, changes: Changes) {
        for (view_id, changes) in changes.into_iter() {
            self.get_or_create(&view_id).borrow_mut().change(changes)
        }
    }

    fn view<Id: ToString>(&self, id: Id) -> ::std::cell::Ref<Relation> {
        self.views.get(&id.to_string()).expect(&id.to_string()).borrow()
    }

    fn view_mut<Id: ToString>(&self, id: Id) -> RefMut<Relation> {
        self.views.get(&id.to_string()).expect(&id.to_string()).borrow_mut()
    }
}

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

fn create_upstream(world: &mut World) {
    let mut upstream = world.view_mut("upstream");
    for view in world.view("view").iter() {
        let downstream_id = &view[VIEW_ID];
        let kind = &view[VIEW_KIND];
        let mut ix = 0.0;
        match &*kind.to_string() {
            "input" => (),
            "query" => {
                for source in world.view("source").find_all(SOURCE_VIEW, downstream_id) {
                    let data = &source[SOURCE_DATA];
                    if &*data[0].to_string() == "view"  {
                        let upstream_id = &data[1];
                        upstream.insert((downstream_id.clone(), ix, upstream_id.clone()).to_tuple());
                        ix += 1.0;
                    }
                }
            }
            "union" => {
                for view_mapping in world.view("view-mapping").find_all(VIEWMAPPING_SINKVIEW, downstream_id) {
                    let upstream_id = &view_mapping[VIEWMAPPING_SOURCEVIEW];
                    upstream.insert((downstream_id.clone(), ix, upstream_id.clone()).to_tuple());
                    ix += 1.0;
                }
            }
            other => panic!("Unknown view kind: {}", other)
        }
    }
}

fn create_schedule(world: &mut World) {
    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut schedule = world.view_mut("schedule");
    let mut ix = 0.0;
    for view in world.view("view").iter() {
        let view_id = &view[VIEW_ID];
        schedule.insert((ix, view_id.clone()).to_tuple());
        ix += 1.0;
    }
}

fn get_view_ix(world: &World, view_id: &Value) -> usize {
    let schedule = world.view("schedule").find_one(SCHEDULE_VIEW, view_id).clone();
    schedule[SCHEDULE_IX].to_usize().unwrap()
}

fn get_source_ix(world: &World, source_id: &Value) -> usize {
    let source = world.view("source").find_one(SOURCE_ID, source_id).clone();
    source[SOURCE_IX].to_usize().unwrap()
}

fn get_field_ix(world: &World, field_id: &Value) -> usize {
    let field = world.view("field").find_one(FIELD_ID, field_id).clone();
    field[FIELD_IX].to_usize().unwrap()
}

fn get_num_fields(world: &World, view_id: &Value) -> usize {
    let view = world.view("view").find_one(VIEW_ID, view_id).clone();
    let schema_id = &view[VIEW_SCHEMA];
    world.view("field").find_all(FIELD_SCHEMA, schema_id).len()
}

fn create_constraint(world: &World, constraint: &Vec<Value>) -> Constraint {
    let my_column = get_field_ix(world, &constraint[CONSTRAINT_LEFT][2]);
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
            let other_source_ix = get_source_ix(world, other_source_id);
            let other_field_ix = get_field_ix(world, other_field_id);
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

fn create_clause(world: &World, source: &Vec<Value>) -> Clause {
    let source_id = &source[SOURCE_ID];
    let source_view_id = &source[SOURCE_VIEW];
    let source_data = &source[SOURCE_DATA];
    if source_data[0].to_string() == "view" {
        let other_view_id = &source_data[1];
        let upstreams = world.view("upstream");
        let upstream = upstreams.iter().filter(|upstream| {
            (upstream[UPSTREAM_DOWNSTREAM] == *source_view_id) &&
            (upstream[UPSTREAM_UPSTREAM] == *other_view_id)
        }).next().unwrap();
        let other_view_ix = &upstream[UPSTREAM_IX];
        let constraints = world.view("constraint").iter().filter(|constraint| {
            constraint[CONSTRAINT_LEFT][1] == *source_id
        }).map(|constraint| {
            create_constraint(world, constraint)
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

        Clause::Call(create_call(&source_data[CALL_FUN],&source_data[CALL_ARGS]))

    } else if source_data[0].to_string() == "column" {

        println!("{:?}",source_data);
        Clause::Call(Call{fun: EveFn::None, arg_refs: vec![]})

    } else {
        
        panic!("Can't compile {:?} yet",source_data[0].to_string())
    }

}

fn create_call(uifun: &Value, uiargvec: &Value) -> Call {

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
        assert_eq!(argt.len(),2 as usize);

        if argt[0] == "constant".to_value() {
            argvec.push(argt[1].clone().to_constref());
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

fn create_query(world: &World, view_id: &Value) -> Query {
    // arrives in ix order
    let clauses = world.view("source")
                       .find_all(SOURCE_VIEW, view_id)
                       .iter()
                       .map(|source| create_clause(world, source))
                       .collect();
    Query{clauses: clauses}
}

fn create_union(world: &World, view_id: &Value) -> Union {
    let num_sink_fields = get_num_fields(world, view_id);
    let mut view_mappings = Vec::new();
    for upstream in world.view("upstream").find_all(UPSTREAM_DOWNSTREAM, view_id) { // arrives in ix order
        let source_view_id = &upstream[UPSTREAM_UPSTREAM];
        let view_mapping = world.view("view-mapping").find_one(VIEWMAPPING_SOURCEVIEW, source_view_id).clone();
        let view_mapping_id = &view_mapping[VIEWMAPPING_ID];
        let invalid = ::std::usize::MAX;
        let mut field_mappings = vec![(invalid, invalid); num_sink_fields];
        for field_mapping in world.view("field-mapping").find_all(FIELDMAPPING_VIEWMAPPING, &view_mapping_id) {
            let source_field_id = &field_mapping[FIELDMAPPING_SOURCEFIELD];
            let source_field_ix = get_field_ix(world, source_field_id);
            let source_column_id = &field_mapping[FIELDMAPPING_SOURCECOLUMN];
            let source_column_ix = get_field_ix(world, source_column_id);
            let sink_field_id = &field_mapping[FIELDMAPPING_SINKFIELD];
            let sink_field_ix = get_field_ix(world, sink_field_id);
            field_mappings[sink_field_ix] = (source_field_ix, source_column_ix);
        }
        let num_source_fields = get_num_fields(world, source_view_id);
        view_mappings.push((num_source_fields, field_mappings));
    }
    Union{mappings: view_mappings}
}

fn create_node(world: &World, view_id: &Value, view_kind: &Value) -> Node {
    let view = match &*view_kind.to_string() {
        "input" => View::Input,
        "query" => View::Query(create_query(world, view_id)),
        "union" => View::Union(create_union(world, view_id)),
        other => panic!("Unknown view kind: {}", other)
    };
    let upstream = world.view("upstream").find_all(UPSTREAM_DOWNSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(world, &upstream[UPSTREAM_UPSTREAM])
    }).collect(); // arrives in ix order so it will match the arg order selected by create_query/union
    let downstream = world.view("upstream").find_all(UPSTREAM_UPSTREAM, view_id).iter().map(|upstream| {
        get_view_ix(world, &upstream[UPSTREAM_DOWNSTREAM])
    }).collect();
    Node{
        id: view_id.to_string(),
        view: view,
        upstream: upstream,
        downstream: downstream,
    }
}

fn create_flow(world: &World) -> Flow {
    let mut nodes = Vec::new();
    for schedule in world.view("schedule").iter() { // arrives in ix order
        let view_id = &schedule[SCHEDULE_VIEW];
        let view = world.view("view").find_one(VIEW_ID, view_id).clone();
        let view_kind = &view[VIEW_KIND];
        let node = create_node(world, view_id, view_kind);
        nodes.push(node);
    }
    Flow{
        nodes: nodes
    }
}

fn create_flow_state(world: &World, flow: &Flow) -> FlowState {
    let mut dirty = BitSet::new();
    let mut outputs = Vec::new();
    for (ix, node) in flow.nodes.iter().enumerate() {
        outputs.push(world.views.get(&node.id).map_or_else(
            || RefCell::new(Index::new()),
            |r| r.clone()
            ));
        match node.view {
            View::Input => (),
            _ => {dirty.insert(ix);},
        }
    }
    FlowState{
        dirty: dirty,
        outputs: outputs
    }
}

pub fn compile(world: &mut World) -> (Flow, FlowState) {
    for view_id in COMPILER_VIEWS.iter() {
        world.get_or_create(view_id);
    }
    create_upstream(world);
    create_schedule(world);
    let flow = create_flow(world);
    let flow_state = create_flow_state(world, &flow);
    (flow, flow_state)
}