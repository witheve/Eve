use std::collections::BitSet;
use std::cell::{RefCell, Ref};
use std::fmt::Debug;
use std::convert::AsRef;

use value::{Value, Tuple};
use relation::{Relation, IndexSelect, ViewSelect, mapping, with_mapping};
use view::{View, Table, Union, Join, JoinSource, Input, Source, Join2, Constraint, ConstraintOp, Aggregate, Direction, Reducer};
use flow::{Node, Flow};
use primitive;
use primitive::Primitive;

// schemas are arranged as (table name, fields)
// any field whose type is not described is a UUID

pub fn code_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    // eve code is stored in tables

    vec![
    // all data lives in a view of some kind
    // `kind` is one of:
    // "table" - a view which can depend on the past
    // "join" - take the product of multiple views and filter the results
    // "union" - take the union of multiple views
    // "aggregate" - group one view by the contents of another and run reducing functions on the groups
    // "primitive" - a built-in function, represented as a view with one or more non-Data fields
    ("view", vec!["view", "kind"]),

    // views have fields
    // some fields have constraints on how they can be queried
    // `kind` is one of:
    // "output" - a normal field
    // "scalar input" - a field that must be constrained to a single scalar value
    // "vector input" - a field that must be constrained to a single vector value (in an aggregate)
    ("field", vec!["view", "field", "kind"]),

    // source ids have two purposes
    // a) uniquely generated ids to disambiguate multiple uses of the same view
    // (eg when joining a view with itself)
    // b) fixed ids to identify views which are used for some specific purpose
    // (these are "insert" and "remove" in tables and "inner" and "outer" in aggregates)
    ("source", vec!["view", "source", "source view"]),

    // every view also has an implicit "constant" source
    // anywhere source-field is expected, you can instead use "constant"-id
    // `value` may be any valid eve value
    ("constant", vec!["constant", "value"]),

    // constraints filter the results of joins and aggregates
    // the left and right fields are compared using the operation
    // `operation` is one of "=", "/=", "<", "<=", ">", ">="
    ("constraint", vec!["constraint", "view"]),
    ("constraint left", vec!["constraint", "left source", "left field"]),
    ("constraint right", vec!["constraint", "right source", "right field"]),
    ("constraint operation", vec!["constraint", "operation"]),

    // aggregates group an "inner" source by the rows of an "outer" source
    // the grouping is determined by binding inner fields to outer fields (TODO or constants)
    ("aggregate grouping", vec!["aggregate", "inner field", "outer field"]),
    // before aggregation the groups are sorted
    // `priority` is an f64. higher priority fields are compared first. ties are broken by field id
    // `direction` is one of "ascending" or "descending"
    // fields which have no entry default to 0, "ascending"
    ("aggregate sorting", vec!["aggregate", "inner field", "priority", "direction"]),
    // groups may optionally be limited by an inner field or constant
    ("aggregate limit from", vec!["aggregate", "from source", "from field"]),
    ("aggregate limit to", vec!["aggregate", "to source", "to field"]),
    // the groups may be reduced by constraining against reducer sources
    // constants and grouped inner fields may both be used as ScalarInput arguments
    // ungrouped inner fields which are not bound to outer fields may be used as VectorInput arguments

    // views produce output by binding fields from sources
    // each table or join field must be bound exactly once
    // each aggregate field must be bound exactly once and can only bind constants, inner fields or reducer outputs
    // each union field must be bound exactly once per source
    ("select", vec!["view", "view field", "source", "source field"]),

    // tags are used to organise views
    ("tag", vec!["view", "tag"]),
    ]
}

