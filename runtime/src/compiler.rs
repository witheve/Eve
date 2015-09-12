use std::cell::RefCell;
use std::convert::AsRef;
use std::mem::replace;

use bit_set::BitSet;

use value::Value;
use relation::{Relation, mapping, with_mapping};
use view::{View, Join, Input, Source, Direction, Member, Union};
use flow::{Node, Flow};
use primitive;
use primitive::Primitive;

// The compiler is responsible for creating a new Flow whenever the program changes.
// Eve code is stored in tables, like all other state.
// The compiler has to turn this relational AST into a Flow.

// --- schemas ---

// Schemas are written as (table name, field names).
// Any field whose type is not described is an id.

pub fn code_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
    // all data lives in a view of some kind
    // `kind` is one of:
    // "table" - a view which can depend on the past
    // "join" - take the product of multiple views and filter the results
    // "union" - take the union of multiple views
    // "primitive" - a built-in function, represented as a view with one or more non-Data fields
    ("view", vec!["view", "kind"]),

    // views have fields
    // some fields have constraints on how they can be queried
    // `kind` is one of:
    // "output" - a normal field
    // "scalar input" - a field that must be constrained to a single scalar value
    // "vector input" - a field that must be constrained to a single vector value (in an aggregate)
    ("field", vec!["view", "field", "kind"]),

    // sources are unique ids used to disambiguate multiple uses of the same view within a join
    ("source", vec!["view", "source", "source view"]),

    // every view has a set of variables which are used to express constraints on the result of the view
    ("variable", vec!["view", "variable"]),

    // variables can be bound to fields
    ("binding", vec!["variable", "source", "field"]),
    ("constant binding", vec!["variable", "value"]),

    // joins produce output by binding fields from sources
    // each field must be bound exactly once
    ("select", vec!["field", "variable"]),

    // sources can be grouped by a subset of their fields
    // TODO primitive sources can't be grouped currently
    ("grouped field", vec!["source", "field"]),

    // each group is then sorted by the reamining fields
    // `ix` is an ascending integer indicating the position of the field in the sort order
    // `direction` is one of "ascending" or "descending"
    ("sorted field", vec!["source", "ix", "field", "direction"]),

    // the ordinal is a virtual field that tracks the position of each row in the group
    // eg the first row has ordinal '1', the second row has ordinal '2' etc
    ("ordinal binding", vec!["variable", "source"]),

    // if a source is chunked, it will return each group as a whole rather than breaking them back down into rows
    ("chunked source", vec!["source"]),

    // if a source is negated, the join fails whenever the source returns rows
    // every bound field of a negated source is treated as an input field
    ("negated source", vec!["source"]),

    // unions are constructed data from zero or more member views in order
    ("member", vec!["view", "ix", "member", "member view"]),

    // member fields are mapped to union fields
    ("mapping", vec!["view field", "member", "member field"]),

    // if a member is negated, it's rows are removed from the union instead of inserted
    ("negated member", vec!["member"]),

    // tags are used to organise all kinds of things
    ("tag", vec!["view", "tag"]),
    ]
}

pub fn compiler_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    // the compiler reflects its decisions into some builtin tables
    // views marked "(pre)" are intermediate calculations

    vec![
    // warnings are generated for any schema violations in the input tables
    ("warning", vec!["view", "row", "warning"]),
    ("disabled view", vec!["view", "warning view", "warning row", "warning"]),
    ("enabled view", vec!["view ix", "view", "kind"]),

    // a view dependency exists whenever the contents of one view depend directly on another
    ("view dependency (pre)", vec!["downstream view", "source", "upstream view"]),
    ("view dependency", vec!["downstream view", "ix", "source", "upstream view"]),

    // the view schedule determines what order views will be calculated in
    ("view schedule (pre)", vec!["view", "kind"]),
    ("view schedule", vec!["ix", "view", "kind"]),

    // a source 'provides' a variable if it can reduce the variable to a finite number of values
    // a source 'requires' a variable if it needs the variable reduced to a finite number of values before it can contribute
    ("provides", vec!["view", "source", "variable"]),
    ("requires", vec!["view", "source", "variable"]),

    // the source schedule determines in which order the sources will be explored
    // the variable schedule determines whether a given variable is being assigned from a given source or constrained against it
    ("unscheduled source", vec!["view", "source"]),
    ("schedulable source", vec!["view", "source"]),
    ("unschedulable source", vec!["view", "source", "variable"]),
    ("source schedule (pre)", vec!["view", "pass", "source"]),
    ("source schedule", vec!["view", "ix", "pass", "source"]),
    ("variable schedule (pre)", vec!["view", "pass", "variable"]),
    ("variable schedule", vec!["view", "ix", "pass", "variable"]),

    // when a variable is bound to multiple fields from the same source we must arbitrarily decide to make
    // one an assignment and the others constraints
    ("constrained binding", vec!["variable", "source", "field"]),
    ("constrained ordinal binding", vec!["variable", "source"]),

    // index layout determines the order in which fields are stored in the view index
    ("compiler index layout", vec!["view", "ix", "field", "name"]),
    ("default index layout", vec!["view", "ix", "field", "kind"]),
    ("index layout", vec!["view", "field ix", "field", "name"]),

    // we need to know the number of fields per view to calculate the index of the ordinal
    ("number of fields", vec!["view", "num"]),

    // when a source has fields that are neither grouped nor sorted, we treat them as being sorted in id order
    ("non-sorted field (pre)", vec!["view", "source", "field"]),
    ("non-sorted field", vec!["view", "source", "ix", "field"]),

    // we denormalise all the above views so that the `create` function only needs to make a single pass over each table
    ("view layout", vec!["view ix", "view", "kind"]),
    ("output layout", vec!["view ix", "field ix", "field", "name"]),
    ("number of variables (pre)", vec!["view", "num"]),
    ("number of variables", vec!["view ix", "num"]),
    ("constant layout", vec!["view ix", "variable ix", "value"]),
    ("source layout", vec!["view ix", "source ix", "source", "input", "chunked", "negated"]),
    ("downstream layout", vec!["downstream view ix", "ix", "upstream view ix"]),
    ("binding layout", vec!["view ix", "source ix", "field ix", "variable ix", "kind"]),
    ("select layout", vec!["view ix", "ix", "variable ix"]),
    ("grouped field layout", vec!["view ix", "source ix", "field ix"]),
    ("sorted field layout", vec!["view ix", "source ix", "ix", "field ix", "direction"]),
    ("non-sorted field layout", vec!["view ix", "source ix", "ix", "field ix"]),
    ("member layout", vec!["view ix", "member ix", "input ix", "negated"]),
    ("mapping layout", vec!["view ix", "member ix", "view field ix", "member field ix"]),
    ]
}

