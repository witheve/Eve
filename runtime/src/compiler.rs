use std::collections::BitSet;
use std::cell::RefCell;

use value::{Value, Tuple};
use relation::{Relation, Change, SingleSelect, Reference, MultiSelect, mapping, with_mapping};
use view::{View, Table, Union, Join, Constraint, ConstraintOp, Aggregate};
use flow::{Node, Flow};

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
    // the grouping is determined by binding inner fields to outer fields (TODO or constants)
    ("aggregate grouping", vec!["aggregate", "inner field"], vec!["outer field"]),
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
    ("display order", vec!["id"], vec!["priority"]),

    // the compiler reflects its decisions into some builtin views
    // a dependency exists whenever the contents on one view depend directly on another
    // `ix` is an integer identifying the edge
    ("dependency", vec!["upstream view", "ix"], vec!["source", "downstream view"]),
    // the schedule determines what order views will be executed in
    // `ix` is an integer. views with lower ixes are executed first.
    ("schedule", vec!["view"], vec!["ix"]),
    ]
}

fn create_dependency(flow: &Flow) -> Relation {
    let mut dependency = Vec::new();
    for view in flow.get_output("view").iter() {
        let mut ix = 0.0;
        for source in flow.get_output("source").find_all("view", &view["view"]) {
            dependency.push(vec![
                source["source view"].clone(),
                Value::Float(ix),
                source["source"].clone(),
                view["view"].clone(),
                ]);
            ix += 1.0;
        }
    }
    Relation{
        fields: vec!["dependency: upstream view".to_owned(), "dependency: ix".to_owned(), "dependency: source".to_owned(), "dependency: downstream view".to_owned()],
        names: vec!["upstream view".to_owned(), "ix".to_owned(), "source".to_owned(), "downstream view".to_owned()],
        index: dependency.into_iter().collect(),
    }
}

fn create_schedule(flow: &Flow) -> Relation {
    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut schedule = Vec::new();
    let mut ix = 0.0;
    for view in flow.get_output("view").iter() {
        if view["kind"].as_str() != "primitive" {
            schedule.push(vec![Value::Float(ix), view["view"].clone()]);
            ix += 1.0;
        }
    }
    Relation{
        fields: vec!["schedule: ix".to_owned(), "schedule: view".to_owned()],
        names: vec!["ix".to_owned(), "view".to_owned()],
        index: schedule.into_iter().collect(),
    }
}

fn create_single_select(flow: &Flow, view_id: &Value, source_id: &Value, source_ix: usize) -> SingleSelect {
    let fields = flow.get_output("field").find_all("view", view_id).iter().map(|field| {
        let select_table = flow.get_output("select");
        let select = select_table.iter().find(|select|
            select["view"] == *view_id
            && select["view field"] == field["field"]
            && select["source"] == *source_id
            ).unwrap();
        select["source field"].as_str().to_owned()
    }).collect();
    SingleSelect{source: source_ix, fields: fields}
}

fn create_reference(flow: &Flow, sources: &[Tuple], source_id: &Value, field_id: &Value) -> Reference {
    if source_id.as_str() == "constant" {
        let value = flow.get_output("constant").find_one("constant", field_id)["value"].clone();
        Reference::Constant{value: value}
    } else {
        let source = sources.iter().position(|source| source["source"] == *source_id).unwrap();
        let field = field_id.as_str().to_owned();
        Reference::Variable{source: source, field: field}
    }
}

fn create_multi_select(flow: &Flow, sources: &[Tuple], view_id: &Value) -> MultiSelect {
    let references = flow.get_output("field").find_all("view", view_id).iter().map(|field| {
        let select_table = flow.get_output("select");
        let select = select_table.iter().find(|select|
            select["view"] == *view_id
            && select["view field"] == field["field"]
            ).unwrap();
        create_reference(flow, sources, &select["source"], &select["source field"])
    }).collect();
    MultiSelect{references: references}
}