pub fn compiler_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    // the compiler reflects its decisions into some builtin tables
    // views marked "(pre)" are intermediate calculations

    vec![
    // a view dependency exists whenever the contents of one view depend directly on another
    // `ix` is an integer identifying the position in the downstream views input list
    // TODO can remove `source` once old compiler is totally gone
    ("view dependency (pre)", vec!["downstream view", "source", "upstream view"]),
    ("view dependency", vec!["downstream view", "ix", "source", "upstream view"]),

    // the view schedule determines what order views will be executed in
    // `ix` is an integer. views with lower ixes are executed first.
    ("view schedule (pre)", vec!["view", "kind"]),
    ("view schedule", vec!["ix", "view", "kind"]),

    // a source dependency exists whenever one source must be calculated before another
    // eg arguments to a primitive view
    ("source dependency", vec!["downstream source", "downstream field", "upstream source", "upstream field"]),

    // the source schedule determines in what order sources will be explored inside joins/aggregates
    // `ix` is an integer. views with lower ixes are explored first.
    ("source schedule", vec!["view", "source", "ix"]),

    // the constraint schedule determines when constraints will be checked
    // `ix` is an integer. the constraint will be checked after the corresponding source is explored
    ("constraint schedule", vec!["constraint", "ix"]),

    // index layout determines the order in which fields are stored in the view index
    // `ix` is an integer, the index of the field
    ("index layout", vec!["view", "field ix", "field", "name"]),

    // sources and fields actually used by each view
    ("view reference", vec!["view", "source", "field"]),

    // view layout determines the order in which source/field pairs are stored while computing the view
    // `ix` is an integer, the index of the field
    ("view layout", vec!["view", "source", "field", "ix"]),

    // temp state for transition to variables
    ("constraint*", vec!["view", "constraint", "left source", "left field", "operation", "right source", "right field"]),
    ("eq link", vec!["view", "left source", "left field", "right source", "right field"]),
    ("eq link step", vec!["view", "left source", "left field", "right source", "right field"]),
    ("eq group", vec!["view", "left source", "left field", "right source", "right field"]),
    ("variable", vec!["view", "variable"]),
    ("binding", vec!["variable", "source", "field"]),
    ("constant*", vec!["variable", "value"]),
    ("select*", vec!["view", "field", "variable"]),
    ("provides", vec!["view", "source", "variable"]),
    ("requires", vec!["view", "source", "variable"]),
    ("unscheduled source", vec!["view", "source"]),
    ("schedulable source", vec!["view", "source"]),
    ("unschedulable source", vec!["view", "source", "variable"]),
    ("source schedule* (pre)", vec!["view", "pass", "source"]),
    ("source schedule*", vec!["view", "ix", "pass", "source"]),
    ("variable schedule (pre)", vec!["view", "pass", "variable"]),
    ("variable schedule", vec!["view", "ix", "pass", "variable"]),
    ("compiler index layout", vec!["view", "ix", "field", "name"]),
    ("default index layout", vec!["view", "ix", "field", "kind"]),

    // layout for `create`
    // TODO these names are awful...
    ("output layout", vec!["view ix", "field ix", "field", "name"]),
    ("number of variables (pre)", vec!["view", "num"]),
    ("number of variables", vec!["view ix", "num"]),
    ("constant layout", vec!["view ix", "variable ix", "value"]),
    ("source layout", vec!["view ix", "source ix", "input"]),
    ]
}

pub fn editor_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    // the editor uses some tables to control the display of code and data

    vec![
    // things can have human readable names
    // `name` is a string
    ("display name", vec!["id", "name"]),

    // things can be displayed in ordered lists
    // `priority` is an f64. higher priority things are displayed first. ties are broken by id
    ("display order", vec!["id", "priority"]),

    // things which can be displayed in the sidebar
    // `type` is one of "table", "query", "ui"
    ("editor item", vec!["item", "type"]),

    // positions for nodes in the graphical editor
    ("editor node position", vec!["node", "x", "y"]),

    // TODO what are this?
    ("primitive", vec!["view", "kind"]),
    ("block", vec!["query", "block", "view"]),
    ("block aggregate", vec!["view", "kind"]),
    ("calculated field", vec!["calculated field", "view", "source", "source view", "field"]),
    ("empty view", vec![]),
    ("query export", vec!["query", "view"]),
    ("source order", vec!["view", "source", "priority"]),

    // TODO what are this?
    ("uiComponentElement", vec!["tx", "id", "component", "layer", "control", "left", "top", "right", "bottom", "zindex"]),
    ("uiComponentLayer", vec!["tx", "id", "component", "layer", "locked", "hidden", "parentLayer"]),
    ("uiComponentAttribute", vec!["tx", "id", "property", "value"]),
    ("uiStyle", vec!["tx", "id", "type", "element", "shared"]),
    ("uiGroupBinding", vec!["group", "view"]),
    ("uiAttrBinding", vec!["elementId", "attr", "field"]),
    ("uiKeyCapture", vec!["elementId", "key"]),
    ("uiMap", vec!["tx", "map", "element"]),
    ("uiMapAttr", vec!["tx", "map", "property", "value"])
    ]
}