pub fn server_schema() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
    // certain primitive views can generate errors when they fail at runtime
    ("error", vec!["source", "error"]),
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

    // the full text of a madlib
    ("madlib", vec!["view", "madlib"]),
    // the non-field portions of a madlib
    ("madlib descriptor", vec!["view", "ix", "content"]),
    // position of source madlibs within a query
    ("source madlib index", vec!["source", "ix"]),
    // facts added to a cell
    ("cell fact row", vec!["cell", "source view", "row", "ix"]),

    // cells in a notebook
    // `kind` is one of "query", "add", "remove"
    ("notebook cell", vec!["cell", "kind"]),
    // order of cells in a notebook
    ("related notebook cell", vec!["cell", "cell2"]),
    ("related notebook cell order", vec!["cell", "cell2", "ix"]),
    // "query", "add", and "remove" cells all have views associated to them
    ("notebook cell view", vec!["cell", "view"]),
    // "query", "add", and "remove" cells all have views associated to them
    ("notebook cell uiElement", vec!["cell", "element"]),

    // descriptions for views in the editor
    ("view description", vec!["view", "description"]),

    // dynamic ui elements
    ("uiElement", vec!["element", "tag", "parent"]),
    ("uiAttribute", vec!["element", "property", "value"]),
    ("uiElementBinding", vec!["element", "view"]),
    ("uiAttributeBinding", vec!["element", "property", "field"]),

    // TODO what are this?
    ("primitive", vec!["view", "kind"]),

    // TODO what are this?
    ("uiKeyCapture", vec!["elementId", "key"]),
    ("uiMap", vec!["tx", "map", "element"]),
    ("uiMapAttr", vec!["tx", "map", "property", "value"]),
    ("uiMapMarker", vec!["id", "map", "lat", "lng"]),
    ("geocoding request", vec!["formatted address"]),
    ("geocoding response status", vec!["formatted address","status"]),
    ("geocoding response data", vec!["formatted address","lat","lng"]),
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
    ("location", vec!["session", "latitude", "longitude", "accuracy", "timestamp", "city"]),
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
    .chain(server_schema().into_iter())
    .chain(editor_schema().into_iter())
    .chain(client_schema().into_iter())
    .collect()
    }