fn create_table(flow: &Flow, view_id: &Value) -> Table {
    let mut insert = None;
    let mut remove = None;
    for (ix, source) in flow.get_output("source").find_all("view", view_id).iter().enumerate() {
        let select = create_single_select(flow, view_id, &source["source"], ix);
        match source["source"].as_str() {
            "insert" => insert = Some(select),
            "remove" => remove = Some(select),
            other => panic!("Unknown table source: {:?}", other),
        }
    }
    Table{insert: insert, remove: remove}
}

fn create_union(flow: &Flow, view_id: &Value) -> Union {
    let selects = flow.get_output("dependency").find_all("downstream view", view_id).iter().enumerate().map(|(ix, dependency)| {
        create_single_select(flow, view_id, &dependency["source"], ix)
    }).collect();
    Union{selects: selects}
}

fn create_constraint(flow: &Flow, sources: &[Tuple], constraint_id: &Value) -> Constraint {
    let left_table = flow.get_output("constraint left");
    let left = left_table.find_one("constraint", constraint_id);
    let left = create_reference(flow, sources, &left["left source"], &left["left field"]);
    let right_table = flow.get_output("constraint right");
    let right = right_table.find_one("constraint", constraint_id);
    let right = create_reference(flow, sources, &right["right source"], &right["right field"]);
    let op = match flow.get_output("constraint operation").find_one("constraint", constraint_id)["operation"].as_str() {
        "=" => ConstraintOp::EQ,
        "!=" => ConstraintOp::NEQ,
        "<" => ConstraintOp::LT,
        ">" => ConstraintOp::GT,
        "<=" => ConstraintOp::LTE,
        ">=" => ConstraintOp::GTE,
        other => panic!("Unknown constraint operation: {:?}", other),
    };
    Constraint{left: left, op: op, right: right}
}

fn create_join(flow: &Flow, view_id: &Value) -> Join {
    let dependency_table = flow.get_output("dependency");
    let sources = dependency_table.find_all("downstream view", view_id);
    let mut constraints = vec![vec![]; sources.len()];
    for constraint in flow.get_output("constraint").find_all("view", view_id).iter() {
        let constraint = create_constraint(flow, &sources[..], &constraint["constraint"]);
        let left_ix = match constraint.left {
            Reference::Variable{source, ..} => source,
            Reference::Constant{..} => 0,
        };
        let right_ix = match constraint.right {
            Reference::Variable{source, ..} => source,
            Reference::Constant{..} => 0,
        };
        let ix = ::std::cmp::max(left_ix, right_ix);
        constraints[ix].push(constraint);
    }
    let select = create_multi_select(flow, &sources[..], view_id);
    Join{constraints: constraints, select: select}
}