pub fn client_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    // clients store their local state (ui events, session data etc)

    vec![
    // TODO what are this?
    ("click", vec!["event number", "button", "binding"]),
    ("client event", vec!["session", "eventId", "type", "element", "row"]),
    ("mouse position", vec!["session", "eventId", "x", "y"]),
    ("text input", vec!["session", "eventId", "element", "binding", "value"]),
    ("location", vec!["session", "latitude", "longitude", "accuracy", "timestamp"]),
    ("session url", vec!["session", "eventId", "href", "origin", "path", "hash"]),
    ("eveusers", vec!["id", "username"]),
    ("sessions", vec!["id", "status"]),
    ("session id to user id", vec!["session id", "user id"]),
    ("captured key", vec!["session", "eventId", "element", "key", "binding"]),
    ]
}

pub fn schema() -> Vec<(&'static str, Vec<&'static str>)> {
    code_schema().into_iter()
    .chain(compiler_schema().into_iter())
    .chain(editor_schema().into_iter())
    .chain(client_schema().into_iter())
    .collect()
    }

macro_rules! find_pattern {
    ( (= $name:expr) ) => {{ $name }};
    ( _ ) => {{ &Value::Null }};
    ( $name:ident ) => {{ &Value::Null }};
}

macro_rules! find_binding {
    ( (= $name:expr) ) => { _ };
    ( _ ) => { _ };
    ( $name:ident ) => { ref $name };
}

macro_rules! find {
    ($table:expr, [ $($pattern:tt),* ]) => {{
        $table.find(vec![$( find_pattern!( $pattern ) ),*])
    }};
    ($table:expr, [ $($pattern:tt),* ], $body:expr) => {{
        for row in find!($table, [ $($pattern),* ]).into_iter() {
            match row {
                [$( find_binding!($pattern) ),*] => $body,
                _ => panic!(),
            }
        }
    }};
}

macro_rules! dont_find {
    ($table:expr, [ $($pattern:tt),* ]) => {{
        $table.dont_find(vec![$( find_pattern!( $pattern ) ),*])
    }};
    ($table:expr, [ $($pattern:tt),* ], $body:expr) => {{
        if dont_find!($table, [ $($pattern),* ]) {
            $body
        }
    }};
}

macro_rules! insert {
    ($table:expr, [ $($value:expr),* ]) => {{
        $table.index.insert(vec![$( { let value: Value = $value.to_owned(); value } ),*])
    }}
}

macro_rules! remove {
    ($table:expr, [ $($pattern:tt),* ]) => {{
        for row in find!($table, [ $($pattern),* ]).into_iter() {
            $table.index.remove(row);
        }
    }}
}

fn check_fields<S: AsRef<str>>(table: &Relation, fields: Vec<S>) {
    for (ix, field) in fields.iter().enumerate() {
        assert_eq!(&table.names[ix][..], field.as_ref());
    }
}

fn group_by(input_table: &Relation, key_len: usize) -> Vec<Vec<Vec<Value>>> {
    let mut groups = Vec::new();
    match input_table.index.iter().next() {
        Some(row) => {
            let mut key = &row[..key_len];
            let mut group = Vec::new();
            for row in input_table.index.iter() {
                if &row[..key_len] != key {
                    key = &row[..key_len];
                    groups.push(group);
                    group = Vec::new();
                }
                group.push(row.clone());
            }
            groups.push(group);
        }
        None => ()
    }
    groups
}

fn ordinal_by(input_table: &Relation, output_table: &mut Relation, key_fields: &[&str]) {
    let key_len = key_fields.len();
    check_fields(input_table, key_fields.to_owned());
    check_fields(output_table, {
        let mut names = input_table.names.clone();
        names.insert(key_len, "ix".to_owned());
        names
    });
    for group in group_by(input_table, key_len).into_iter() {
        let mut ix = 0;
        for mut row in group.into_iter() {
            row.insert(key_len, Value::Float(ix as f64));
            output_table.index.insert(row);
            ix += 1;
        }
    }
}