// --- macros ---

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
    ($table:expr, [ $($pattern:tt),* ], $if_expr:expr) => {{
        find!($table, [ $($pattern),* ], $if_expr, ());
    }};
    ($table:expr, [ $($pattern:tt),* ], $if_expr:expr, $else_expr:expr) => {{
        let table = &$table;
        let rows = find!(table, [ $($pattern),* ]);
        if rows.len() > 0 {
            for row in rows.into_iter() {
                match row {
                    [$( find_binding!($pattern) ),*] => $if_expr,
                    other => panic!("Did not expect {:?} in find!", other),
                }
            }
        } else {
            $else_expr
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

// --- util ---

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

fn check_unique_key(warning_table: &mut Relation, relation: &Relation, key_fields: &[&str]) {
    let key_mapping = key_fields.iter().map(|field|
        relation.names.iter().position(|name| name == field).unwrap()
        ).collect::<Vec<_>>();
    for row in relation.index.iter() {
        for other_row in relation.index.iter() {
            if row != other_row && key_mapping.iter().all(|&ix| row[ix] == other_row[ix]) {
                warning_table.index.insert(vec![
                    Value::String(relation.view.to_owned()),
                    Value::Column(row.clone()),
                    string!("Duplicate rows {:?} and {:?} for unique key {:?}{:?}",
                        &relation.view, key_fields,
                        &row, &other_row
                        ),
                    ]);
            }
        }
    }
}

fn check_foreign_key(warning_table: &mut Relation, relation: &Relation, key_fields: &[&str], foreign_relation: &Relation, foreign_key_fields: &[&str]) {
    let key_mapping = key_fields.iter().map(|field|
        relation.names.iter().position(|name| name == field).unwrap()
        ).collect::<Vec<_>>();
    let foreign_key_mapping = foreign_key_fields.iter().map(|field|
        foreign_relation.names.iter().position(|name| name == field).unwrap()
        ).collect::<Vec<_>>();
    let mapping = key_mapping.into_iter().zip(foreign_key_mapping.into_iter()).collect::<Vec<_>>();
    'next_row: for row in relation.index.iter() {
        for foreign_row in foreign_relation.index.iter() {
            if mapping.iter().all(|&(ix, foreign_ix)| row[ix] == foreign_row[foreign_ix]) {
               continue 'next_row;
            }
        }
        warning_table.index.insert(vec![
            Value::String(relation.view.to_owned()),
            Value::Column(row.clone()),
            string!("Foreign key {:?}{:?}={:?} has no matching entry in {:?}{:?}",
                &relation.view, key_fields, mapping.iter().map(|&(ix, _)| &row[ix]).collect::<Vec<_>>(),
                &foreign_relation.view, foreign_key_fields
                ),
            ]);
    }
}

fn check_triangle_key(warning_table: &mut Relation,
    base_relation: &Relation, base_to_left_field: &str, base_to_right_field: &str,
    left_relation: &Relation, left_to_base_field: &str, left_to_right_field: &str,
    right_relation: &Relation, right_to_base_field: &str, right_to_left_field: &str
    ) {
    let base_to_left_ix = base_relation.names.iter().position(|name| name == base_to_left_field).unwrap();
    let base_to_right_ix = base_relation.names.iter().position(|name| name == base_to_right_field).unwrap();
    let left_to_base_ix = left_relation.names.iter().position(|name| name == left_to_base_field).unwrap();
    let left_to_right_ix = left_relation.names.iter().position(|name| name == left_to_right_field).unwrap();
    let right_to_base_ix = right_relation.names.iter().position(|name| name == right_to_base_field).unwrap();
    let right_to_left_ix = right_relation.names.iter().position(|name| name == right_to_left_field).unwrap();
    'next_row: for base_row in base_relation.index.iter() {
        for left_row in left_relation.index.iter() {
            if base_row[base_to_left_ix] == left_row[left_to_base_ix] {
                for right_row in right_relation.index.iter() {
                    if base_row[base_to_right_ix] == right_row[right_to_base_ix] {
                        if left_row[left_to_right_ix] != right_row[right_to_left_ix] {
                            warning_table.index.insert(vec![
                                Value::String(base_relation.view.to_owned()),
                                Value::Column(base_row.clone()),
                                string!("Row {:?}={:?} has {:?}[{:?}]=[{:?}] but {:?}[{:?}]=[{:?}]",
                                    &base_relation.view, &base_row,
                                    &left_relation.view, left_to_right_field, &left_row[left_to_right_ix],
                                    &right_relation.view, right_to_left_field, &right_row[right_to_left_ix]
                                    ),
                                ]);
                        }
                    }
                }
            }
        }
    }
}

fn check_enum(warning_table: &mut Relation, relation: &Relation, field: &str, values: &[Value]) {
    let ix = relation.names.iter().position(|name| name == field).unwrap();
    for row in relation.index.iter() {
        if !values.iter().any(|value| *value == row[ix]) {
            warning_table.index.insert(vec![
                Value::String(relation.view.to_owned()),
                Value::Column(row.clone()),
                string!("Value for {:?} is not in {:?}", field, values),
                ]);
        }
    }
}

fn check_view_kind(warning_table: &mut Relation, relation: &Relation, field: &str, view_table: &Relation, kinds: &[&str]) {
    let ix = relation.names.iter().position(|name| name == field).unwrap();
    for row in relation.index.iter() {
        let view = &row[ix];
        find!(view_table, [(= view), view_kind], {
            if kinds.iter().all(|&kind| kind != view_kind.as_str()) {
                warning_table.index.insert(vec![
                    Value::String(relation.view.to_owned()),
                    Value::Column(row.clone()),
                    string!("This {:?} is attached to a non-{} view of kind: {:?}", &relation.view, kinds.join("/"), view_kind),
                    ]);
            }
        });
    }
}

// --- compiler ---

// Make all the decisions (eg scheduling, layout, disabling).
// The intention is that this entire function will eventually be implemented in Eve.
fn plan(flow: &Flow) {
    use value::Value::*;

    let mut warning_table = flow.overwrite_output("warning");

    // --- check inputs ---
    // see the view descriptions in `code_schema` above to understand the constraints applied here

    let view_table = flow.get_output("view");
    check_unique_key(&mut *warning_table, &*view_table, &["view"]);
    check_enum(&mut *warning_table, &*view_table, "kind",
        &[string!("table"), string!("join"), string!("union"), string!("primitive")]);

    let field_table = flow.get_output("field");
    check_unique_key(&mut *warning_table, &*field_table, &["field"]);
    check_foreign_key(&mut *warning_table, &*field_table, &["view"], &*view_table, &["view"]);
    check_enum(&mut *warning_table, &*field_table, "kind",
        &[string!("scalar input"), string!("vector input"), string!("output")]);

    let source_table = flow.get_output("source");
    check_unique_key(&mut *warning_table, &*source_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*source_table, &["view"], &*view_table, &["view"]);
    check_foreign_key(&mut *warning_table, &*source_table, &["source view"], &*view_table, &["view"]);
    check_view_kind(&mut *warning_table, &*source_table, "view", &*view_table, &["join"]);

    let variable_table = flow.get_output("variable");
    check_unique_key(&mut *warning_table, &*variable_table, &["variable"]);
    check_foreign_key(&mut *warning_table, &*variable_table, &["view"], &*view_table, &["view"]);
    check_view_kind(&mut *warning_table, &*variable_table, "view", &*view_table, &["join"]);

    let binding_table = flow.get_output("binding");
    check_unique_key(&mut *warning_table, &*binding_table, &["source", "field"]);
    check_foreign_key(&mut *warning_table, &*binding_table, &["variable"], &*variable_table, &["variable"]);
    check_foreign_key(&mut *warning_table, &*binding_table, &["source"], &*source_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*binding_table, &["field"], &*field_table, &["field"]);
    check_triangle_key(&mut *warning_table,
        &*binding_table, "variable", "source",
        &*variable_table, "variable", "view",
        &*source_table, "source", "view",
        );
    check_triangle_key(&mut *warning_table,
        &*binding_table, "field", "source",
        &*field_table, "field", "view",
        &*source_table, "source", "source view",
        );

    let constant_binding_table = flow.get_output("constant binding");
    check_unique_key(&mut *warning_table, &*constant_binding_table, &["variable"]);
    check_foreign_key(&mut *warning_table, &*constant_binding_table, &["variable"], &*variable_table, &["variable"]);

    let select_table = flow.get_output("select");
    check_unique_key(&mut *warning_table, &*select_table, &["field"]);
    check_foreign_key(&mut *warning_table, &*select_table, &["field"], &*field_table, &["field"]);
    check_foreign_key(&mut *warning_table, &*select_table, &["variable"], &*variable_table, &["variable"]);
    check_triangle_key(&mut *warning_table,
        &*select_table, "field", "variable",
        &*field_table, "field", "view",
        &*variable_table, "variable", "view"
        );

    let grouped_field_table = flow.get_output("grouped field");
    check_foreign_key(&mut *warning_table, &*grouped_field_table, &["source"], &*source_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*grouped_field_table, &["field"], &*field_table, &["field"]);
    check_triangle_key(&mut *warning_table,
        &*grouped_field_table, "source", "field",
        &*source_table, "source", "source view",
        &*field_table, "field", "view",
        );

    let sorted_field_table = flow.get_output("sorted field");
    check_unique_key(&mut *warning_table, &*sorted_field_table, &["source", "field"]);
    check_foreign_key(&mut *warning_table, &*sorted_field_table, &["source"], &*source_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*sorted_field_table, &["field"], &*field_table, &["field"]);
    check_triangle_key(&mut *warning_table,
        &*sorted_field_table, "source", "field",
        &*source_table, "source", "source view",
        &*field_table, "field", "view",
        );
    check_enum(&mut *warning_table, &*sorted_field_table, "direction",
        &[string!("ascending"), string!("descending")]);
    find!(source_table, [_, source, _], {
        let sorted_fields = find!(sorted_field_table, [(= source), _, _, _]);
        let mut ixes = sorted_fields.iter().map(|sorted_field| sorted_field[1].as_usize()).collect::<Vec<_>>();
        ixes.sort();
        if ixes != (0..ixes.len()).collect::<Vec<_>>() {
            for sorted_field in sorted_fields.into_iter() {
                warning_table.index.insert(vec![
                    string!("sorted field"),
                    Column(sorted_field.to_vec()),
                    string!("Ixes should be consecutive integers from 0 to (number of sorted fields)-1"),
                    ]);
            }
        }
    });

    let ordinal_binding_table = flow.get_output("ordinal binding");
    check_unique_key(&mut *warning_table, &*ordinal_binding_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*ordinal_binding_table, &["source"], &*source_table, &["source"]);
    check_foreign_key(&mut *warning_table, &*ordinal_binding_table, &["variable"], &*variable_table, &["variable"]);

    let chunked_source_table = flow.get_output("chunked source");
    check_foreign_key(&mut *warning_table, &*chunked_source_table, &["source"], &*source_table, &["source"]);

    let negated_source_table = flow.get_output("negated source");
    check_foreign_key(&mut *warning_table, &*negated_source_table, &["source"], &*source_table, &["source"]);

    let member_table = flow.get_output("member");
    check_unique_key(&mut *warning_table, &*member_table, &["member"]);
    check_foreign_key(&mut *warning_table, &*member_table, &["view"], &*view_table, &["view"]);
    check_foreign_key(&mut *warning_table, &*member_table, &["member view"], &*view_table, &["view"]);
    check_view_kind(&mut *warning_table, &*member_table, "view", &*view_table, &["union"]);
    check_view_kind(&mut *warning_table, &*member_table, "member view", &*view_table, &["table", "join", "union"]);

    let mapping_table = flow.get_output("mapping");
    check_unique_key(&mut *warning_table, &*mapping_table, &["view field", "member"]);
    check_foreign_key(&mut *warning_table, &*mapping_table, &["view field"], &*field_table, &["field"]);
    check_foreign_key(&mut *warning_table, &*mapping_table, &["member"], &*member_table, &["member"]);
    check_foreign_key(&mut *warning_table, &*mapping_table, &["member field"], &*field_table, &["field"]);
    check_triangle_key(&mut *warning_table,
        &*mapping_table, "view field", "member",
        &*field_table, "field", "view",
        &*member_table, "member", "view",
        );
    check_triangle_key(&mut *warning_table,
        &*mapping_table, "member field", "member",
        &*field_table, "field", "view",
        &*member_table, "member", "member view",
        );

    let negated_member_table = flow.get_output("negated member");
    check_foreign_key(&mut *warning_table, &*negated_member_table, &["member"], &*member_table, &["member"]);

    find!(view_table, [view, view_kind], {
        if view_kind.as_str() == "join" {
            find!(field_table, [(= view), field, field_kind], {
                dont_find!(select_table, [(= field), _], {
                    warning_table.index.insert(vec![
                        string!("field"),
                        Column(vec![view.clone(), field.clone(), field_kind.clone()]),
                        string!("This field has no select"),
                        ]);
                });
            });
        }
    });

    find!(view_table, [view, view_kind], {
        if view_kind.as_str() == "union" {
            find!(field_table, [(= view), field, field_kind], {
                find!(member_table, [(= view), member, _], {
                    dont_find!(mapping_table, [(= field), (= member), _], {
                        warning_table.index.insert(vec![
                            string!("field"),
                            Column(vec![view.clone(), field.clone(), field_kind.clone()]),
                            string!("This field has no mapping in member {:?}", member),
                            ]);
                    });
                });
            });
        }
    });

    find!(variable_table, [view, variable], {
        if dont_find!(binding_table, [(= variable), _, _])
        && dont_find!(ordinal_binding_table, [(= variable), _]) {
            warning_table.index.insert(vec![
                string!("variable"),
                Column(vec![view.clone(), variable.clone()]),
                string!("This variable is never bound")
                ]);
        }
    });

    find!(grouped_field_table, [source, field], {
        find!(sorted_field_table, [(= source), _, (= field), _], {
            warning_table.index.insert(vec![
                string!("grouped field"),
                Column(vec![source.clone(), field.clone()]),
                string!("This field is both grouped and sorted"),
                ]);
        });
    });

    find!(chunked_source_table, [source], {
        find!(negated_source_table, [(= source)], {
            warning_table.index.insert(vec![
                string!("chunked source"),
                Column(vec![source.clone()]),
                string!("This source is both chunked and negated"),
                ]);
        });
    });

    // --- plan the flow ---
    // see the view descriptions in `compiler_schema` above to understand what is being calculated here

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
    find!(view_table, [view, _], {
        find!(member_table, [(= view), _, member, member_view], {
            find!(view_table, [(= member_view), _], {
                insert!(view_dependency_pre_table, [view, member, member_view]);
            });
        });
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

    let mut provides_table = flow.overwrite_output("provides");
    let mut requires_table = flow.overwrite_output("requires");
    find!(variable_table, [view, variable], {
        find!(binding_table, [(= variable), source, field], {
            dont_find!(negated_source_table, [(= source)], {
                find!(field_table, [_, (= field), field_kind], {
                    match field_kind.as_str() {
                        "output" => insert!(provides_table, [view, source, variable]),
                        _ => insert!(requires_table, [view, source, variable]),
                    };
                });
            });
        });
    });
    find!(variable_table, [view, variable], {
        find!(ordinal_binding_table, [(= variable), source], {
            dont_find!(negated_source_table, [(= source)], {
                insert!(provides_table, [view, source, variable]);
            });
        });
    });
    find!(variable_table, [view, variable], {
        find!(binding_table, [(= variable), source, _], {
            find!(negated_source_table, [(= source)], {
                find!(provides_table, [(= view), _, (= variable)], {
                    // negated sources treat fields as input if they are bound elsewhere
                    insert!(requires_table, [view, source, variable]);
                });
            });
        });
    });

    // schedule sources/variables by topological sort of the provides/requires graph
    let mut source_schedule_pre_table = flow.overwrite_output("source schedule (pre)");
    let mut variable_schedule_pre_table = flow.overwrite_output("variable schedule (pre)");
    let mut pass = 0;
    {
        find!(constant_binding_table, [variable, _], {
            find!(variable_table, [view, (= variable)], {
                insert!(variable_schedule_pre_table, [view, Float(pass as f64), variable]);
            });
        });
        pass += 1;
    }
    loop {
        let mut unscheduled_source_table = flow.overwrite_output("unscheduled source");
        find!(view_table, [view, _], {
            find!(source_table, [(= view), source, _], {
                dont_find!(source_schedule_pre_table, [(= view), _, (= source)], {
                    insert!(unscheduled_source_table, [view, source]);
                });
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
            insert!(source_schedule_pre_table, [view, Float(pass as f64), source]);
        });

        find!(schedulable_source_table, [view, source], {
            find!(provides_table, [(= view), (= source), variable], {
                dont_find!(variable_schedule_pre_table, [(= view), _, (= variable)], {
                    insert!(variable_schedule_pre_table, [view, Float(pass as f64), variable]);
                });
            });
        });

        if schedulable_source_table.index.len() == 0 {
            find!(unschedulable_source_table, [view, source, variable], {
                warning_table.index.insert(vec![
                    string!("unschedulable source"),
                    Column(vec![view.clone(), source.clone(), variable.clone()]),
                    string!("This source cannot be scheduled because this variable cannot be scheduled"),
                    ]);
            });
            break; // done scheduling
        }

        pass += 1;
    }

    let mut source_schedule_table = flow.overwrite_output("source schedule");
    ordinal_by(&*source_schedule_pre_table, &mut *source_schedule_table, &["view"]);

    let mut variable_schedule_table = flow.overwrite_output("variable schedule");
    ordinal_by(&*variable_schedule_pre_table, &mut *variable_schedule_table, &["view"]);

    // TODO find a nicer way to calculate constrained/free bindings

    let mut constrained_binding_table = flow.overwrite_output("constrained binding");
    find!(variable_table, [_, variable], {
        find!(constant_binding_table, [(= variable), _], {
            find!(binding_table, [(= variable), source, field], {
                insert!(constrained_binding_table, [variable, source, field]);
            });
        });
    });
    find!(variable_table, [view, variable], {
        find!(binding_table, [(= variable), source, field], {
            find!(binding_table, [(= variable), other_source, other_field], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(source_schedule_table, [(= view), other_source_ix, _, (= other_source)], {
                        if (other_source_ix < source_ix)
                        // arbitrary field ordering, just to have to pick one to be the unconstrained binding
                        || (other_source_ix == source_ix && other_field < field) {
                            insert!(constrained_binding_table, [variable, source, field]);
                        }
                    });
                });
            });
        });
    });

    let mut constrained_ordinal_binding_table = flow.overwrite_output("constrained ordinal binding");
    find!(variable_table, [_, variable], {
        find!(constant_binding_table, [(= variable), _], {
            find!(ordinal_binding_table, [(= variable), source], {
                insert!(constrained_ordinal_binding_table, [variable, source]);
            });
        });
    });
    find!(variable_table, [view, variable], {
        find!(ordinal_binding_table, [(= variable), source], {
            find!(binding_table, [(= variable), other_source, _], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(source_schedule_table, [(= view), other_source_ix, _, (= other_source)], {
                        if other_source_ix <= source_ix {
                            insert!(constrained_ordinal_binding_table, [variable, source]);
                        }
                    });
                });
            });
        });
    });
    find!(variable_table, [view, variable], {
        find!(ordinal_binding_table, [(= variable), source], {
            find!(ordinal_binding_table, [(= variable), other_source], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(source_schedule_table, [(= view), other_source_ix, _, (= other_source)], {
                        if other_source_ix < source_ix {
                            insert!(constrained_ordinal_binding_table, [variable, source]);
                        }
                    });
                });
            });
        });
    });

    let mut compiler_index_layout_table = flow.overwrite_output("compiler index layout");
    for (view, names) in schema().into_iter() {
        for (ix, name) in names.into_iter().enumerate() {
            insert!(compiler_index_layout_table,
                [string!("{}", view), Float(ix as f64), string!("{}: {}", view, name), string!("{}", name)]);
        }
    }
    for (view, scalar_input_names, vector_input_names, output_names, _) in primitive::primitives().into_iter() {
        for (ix, name) in
        scalar_input_names.into_iter()
        .chain(vector_input_names.into_iter())
        .chain(output_names.into_iter())
        .enumerate() {
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

    let mut number_of_fields_table = flow.overwrite_output("number of fields");
    count_by(&*index_layout_table, &mut *number_of_fields_table, &["view"]);

    let mut non_sorted_field_pre_table = flow.overwrite_output("non-sorted field (pre)");
    find!(view_table, [view, kind], {
        if kind.as_str() == "join" {
            find!(source_table, [(= view), source, source_view], {
                find!(field_table, [(= source_view), field, _], {
                    dont_find!(grouped_field_table, [(= source), (= field)], {
                        dont_find!(sorted_field_table, [(= source), _, (= field), _], {
                            insert!(non_sorted_field_pre_table, [view, source, field]);
                        });
                    });
                });
            });
        }
    });

    let mut non_sorted_field_table = flow.overwrite_output("non-sorted field");
    ordinal_by(&*non_sorted_field_pre_table, &mut *non_sorted_field_table, &["view", "source"]);

    // --- disable views which have warnings ---

    let disabled_view_table = RefCell::new(flow.overwrite_output("disabled view"));
    find!(warning_table, [warning_view, warning_row, warning], {
        let disable_view = |view: &Value| {
            insert!(disabled_view_table.borrow_mut(), [view, warning_view, warning_row, warning]);
        };
        let disable_source = |source: &Value| {
            find!(source_table, [view, (= source), _], {
                insert!(disabled_view_table.borrow_mut(), [view, warning_view, warning_row, warning]);
            });
        };
        let disable_variable = |variable: &Value| {
            find!(variable_table, [view, (= variable)], {
                insert!(disabled_view_table.borrow_mut(), [view, warning_view, warning_row, warning]);
            });
        };
        let disable_field = |field: &Value| {
            find!(field_table, [view, (= field), _], {
                insert!(disabled_view_table.borrow_mut(), [view, warning_view, warning_row, warning]);
            });
        };
        let disable_member = |member: &Value| {
            find!(member_table, [view, (= member), _], {
                insert!(disabled_view_table.borrow_mut(), [view, warning_view, warning_row, warning]);
            });
        };
        match (warning_view.as_str(), &warning_row.as_column()[..]) {
            ("view", [ref view, _]) => disable_view(view),
            ("field", [ref view, _, _]) => disable_view(view),
            ("source", [ref view, _, _]) => disable_view(view),
            ("variable", [ref view, _]) => disable_view(view),
            ("binding", [ref variable, ref source, _]) => { disable_variable(variable); disable_source(source) },
            ("constant binding", [ref variable, _]) => disable_variable(variable),
            ("select", [ref field, ref variable]) => { disable_field(field); disable_variable(variable) },
            ("grouped field", [ref source, _]) => disable_source(source),
            ("sorted field", [ref source, _, _, _]) => disable_source(source),
            ("ordinal binding", [ref variable, ref source]) => { disable_variable(variable); disable_source(source) },
            ("chunked source", [ref source]) => disable_source(source),
            ("negated source", [ref source]) => disable_source(source),
            ("unschedulable source", [ref view, ref source, ref variable]) => { disable_view(view); disable_source(source); disable_variable(variable) },
            ("member", [ref view, _, _]) => disable_view(view),
            ("mapping", [ref view_field, ref member, _]) => { disable_field(view_field); disable_member(member) },
            ("constant mapping", [ref view_field, ref member, _]) => { disable_field(view_field); disable_member(member) },
            ("negated member", [ref member]) => disable_member(member),
            _ => panic!("Don't know how to handle this warning: {:?} {:?} {:?}", warning_view, warning_row, warning),
        }
    });

    let mut enabled_view_table = flow.overwrite_output("enabled view");
    find!(view_schedule_table, [view_ix, view, kind], {
        dont_find!(disabled_view_table.borrow(), [(= view), _, _, _], {
            insert!(enabled_view_table, [view_ix, view, kind]);
        });
    });

    // --- denormalise for `create` ---

    let mut view_layout_table = flow.overwrite_output("view layout");
    find!(view_schedule_table, [view_ix, view, kind], {
        if dont_find!(disabled_view_table.borrow(), [(= view), _, _, _]) {
            insert!(view_layout_table, [view_ix, view, kind]);
        } else {
            insert!(view_layout_table, [view_ix, view, string!("disabled")]);
        }
    });

    let mut output_layout_table = flow.overwrite_output("output layout");
    find!(index_layout_table, [view, field_ix, field, name], {
        find!(view_layout_table, [view_ix, (= view), _], {
            insert!(output_layout_table, [view_ix, field_ix, field, name]);
        });
    });

    let mut downstream_layout_table = flow.overwrite_output("downstream layout");
    find!(view_dependency_table, [downstream_view, ix, _, upstream_view], {
        find!(view_layout_table, [downstream_view_ix, (= downstream_view), _], {
            find!(view_layout_table, [upstream_view_ix, (= upstream_view), _], {
                insert!(downstream_layout_table, [downstream_view_ix, ix, upstream_view_ix]);
            });
        });
    });

    let mut number_of_variables_pre_table = flow.overwrite_output("number of variables (pre)");
    count_by(&*variable_schedule_table, &mut *number_of_variables_pre_table, &["view"]);

    let mut number_of_variables_table = flow.overwrite_output("number of variables");
    find!(number_of_variables_pre_table, [view, num], {
        find!(enabled_view_table, [view_ix, (= view), _], {
            insert!(number_of_variables_table, [view_ix, num]);
        });
    });

    let mut constant_layout_table = flow.overwrite_output("constant layout");
    find!(constant_binding_table, [variable, value], {
        find!(variable_table, [view, (= variable)], {
            find!(enabled_view_table, [view_ix, (= view), _], {
                find!(variable_schedule_table, [(= view), variable_ix, _, (= variable)], {
                    insert!(constant_layout_table, [view_ix, variable_ix, value]);
                });
            });
        });
    });

    let mut source_layout_table = flow.overwrite_output("source layout");
    find!(enabled_view_table, [view_ix, view, _], {
        find!(source_schedule_table, [(= view), source_ix, _, source], {
            find!(source_table, [(= view), (= source), source_view], {
                find!(view_table, [(= source_view), kind], {
                    let chunked = !dont_find!(chunked_source_table, [(= source)]);
                    let negated = !dont_find!(negated_source_table, [(= source)]);
                    if kind.as_str() == "primitive" {
                        insert!(source_layout_table, [view_ix, source_ix, source, source_view, Bool(chunked), Bool(negated)]);
                    } else {
                        find!(view_dependency_table, [(= view), input_ix, (= source), (= source_view)], {
                            insert!(source_layout_table, [view_ix, source_ix, source, input_ix, Bool(chunked), Bool(negated)]);
                        });
                    }
                });
            });
        });
    });

    let mut binding_layout_table = flow.overwrite_output("binding layout");
    find!(enabled_view_table, [view_ix, view, _], {
        find!(source_schedule_table, [(= view), source_ix, _, source], {
            find!(source_table, [(= view), (= source), source_view], {
                find!(index_layout_table, [(= source_view), field_ix, field, _], {
                    find!(binding_table, [variable, (= source), (= field)], {
                        find!(variable_schedule_table, [(= view), variable_ix, _, (= variable)], {
                            find!(field_table, [(= source_view), (= field), field_kind], {
                                let unconstrained = dont_find!(constrained_binding_table, [(= variable), (= source), (= field)]);
                                let kind = match (field_kind.as_str(), unconstrained) {
                                    ("scalar input", _) => string!("input"),
                                    ("vector input", _) => string!("input"),
                                    ("output", false) => string!("constraint"),
                                    ("output", true) => string!("output"),
                                    other => panic!("Unknown field kind: {:?}", other),
                                };
                                insert!(binding_layout_table, [view_ix, source_ix, field_ix, variable_ix, kind]);
                            });
                        });
                    });
                });
            });
        });
    });
    find!(ordinal_binding_table, [variable, source], {
        find!(variable_schedule_table, [view, variable_ix, _, (= variable)], {
            find!(enabled_view_table, [view_ix, (= view), _], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(source_table, [(= view), (= source), source_view], {
                        find!(number_of_fields_table, [(= source_view), number_of_fields], {
                            let unconstrained = dont_find!(constrained_ordinal_binding_table, [(= variable), (= source)]);
                            let kind = match unconstrained {
                                false => string!("constraint"),
                                true => string!("output"),
                            };
                            insert!(binding_layout_table, [view_ix, source_ix, number_of_fields, variable_ix, kind]);
                        });
                    });
                });
            });
        });
    });

    let mut select_layout_table = flow.overwrite_output("select layout");
    find!(enabled_view_table, [view_ix, view, _], {
        find!(index_layout_table, [(= view), field_ix, field, _], {
            find!(select_table, [(= field), variable], {
                find!(variable_schedule_table, [(= view), variable_ix, _, (= variable)], {
                    insert!(select_layout_table, [view_ix, field_ix, variable_ix]);
                });
            });
        });
    });

    let mut grouped_field_layout_table = flow.overwrite_output("grouped field layout");
    find!(grouped_field_table, [source, field], {
        find!(source_table, [view, (= source), source_view], {
            find!(enabled_view_table, [view_ix, (= view), _], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(index_layout_table, [(= source_view), field_ix, (= field), _], {
                        insert!(grouped_field_layout_table, [view_ix, source_ix, field_ix]);
                    });
                });
            });
        });
    });

    let mut sorted_field_layout_table = flow.overwrite_output("sorted field layout");
    find!(sorted_field_table, [source, ix, field, direction], {
        find!(source_table, [view, (= source), source_view], {
            find!(enabled_view_table, [view_ix, (= view), _], {
                find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                    find!(index_layout_table, [(= source_view), field_ix, (= field), _], {
                        insert!(sorted_field_layout_table, [view_ix, source_ix, ix, field_ix, direction]);
                    });
                });
            });
        });
    });

    let mut non_sorted_field_layout_table = flow.overwrite_output("non-sorted field layout");
    find!(non_sorted_field_table, [view, source, ix, field], {
        find!(enabled_view_table, [view_ix, (= view), _], {
            find!(source_schedule_table, [(= view), source_ix, _, (= source)], {
                find!(source_table, [(= view), (= source), source_view], {
                    find!(index_layout_table, [(= source_view), field_ix, (= field), _], {
                        insert!(non_sorted_field_layout_table, [view_ix, source_ix, ix, field_ix]);
                    });
                });
            });
        });
    });

    let mut member_layout_table = flow.overwrite_output("member layout");
    find!(member_table, [view, member_ix, member, member_view], {
        find!(enabled_view_table, [view_ix, (= view), _], {
            find!(view_dependency_table, [(= view), input_ix, (= member), (= member_view)], {
                let negated = !dont_find!(negated_member_table, [(= member)]);
                insert!(member_layout_table, [view_ix, member_ix, input_ix, Bool(negated)]);
            });
        });
    });

    let mut mapping_layout_table = flow.overwrite_output("mapping layout");
    find!(mapping_table, [view_field, member, member_field], {
        find!(member_table, [view, member_ix, (= member), member_view], {
            find!(enabled_view_table, [view_ix, (= view), _], {
                find!(index_layout_table, [(= view), view_field_ix, (= view_field), _], {
                    find!(index_layout_table, [(= member_view), member_field_ix, (= member_field), _], {
                        insert!(mapping_layout_table, [view_ix, member_ix, view_field_ix, member_field_ix]);
                    });
                });
            });
        });
    });
}

