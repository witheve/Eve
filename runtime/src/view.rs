use std::collections::BTreeSet;

use value::Value;
use relation::{Relation, IndexSelect, ViewSelect};
use primitive::{Primitive, resolve_as_scalar};
use std::cmp::{min, max, Ordering};
use std::mem::replace;

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Option<IndexSelect>,
    pub remove: Option<IndexSelect>,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub selects: Vec<IndexSelect>,
}

#[derive(Clone, Debug, Copy)]
pub enum Direction {
    Ascending,
    Descending,
}

#[derive(Clone, Debug)]
pub enum Input {
    Primitive{
        primitive: Primitive,
        input_bindings: Vec<(usize, usize)>,
    },
    View{
        input_ix: usize,
    },
}

#[derive(Clone, Debug)]
pub struct Source {
    pub input: Input,
    pub grouped_fields: Vec<usize>,
    pub sorted_fields: Vec<(usize, Direction)>,
    pub chunked: bool,
    pub constraint_bindings: Vec<(usize, usize)>,
    pub output_bindings: Vec<(usize, usize)>,
}

impl Source {
    fn prepare(&self, mut rows: Vec<Vec<Value>>) -> Vec<Vec<Value>> {
        // TODO compensate for inputs if primitive
        rows.sort_by(|a, b| {
            for &ix in self.grouped_fields.iter() {
                match a[ix].cmp(&b[ix]) {
                    Ordering::Greater => return Ordering::Greater,
                    Ordering::Less => return Ordering::Less,
                    Ordering::Equal => ()
                }
            }
            for &(ix, direction) in self.sorted_fields.iter() {
                match (a[ix].cmp(&b[ix]), direction) {
                    (Ordering::Greater, Direction::Ascending) => return Ordering::Greater,
                    (Ordering::Greater, Direction::Descending) => return Ordering::Less,
                    (Ordering::Less, Direction::Ascending) => return Ordering::Less,
                    (Ordering::Less, Direction::Descending) => return Ordering::Greater,
                    (Ordering::Equal, _) => ()
                }
            }
            return Ordering::Equal;
        });


        if self.chunked {
            // if the source is chunked, we need to turn all of the fields into columns for each grouping
            // we want the grouped fields to be scalars so that they can be joined against and every other
            // field should be a column of the values for that group
            let mut groups = Vec::new();
            let mut ordinal = 0;
            let grouped_fields = &self.grouped_fields;
            let row_len = rows.iter().next().map_or(0, |row| row.len());
            let ungrouped_fields = &(0..row_len).filter(|field_ix| !self.grouped_fields.contains(field_ix)).collect::<Vec<usize>>();
            let mut group: Vec<Value> = vec![Value::Column(vec![]); row_len]; // this creates a vector of the given length with all the values set to Value::Null
            for mut row in rows.into_iter() {
                // check if this is a new group
                let is_new_group = match self.grouped_fields.len() {
                    0 => false,
                    _ => !self.grouped_fields.iter().all(|&ix| row[ix] == group[ix])
                };
                if is_new_group {
                    // add the current ordinal to the group
                    group.push(Value::Float(ordinal as f64));
                    // push the old group
                    groups.push(group);
                    // create a new group with every field being a column
                    ordinal += 1;
                    group = vec![Value::Column(vec![]); row_len];
                    // any grouped field should have a scalar value for its index so that it can be joined on
                    // e.g. ["foo", [..], [..]] if you've grouped on index 0
                    for &grouped_field_ix in grouped_fields {
                        group[grouped_field_ix] = row[grouped_field_ix].clone();
                    }
                }
                // add the fields for this row
                for &field_ix in ungrouped_fields {
                    group[field_ix].as_column_mut().push(row[field_ix].clone());
                }
            }
            group.push(Value::Float(ordinal as f64));
            groups.push(group);
            // if there are grouped fields then the first group is the initial placeholder and
            // should be removed
            if self.grouped_fields.len() > 0 {
                groups.remove(0);
            }
            groups
        } else {
            // in the case where the source is not chunked all we need to worry about is setting the ordinal correctly
            // if there are no groups, then this is just normal rows and we number them monotonically
            // if there are groups, each new group resets the ordinal to 1
            let otherwise = vec![];
            let mut groups = Vec::new();
            let mut ordinal = 1;
            let mut prev_row = rows.iter().next().map_or(otherwise, |row| row.clone());
            for mut row in rows.into_iter() {
                let is_new_group = match self.grouped_fields.len() {
                    0 => false,
                    _ => !self.grouped_fields.iter().all(|&ix| row[ix] == prev_row[ix])
                };
                if is_new_group {
                    ordinal = 1;
                    prev_row = row.clone(); // @TODO: is there a way to do this without having to clone it?
                }
                row.push(Value::Float(ordinal as f64));
                groups.push(row);
                ordinal += 1;
            }
            groups
        }
    }
}

#[derive(Clone, Debug)]
pub struct Join {
    pub constants: Vec<Value>,
    pub sources: Vec<Source>,
    pub select: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct Reducer {
    pub primitive: Primitive,
    pub arguments: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct Aggregate {
    pub constants: Vec<Value>,
    pub outer: IndexSelect,
    pub inner: IndexSelect,
    pub directions: Vec<Direction>,
    pub limit_from: Option<usize>,
    pub limit_to: Option<usize>,
    pub reducers: Vec<Reducer>,
    pub selects_inner: bool,
    pub select: ViewSelect,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
    Union(Union),
    Join(Join),
    Aggregate(Aggregate),
}

fn push_all<'a>(state: &mut Vec<&'a Value>, input: &'a Vec<Value>) {
    for value in input.iter() {
        state.push(value);
    }
}

fn pop_all<'a>(state: &mut Vec<&'a Value>, input: &'a Vec<Value>) {
    for _ in input.iter() {
        state.pop();
    }
}