fn min_by(input_table: &Relation, output_table: &mut Relation, key_fields: &[&str], val_fields: &[&str]) {
    check_fields(input_table, key_fields.iter().chain(val_fields.iter()).collect());
    check_fields(output_table, input_table.names.clone());
    let val_range = key_fields.len()..key_fields.len()+val_fields.len();
    for group in group_by(input_table, key_fields.len()).into_iter() {
        let min = group.iter().min_by(|row| &row[val_range.clone()]).unwrap();
        output_table.index.insert(min.clone());
    }
}

fn count_by(input_table: &Relation, output_table: &mut Relation, key_fields: &[&str]) {
    let key_len = key_fields.len();
    check_fields(input_table, key_fields.to_owned());
    check_fields(output_table, {
        let mut names = key_fields.to_owned();
        names.push(&"num");
        names
    });
    for group in group_by(input_table, key_fields.len()).into_iter() {
        let count = group.len();
        let mut row = group[0][0..key_len].to_owned();
        row.push(Value::Float(count as f64));
        output_table.index.insert(row);
    }
}

fn union(input_tables: &[&Relation], output_table: &mut Relation) {
    for input_table in input_tables.iter() {
        assert_eq!(input_table.names, output_table.names);
        for row in input_table.index.iter() {
            output_table.index.insert(row.clone());
        }
    }
}

