use std::collections::BitSet;
use std::cell::RefCell;
use std::fmt::Debug;

use value::{Value, Tuple};
use relation::{Relation, Change, SingleSelect, Reference, MultiSelect, mapping, with_mapping};
use view::{View, Table, Union, Join, JoinSource, Constraint, ConstraintOp, Aggregate};
use flow::{Node, Flow};
use primitive;
use primitive::Primitive;

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

    // constraints filter the results of joins and aggregates
    // the left and right fields are compared using the operation
    // `operation` is one of "=", "/=", "<", "<=", ">", ">="
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
    // the groups may be reduced by constraining against reducer sources
    // constants and grouped inner fields may both be used as ScalarInput arguments
    // ungrouped inner fields which are not bound to outer fields may be used as VectorInput arguments

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

    // tags are used to organise views
    ("tag", vec!["view"], vec!["tag"]),

    // the compiler reflects its decisions into some builtin views:

    // a view dependency exists whenever the contents of one view depend directly on another
    // `ix` is an integer identifying the edge
    ("view dependency", vec!["upstream view", "ix"], vec!["source", "downstream view"]),

    // the view schedule determines what order views will be executed in
    // `ix` is an integer. views with lower ixes are executed first.
    ("view schedule", vec!["view"], vec!["ix"]),

    // a source dependency exists whenever one source must be calculated before another
    // eg arguments to a primitive view
    ("source dependency", vec!["upstream source", "upstream field", "downstream source", "downstream field"], vec![]),

    // the source schedule determines in what order sources will be explored inside joins/aggregates
    // `ix` is an integer. views with lower ixes are explored first.
    ("source schedule", vec!["source"], vec!["ix"]),

    // the constraint schedule determines when constraints will be checked
    // `ix` is an integer. the constraint will be checked after the corresponding source is explored
    ("constraint schedule", vec!["constraint"], vec!["ix"]),
    ]
}

// TODO really need to define physical ordering of fields in each view
//      and stop relying on implicit ordering
//      and stop using fields at runtime

fn overwrite_compiler_view(flow: &Flow, view: &str, items: Vec<Vec<Value>>) {
    let (_, unique_fields, other_fields) = schema().into_iter().find(|&(ref v, _, _)| *v == view).unwrap();
    let fields = unique_fields.iter().chain(other_fields.iter())
        .map(|field| format!("{}: {}", view, field))
        .collect();
    let names = unique_fields.iter().chain(other_fields.iter())
        .map(|field| format!("{}", field))
        .collect();
    let index = items.into_iter().collect();
    *flow.get_output_mut(view) = Relation{fields: fields, names: names, index: index};
}

// TODO we don't really need source in here
fn calculate_view_dependency(flow: &Flow) {
    let mut items = Vec::new();
    let view_table = flow.get_output("view");
    for view in view_table.iter() {
        let mut ix = 0.0;
        for source in flow.get_output("source").find_all("view", &view["view"]) {
            let source_view = view_table.find_one("view", &source["source view"]);
            if source_view["kind"].as_str() != "primitive" {
                items.push(vec![
                    source["source view"].clone(),
                    Value::Float(ix),
                    source["source"].clone(),
                    view["view"].clone(),
                    ]);
                ix += 1.0;
            }
        }
    }
    overwrite_compiler_view(flow, "view dependency", items);
}

fn calculate_view_schedule(flow: &Flow) {
    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut items = Vec::new();
    let mut ix = 0.0;
    for view in flow.get_output("view").iter() {
        if view["kind"].as_str() != "primitive" {
            items.push(vec![view["view"].clone(), Value::Float(ix)]);
            ix += 1.0;
        }
    }
    overwrite_compiler_view(flow, "view schedule", items);
}

fn calculate_source_dependency(flow: &Flow) {
    let mut items = Vec::new();
    let source_table = flow.get_output("source");
    let field_table = flow.get_output("field");
    let constraint_left_table = flow.get_output("constraint left");
    let constraint_right_table = flow.get_output("constraint right");
    let constraint_operation_table = flow.get_output("constraint operation");
    let view_table = flow.get_output("view");
    for source in source_table.iter() {
        let source_view = view_table.find_one("view", &source["source view"]);
        if source_view["kind"].as_str() == "primitive" {
            for left in constraint_left_table.find_all("left source", &source["source"]) {
                let operation = constraint_operation_table.find_one("constraint", &left["constraint"]);
                let right = constraint_right_table.find_one("constraint", &left["constraint"]);
                let field = field_table.find_one("field", &left["left field"]);
                if operation["operation"].as_str() == "="
                && right["right source"] != left["left source"]
                && field["kind"].as_str() != "output" {
                    items.push(vec![
                        right["right source"].clone(), right["right field"].clone(),
                        left["left source"].clone(), left["left field"].clone()
                        ]);
                }
            }
            for right in constraint_right_table.find_all("right source", &source["source"]) {
                let operation = constraint_operation_table.find_one("constraint", &right["constraint"]);
                let left = constraint_left_table.find_one("constraint", &right["constraint"]);
                let field = field_table.find_one("field", &right["right field"]);
                if operation["operation"].as_str() == "="
                && left["left source"] != right["right source"]
                && field["kind"].as_str() != "output" {
                    items.push(vec![
                        left["left source"].clone(), left["left field"].clone(),
                        right["right source"].clone(), right["right field"].clone()
                        ]);
                }
            }
        }
    }
    overwrite_compiler_view(flow, "source dependency", items);
}