fn create_aggregate(flow: &Flow, view_id: &Value) -> Aggregate {
    let dependency_table = flow.get_output("dependency");
    let sources = dependency_table.find_all("downstream view", view_id);
    let outer_ix = sources.iter().position(|source| source["source"].as_str() == "outer").unwrap();
    let inner_ix = sources.iter().position(|source| source["source"].as_str() == "inner").unwrap();
    let outer_source = sources[outer_ix].clone();
    let inner_source = sources[inner_ix].clone();
    let grouping_table = flow.get_output("aggregate grouping");
    let groupings = grouping_table.find_all("aggregate", view_id);
    let field_table = flow.get_output("field");
    let fields = field_table.find_all("view", &inner_source["source view"]);
    let ungrouped = fields.iter().filter(|field|
            groupings.iter().find(|grouping| grouping["inner field"] == field["field"]).is_none()
        ).collect::<Vec<_>>();
    let sorting_table = flow.get_output("aggregate sorting");
    let mut sortable = ungrouped.iter().map(|field|
        match sorting_table.find_maybe("inner field", &field["field"]) {
            None => (Value::Float(0.0), &field["field"]),
            Some(sorting) => (sorting["priority"].clone(), &field["field"]),
        }).collect::<Vec<_>>();
    sortable.sort();
    let outer_fields =
        groupings.iter().map(|grouping| grouping["outer field"].as_str().to_owned())
        .collect();
    let inner_fields =
        groupings.iter().map(|grouping| grouping["inner field"].as_str().to_owned())
        .chain(sortable.iter().map(|&(_, ref field_id)| field_id.as_str().to_owned()))
        .collect();
    let inputs = &[outer_source];
    let outer = SingleSelect{source: outer_ix, fields: outer_fields};
    let inner = SingleSelect{source: inner_ix, fields: inner_fields};
    let limit_from = flow.get_output("aggregate limit from").find_maybe("aggregate", view_id)
        .map(|limit_from| create_reference(flow, inputs, &limit_from["source"], &limit_from["field"]));
    let limit_to = flow.get_output("aggregate limit to").find_maybe("aggregate", view_id)
        .map(|limit_to| create_reference(flow, inputs, &limit_to["source"], &limit_to["field"]));
    let select = create_multi_select(flow, &[inner_source], view_id);
    Aggregate{outer: outer, inner: inner, limit_from: limit_from, limit_to: limit_to, select: select}
}