fn plan(flow: &Flow) {
    use value::Value::*;

    let view_table = flow.get_output("view");
    let field_table = flow.get_output("field");
    let source_table = flow.get_output("source");
    let constant_table = flow.get_output("constant");
    let constraint_table = flow.get_output("constraint");
    let constraint_left_table = flow.get_output("constraint left");
    let constraint_right_table = flow.get_output("constraint right");
    let constraint_operation_table = flow.get_output("constraint operation");
    let aggregate_grouping_table = flow.get_output("aggregate grouping");
    let aggregate_sorting_table = flow.get_output("aggregate sorting");
    let aggregate_limit_from_table = flow.get_output("aggregate limit from");
    let aggregate_limit_to_table = flow.get_output("aggregate limit to");
    let select_table = flow.get_output("select");

    let mut constraint_ish_table = flow.overwrite_output("constraint*");
    find!(constraint_table, [constraint, view], {
        find!(constraint_operation_table, [(= constraint), operation], {
            find!(constraint_left_table, [(= constraint), left_source, left_field], {
                find!(constraint_right_table, [(= constraint), right_source, right_field], {
                    insert!(constraint_ish_table, [view, constraint, left_source, left_field, operation, right_source, right_field]);
                });
            });
        });
    });

    let mut view_dependency_pre_table = flow.overwrite_output("view dependency (pre)");
    find!(view_table, [view, _], {
        find!(source_table, [(= view), source, source_view], {
            find!(view_table, [(= source_view), source_kind], {
                if source_kind.as_str() != "primitive" {
                    insert!(view_dependency_pre_table, [view, source, source_view]);
                }
            })
        })
    });

    let mut view_dependency_table = flow.overwrite_output("view dependency");
    ordinal_by(&*view_dependency_pre_table, &mut *view_dependency_table, &["downstream view"]);

    // TODO actually schedule sensibly
    // TODO warn about cycles through aggregates
    let mut view_schedule_pre_table = flow.overwrite_output("view schedule (pre)");
    find!(view_table, [view, kind], {
        if kind.as_str() != "primitive" {
            insert!(view_schedule_pre_table, [view, kind]);
        }
    });

    let mut view_schedule_table = flow.overwrite_output("view schedule");
    ordinal_by(&*view_schedule_pre_table, &mut *view_schedule_table, &[]);

    let mut source_dependency_table = flow.overwrite_output("source dependency");
    find!(constraint_ish_table, [_, _, left_source, left_field, operation, right_source, right_field], {
        if operation.as_str() == "="
        && left_source != right_source {
            find!(field_table, [_, (= left_field), left_kind], {
                if left_kind.as_str() != "output" {
                    insert!(source_dependency_table,
                        [left_source, left_field, right_source, right_field]
                        );
                }
            });
            find!(field_table, [_, (= right_field), right_kind], {
                if right_kind.as_str() != "output" {
                    insert!(source_dependency_table,
                        [right_source, right_field, left_source, left_field]
                        );
                }
            });
        }
    });

    let mut eq_link_table = flow.overwrite_output("eq link");
    // every pair of source/field constrained by "=" are equal
    find!(constraint_ish_table, [view, _, left_source, left_field, operation, right_source, right_field], {
        if operation.as_str() == "="
        && left_source.as_str() != "constant"
        && right_source.as_str() != "constant" {
            insert!(eq_link_table, [view, left_source, left_field, right_source, right_field]);
            insert!(eq_link_table, [view, right_source, right_field, left_source, left_field]);
        }
    });
    // equality is transitive
    loop {
        let mut eq_link_step_table = flow.overwrite_output("eq link step");
        find!(eq_link_table, [view, left_source, left_field, mid_source, mid_field], {
            find!(eq_link_table, [(= view), (= mid_source), (= mid_field), right_source, right_field], {
                dont_find!(eq_link_table, [(= view), (= left_source), (= left_field), (= right_source), (= right_field)], {
                    insert!(eq_link_step_table, [view, left_source, left_field, right_source, right_field]);
                });
            });
        });
        if eq_link_step_table.index.len() > 0 {
            find!(eq_link_step_table, [view, left_source, left_field, right_source, right_field], {
                insert!(eq_link_table, [view, left_source, left_field, right_source, right_field]);
            });
        } else {
            break; // done
        }
    }
    // every source/field is equal to itself
    find!(view_table, [view, _], {
        find!(source_table, [(= view), source, source_view], {
            find!(field_table, [(= source_view), field, _], {
                insert!(eq_link_table, [view, source, field, source, field]);
            });
        });
    });

    let mut eq_group_table = flow.overwrite_output("eq group");
    min_by(&*eq_link_table, &mut *eq_group_table, &["view", "left source", "left field"], &["right source", "right field"]);

    let mut variable_table = flow.overwrite_output("variable");
    let mut binding_table = flow.overwrite_output("binding");
    find!(eq_group_table, [view, source, field, group_source, group_field], {
        let variable = &string!("{}->{}->{}", view.as_str(), group_source.as_str(), group_field.as_str());
        insert!(variable_table, [view, variable]);
        insert!(binding_table, [variable, source, field]);
    });

    let mut constant_ish_table = flow.overwrite_output("constant*");
    find!(constraint_ish_table, [view, _, left_source, left_field, operation, right_source, right_field], {
        match (operation.as_str(), left_source.as_str(), right_source.as_str()) {
            ("=", "constant", "constant") => panic!("Why would you do that..."),
            ("=", "constant", _) => {
                find!(constant_table, [(= left_field), value], {
                    find!(eq_group_table, [(= view), (= right_source), (= right_field), group_source, group_field], {
                        let variable = &string!("{}->{}->{}", view.as_str(), group_source.as_str(), group_field.as_str());
                        insert!(constant_ish_table, [variable, value]);
                    });
                });
            }
            ("=", _, "constant") => {
                find!(constant_table, [(= right_field), value], {
                    find!(eq_group_table, [(= view), (= left_source), (= left_field), group_source, group_field], {
                        let variable = &string!("{}->{}->{}", view.as_str(), group_source.as_str(), group_field.as_str());
                        insert!(constant_ish_table, [variable, value]);
                    });
                });
            }
            _ => (),
        }
    });

    let mut select_ish_table = flow.overwrite_output("select*");
    find!(select_table, [view, view_field, source, source_field], {
        find!(eq_group_table, [(= view), (= source), (= source_field), group_source, group_field], {
            let variable = &string!("{}->{}->{}", view.as_str(), group_source.as_str(), group_field.as_str());
            insert!(select_ish_table, [view, view_field, variable]);
        });
    });

    let mut provides_table = flow.overwrite_output("provides");
    let mut requires_table = flow.overwrite_output("requires");
    find!(variable_table, [view, variable], {
        find!(binding_table, [(= variable), source, field], {
            find!(field_table, [_, (= field), field_kind], {
                match field_kind.as_str() {
                    "output" => insert!(provides_table, [view, source, variable]),
                    _ => insert!(requires_table, [view, source, variable]),
                };
            });
        });
    });

    let mut source_schedule_ish_pre_table = flow.overwrite_output("source schedule* (pre)");
    let mut variable_schedule_pre_table = flow.overwrite_output("variable schedule (pre)");
    let mut pass = 0;
    {
        find!(constant_ish_table, [variable, _], {
            find!(variable_table, [view, (= variable)], {
                insert!(variable_schedule_pre_table, [view, Float(pass as f64), variable]);
            });
        });
        pass += 1;
    }
    loop {
        let mut unscheduled_source_table = flow.overwrite_output("unscheduled source");
        find!(source_table, [view, source, _], {
            dont_find!(source_schedule_ish_pre_table, [(= view), _, (= source)], {
                insert!(unscheduled_source_table, [view, source]);
            });
        });

        let mut unschedulable_source_table = flow.overwrite_output("unschedulable source");
        find!(unscheduled_source_table, [view, source], {
            find!(requires_table, [(= view), (= source), variable], {
                dont_find!(variable_schedule_pre_table, [(= view), _, (= variable)], {
                    insert!(unschedulable_source_table, [view, source, variable]);
                });
            });
        });

        let mut schedulable_source_table = flow.overwrite_output("schedulable source");
        find!(unscheduled_source_table, [view, source], {
            dont_find!(unschedulable_source_table, [(= view), (= source), _], {
                insert!(schedulable_source_table, [view, source]);
            })
        });

        find!(schedulable_source_table, [view, source], {
            insert!(source_schedule_ish_pre_table, [view, Float(pass as f64), source]);
        });

        find!(schedulable_source_table, [view, source], {
            find!(provides_table, [(= view), (= source), variable], {
                dont_find!(variable_schedule_pre_table, [(= view), _, (= variable)], {
                    insert!(variable_schedule_pre_table, [view, Float(pass as f64), variable]);
                });
            });
        });

        if schedulable_source_table.index.len() == 0 {
            if unscheduled_source_table.index.len() == 0 {
                break; // done
            } else {
                panic!("Cannot schedule {:?}", unschedulable_source_table.iter().collect::<Vec<_>>());
            }
        }

        pass += 1;
    }

    let mut source_schedule_ish_table = flow.overwrite_output("source schedule*");
    ordinal_by(&*source_schedule_ish_pre_table, &mut *source_schedule_ish_table, &["view"]);

    let mut variable_schedule_table = flow.overwrite_output("variable schedule");
    ordinal_by(&*variable_schedule_pre_table, &mut *variable_schedule_table, &["view"]);

    let mut compiler_index_layout_table = flow.overwrite_output("compiler index layout");
    for (view, names) in schema().into_iter() {
        for (ix, name) in names.into_iter().enumerate() {
            insert!(compiler_index_layout_table,
                [string!("{}", view), Float(ix as f64), string!("{}: {}", view, name), string!("{}", name)]);
        }
    }

    let mut default_index_layout_table = flow.overwrite_output("default index layout");
    ordinal_by(&*field_table, &mut *default_index_layout_table, &["view"]);

    let mut index_layout_table = flow.overwrite_output("index layout");
    find!(view_table, [view, _], {
        find!(compiler_index_layout_table, [(= view), field_ix, field, name], {
            insert!(index_layout_table, [view, field_ix, field, name]);
        });
        dont_find!(compiler_index_layout_table, [(= view), _, _, _], {
            find!(default_index_layout_table, [(= view), field_ix, field, _], {
                insert!(index_layout_table, [view, field_ix, field, string!("")]);
            });
        });
    });

    // rest is just denormalising for `create`

    let mut output_layout_table = flow.overwrite_output("output layout");
    find!(index_layout_table, [view, field_ix, field, name], {
        find!(view_schedule_table, [view_ix, (= view), _], {
            insert!(output_layout_table, [view_ix, field_ix, field, name]);
        });
    });

    let mut number_of_variables_pre_table = flow.overwrite_output("number of variables (pre)");
    count_by(&*variable_schedule_table, &mut *number_of_variables_pre_table, &["view"]);

    let mut number_of_variables_table = flow.overwrite_output("number of variables");
    find!(number_of_variables_pre_table, [view, num], {
        find!(view_schedule_table, [view_ix, (= view), _], {
            insert!(number_of_variables_table, [view_ix, num]);
        });
    });

    let mut constant_layout_table = flow.overwrite_output("constant layout");
    find!(constant_ish_table, [variable, value], {
        find!(variable_table, [view, (= variable)], {
            find!(view_schedule_table, [view_ix, (= view), _], {
                find!(variable_schedule_table, [(= view), variable_ix, _, (= variable)], {
                    insert!(constant_layout_table, [view_ix, variable_ix, value]);
                });
            });
        });
    });

    let mut source_layout_table = flow.overwrite_output("source layout");
    find!(view_schedule_table, [view_ix, view, _], {
        find!(source_schedule_ish_table, [(= view), source_ix, _, source], {
            find!(source_table, [(= view), (= source), source_view], {
                find!(view_table, [(= source_view), kind], {
                    if kind.as_str() == "primitive" {
                        insert!(source_layout_table, [view_ix, source_ix, source_view]);
                    } else {
                        find!(view_schedule_table, [source_view_ix, (= source_view), _], {
                            insert!(source_layout_table, [view_ix, source_ix, source_view_ix]);
                        });
                    }
                });
            });
        });
    });
}