fn push_at<T>(items: &mut Vec<T>, ix: &Value, item: T) {
    assert_eq!(items.len(), ix.as_usize());
    items.push(item);
}

// Make a new flow, based on the decisions made in `plan`
fn create(flow: &Flow) -> Flow {
    use value::Value::*;

    let mut nodes = Vec::new();
    let mut dirty = BitSet::new();
    let mut outputs = Vec::new();
    let mut errors = Vec::new();

    find!(flow.get_output("view layout"), [view_ix, view, kind], {
        nodes.push(Node{
            id: view.as_str().to_owned(),
            view: match kind.as_str() {
                "table" => View::Table,
                "union" => View::Union(Union{
                    members: vec![],
                }),
                "join" => View::Join(Join{
                    constants: vec![],
                    sources: vec![],
                    select: vec![],
                }),
                "disabled" => View::Disabled,
                _ => panic!("Unknown view kind: {:?}", kind)
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
        errors.push(vec![]);
    });

    find!(flow.get_output("output layout"), [view_ix, field_ix, field, name], {
        let mut output = outputs[view_ix.as_usize()].borrow_mut();
        push_at(&mut output.fields, field_ix, field.as_str().to_owned());
        push_at(&mut output.names, field_ix, name.as_str().to_owned());
    });

    find!(flow.get_output("downstream layout"), [downstream_ix, ix, upstream_ix], {
        push_at(&mut nodes[downstream_ix.as_usize()].upstream, ix, upstream_ix.as_usize());
        nodes[upstream_ix.as_usize()].downstream.push(downstream_ix.as_usize());
    });

    find!(flow.get_output("number of variables"), [view_ix, num], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => join.constants = vec![Null; num.as_usize()],
            other => panic!("Variables given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("constant layout"), [view_ix, variable_ix, value], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => join.constants[variable_ix.as_usize()] = value.clone(),
            other => panic!("Constants given for non-join/union view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("source layout"), [view_ix, source_ix, source, input, chunked, negated], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                let source = Source{
                    id: source.as_str().to_owned(),
                    input: match input {
                        &String(ref primitive) => Input::Primitive{
                            primitive: Primitive::from_str(primitive),
                            input_bindings: vec![],
                        },
                        &Float(upstream_view_ix) => Input::View{
                            input_ix: upstream_view_ix as usize,
                        },
                        other => panic!("Unknown input type: {:?}", other),
                    },
                    grouped_fields: vec![],
                    sorted_fields: vec![],
                    chunked: chunked.as_bool(),
                    negated: negated.as_bool(),
                    constraint_bindings: vec![],
                    output_bindings: vec![],
                };
                push_at(&mut join.sources, source_ix, source);
            }
            other => panic!("Sources given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("binding layout"), [view_ix, source_ix, field_ix, variable_ix, kind], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                let source = &mut join.sources[source_ix.as_usize()];
                let binding = (field_ix.as_usize(), variable_ix.as_usize());
                match (kind.as_str(), &mut source.input) {
                    ("input", &mut Input::Primitive{ref mut input_bindings, ..}) => input_bindings.push(binding),
                    ("constraint", _) => source.constraint_bindings.push(binding),
                    ("output", _) => source.output_bindings.push(binding),
                    other => panic!("Unexpected binding kind / input combo: {:?}", other),
                }
            }
            other => panic!("Bindings given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("select layout"), [view_ix, field_ix, variable_ix], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                push_at(&mut join.select, field_ix, variable_ix.as_usize());
            }
            other => panic!("Selects given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("grouped field layout"), [view_ix, source_ix, field_ix], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                join.sources[source_ix.as_usize()].grouped_fields.push(field_ix.as_usize());
            }
            other => panic!("Grouped fields given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("sorted field layout"), [view_ix, source_ix, ix, field_ix, direction], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                let direction = match direction.as_str() {
                    "ascending" => Direction::Ascending,
                    "descending" => Direction::Descending,
                    _ => panic!("Unknown direction {:?}", direction),
                };
                push_at(&mut join.sources[source_ix.as_usize()].sorted_fields, ix, (field_ix.as_usize(), direction));
            }
            other => panic!("Sorted fields given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("non-sorted field layout"), [view_ix, source_ix, _, field_ix], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Join(ref mut join) => {
                let direction = Direction::Ascending;
                join.sources[source_ix.as_usize()].sorted_fields.push((field_ix.as_usize(), direction));
            }
            other => panic!("Sorted fields given for non-join view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("member layout"), [view_ix, member_ix, input_ix, negated], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Union(ref mut union) => {
                push_at(&mut union.members, member_ix, Member{
                    input_ix: input_ix.as_usize(),
                    mapping: vec![],
                    negated: negated.as_bool(),
                });
            }
            other => panic!("Member given for non-union view {:?} {:?}", view_ix, other),
        }
    });

    find!(flow.get_output("mapping layout"), [view_ix, member_ix, view_field_ix, member_field_ix], {
        match &mut nodes[view_ix.as_usize()].view {
            &mut View::Union(ref mut union) => {
                push_at(&mut union.members[member_ix.as_usize()].mapping, view_field_ix, member_field_ix.as_usize());
            }
            other => panic!("Mapping given for non-union view {:?} {:?}", view_ix, other),
        }
    });

    Flow{
        nodes: nodes,
        dirty: dirty,
        outputs: outputs,
        errors: errors,
        needs_recompile: false,
    }
}