fn create_node(flow: &Flow, view_id: &Value, view_kind: &Value) -> Node {
    let view = match view_kind.as_str() {
        "table" => View::Table(create_table(flow, view_id)),
        "union" => View::Union(create_union(flow, view_id)),
        "join" => View::Join(create_join(flow, view_id)),
        "aggregate" => View::Aggregate(create_aggregate(flow, view_id)),
        other => panic!("Unknown view kind: {}", other),
    };
    let upstream = flow.get_output("dependency").find_all("downstream view", view_id).iter().map(|dependency| {
        flow.get_output("schedule").find_one("view", &dependency["upstream view"])["ix"].as_usize()
    }).collect(); // arrives in ix order so will match the arg order selected by create_join/union
    let mut downstream = flow.get_output("dependency").find_all("upstream view", view_id).iter().map(|dependency| {
        flow.get_output("schedule").find_one("view", &dependency["downstream view"])["ix"].as_usize()
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

fn create_flow(flow: &Flow) -> Flow {
    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut outputs = Vec::new();
    for schedule in flow.get_output("schedule").iter() {
        let view_table = flow.get_output("view");
        let view = view_table.find_one("view", &schedule["view"]);
        nodes.push(create_node(flow, &view["view"], &view["kind"]));
        dirty.insert(schedule["ix"].as_usize());
        let field_table = flow.get_output("field");
        let fields = field_table.find_all("view", &view["view"]);
        let field_ids = fields.iter().map(|field|
            field["field"].as_str().to_owned()
            ).collect();
        let field_names = fields.iter().map(|field|
            match flow.get_output("display name").find_maybe("id", &field["field"]) {
                Some(display_name) => display_name["name"].as_str().to_owned(),
                None => "<unnamed>".to_owned(),
            }).collect();
        outputs.push(RefCell::new(Relation::with_fields(field_ids, field_names)));
    }
    Flow{
        nodes: nodes,
        dirty: dirty,
        outputs: outputs,
    }
}

fn reuse_state(old_flow: Flow, new_flow: &mut Flow) {
    let Flow{nodes, outputs, ..} = old_flow;
    for (old_node, old_output) in nodes.into_iter().zip(outputs.into_iter()) {
        if let Some(new_ix) = new_flow.get_ix(&old_node.id[..]) {
            let old_output = old_output.into_inner();
            let mut new_output = new_flow.outputs[new_ix].borrow_mut();
            if new_output.fields == old_output.fields {
                new_output.index = old_output.index;
            } else if let Some(mapping) = mapping(&old_output.fields[..], &new_output.fields[..]) {
                for values in old_output.index.into_iter() {
                    new_output.index.insert(with_mapping(values, &mapping[..]));
                }
            } else {
                println!("Warning, cannot migrate state for: {:?}", old_node.id);
            }
        }
    }
}

pub fn recompile(mut old_flow: Flow) -> Flow {
    println!("Compiling...");
    let dependency = create_dependency(&old_flow);
    let dependency_ix = old_flow.get_ix("dependency").unwrap();
    old_flow.outputs[dependency_ix] = RefCell::new(dependency);
    let schedule = create_schedule(&old_flow);
    let schedule_ix = old_flow.get_ix("schedule").unwrap();
    old_flow.outputs[schedule_ix] = RefCell::new(schedule);
    let mut new_flow = create_flow(&old_flow);
    reuse_state(old_flow, &mut new_flow);
    println!("Compiled!");
    new_flow
}

pub fn bootstrap(mut flow: Flow) -> Flow {
    let schema = schema();
    for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
        flow.nodes.push(Node{
            id: format!("{}", id),
                view: View::Union(Union{selects: Vec::new()}), // dummy node
                upstream: Vec::new(),
                downstream: Vec::new(),
            });
        let mut names = unique_fields.iter().chain(other_fields.iter())
            .map(|&field| field.to_owned()).collect::<Vec<_>>();
        names.sort(); // fields are implicitly sorted in the compiler - need to use the same ordering here
        let fields = names.iter().map(|name| format!("{}: {}", id.clone(), name)).collect();
        flow.outputs.push(RefCell::new(Relation::with_fields(fields, names)));
    }
    let mut view_values = Vec::new();
    let mut field_values = Vec::new();
    let mut select_values = Vec::new();
    let mut source_values = Vec::new();
    let mut display_name_values = Vec::new();
    for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
        view_values.push(vec![string!("{}", id), string!("table")]);
        view_values.push(vec![string!("insert: {}", id), string!("union")]);
        view_values.push(vec![string!("remove: {}", id), string!("union")]);
        for &field in unique_fields.iter().chain(other_fields.iter()) {
            field_values.push(vec![string!("{}: {}", id, field), string!("{}", id), string!("output")]);
            field_values.push(vec![string!("insert: {}: {}", id, field), string!("insert: {}", id), string!("output")]);
            field_values.push(vec![string!("remove: {}: {}", id, field), string!("remove: {}", id), string!("output")]);
            display_name_values.push(vec![string!("{}: {}", id, field), string!("{}", field)]);
            display_name_values.push(vec![string!("insert: {}: {}", id, field), string!("{}", field)]);
            display_name_values.push(vec![string!("remove: {}: {}", id, field), string!("{}", field)]);
            source_values.push(vec![string!("{}", id), string!("insert"), string!("insert: {}", id)]);
            source_values.push(vec![string!("{}", id), string!("remove"), string!("remove: {}", id)]);
            select_values.push(vec![string!("{}", id), string!("{}: {}", id, field), string!("insert"), string!("insert: {}: {}", id, field)]);
            select_values.push(vec![string!("{}", id), string!("{}: {}", id, field), string!("remove"), string!("remove: {}: {}", id, field)]);
        }
    }
    flow.get_output_mut("view").change(Change{
        fields: vec!["view: view".to_owned(), "view: kind".to_owned()],
        insert: view_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("field").change(Change{
        fields: vec!["field: field".to_owned(), "field: view".to_owned(), "field: kind".to_owned()],
        insert: field_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("source").change(Change{
        fields: vec!["source: view".to_owned(), "source: source".to_owned(), "source: source view".to_owned()],
        insert: source_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("select").change(Change{
        fields: vec!["select: view".to_owned(), "select: view field".to_owned(), "select: source".to_owned(), "select: source field".to_owned()],
        insert: select_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("display name").change(Change{
        fields: vec!["display name: id".to_owned(), "display name: name".to_owned()],
        insert: display_name_values,
        remove: Vec::new(),
    });
    recompile(flow) // bootstrap away our dummy nodes
}
