use value::{Id, Value, Tuple, Relation, ToValue, ToTuple, ToRelation};
use index::Index;
use query::{Ref, ConstraintOp, Constraint, Source, Clause, Query};
use flow::{FlowState, View, Node, Flow};

use std::collections::{HashMap, BitSet};
use std::cell::{RefCell, RefMut};
use std::num::ToPrimitive;

struct World {
    views: HashMap<Id, RefCell<Relation>>,
}

impl World {
    fn view<Id: ToString>(&self, id: Id) -> RefMut<Relation> {
        self.views.get(&id.to_string()).unwrap().borrow_mut()
    }
}

impl Index<Tuple> {
    pub fn find_all(&self, ix: usize, value: &Value) -> Vec<&Tuple> {
        self.iter().filter(|t| &t[ix] == value).collect()
    }

    pub fn find_one(&self, ix: usize, value: &Value) -> Option<&Tuple> {
        match &*self.find_all(ix, value) {
            [t] => Some(t),
            _ => None,
        }
    }
}

// TODO
// check schema table
// check view table
// fill in missing tables
// check schemas on every table
// check every table has a schema
// check every table is a view with kind=input
// check upstream etc are empty
// gather function refs
// poison rows in rounds until changes stop
//   foreign keys don't exist or are poisoned
//   ixes are not 0-n

// static view_id_ix: usize = 0;
// static view_kind_ix: usize = 2;

// static field_ix_ix: usize = 1;
// static field_id_ix: usize = 2;

// static source_ix_ix: usize = 0;
// static source_view_ix: usize = 1;
// static source_id_ix: usize = 2;
// static source_data_ix: usize = 3;
// static source_action_ix: usize = 4;

// static constraint_left_ix: usize = 0;
// static constraint_op_ix: usize = 1;
// static constraint_right_ix: usize = 2;

// static column_source_ix: usize = 0;
// static column_field_ix: usize = 1;

// static schedule_ix_ix: usize = 0;
// static schedule_view_ix: usize = 1;

// static upstream_downstream_ix: usize = 0;
// static upstream_upstream_ix: usize = 2;

// fn create_upstream(world: &mut World) {
//     // TODO have to handle unions too
//     let mut upstream = world.view("upstream");
//     for view in world.view("view").iter() {
//         let mut ix = 0.0;
//         let downstream_id = &view[view_id_ix];
//         for source in world.view("source").find_all(source_view_ix, downstream_id) {
//             let data = &source[source_data_ix];
//             if data[0] == "view".to_value() {
//                 let upstream_id = &data[1];
//                 upstream.insert((downstream_id.clone(), ix, upstream_id.clone()).to_tuple());
//                 ix += 1.0;
//             }
//         }
//     }
// }

// fn create_schedule(world: &mut World) {
//     // TODO actually schedule sensibly
//     // TODO warn about cycles through aggregates
//     let mut schedule = world.view("schedule");
//     let mut ix = 0.0;
//     for view in world.view("view").iter() {
//         let view_id = &view[view_id_ix];
//         schedule.insert((ix, view_id.clone()).to_tuple());
//         ix += 1.0;
//     }
// }

// fn get_source_ix(world: &World, source_id: &Value) -> usize {
//     let source = world.view("source").find_one(source_id_ix, source_id).unwrap();
//     source[source_ix_ix].to_usize().unwrap();
// }

// fn get_field_ix(world: &World, field_id: &Value) -> usize {
//     let field = world.view("field").find_one(field_id_ix, field_id).unwrap();
//     field[field_ix_ix].to_usize().unwrap();
// }

// fn get_num_fields(world: &World, view_id: &Value) -> usize {
//     let view = world.view("view").get_one(view_id_ix, view_id);
//     let schema_id = view[view_schema_ix];
//     world.view("fields").get_all(field_schema_ix, schema_id).len()
// }

// fn create_constraint(world: &World, constraint: Value) {
//     let my_column = constraint[constraint_left_ix][column_field_ix];
//     let op = match constraint[constraint_op_ix].to_string() {
//           "<" => ConstraintOp::LT,
//           "<=" => ConstraintOp::LTE,
//           "=" => ConstraintOp::EQ,
//           "!=" => ConstraintOp::NEQ,
//           ">" => ConstraintOp::GT,
//           ">=" => ConstraintOp::GTE,
//           _ => panic!("Dont know this op"),
//     };
//     let other_source_id = constraint[constraint_right_ix][column_source_ix];
//     let other_source_ix = get_source_ix(world, other_source_id);
//     let other_field_id = constraint[constraint_right_ix][column_field_ix];
//     let other_field_ix = get_field_ix(world, other_field_id);
//     Constraint{
//         my_column: my_column.to_usize().unwrap(),
//         op: op,
//         other_ref: Ref::Value{
//             clause: other_source_ix,
//             field: other_field_ix,
//         }
//     }
// }

