use std::collections::BitSet;
use std::cell::RefCell;
use std::fmt::Debug;

use value::{Value, Tuple};
use relation::{Relation, IndexSelect, ViewSelect, mapping, with_mapping};
use view::{View, Table, Union, Join, JoinSource, Constraint, ConstraintOp, Aggregate, Direction, Reducer};
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
    ("source schedule", vec!["view", "source"], vec!["ix"]),

    // the constraint schedule determines when constraints will be checked
    // `ix` is an integer. the constraint will be checked after the corresponding source is explored
    ("constraint schedule", vec!["constraint"], vec!["ix"]),

    // index layout determines the order in which fields are stored in the view index
    // `ix` is an integer, the index of the field
    ("index layout", vec!["view", "field"], vec!["ix"]),

    // sources and fields actually used by each view
    ("view reference", vec!["view", "source", "field"], vec![]),

    // view layout determines the order in which source/field pairs are stored while computing the view
    // `ix` is an integer, the index of the field
    ("view layout", vec!["view", "source", "field"], vec!["ix"]),
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
    *flow.get_output_mut(view) = Relation{view: view.to_owned(), fields: fields, names: names, index: index};
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

fn sort_by_ix(tuples: &mut Vec<Tuple>) {
    tuples.sort_by(|a,b| a["ix"].cmp(&b["ix"]));
}

fn sort_by_priority(tuples: &mut Vec<Tuple>) {
    tuples.sort_by(|a,b| b["priority"].cmp(&a["priority"]));
}

fn move_to_start<T, F>(vec: &mut Vec<T>, f: F) where F: FnMut(&T) -> bool {
    let ix = vec.iter().position(f);
    match ix {
        Some(ix) => {
            let t = vec.remove(ix);
            vec.insert(0, t);
        }
        None => ()
    }
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
            let upstreams = source_dependency_table.find_all("downstream source", &source["source"])
                .iter()
                .map(|dependency| dependency["upstream source"].clone())
                .filter(|upstream| upstream.as_str() != "constant")
                .collect();
            (source["source"].clone(), upstreams)
        }).collect();
        let mut sources_and_upstreams = topological_sort(sources_and_upstreams);

        // aggregates need to have outer/inner at the end
        move_to_start(&mut sources_and_upstreams, |&(ref source_id, _)|
            source_id.as_str() == "inner"
            );
        move_to_start(&mut sources_and_upstreams, |&(ref source_id, _)|
            source_id.as_str() == "outer"
            );

        for (ix, (source, _)) in sources_and_upstreams.into_iter().enumerate() {
            items.push(vec![view["view"].clone(), source, Value::Float(ix as f64)]);
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
    let field_table = flow.get_output("field");
    for constraint in constraint_table.iter() {
        let left = constraint_left_table.find_one("constraint", &constraint["constraint"]);
        let left_ix = source_schedule_table.find_maybe("source", &left["left source"])
            .map_or(-1, |left_schedule| left_schedule["ix"].as_i64());
        let left_is_output = (left["left source"].as_str() == "constant")
            || (field_table.find_one("field", &left["left field"])["kind"].as_str() == "output");

        let right = constraint_right_table.find_one("constraint", &constraint["constraint"]);
        let right_ix = source_schedule_table.find_maybe("source", &right["right source"])
            .map_or(-1, |right_schedule| right_schedule["ix"].as_i64());
        let right_is_output = (right["right source"].as_str() == "constant")
            || (field_table.find_one("field", &right["right field"])["kind"].as_str() == "output");

        // non-output fields can't be constrained directly - handled by arguments to primitives instead
        if left_is_output && right_is_output {
            let ix = ::std::cmp::max(left_ix, right_ix);
            assert!(ix != -1); // ie not comparing two constants
            items.push(vec![constraint["constraint"].clone(), Value::Float(ix as f64)]);
        }
    }
    overwrite_compiler_view(flow, "constraint schedule", items);
}