fn push_at<T>(items: &mut Vec<T>, ix: &Value, item: T) {
    assert_eq!(items.len(), ix.as_usize());
    items.push(item);
}

fn create(flow: &Flow) {
    use value::Value::*;

    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut outputs = Vec::new();

    find!(flow.get_output("view schedule"), [view_ix, view, kind], {
        nodes.push(Node{
            id: view.as_str().to_owned(),
            view: match kind.as_str() {
                "join" => View::Join2(Join2{
                    constants: vec![],
                    sources: vec![],
                    select: vec![],
                }),
                _ => {
                    println!("Unimplemented: create for {:?} {:?} {:?}", view_ix, view, kind);
                    View::Table(Table{insert:None, remove:None}) // dummy node
                }
            },
            upstream: vec![],
            downstream: vec![],
        });
        dirty.insert(view_ix.as_usize());
        outputs.push(RefCell::new(Relation::new(
            view.as_str().to_owned(),
            vec![],
            vec![],
            )));
    });

    find!(flow.get_output("output layout"), [view_ix, field_ix, field, name], {
        let mut output = outputs[view_ix.as_usize()].borrow_mut();
        push_at(&mut output.fields, field_ix, field.as_str().to_owned());
        push_at(&mut output.names, field_ix, name.as_str().to_owned());
    });

    find!(flow.get_output("number of variables"), [view_ix, num], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join2(ref mut join) => join.constants = vec![Value::Null; num.as_usize()],
            other => println!("Unimplemented: variables for {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("constant layout"), [view_ix, variable_ix, value], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join2(ref mut join) => join.constants[variable_ix.as_usize()] = value.clone(),
            other => println!("Unimplemented: variables for {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("source layout"), [view_ix, source_ix, input], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join2(ref mut join) => {
                let source = Source{
                    input: match input {
                        &String(ref primitive) => Input::Primitive(Primitive::from_str(primitive)),
                        &Float(view_ix) => Input::View(view_ix as usize),
                        other => panic!("Unknown input type: {:?}", other),
                    },
                    bindings: vec![],
                };
                push_at(&mut join.sources, source_ix, source);
            }
            other => println!("Unimplemented: sources for {:?} {:?}", view_ix, other),
        }
    })

    // TODO
    // fill in downstream
    // fill in bindings in sources
    // fill in select in join
}

