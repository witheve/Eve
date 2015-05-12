use std::collections::BitSet;
use std::cell::RefCell;

use value::{Id, Value};
use relation::{Relation, Change, Select};
use view::{View, Table, Union};
use flow::{Node, Flow, Changes};

pub fn schema() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>)> {
    // the schema is arranged as (table name, unique key fields, other fields)
    // any field whose type is not described is a UUID

    vec![
    // all state lives in a view of some kind
    // `kind` is one of:
    // "table" - a view which can depend on the past
    // "join" - take the product of multiple views and filter the results
    // "union" - take the union of multiple views
    // "aggregate" - group one view by the contents of another and run reducing functions on the groups
    // "primitive" - a built-in function, represented as a view with one or more non-Data fields
    ("view", vec!["view"], vec!["kind"]),

    // views have fields
    // some fields have constraints on how they can be queried
    // `kind` is one of:
    // "output" - a normal field
    // "scalar input" - a field that must be constrained to a single scalar value
    // "vector input" - a field that must be constrained to a single vector value (in an aggregate)
    ("field", vec!["field"], vec!["view", "kind"]),

    // source ids have two purposes
    // a) uniquely generated ids to disambiguate multiple uses of the same view
    // (eg when joining a view with itself)
    // b) fixed ids to identify views which are used for some specific purpose
    // (these are "insert" and "remove" in tables and "inner" and "outer" in aggregates)
    ("source", vec!["view", "source"], vec!["source view"]),

    // every view also has an implicit "constant" source
    // anywhere source-field is expected, you can instead use "constant"-id
    // `value` may be any valid eve value
    ("constant", vec!["constant"], vec!["value"]),

    // constraints belong to a join view
    // the left and right fields are compared using the operation
    // `operation` is one of "==", "/=", "<", "<=", ">", ">="
    ("constraint", vec!["constraint"], vec!["view"]),
    ("constraint left", vec!["constraint"], vec!["left source", "left field"]),
    ("constraint right", vec!["constraint"], vec!["right source", "right field"]),
    ("constraint operation", vec!["constraint"], vec!["operation"]),

    // aggregates group an "inner" source by the rows of an "outer" source
    // the grouping is determined by binding inner fields to outer fields or constants
    ("aggregate grouping", vec!["aggregate", "inner field"], vec!["group source", "group field"]),
    // before aggregation the groups are sorted
    // `priority` is an f64. higher priority fields are compared first. ties are broken by field id
    // `direction` is one of "ascending" or "descending"
    // fields which have no entry default to 0, "ascending"
    ("aggregate sorting", vec!["aggregate", "inner field"], vec!["priority", "direction"]),
    // groups may optionally be limited by an inner field or constant
    ("aggregate limit from", vec!["aggregate"], vec!["from source", "from field"]),
    ("aggregate limit to", vec!["aggregate"], vec!["to source", "to field"]),
    // the groups may be reduced by binding against reducer sources
    // constants and grouped inner fields may both be used as ScalarInput arguments
    // ungrouped inner fields which are not bound to outer fields may be used as VectorInput arguments
    ("aggregate argument", vec!["aggregate", "reducer source", "reducer field"], vec!["argument source", "argument field"]),

    // views produce output by binding fields from sources
    // each table or join field must be bound exactly once
    // each aggregate field must be bound exactly once and can only bind constants, inner fields or reducer outputs
    // each union field must be bound exactly once per source
    // (the unique key is different for union than for other kinds, so I don't give a key at all)
    ("select", vec![], vec!["view", "view field", "source", "source field"]),

    // things can have human readable names
    // `name` is a string
    ("display name", vec!["id"], vec!["name"]),
    // things can be displayed in ordered lists
    // `priority` is an f64. higher priority things are displayed first. ties are broken by id
    ("display order", vec!["field"], vec!["priority"]),

    // the compiler reflects its decisions into some builtin views
    // a dependency exists whenever the contents on one view depend directly on another
    // `ix` is an integer identifying the edge
    ("dependency", vec!["upstream view", "ix"], vec!["downstream view"]),
    // the schedule determines what order views will be executed in
    // `ix` is an integer. views with lower ixes are executed first.
    ("schedule", vec!["view"], vec!["ix"]),
    ]
}

struct Compiler {
    flow: Flow,
    dependency: Relation,
    schedule: Relation,
}