fn calculate_index_layout(flow: &Flow) {
    let mut items = Vec::new();
    let schema = schema().into_iter().map(|(view, mut unique_fields, mut other_fields)| {
        unique_fields.append(&mut other_fields);
        (view, unique_fields)
    }).collect::<Vec<_>>();
    let view_table = flow.get_output("view");
    let field_table = flow.get_output("field");
    for view in view_table.iter() {
        match schema.iter().find(|&&(view_id, _)| view_id == view["view"].as_str()) {
            Some(&(_, ref fields)) => {
                // force compiler fields to be stored in the order we wrote the fields
                for (ix, field) in fields.iter().enumerate() {
                    items.push(vec![
                        view["view"].clone(),
                        string!("{}: {}", view["view"].as_str(), field),
                        Value::Float(ix as f64),
                        ]);
                }
            }
            None => {
                // other fields we just order arbitrarily
                for (ix, field) in field_table.find_all("view", &view["view"]).iter().enumerate() {
                    items.push(vec![
                        view["view"].clone(),
                        field["field"].clone(),
                        Value::Float(ix as f64),
                        ]);
                }

            }
        }
    }
    overwrite_compiler_view(flow, "index layout", items);
}

fn calculate_view_reference(flow: &Flow) {
    let mut items = Vec::new();
    let view_table = flow.get_output("view");
    let constraint_table = flow.get_output("constraint");
    let constraint_left_table = flow.get_output("constraint left");
    let constraint_right_table = flow.get_output("constraint right");
    let limit_from_table = flow.get_output("aggregate limit from");
    let limit_to_table = flow.get_output("aggregate limit to");
    let select_table = flow.get_output("select");
    for view in view_table.iter() {
        for constraint in constraint_table.find_all("view", &view["view"]) {
            for constraint_left in constraint_left_table.find_all("constraint", &constraint["constraint"]) {
                items.push(vec![
                    view["view"].clone(),
                    constraint_left["left source"].clone(),
                    constraint_left["left field"].clone(),
                    ]);
            }
            for constraint_right in constraint_right_table.find_all("constraint", &constraint["constraint"]) {
                items.push(vec![
                    view["view"].clone(),
                    constraint_right["right source"].clone(),
                    constraint_right["right field"].clone(),
                    ]);
            }
        }
        for limit_from in limit_from_table.find_all("aggregate", &view["view"]) {
            items.push(vec![
                view["view"].clone(),
                limit_from["from source"].clone(),
                limit_from["from field"].clone(),
                ]);
        }
        for limit_to in limit_to_table.find_all("aggregate", &view["view"]) {
            items.push(vec![
                view["view"].clone(),
                limit_to["to source"].clone(),
                limit_to["to field"].clone(),
                ]);
        }
        for select in select_table.find_all("view", &view["view"]) {
            items.push(vec![
                view["view"].clone(),
                select["source"].clone(),
                select["source field"].clone(),
                ]);
        }
    }
    overwrite_compiler_view(flow, "view reference", items);
}

