use std::collections::BTreeSet;

use value::Value;
use relation::{Relation, IndexSelect, ViewSelect};
use primitive::{Primitive, resolve_as_scalar};
use std::cmp::{min, max, Ordering};

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Option<IndexSelect>,
    pub remove: Option<IndexSelect>,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub selects: Vec<IndexSelect>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConstraintOp {
    EQ,
    NEQ,
    LT,
    GT,
    LTE,
    GTE,
}

#[derive(Clone, Debug)]
pub struct Constraint {
    pub left: usize,
    pub op: ConstraintOp,
    pub right: usize,
}

impl Constraint {
    fn is_satisfied_by(&self, state: &[&Value]) -> bool {
        match self.op {
            ConstraintOp::EQ => state[self.left] == state[self.right],
            ConstraintOp::NEQ => state[self.left] != state[self.right],
            ConstraintOp::LT => state[self.left] < state[self.right],
            ConstraintOp::GT => state[self.left] > state[self.right],
            ConstraintOp::LTE => state[self.left] <= state[self.right],
            ConstraintOp::GTE => state[self.left] >= state[self.right],
        }
    }
}

#[derive(Clone, Debug)]
pub enum JoinSource {
    Relation{
        input: usize
    },
    Primitive{
        primitive: Primitive,
        arguments: Vec<usize>,
    },
}

#[derive(Clone, Debug)]
pub struct Join {
    pub constants: Vec<Value>,
    pub sources: Vec<JoinSource>,
    pub constraints: Vec<Vec<Constraint>>,
    pub select: ViewSelect,
    pub join2: Join2,
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
    pub constraint_bindings: Vec<(usize, usize)>,
    pub output_bindings: Vec<(usize, usize)>,
}

#[derive(Clone, Debug)]
pub struct Join2 {
    pub constants: Vec<Value>,
    pub sources: Vec<Source>,
    pub select: ViewSelect,
}

#[derive(Clone, Debug)]
pub struct Reducer {
    pub primitive: Primitive,
    pub arguments: Vec<usize>,
}

#[derive(Clone, Debug, Copy)]
pub enum Direction {
    Ascending,
    Descending,
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
    Join2(Join2),
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

fn join_step<'a>(join: &'a Join, ix: usize, inputs: &[&'a Relation], state: &mut Vec<&'a Value>, index: &mut BTreeSet<Vec<Value>>) {
    if ix == join.sources.len() {
        index.insert(join.select.select(&state[..]));
    } else {
        match join.sources[ix] {
            JoinSource::Relation{input} => {
                for values in inputs[input].index.iter() {
                    push_all(state, values);
                    if join.constraints[ix].iter().all(|constraint| constraint.is_satisfied_by(&state[..])) {
                        join_step(join, ix+1, inputs, state, index)
                    }
                    pop_all(state, values);
                }
            }
            JoinSource::Primitive{ref primitive, ref arguments, ..} => {
                for values in primitive.eval_from_join(&arguments[..], &state[..]).into_iter() {
                    // promise the borrow checker that we will pop values before we exit this scope
                    // TODO this is not panic-safe - we should use CowString in Value instead
                    let values = unsafe { ::std::mem::transmute::<&Vec<Value>, &'a Vec<Value>>(&values) };
                    push_all(state, values);
                    if join.constraints[ix].iter().all(|constraint| constraint.is_satisfied_by(&state[..])) {
                        join_step(join, ix+1, inputs, state, index)
                    }
                    pop_all(state, values);
                }
            }
        }
    }
}

fn join_step2<'a>(join: &'a Join2, ix: usize, inputs: &[&'a Relation], state: &mut Vec<&'a Value>, index: &mut BTreeSet<Vec<Value>>) {
    if ix == join.sources.len() {
        index.insert(join.select.select(&state[..]));
    } else {
        let source = &join.sources[ix];
        match source.input {
            Input::View{input_ix} => {
                for values in inputs[input_ix].index.iter() {
                    if source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        *state[variable_ix] == values[field_ix]
                    ) {
                        for &(field_ix, variable_ix) in source.output_bindings.iter() {
                            state[variable_ix] = &values[field_ix];
                        }
                        join_step2(join, ix+1, inputs, state, index);
                    }
                }
            }
            Input::Primitive{primitive, ref input_bindings} => {
                // values returned from primitives don't include inputs, so we will have to offset accesses by input_len
                let input_len = input_bindings.len();
                for values in primitive.eval_from_join2(&input_bindings[..], &state[..]).into_iter() {
                    // promise the borrow checker that we wont read these values after exiting this scope
                    // TODO this is not panic-safe - we should use CowString in Value instead
                    let values = unsafe { ::std::mem::transmute::<&Vec<Value>, &'a Vec<Value>>(&values) };
                    if source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        *state[variable_ix] == values[field_ix - input_len]
                    ) {
                        for &(field_ix, variable_ix) in source.output_bindings.iter() {
                            state[variable_ix] = &values[field_ix - input_len];
                        }
                        join_step2(join, ix+1, inputs, state, index);
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
    pub fn run(&self, old_output: &Relation, inputs: &[&Relation]) -> Option<Relation> {
        let mut output = Relation::new(
            old_output.view.clone(),
            old_output.fields.clone(),
            old_output.names.clone()
            );
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), inputs.len());
                for select in union.selects.iter() {
                    for values in select.select(&inputs[..]) {
                        output.index.insert(values);
                    }
                }
                Some(output)
            }
            View::Join(ref join) => {
                let mut state = join.constants.iter().collect();
                join_step(join, 0, inputs, &mut state, &mut output.index);
                let output2 = {
                    let mut output = Relation::new(
                        old_output.view.clone(),
                        old_output.fields.clone(),
                        old_output.names.clone()
                        );
                    let mut state = join.join2.constants.iter().collect();
                    join_step2(&join.join2, 0, inputs, &mut state, &mut output.index);
                    output
                };
                if output.index != output2.index {
                    println!("Failed for:");
                    println!("{:#?}", join);
                    println!("{:#?}", output);
                    println!("{:#?}", output2);
                }
                Some(output)
            }
            View::Join2(ref join) => {
                let mut state = join.constants.iter().collect();
                join_step2(join, 0, inputs, &mut state, &mut output.index);
                Some(output)
            }
            View::Aggregate(ref aggregate) => {
                let mut outer = aggregate.outer.select(&inputs[..]);
                let mut inner = aggregate.inner.select(&inputs[..]);
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