// TODO this algorithm is incredibly naive and also clones excessively
fn join_step(join: &Join, ix: usize, inputs: &[Vec<Vec<Value>>], state: &mut Vec<Value>, index: &mut BTreeSet<Vec<Value>>) {
    if ix == join.sources.len() {
        index.insert(join.select.iter().map(|ix| state[*ix].clone()).collect());
    } else {
        let source = &join.sources[ix];
        match source.input {
            Input::View{..} => {
                for values in inputs[ix].iter() {
                    for &(field_ix, variable_ix) in source.output_bindings.iter() {
                        state[variable_ix] = values[field_ix].clone();
                    }
                    if source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == values[field_ix]
                    ) {
                        join_step(join, ix+1, inputs, state, index);
                    }
                }
            }
            Input::Primitive{primitive, ref input_bindings} => {
                // values returned from primitives don't include inputs, so we will have to offset accesses by input_len
                let input_len = input_bindings.len();
                for mut values in primitive.eval_from_join(&input_bindings[..], &state[..]).into_iter() {
                    for &(field_ix, variable_ix) in source.output_bindings.iter() {
                        state[variable_ix] = replace(&mut values[field_ix - input_len], Value::Null);
                    }
                    if source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == values[field_ix - input_len]
                    ) {
                        join_step(join, ix+1, inputs, state, index);
                    }
                }
            }
        }
    }
}

fn aggregate_step<'a>(aggregate: &Aggregate, input_sets: &'a [&[Vec<Value>]], state: &mut Vec<&'a Value>, index: &mut BTreeSet<Vec<Value>>) {
    if input_sets.len() == 0 {
        index.insert(aggregate.select.select(&state[..]));
    } else {
        for values in input_sets[0].iter() {
            push_all(state, values);
            aggregate_step(aggregate, &input_sets[1..], state, index);
            pop_all(state, values);
        }
    }
}

fn compare_in_direction(xs: &[Value], ys: &[Value], directions: &[Direction]) -> Ordering {
    for ((x,y), direction) in xs.iter().zip(ys.iter()).zip(directions.iter()) {
        let cmp = match *direction {
            Direction::Ascending => x.cmp(y),
            Direction::Descending => y.cmp(x),
        };
        match cmp {
            Ordering::Greater => return Ordering::Greater,
            Ordering::Equal => (),
            Ordering::Less => return Ordering::Less,
        };
    }
    return Ordering::Equal;
}

impl View {
    pub fn run(&self, old_output: &Relation, upstream: &[&Relation]) -> Option<Relation> {
        let mut output = Relation::new(
            old_output.view.clone(),
            old_output.fields.clone(),
            old_output.names.clone()
            );
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), upstream.len());
                for select in union.selects.iter() {
                    for values in select.select(&upstream[..]) {
                        output.index.insert(values);
                    }
                }
                Some(output)
            }
            View::Join(ref join) => {
                let mut state = join.constants.clone();
                let inputs = join.sources.iter().map(|source|
                    match source.input {
                        Input::Primitive{..} => {
                            vec![]
                        }
                        Input::View{input_ix, ..} => {
                            source.prepare(upstream[input_ix].index.iter().map(|row| row.clone()).collect())
                        }
                    }).collect::<Vec<_>>();
                join_step(join, 0, &inputs[..], &mut state, &mut output.index);
                Some(output)
            }
            View::Aggregate(ref aggregate) => {
                let mut outer = aggregate.outer.select(&upstream[..]);
                let mut inner = aggregate.inner.select(&upstream[..]);
                outer.sort_by(|a,b| compare_in_direction(&a[..], &b[..], &aggregate.directions[..]));
                outer.dedup();
                inner.sort_by(|a,b| compare_in_direction(&a[..], &b[..], &aggregate.directions[..]));
                let constants = &aggregate.constants[..];
                let mut group_start = 0;
                for outer_values in outer.into_iter() {
                    let mut group_end = group_start;
                    while (group_end < inner.len())
                    && (inner[group_end][0..outer_values.len()] == outer_values[..]) {
                        group_end += 1;
                    }
                    let (group, output_values) = {
                        let limit_from = match aggregate.limit_from {
                            None => group_start,
                            Some(ix) => group_start
                                + resolve_as_scalar(ix, constants, &outer_values[..]).as_usize(),
                        };
                        let limit_to = match aggregate.limit_to {
                            None => group_end,
                            Some(ix) => group_start
                                + resolve_as_scalar(ix, constants, &outer_values[..]).as_usize(),
                        };
                        let limit_from = min(max(limit_from, group_start), group_end);
                        let limit_to = min(max(limit_to, limit_from), group_end);
                        let group = &inner[limit_from..limit_to];
                        let output_values = aggregate.reducers.iter().map(|reducer| {
                            reducer.primitive.eval_from_aggregate(&reducer.arguments[..], constants, &outer_values[..], group)
                        }).collect::<Vec<_>>();
                        (group, output_values)
                    };
                    let mut output_sets = vec![];
                    let null = Value::Null;
                    let mut state = constants.iter().chain(outer_values.iter()).collect::<Vec<_>>();
                    if aggregate.selects_inner {
                        output_sets.push(group);
                    } else {
                        // nasty hack - fill null values for inner so that the ixes work out right
                        for _ in aggregate.inner.mapping.iter() {
                            state.push(&null);
                        }
                    }
                    for output in output_values.iter() {
                        output_sets.push(output);
                    }
                    aggregate_step(aggregate, &output_sets[..], &mut state, &mut output.index);
                    group_start = group_end;
                }
                Some(output)
            }
        }
    }
}