fn calculate_view_layout(flow: &Flow) {
    let mut items = Vec::new();
    let view_table = flow.get_output("view");
    let view_reference_table = flow.get_output("view reference");
    let source_table = flow.get_output("source");
    let source_schedule_table = flow.get_output("source schedule");
    let index_layout_table = flow.get_output("index layout");
    let grouping_table = flow.get_output("aggregate grouping");
    let sorting_table = flow.get_output("aggregate sorting");
    let field_table = flow.get_output("field");

    for view in view_table.iter() {
        let mut ix = 0;

        // constants go first
        for view_reference in view_reference_table.find_all("view", &view["view"]) {
            if view_reference["source"].as_str() == "constant" {
                items.push(vec![
                    view["view"].clone(),
                    string!("constant"),
                    view_reference["field"].clone(),
                    Value::Float(ix as f64),
                    ]);
                ix += 1;
            }
        }

        // then other sources go in source order
        let mut source_schedules = source_schedule_table.find_all("view", &view["view"]);
        sort_by_ix(&mut source_schedules);
        for source_schedule in source_schedules {
            let source = source_table.iter().find(|source|
                source["view"] == view["view"]
                && source["source"] == source_schedule["source"]).unwrap();
            let mut push_field = |field_id: &Value| {
                items.push(vec![
                    view["view"].clone(),
                    source["source"].clone(),
                    field_id.clone(),
                    Value::Float(ix as f64),
                    ]);
                ix += 1;
            };
            match source["source"].as_str() {
                "outer" => {
                    // only use the grouped fields
                    for grouping in grouping_table.find_all("aggregate", &view["view"]) {
                        push_field(&grouping["outer field"].clone());
                    }
                }
                "inner" => {
                    // use grouped fields first
                    let groupings = grouping_table.find_all("aggregate", &view["view"]);
                    for grouping in groupings.iter() {
                        push_field(&grouping["inner field"].clone());
                    }

                    // followed by sorting fields
                    let mut sortings = sorting_table.find_all("aggregate", &view["view"]);
                    sortings.retain(|sorting|
                        !groupings.iter().any(|grouping|
                            grouping["inner field"] == sorting["inner field"]));
                    sort_by_priority(&mut sortings);
                    for sorting in sortings.iter() {
                        push_field(&sorting["inner field"]);
                    }

                    // followed by all remaining fields
                    let mut fields = field_table.find_all("view", &source["source view"]);
                    fields.retain(|field|
                        !groupings.iter().any(|grouping|
                            grouping["inner field"] == field["field"]));
                    fields.retain(|field|
                        !sortings.iter().any(|sorting|
                            sorting["inner field"] == field["field"]));
                    fields.sort_by(|a,b| a["field"].cmp(&b["field"]));
                    for field in fields.iter() {
                        push_field(&field["field"]);
                    }
                }
                _ => {
                    // use all fields
                    let mut index_layouts = index_layout_table.find_all("view", &source["source view"]);
                    sort_by_ix(&mut index_layouts);
                    for index_layout in index_layouts.into_iter() {
                        let field = field_table.find_one("field", &index_layout["field"]);
                        if field["kind"].as_str() == "output" {
                            push_field(&index_layout["field"].clone());
                        }
                    }
                }
            }
        }
    }
    overwrite_compiler_view(flow, "view layout", items);
}

fn get_index_layout_ix(flow: &Flow, view_id: &Value, field_id: &Value) -> usize {
    flow.get_output("index layout").iter().find(|index_layout|
        index_layout["view"] == *view_id
        && index_layout["field"] == *field_id
        ).unwrap()["ix"].as_usize()
}

fn get_view_layout_ix(flow: &Flow, view_id: &Value, source_id: &Value, field_id: &Value) -> usize {
    flow.get_output("view layout").iter().find(|view_layout|
        view_layout["view"] == *view_id
        && view_layout["source"] == *source_id
        && view_layout["field"] == *field_id
        ).unwrap()["ix"].as_usize()
}

fn create_constants(flow: &Flow, view_id: &Value) -> Vec<Value> {
    let view_layout_table = flow.get_output("view layout");
    let constant_table = flow.get_output("constant");
    let mut view_layouts = view_layout_table.iter().filter(|view_layout|
        view_layout["view"] == *view_id
        && view_layout["source"].as_str() == "constant"
        ).collect::<Vec<_>>();
    sort_by_ix(&mut view_layouts);
    view_layouts.iter().map(|view_layout| {
        let constant = constant_table.find_one("constant", &view_layout["field"]);
        constant["value"].clone()
    }).collect::<Vec<_>>()
}

fn create_index_select(flow: &Flow, view_id: &Value, source_id: &Value, source_ix: usize) -> IndexSelect {
    let index_layout_table = flow.get_output("index layout");
    let source_table = flow.get_output("source");
    let select_table = flow.get_output("select");
    let selects = select_table.iter().filter(|select|
        (select["view"] == *view_id)
        && (select["source"] == *source_id)
        ).collect::<Vec<_>>();
    let mut index_layouts = index_layout_table.find_all("view", view_id);
    sort_by_ix(&mut index_layouts);
    let source_fields = index_layouts.iter().map(|index_layout| {
        let select = selects.iter().find(|select|
            select["view field"] == index_layout["field"]
            ).unwrap();
        &select["source field"]
    }).collect::<Vec<_>>();
    let source = source_table.iter().find(|source|
        source["view"] == *view_id
        && source["source"] == *source_id).unwrap();
    let mapping = source_fields.iter().map(|source_field_id| {
        get_index_layout_ix(flow, &source["source view"], source_field_id)
        }).collect();
    IndexSelect{source: source_ix, mapping: mapping}
}