fn create_dependency(flow: &Flow) -> Relation {
    let mut dependency = Vec::new();
    for view in flow.get_output("view").iter() {
        let mut ix = 0.0;
        for source in flow.get_output("source").find_all("view", &view["view"]) {
            dependency.push(vec![
                view["view"].clone(),
                Value::Float(ix),
                source["source view"].clone(),
                ]);
            ix += 1.0;
        }
    }
    Relation{
        fields: vec!["upstream view".to_owned(), "ix".to_owned(), "downstream view".to_owned()],
        index: dependency.into_iter().collect(),
    }
}

fn create_schedule(flow: &Flow) -> Relation {
    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut schedule = Vec::new();
    let mut ix = 0.0;
    for view in flow.get_output("view").iter() {
        schedule.push(vec![Value::Float(ix), view["view"].clone()]);
        ix += 1.0;
    }
    Relation{
        fields: vec!["ix".to_owned(), "view".to_owned()],
        index: schedule.into_iter().collect(),
    }
}

fn create_union_select(compiler: &Compiler, view_id: &Value, source_id: &Value) -> Select {
    let fields = compiler.flow.get_output("field").find_all("view", view_id).iter().map(|field| {
            compiler.flow.get_output("select").iter().find(|select|
                select["view"] == *view_id
                && select["view field"] == field["field"]
                && select["source"] == *source_id
            ).unwrap()["source field"].as_str().to_owned()
        }).collect();
    Select{fields: fields}
}

fn create_union(compiler: &Compiler, view_id: &Value) -> Union {
    let selects = compiler.dependency.find_all("downstream view", view_id).iter().map(|dependency| {
        create_union_select(compiler, view_id, &dependency["upstream view"])
    }).collect();
    Union{selects: selects}
}

fn create_node(compiler: &Compiler, view_id: &Value, view_kind: &Value) -> Node {
    let view = match view_kind.as_str() {
        "table" => View::Table(Table),
        "union" => View::Union(create_union(compiler, view_id)),
        other => panic!("Unknown view kind: {}", other),
    };
    let upstream = compiler.dependency.find_all("downstream view", view_id).iter().map(|dependency| {
        compiler.schedule.find_one("view", &dependency["upstream view"])["ix"].as_usize()
    }).collect(); // arrives in ix order so will match the arg order selected by create_join/union
    let mut downstream = compiler.dependency.find_all("upstream view", view_id).iter().map(|dependency| {
        compiler.schedule.find_one("view", &dependency["downstream view"])["ix"].as_usize()
    }).collect::<Vec<_>>();
    downstream.sort();
    downstream.dedup();
    Node{
        id: view_id.as_str().to_owned(),
        view: view,
        upstream: upstream,
        downstream: downstream,
    }
}

fn create_flow(compiler: &Compiler) -> Flow {
    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut outputs = Vec::new();
    for schedule in compiler.schedule.iter() {
        let view_table = compiler.flow.get_output("view");
        let view = view_table.find_one("view", &schedule["view"]);
        nodes.push(create_node(compiler, &view["view"], &view["kind"]));
        dirty.insert(schedule["ix"].as_usize());
        let fields = compiler.flow.get_output("field").find_all("view", &view["view"])
            .iter().map(|field| field["field"].as_str().to_owned()).collect();
        outputs.push(RefCell::new(Relation::with_fields(fields)));
    }
    Flow{
        nodes: nodes,
        dirty: dirty,
        outputs: outputs,
    }
}

fn reuse_state(compiler: Compiler, flow: &mut Flow, changes: &mut Changes) {
    let Flow{nodes, outputs, ..} = compiler.flow;
    for (node, output) in nodes.into_iter().zip(outputs.into_iter()) {
        let id = &node.id[..];
        if flow.get_ix(id) != None
           && output.borrow().fields == flow.get_output(id).fields {
            flow.set_output(id, output);
        } else {
            changes.push((id.to_owned(), output.borrow().as_remove()));
        }
    }
}

pub fn recompile(old_flow: Flow, changes: &mut Changes) -> Flow {
    let dependency = create_dependency(&old_flow);
    let schedule = create_schedule(&old_flow);
    let compiler = Compiler{
        flow: old_flow,
        dependency: dependency,
        schedule: schedule,
    };
    let mut new_flow = create_flow(&compiler);
    reuse_state(compiler, &mut new_flow, changes);
    new_flow
}

pub fn needs_recompile(changes: &[(Id, Change)]) -> bool {
    let schema = schema();
    changes.iter().any(|&(ref changed_id, _)|
        schema.iter().any(|&(ref compiler_id, _, _)|
            changed_id == compiler_id))
}