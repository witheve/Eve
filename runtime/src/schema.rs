use value::Value;

type Id = String;

// K is the unique key
type KV<K, V> = Hashtable<K, V>;

// two columns - no unique keys
type VV<K,V> = Hashtable<K, V>;

// two columns - first two are the unique key
type KKV<K1, K2, V> = Hashtable<K1, Hashtable<K2, V>>;

type Program = {
    // all state lives in a view of some kind
    view_kind: KV<Id, ViewKind>,

    // views have fields, fields may belong to multiple views
    field_view: VV<Id, Id>,

    // a table has an insert view and a remove view
    table_insert: KV<Id, Id>,
    table_remove: KV<Id, Id>,

    // a query just indirects to another view
    query_view: KV<Id, Id>,

    // sources uniquely identify a copy of a child view inside a parent view
    // eg a parent join can have multiple copies of some child view, with different source ids
    source_parent: KV<Id, Id>,
    source_child: KV<Id, Id>,

    // constraints belong to a join view
    // the left and right are references which are compared using the operation
    constraint_parent: KV<Id, Id>,
    constraint_left: KV<Id, Id>,
    constraint_operation: KV<Id, ConstraintOperation>,
    constraint_right: KV<Id, Id>,

    // aggregates group an inner view by the rows of an outer view
    // the groups are reduced using some primitive
    aggregate_primitive: KV<Id, Id>,
    aggregate_outer: KV<Id, Id>,
    aggregate_inner: KV<Id, Id>,

    // the aggregate grouping is determined by binding outer fields to inner fields
    // bound fields can optionally be passed to the aggregate primitive as arguments
    aggregate_outerfield_binding: KKV<Id, Id, Id>,
    binding_innerfield: KV<Id, Id>,
    binding_primitivefield: KV<Id, ID>,

    // primitives are used to access built-in operations
    primitive: K<Id>,

    // constant references just refer to some value
    reference_value: KV<Id, Value>,

    // field references refer to a field in either a source (for join) or TODO
    reference_field: KV<Id, Id>,
    reference_source: KV<Id, Id>,

    // things that live in an ordered list are sorted by some f64
    thing_order: KV<Id, f64>,

    // things can have human readable names
    thing_name: KV<Id, String>,

    // TODO functions
    // TODO function and aggregate arguments (FieldKind?)
    // TODO select
    // TODO union
    // TODO negate
}

enum ViewKind {
    Table, // a view which can depend on the past
    Query, // a wrapper around some workspace full of views
    Join, // take the product of multiple views and filter the results
    Union, // take the union of multiple views
    Aggregate, // group one view by the contents of another and run some primitive on the groups
}

enum ConstraintOperation {
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
}

enum PrimitiveKind {
    Function,
    Aggregate,
}