fn create_view_select(flow: &Flow, view_id: &Value) -> ViewSelect {
    let index_layout_table = flow.get_output("index layout");
    let select_table = flow.get_output("select");
    let mut index_layouts = index_layout_table.find_all("view", view_id);
    sort_by_ix(&mut index_layouts);
    let mapping = index_layouts.iter().map(|index_layout| {
        let select = select_table.iter().find(|select|
            select["view"] == *view_id
            && select["view field"] == index_layout["field"]
            ).unwrap();
        get_view_layout_ix(flow, view_id, &select["source"], &select["source field"])
    }).collect();
    ViewSelect{mapping: mapping}
}

fn create_table(flow: &Flow, view_id: &Value) -> Table {
    let mut insert = None;
    let mut remove = None;
    for (ix, source) in flow.get_output("source").find_all("view", view_id).iter().enumerate() {
        let select = create_index_select(flow, view_id, &source["source"], ix);
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
        create_index_select(flow, view_id, &dependency["source"], ix)
    }).collect();
    Union{selects: selects}
}

fn create_constraint(flow: &Flow, view_id: &Value, constraint_id: &Value) -> Constraint {
    let left_table = flow.get_output("constraint left");
    let left = left_table.find_one("constraint", constraint_id);
    let left = get_view_layout_ix(flow, view_id, &left["left source"], &left["left field"]);
    let right_table = flow.get_output("constraint right");
    let right = right_table.find_one("constraint", constraint_id);
    let right = get_view_layout_ix(flow, view_id, &right["right source"], &right["right field"]);
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
    let source_dependency_table = flow.get_output("source dependency");
    let view_table = flow.get_output("view");
    let view_dependency_table = flow.get_output("view dependency");
    let constraint_table = flow.get_output("constraint");
    let constraint_schedule_table = flow.get_output("constraint schedule");
    let field_table = flow.get_output("field");

    let constants = create_constants(flow, view_id);

    let dependencies = view_dependency_table.find_all("downstream view", view_id);

    let mut ixes_and_sources = source_table.find_all("view", view_id).into_iter().map(|source| {
        let schedule = source_schedule_table.find_one("source", &source["source"]);
        (schedule["ix"].as_usize(), source)
        }).collect::<Vec<_>>();
    ixes_and_sources.sort();
    let sources = ixes_and_sources.into_iter().map(|(_, source)| source).collect::<Vec<_>>();

    let mut join_constraints = vec![vec![]; sources.len()];
    for constraint in constraint_table.find_all("view", view_id).iter() {
        match constraint_schedule_table.find_maybe("constraint", &constraint["constraint"]) {
            Some(constraint_schedule) => {
                let join_constraint = create_constraint(flow, view_id, &constraint["constraint"]);
                join_constraints[constraint_schedule["ix"].as_usize()].push(join_constraint);
            }
            None => () // not scheduled, must be a primitive argument instead
        }
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
                let dependencies = source_dependency_table.find_all("downstream source", &source["source"]);
                let arguments = input_fields.iter().map(|input_field| {
                    let dependency = dependencies.iter().find(|dependency| dependency["downstream field"] == *input_field).unwrap();
                    get_view_layout_ix(flow, view_id, &dependency["upstream source"], &dependency["upstream field"])
                    }).collect();
                JoinSource::Primitive{primitive: primitive, arguments: arguments}
            }
            _ => {
                let input_ix = dependencies.iter().position(|dependency|
                    dependency["source"] == source["source"]
                    ).unwrap(); // TODO really should use ix here but it's tricky in create_node
                JoinSource::Relation{input: input_ix}
            }
        }
    }).collect();

    let select = create_view_select(flow, view_id);

    Join{constants: constants, sources: join_sources, constraints: join_constraints, select: select}
}