fn calculate_source_schedule(flow: &Flow) {
    let mut items = Vec::new();
    let view_table = flow.get_output("view");
    let source_table = flow.get_output("source");
    let source_dependency_table = flow.get_output("source dependency");
    for view in view_table.iter() {
        // TODO this is an overly strict scheduling
        //      we could allow schedules where each field has at least one binding upstream
        //      instead we require that all bindings are upstream
        // TODO need to handle "constant" source specially
        let sources_and_upstreams = source_table.find_all("view", &view["view"]).iter().map(|source| {
            let upstream = source_dependency_table.find_all("downstream source", &source["source"])
                .iter().map(|dependency| dependency["upstream source"].clone())
                .collect();
            (source["source"].clone(), upstream)
        }).collect();
        let sources_and_upstreams = topological_sort(sources_and_upstreams);
        for (ix, (source, _)) in sources_and_upstreams.into_iter().enumerate() {
            items.push(vec![source, Value::Float(ix as f64)]);
        }
    }
    overwrite_compiler_view(flow, "source schedule", items);
}

fn calculate_constraint_schedule(flow: &Flow) {
    let mut items = Vec::new();
    let constraint_table = flow.get_output("constraint");
    let constraint_left_table = flow.get_output("constraint left");
    let constraint_right_table = flow.get_output("constraint right");
    let source_schedule_table = flow.get_output("source schedule");
    for constraint in constraint_table.iter() {
        let left = constraint_left_table.find_one("constraint", &constraint["constraint"]);
        let right = constraint_right_table.find_one("constraint", &constraint["constraint"]);
        let left_schedule = source_schedule_table.find_one("source", &left["left source"]);
        let right_schedule = source_schedule_table.find_one("source", &right["right source"]);
        let left_ix = left_schedule["ix"].as_usize();
        let right_ix = right_schedule["ix"].as_usize();
        let ix = ::std::cmp::max(left_ix, right_ix);
        items.push(vec![constraint["constraint"].clone(), Value::Float(ix as f64)]);
    }
    overwrite_compiler_view(flow, "constraint schedule", items);
}

