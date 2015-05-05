use value::Value;

fn compiler_schema() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>)> {
    // the schema is arranged as (table name, unique key fields, other fields)

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
    ("field", vec!["view", "field"], vec!["kind"]),

    // sources uniquely identify a copy of a child view inside a parent join or union
    // a table has an "insert" source and a "remove" source
    // a join or union can query multiple copies of some child view, with different source ids
    // an aggregate has an "outer" source, an "inner" source and a "reducer" source
    ("source", vec!["parent view", "source"], vec!["child view"]),

    // every view also has an implicit "constant" source
    // anywhere source-field is expected, you can instead use "constant"-id
    // `value` may be any valid eve value
    ("constant", vec!["constant"], vec!["value"]),

    // constraints belong to a join view
    // the left and right fields are compared using the operation
    // `operation` is one of "==", "/=", "<", "<=", ">", ">="
    ("constraint parent", vec!["constraint"], vec!["parent view"]),
    ("constraint left", vec!["constraint"], vec!["left source", "left field"]),
    ("constraint right", vec!["constraint"], vec!["right source", "right field"]),
    ("constraint operation", vec!["constraint"], vec!["operation"]),

    // aggregates group an "inner" source by the rows of an "outer" source
    // the grouping is determined by binding inner fields to outer fields or constants
    ("aggregate grouping", vec!["aggregate", "inner field"], vec!["group source", "group field"]),
    // before aggregation the groups are sorted
    // `order` is an f64
    ("aggregate sorting", vec!["aggregate", "inner field"], vec!["order"]),
    // groups may optionally be limited by an inner field or constant
    ("aggregate limit from", vec!["aggregate"], vec!["from source", "from field"]),
    ("aggregate limit to", vec!["aggregate"], vec!["to source", "to field"]),
    // the groups are reduced by binding against the "reducer" source
    // constants and inner fields which are bound to outer fields may both be used as ScalarInput arguments
    // inner fields which are not bound to outer fields may be used as VectorInput arguments
    ("aggregate arguments", vec!["aggregate", "reducer field"], vec!["argument source", "argument field"]),

    // views produce output by binding fields from sources
    // each table or join field must be bound exactly once
    // each aggregate field must be bound exactly once and can only bind constants, inner fields or reducer outputs
    // each union field must be bound exactly once per source
    // (the unique key is different for union than for other kinds, so I don't give a key at all)
    ("select", vec![], vec!["view", "view field", "source", "source field"]),

    // things that live in an ordered list are sorted by some f64 (ties are broken by Id)
    // `order` is an f64
    ("display order", vec!["id"], vec!["order"]),
    // things can have human readable names
    // `name` is a string
    ("display name", vec!["id"], vec!["name"]),
    ]
}