// Carry state over from the old flow where possible
fn reuse_state(old_flow: &mut Flow, new_flow: &mut Flow) {
    let nodes = replace(&mut old_flow.nodes, vec![]);
    let outputs = replace(&mut old_flow.outputs, vec![]);
    for (old_node, old_output) in nodes.into_iter().zip(outputs.into_iter()) {
        if let View::Table = old_node.view { // only reuse tables - less potential for bugs eg with recursive views
            if &old_node.id[..] != "error" { // dont reuse old error state since we clear errors inside the nodes
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
    }
}

pub fn recompile(old_flow: &mut Flow) {
    plan(old_flow);
    let mut new_flow = create(old_flow);
    reuse_state(old_flow, &mut new_flow);
    *old_flow = new_flow;
}

// For new flows, mirror the info from `schema` into the flow
pub fn bootstrap(flow: &mut Flow) {
    let schema = schema();
    for &(view, ref names) in schema.iter() {
        flow.nodes.push(Node{
            id: format!("{}", view),
                view: View::Table, // dummy node, replaced by recompile
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
        let mut view_description_table = flow.overwrite_output("view description");

        for (view, _) in code_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("editor")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, _) in compiler_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, _) in server_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, _) in editor_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("editor")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
        }

        for (view, fields) in client_schema().into_iter() {
            tag_table.index.insert(vec![string!("{}", view), string!("client")]);
            tag_table.index.insert(vec![string!("{}", view), string!("hidden")]);
            let has_session = fields.into_iter().any(|name| name == "session");
            if has_session {
                tag_table.index.insert(vec![string!("{}: {}", view, "session"), string!("session")]);
            }
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
                ix += 1;
            }
        }

        for (primitive, scalar_inputs, vector_inputs, outputs, description) in primitive::primitives().into_iter() {
            let mut ix = 0;
            view_table.index.insert(vec![string!("{}", primitive), string!("primitive")]);
            display_name_table.index.insert(vec![string!("{}", primitive), string!("{}", primitive)]);
            for name in scalar_inputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("scalar input")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
                display_order_table.index.insert(vec![string!("{}: {}", primitive, name), Value::Float(ix as f64)]);
                ix += 1;
            }
            for name in vector_inputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("vector input")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
                display_order_table.index.insert(vec![string!("{}: {}", primitive, name), Value::Float(ix as f64)]);
                ix += 1;
            }
            for name in outputs.into_iter() {
                field_table.index.insert(vec![string!("{}", primitive), string!("{}: {}", primitive, name), string!("output")]);
                display_name_table.index.insert(vec![string!("{}: {}", primitive, name), string!("{}", name)]);
                display_order_table.index.insert(vec![string!("{}: {}", primitive, name), Value::Float(ix as f64)]);
                ix += 1;
            }
            view_description_table.index.insert(vec![string!("{}", primitive), string!("{}", description)]);
        }
    }

    recompile(flow); // bootstrap away our dummy nodes
}