fn create_aggregate(flow: &Flow, view_id: &Value) -> Aggregate {
    let view_table = flow.get_output("view");
    let source_table = flow.get_output("source");
    let source_dependency_table = flow.get_output("source dependency");
    let dependency_table = flow.get_output("view dependency");
    let select_table = flow.get_output("select");
    let view_layout_table = flow.get_output("view layout");
    let field_table = flow.get_output("field");
    let sorting_table = flow.get_output("aggregate sorting");

    let constants = create_constants(flow, view_id);

    let dependencies = dependency_table.find_all("downstream view", view_id);
    let outer_ix = dependencies.iter().position(|dependency| dependency["source"].as_str() == "outer").unwrap();
    let inner_ix = dependencies.iter().position(|dependency| dependency["source"].as_str() == "inner").unwrap();
    let outer_dependency = dependencies[outer_ix].clone();
    let inner_dependency = dependencies[inner_ix].clone();
    let mut view_layouts = view_layout_table.find_all("view", view_id);
    sort_by_ix(&mut view_layouts);
    let outer_mapping = view_layouts.iter().filter(|view_layout|
            view_layout["source"].as_str() == "outer"
        ).map(|view_layout|
            get_index_layout_ix(flow, &outer_dependency["upstream view"], &view_layout["field"])
        ).collect();
    let inner_mapping = view_layouts.iter().filter(|view_layout|
            view_layout["source"].as_str() == "inner"
        ).map(|view_layout|
            get_index_layout_ix(flow, &inner_dependency["upstream view"], &view_layout["field"])
        ).collect();
    let outer = IndexSelect{source: outer_ix, mapping: outer_mapping};
    let inner = IndexSelect{source: inner_ix, mapping: inner_mapping};
    let directions = view_layouts.iter().filter(|view_layout|
            view_layout["source"].as_str() == "inner"
        ).map(|view_layout|
            sorting_table.iter().find(|sorting|
                sorting["aggregate"] == *view_id
                && sorting["inner field"] == view_layout["field"]
            ).map_or(
                Direction::Ascending,
                |sorting| match sorting["direction"].as_str() {
                    "ascending" => Direction::Ascending,
                    "descending" => Direction::Descending,
                    _ => panic!("Unknown sort direction: {:?}", sorting),
                }
            )
        ).collect();
    let limit_from = flow.get_output("aggregate limit from").find_maybe("aggregate", view_id)
        .map(|limit_from| get_view_layout_ix(flow, view_id, &limit_from["from source"], &limit_from["from field"]));
    let limit_to = flow.get_output("aggregate limit to").find_maybe("aggregate", view_id)
        .map(|limit_to| get_view_layout_ix(flow, view_id, &limit_to["to source"], &limit_to["to field"]));
    let reducer_sources = source_table.find_all("view", view_id).into_iter().filter(|source|
        match source["source"].as_str() {
            "inner" | "outer" => false,
            _ => true,
        }).collect::<Vec<_>>();
    let reducers = reducer_sources.iter().map(|source| {
        let source_view = view_table.find_one("view", &source["source view"]);
        match source_view["kind"].as_str() {
            "primitive" => (),
            other => panic!("Aggregate {:?} has a non-primitive reducer {:?} of kind {:?}", view_id, source["source"], other),
        };
        let primitive = Primitive::from_str(source_view["view"].as_str());
        let fields = field_table.find_all("view", &source_view["view"]);
        let input_fields = fields.iter()
        .filter(|field| field["kind"].as_str() != "output")
        .map(|field| field["field"].clone())
        .collect::<Vec<_>>();
        let dependencies = source_dependency_table.find_all("downstream source", &source["source"]);
        let arguments = input_fields.iter().map(|input_field| {
            let dependency = dependencies.iter().find(|dependency| dependency["downstream field"] == *input_field).unwrap();
            get_view_layout_ix(flow, view_id, &dependency["upstream source"], &dependency["upstream field"])
        }).collect();
        Reducer{primitive: primitive, arguments: arguments}
    }).collect();
    let select = create_view_select(flow, view_id);
    let selects_inner = select_table.find_all("view", view_id).iter().any(|select|
        select["source"].as_str() == "inner"
        );
    Aggregate{constants: constants, outer: outer, inner: inner, directions: directions, limit_from: limit_from, limit_to: limit_to, reducers: reducers, selects_inner: selects_inner, select: select}
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
    let index_layout_table = flow.get_output("index layout");
    let view_schedule_table = flow.get_output("view schedule");
    let num_schedules = view_schedule_table.index.len();
    for ix in (0..num_schedules) {
        let schedule = view_schedule_table.find_one("ix", &Value::Float(ix as f64));
        let view_table = flow.get_output("view");
        let view = view_table.find_one("view", &schedule["view"]);
        let view_id = view["view"].as_str().to_owned();
        nodes.push(create_node(flow, &view["view"], &view["kind"]));
        dirty.insert(schedule["ix"].as_usize());
        let mut index_layouts = index_layout_table.find_all("view", &view["view"]);
        sort_by_ix(&mut index_layouts);
        let field_ids = index_layouts.iter().map(|index_layout|
            index_layout["field"].as_str().to_owned()
            ).collect();
        let field_names = index_layouts.iter().map(|index_layout|
            match flow.get_output("display name").find_maybe("id", &index_layout["field"]) {
                Some(display_name) => display_name["name"].as_str().to_owned(),
                None => "<unnamed>".to_owned(),
            }).collect();
        outputs.push(RefCell::new(Relation::new(view_id, field_ids, field_names)));
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
    calculate_index_layout(&old_flow);
    calculate_view_reference(&old_flow);
    calculate_view_layout(&old_flow);
    let mut new_flow = create_flow(&old_flow);
    reuse_state(old_flow, &mut new_flow);
    new_flow
}

pub fn bootstrap(mut flow: Flow) -> Flow {
    let schema = schema();
    for &(id, ref unique_fields, ref other_fields) in schema.iter() {
        flow.nodes.push(Node{
            id: format!("{}", id),
                view: View::Union(Union{selects: Vec::new()}), // dummy node, replaced by recompile
                upstream: Vec::new(),
                downstream: Vec::new(),
            });
        let names = unique_fields.iter().chain(other_fields.iter())
            .map(|&field| field.to_owned()).collect::<Vec<_>>();
        let fields = names.iter().map(|name| format!("{}: {}", id, name)).collect();
        flow.outputs.push(RefCell::new(Relation::new(id.to_owned(), fields, names)));
    }
    let mut view_values = Vec::new();
    let mut tag_values = Vec::new();
    let mut field_values = Vec::new();
    let mut display_name_values = Vec::new();
    for (id, unique_fields, other_fields) in schema.into_iter() {
        view_values.push(vec![string!("{}", id), string!("table")]);
        display_name_values.push(vec![string!("{}", id), string!("{}", id)]);
        tag_values.push(vec![string!("{}", id), string!("compiler")]);
        for field in unique_fields.into_iter().chain(other_fields.into_iter()) {
            field_values.push(vec![string!("{}: {}", id, field), string!("{}", id), string!("output")]);
            display_name_values.push(vec![string!("{}: {}", id, field), string!("{}", field)]);
        }
    }
    for (name, scalar_inputs, vector_inputs, outputs) in primitive::primitives().into_iter() {
        view_values.push(vec![string!("{}", name), string!("primitive")]);
        display_name_values.push(vec![string!("{}", name), string!("{}", name)]);
        for field in scalar_inputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("scalar input")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
        for field in vector_inputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("vector input")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
        for field in outputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("output")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
    }
    overwrite_compiler_view(&flow, "view", view_values);
    overwrite_compiler_view(&flow, "tag", tag_values);
    overwrite_compiler_view(&flow, "field", field_values);
    overwrite_compiler_view(&flow, "display name", display_name_values);
    recompile(flow) // bootstrap away our dummy nodes
}