// TODO really need to define physical ordering of fields in each view
//      and stop relying on implicit ordering
//      and stop using fields at runtime

fn overwrite_compiler_view<'a>(flow: &'a Flow, view: &str, items: Vec<Vec<Value>>) -> Ref<'a, Relation> {
    let (_, names) = compiler_schema().into_iter().find(|&(ref v, _)| *v == view).unwrap();
    let fields = names.iter().map(|name| format!("{}: {}", view, name)).collect();
    let names = names.iter().map(|name| format!("{}", name)).collect();
    let index = items.into_iter().collect();
    *flow.get_output_mut(view) = Relation{view: view.to_owned(), fields: fields, names: names, index: index};
    flow.get_output(view)
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

fn sort_by(tuples: &mut Vec<Tuple>, field: &str) {
    tuples.sort_by(|a,b| a[field].cmp(&b[field]));
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
        sort_by(&mut source_schedules, "ix");
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
                    sort_by(&mut index_layouts, "field ix");
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
        ).unwrap()["field ix"].as_usize()
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
    sort_by(&mut view_layouts, "ix");
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
    sort_by(&mut index_layouts, "field ix");
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
    sort_by(&mut index_layouts, "field ix");
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
    sort_by(&mut view_layouts, "ix");
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
        "primitive" => panic!("Should not be creating nodes for primitives!"),
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
        sort_by(&mut index_layouts, "field ix");
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
        needs_recompile: false,
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
    plan(&old_flow);
    calculate_source_schedule(&old_flow);
    calculate_constraint_schedule(&old_flow);
    calculate_view_reference(&old_flow);
    calculate_view_layout(&old_flow);
    drop(create(&old_flow)); // just running this to catch errors for now
    let mut new_flow = create_flow(&old_flow);
    reuse_state(old_flow, &mut new_flow);
    new_flow
}