// fn create_clause(world: &World, view_id: Value, source: Vec<Value>) {
//     let source_id = source[source_id_ix];
//     let source_data = source[source_data_ix];
//     if source_data[0].to_string() == "view" {
//         let other_view_id = source_data[1];
//         let schedule = world.view("schedule").find_one(schedule_view_ix, other_view_id);
//         let other_view_ix = schedule[schedule_ix_ix];
//         let constraints = world.view("constraint").iter().filter(|constraint| {
//             constraint[constraint_left_ix][column_source_ix] == other_view_id
//         }).map(|constraint| {
//             create_constraint(world, constraint)
//         }).collect::<Vec<_>>();
//         if source[source_action_ix].to_string() == "get-tuple" {
//             Clause::Tuple(Source{
//                 relation: other_view_ix,
//                 constraints: constraints,
//             })
//         } else {
//             Clause::Relation(Source{
//                 relation: other_view_ix,
//                 constraints: constraints,
//             })
//         }
//     } else {
//         panic!("Can't compile functions yet")
//     }

// }

// fn create_query(world: &World, view_id: &Value) -> Query {
//     let sources = world.view("source").find_all(source_view_ix, view_id); // arrives in ix order
//     let clauses = sources.map(|source| create_clause(world, view_id, source)).collect();
//     Query{clauses: clauses}
// }

// fn create_union(world: &World, view_id: &Value) -> Union {
//     // TODO have to handle mappings in upstream order...
//     let num_sink_fields = get_num_fields(view_id);
//     let view_mappings = Vec::new();
//     for view_mapping in world.view("view-mapping").find_all(view_mapping_view_ix, view_id) {
//         view_mapping_id = view_mapping[view_mapping_id_ix];
//         let source_view
//         let invalid = ::std::usize::MAX;
//         let field_mappings = vec![(invalid, invalid); num_sink_fields];
//         for field_mapping in world.view("field-mapping").find_all(field_mapping_view_mapping_ix) {
//             let source_field_id = field_mapping[field_mapping_source_field_ix];
//             let source_field_ix = get_field_ix(world, source_field_id);
//             let source_column_ix = field_mapping[field_mapping_source_column_ix].to_usize().unwrap();
//             let sink_field_id = field_mapping[field_mapping_sink_field_ix];
//             let sink_field_ix = get_field_ix(world, sink_field_id);
//             field_mappings[sink_field_ix] = (source_field_ix, source_column_ix);
//         }
//         let num_source_fields = get_num_fields()
//         view_mappings.push((num))
//     }
// }

// fn create_node(world: &World, view_id: &Value, view_kind: &Value) -> Node {
//     let view = match *view_kind.to_string() {
//         "input" => View::Input,
//         "query" => View::Query(create_query(world, view_id)),
//         "union" => View::Union(create_union(world, view_id)),
//     };
//     let upstream = world.view("upstream").find_all(upstream_downstream_ix, view_id).map(|upstream| {
//         upstream[upstream_upstream_ix];
//     }).collect(); // arrives in ix order so it will match the arg order selected by create_query/union
//     let downstream = world.view("upstream").find_all(upstream_upstream_ix, view_id).map(|upstream| {
//         upstream[upstream_downstream_ix];
//     }).collect();
//     Node{
//         id: view_id.to_string(),
//         view: view,
//         upstream: upstream,
//         downstream: downstream,
//     }
// }

// fn create_flow(world: &World) -> Flow {
//     let nodes = Vec::new();
//     for schedule in world.view("schedule").iter() { // arrives in ix order
//         let view_id = &schedule[schedule_view_ix];
//         let view = world.view("view").find_one(view_id_ix, view_id).unwrap();
//         let view_kind = &view[view_kind_ix];
//         let node = create_node(world, view);
//         nodes.push(node);
//     }
//     Flow{
//         nodes: nodes
//     }
// }

// fn create_flow_state(world: &World, flow: &Flow) -> FlowState {
//     let mut dirty = BitSet::new();
//     let mut outputs = Vec::new();
//     for (ix, node) in flow.nodes.iter().enumerate() {
//         outputs.push(RefCell::new(world.view(node.id).clone()));
//         match node.view {
//             View::Input => (),
//             _ => dirty.insert(ix),
//         }
//     }
//     FlowState{
//         dirty: dirty,
//         outputs: outputs
//     }
// }