fn topological_sort<K: Eq + Debug>(mut input: Vec<(K, Vec<K>)>) -> Vec<(K, Vec<K>)> {
    let mut output = Vec::new();
    while input.len() > 0 {
        match input.iter().position(|&(_, ref parents)|
                parents.iter().all(|parent_key|
                    output.iter().find(|&&(ref output_key, _)| output_key == parent_key) != None
                    )
                ) {
            Some(ix) => output.push(input.swap_remove(ix)),
            None => panic!("Cannot topological sort - stuck at {:?} {:?}", input, output),
        }
    }
    output
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
    let selects = flow.get_output("view dependency").find_all("downstream view", view_id).iter().enumerate().map(|(ix, dependency)| {
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
    let source_table = flow.get_output("source");
    let source_schedule_table = flow.get_output("source schedule");
    let source_dependency_table = flow.get_output("source dependecy");
    let view_table = flow.get_output("view");
    let view_dependency_table = flow.get_output("view dependency");
    let constraint_table = flow.get_output("constraint");
    let constraint_schedule_table = flow.get_output("constraint schedule");
    let field_table = flow.get_output("field");

    let dependencies = view_dependency_table.find_all("downstream view", view_id);

    let mut ixes_and_sources = source_table.find_all("view", view_id).into_iter().map(|source| {
        let schedule = source_schedule_table.find_one("source", &source["source"]);
        (schedule["ix"].as_usize(), source)
        }).collect::<Vec<_>>();
    ixes_and_sources.sort();
    let sources = ixes_and_sources.into_iter().map(|(_, source)| source).collect::<Vec<_>>();

    let mut join_constraints = vec![vec![]; sources.len()];
    for constraint in constraint_table.find_all("view", view_id).iter() {
        let ix = constraint_schedule_table.find_one("constraint", &constraint["constraint"])["ix"].as_usize();
        join_constraints[ix].push(create_constraint(flow, &sources[..], &constraint["constraint"]));
    }

    let join_sources = sources.iter().map(|source| {
        let source_view = view_table.find_one("view", &source["source view"]);
        match source_view["kind"].as_str() {
            "primitive" => {
                let primitive = Primitive::from_str(source_view["view"].as_str());
                let fields = field_table.find_all("view", &source_view["view"]);
                let input_fields = fields.iter()
                    .filter(|field| field["kind"].as_str() != "output")
                    .map(|field| field["field"].clone())
                    .collect::<Vec<_>>();
                let output_fields = fields.iter()
                    .filter(|field| field["kind"].as_str() == "output")
                    .map(|field| field["field"].as_str().to_owned())
                    .collect::<Vec<_>>();
                let dependencies = source_dependency_table.find_all("downstream source", &source["source"]);
                let arguments = input_fields.iter().map(|input_field| {
                    let dependency = dependencies.iter().find(|dependency| dependency["downstream field"] == *input_field).unwrap();
                    create_reference(flow, &sources[..], &dependency["upstream source"], &dependency["upstream field"])
                    }).collect();
                JoinSource::Primitive{primitive: primitive, arguments: arguments, fields: output_fields}
            }
            _ => {
                let input_ix = dependencies.iter().find(|dependency|
                    dependency["source"] == source["source"]
                    ).unwrap()["ix"].as_usize();
                JoinSource::Relation{input: input_ix}
            }
        }
    }).collect();

    let select = create_multi_select(flow, &sources[..], view_id);

    Join{sources: join_sources, constraints: join_constraints, select: select}
}

fn create_aggregate(flow: &Flow, view_id: &Value) -> Aggregate {
    let dependency_table = flow.get_output("view dependency");
    let dependencies = dependency_table.find_all("downstream view", view_id);
    let outer_ix = dependencies.iter().position(|dependency| dependency["source"].as_str() == "outer").unwrap();
    let inner_ix = dependencies.iter().position(|dependency| dependency["source"].as_str() == "inner").unwrap();
    let outer_dependency = dependencies[outer_ix].clone();
    let inner_dependency = dependencies[inner_ix].clone();
    let grouping_table = flow.get_output("aggregate grouping");
    let groupings = grouping_table.find_all("aggregate", view_id);
    let field_table = flow.get_output("field");
    let fields = field_table.find_all("view", &inner_dependency["downstream view"]);
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
    let inputs = &[outer_dependency];
    let outer = SingleSelect{source: outer_ix, fields: outer_fields};
    let inner = SingleSelect{source: inner_ix, fields: inner_fields};
    let limit_from = flow.get_output("aggregate limit from").find_maybe("aggregate", view_id)
        .map(|limit_from| create_reference(flow, inputs, &limit_from["from source"], &limit_from["from field"]));
    let limit_to = flow.get_output("aggregate limit to").find_maybe("aggregate", view_id)
        .map(|limit_to| create_reference(flow, inputs, &limit_to["to source"], &limit_to["to field"]));
    let select = create_multi_select(flow, &[inner_dependency], view_id);
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
    let upstream = flow.get_output("view dependency").find_all("downstream view", view_id).iter().map(|dependency| {
        flow.get_output("view schedule").find_one("view", &dependency["upstream view"])["ix"].as_usize()
    }).collect(); // arrives in ix order so will match the arg order selected by create_join/union
    let mut downstream = flow.get_output("view dependency").find_all("upstream view", view_id).iter().map(|dependency| {
        flow.get_output("view schedule").find_one("view", &dependency["downstream view"])["ix"].as_usize()
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
    for schedule in flow.get_output("view schedule").iter() {
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

pub fn recompile(old_flow: Flow) -> Flow {
    calculate_view_dependency(&old_flow);
    calculate_view_schedule(&old_flow);
    calculate_source_dependency(&old_flow);
    calculate_source_schedule(&old_flow);
    calculate_constraint_schedule(&old_flow);
    let mut new_flow = create_flow(&old_flow);
    reuse_state(old_flow, &mut new_flow);
    new_flow
}

pub fn bootstrap(mut flow: Flow) -> Flow {
    let schema = schema();
    for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
        flow.nodes.push(Node{
            id: format!("{}", id),
                view: View::Union(Union{selects: Vec::new()}), // dummy node, replaced by recompile
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
    let mut tag_values = Vec::new();
    let mut field_values = Vec::new();
    let mut select_values = Vec::new();
    let mut source_values = Vec::new();
    let mut display_name_values = Vec::new();
    for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
        view_values.push(vec![string!("{}", id), string!("table")]);
        view_values.push(vec![string!("insert: {}", id), string!("union")]);
        view_values.push(vec![string!("remove: {}", id), string!("union")]);
        display_name_values.push(vec![string!("{}", id), string!("{}", id)]);
        display_name_values.push(vec![string!("insert: {}", id), string!("insert: {}", id)]);
        display_name_values.push(vec![string!("remove: {}", id), string!("remove: {}", id)]);
        tag_values.push(vec![string!("{}", id), string!("compiler")]);
        tag_values.push(vec![string!("insert: {}", id), string!("compiler")]);
        tag_values.push(vec![string!("remove: {}", id), string!("compiler")]);
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
    flow.get_output_mut("tag").change(Change{
        fields: vec!["tag: view".to_owned(), "tag: tag".to_owned()],
        insert: tag_values,
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
    primitive::install(&mut flow);
    recompile(flow) // bootstrap away our dummy nodes
}
