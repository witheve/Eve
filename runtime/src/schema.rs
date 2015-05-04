use value::Value;

type Id = String;

// a table with a single unique key K
type KV<K, V> = Hashtable<K, V>;

// every record in this struct represents a table
// the tables are named by their fields, separated by underscores
// eg view_kind is a table with two fields: view and kind
type Program = {
    // all state lives in a view of some kind
    view_kind: KV<Id, ViewKind>,

    // views have fields which are globally unique
    field_view: KV<Id, Id>,
    // some fields have constraints on how they can be queried
    field_kind: KV<Id, FieldKind>,

    // a table has an insert view and a remove view
    table_insert: KV<Id, Id>,
    table_remove: KV<Id, Id>,

    // sources uniquely identify a copy of a child view inside a parent join or union
    // eg a parent join can have multiple copies of some child view, with different source ids
    parent_source_child: KV<(Id, Id), Id>,
    // every view also has an implicit "constant" source
    // anywhere a source-field pair is expected, you can instead use "constant"-id
    constant_value: KV<Id, Value>,

    // constraints belong to a join view
    // the left and right fields are compared using the operation
    constraint_parent: KV<Id, Id>,
    constraint_leftsource_leftfield: KV<Id, (Id, Id)>,
    constraint_operation: KV<Id, ConstraintOperation>,
    constraint_rightsource_rightfield: KV<Id, (Id, Id)>,

    // aggregates group an "inner" source by the rows of an "outer" source
    // the groups are reduced by joining against a "primitive" source
    // the grouping is determined by binding inner fields to outer fields or constants
    aggregate_innerfield_source_sourcefield: KV<(Id, Id), (Id, Id)>,
    // inner fields and constants can also be used as arguments to the aggregate function
    aggregate_primitivefield_source_sourcefield: KV<(Id, Id), (Id, Id)>,

    // views produce output by binding fields from sources
    // each join field is bound exactly once
    join_joinfield_source_sourcefield: KV<(Id, Id), (Id, Id)>,
    // each union field is bound exactly once per source
    union_unionfield_source_sourcefield: KV<(Id, Id, Id), Id>,
    // each aggregate field is bound exactly once and cannot bind "outer"
    aggregate_aggregatefield_source_sourcefield: KV<(Id, Id), (Id, Id)>,

    // things that live in an ordered list are sorted by some f64
    thing_order: KV<Id, f64>,

    // things can have human readable names
    thing_name: KV<Id, String>,

    // TODO primitives cannot represent limit
    // TODO want multiple primitives per aggregate?
    // TODO sort order for aggregates?
}

enum ViewKind {
    Table, // a view which can depend on the past
    Join, // take the product of multiple views and filter the results
    Union, // take the union of multiple views
    Aggregate, // group one view by the contents of another and run some primitive on the groups
    Primitive, // a built-in function, represented as a view with one or more non-Data fields
}

enum FieldKind {
    Data, // a normal field
    ScalarInput, // a field that must be constrained to a single scalar value
    VectorInput, // a field that must be constrained to a single vector value (in an aggregate)
}

enum ConstraintOperation {
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
}