// TODO separate remote for internals
pub fn bootstrap(mut flow: Flow) -> Flow {
    let schema = schema();
    for &(view, ref names) in schema.iter() {
        flow.nodes.push(Node{
            id: format!("{}", view),
                view: View::Table(Table{insert: None, remove: None}), // dummy node, replaced by recompile
                upstream: Vec::new(),
                downstream: Vec::new(),
            });
        let fields = names.iter().map(|name| format!("{}: {}", view, name)).collect();
        let names = names.iter().map(|name| format!("{}", name)).collect();
        flow.outputs.push(RefCell::new(Relation::new(format!("{}", view), fields, names)));
    }
    {
        let mut view_table = flow.overwrite_output("view");
        let mut field_table = flow.overwrite_output("field");
        let mut tag_table = flow.overwrite_output("tag");
        let mut display_name_table = flow.overwrite_output("display name");
        let mut display_order_table = flow.overwrite_output("display order");
        let mut editor_item_table = flow.overwrite_output("editor item");

        for (view, _) in code_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("editor")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
            // TODO "code" and "remote" don't seem to be used anymore
            tag_table.index.insert(vec![string!("{}", view), string!("code")]);
            tag_table.index.insert(vec![string!("{}", view), string!("remote")]);
        }

        for (view, _) in compiler_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
            // TODO "compiler" and "remote" =don't seem to be used anymore
            tag_table.index.insert(vec![string!("{}", view), string!("compiler")]);
            tag_table.index.insert(vec![string!("{}", view), string!("remote")]);
        }

        for (view, _) in editor_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("editor")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, _) in client_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("client")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, names) in schema.into_iter() {
            view_table.index.insert(vec![string!("{}", view), string!("table")]);
            display_name_table.index.insert(vec![string!("{}", view), string!("{}", view)]);
            editor_item_table.index.insert(vec![string!("{}", view), string!("table")]);

            let mut ix = 0;
            for name in names.into_iter() {
                field_table.index.insert(vec![string!("{}", view), string!("{}: {}", view, name), string!("output")]);
                display_name_table.index.insert(vec![string!("{}: {}", view, name), string!("{}", name)]);
                display_order_table.index.insert(vec![string!("{}: {}", view, name), Value::Float(ix as f64)]);
                ix -= 1;
            }
        }

        for (primitive, scalar_inputs, vector_inputs, outputs) in primitive::primitives().into_iter() {
            view_table.index.insert(vec![string!("{}", primitive), string!("primitive")]);
            display_name_table.index.insert(vec![string!("{}", primitive), string!("{}", primitive)]);
            for name in scalar_inputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("scalar input")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
            }
            for name in vector_inputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("vector input")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
            }
            for name in outputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("output")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
            }
        }
    }
    {
        let mut constant_table = flow.overwrite_output("constant");
        constant_table.index.insert(vec![string!("default empty"), string!("")]);
        constant_table.index.insert(vec![string!("default zero"), Value::Float(0.0)]);
        constant_table.index.insert(vec![string!("default space"), string!(" ")]);
        constant_table.index.insert(vec![string!("default zero string"), string!("0")]);

        let mut empty_view_table = flow.overwrite_output("empty view");
        empty_view_table.index.insert(vec![]);
    }
    recompile(flow) // bootstrap away our dummy nodes
}