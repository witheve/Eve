use std::collections::BTreeSet;

use value::{Value, Field, Tuple};
use relation::{Relation, SingleSelect, Reference, MultiSelect};
use primitive::Primitive;

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Option<SingleSelect>,
    pub remove: Option<SingleSelect>,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub selects: Vec<SingleSelect>,
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
    pub left: Reference,
    pub op: ConstraintOp,
    pub right: Reference,
}

impl Constraint {
    fn is_satisfied_by(&self, tuples: &[Tuple]) -> bool {
        let left = self.left.resolve(tuples);
        let right = self.right.resolve(tuples);
        match self.op {
            ConstraintOp::EQ => left == right,
            ConstraintOp::NEQ => left != right,
            ConstraintOp::LT => left < right,
            ConstraintOp::GT => left > right,
            ConstraintOp::LTE => left <= right,
            ConstraintOp::GTE => left >= right,
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
        arguments: Vec<Reference>,
        fields: Vec<Field>,
        // TODO `fields` is here just to hack a Tuple in - will go away when we stop using Tuple
    },
}

#[derive(Clone, Debug)]
pub struct Join {
    pub sources: Vec<JoinSource>,
    pub constraints: Vec<Vec<Constraint>>,
    pub select: MultiSelect,
}

#[derive(Clone, Debug)]
pub struct Reducer {
    primitive: Primitive,
    arguments: Vec<Reference>,
    fields: Vec<Field>,
    // TODO `fields` is here just to hack a Tuple in - will go away when we stop using Tuple
}

#[derive(Clone, Debug)]
pub struct Aggregate {
    pub outer: SingleSelect,
    pub inner: SingleSelect,
    pub limit_from: Option<Reference>,
    pub limit_to: Option<Reference>,
    pub reducers: Vec<Reducer>,
    pub select: MultiSelect,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
    Union(Union),
    Join(Join),
    Aggregate(Aggregate),
}

fn join_step<'a>(join: &'a Join, inputs: &[&'a Relation], tuples: &mut Vec<Tuple<'a>>, index: &mut BTreeSet<Vec<Value>>) {
    let ix = tuples.len();
    if ix == join.sources.len() {
        index.insert(join.select.select(&tuples[..]));
    } else {
        match join.sources[ix] {
            JoinSource::Relation{input} => {
                for tuple in inputs[input].iter() {
                    tuples.push(tuple);
                    if join.constraints[ix].iter().all(|constraint| constraint.is_satisfied_by(&tuples[..])) {
                        join_step(join, inputs, tuples, index)
                    }
                    tuples.pop();
                }
            }
            JoinSource::Primitive{ref primitive, ref arguments, ref fields} => {
                let output = {
                    let arguments = arguments.iter().map(|reference|
                        reference.resolve(&tuples[..])
                        ).collect::<Vec<_>>();
                    primitive.eval(&arguments[..])
                };
                for values in output.into_iter() {
                    let tuple = Tuple{fields: &fields[..], names: &fields[..], values: &values[..]};
                    // promise the borrow checker that we will pop `tuple` before leaving this scope
                    let tuple = unsafe{ ::std::mem::transmute::<Tuple, Tuple<'a>>(tuple) };
                    tuples.push(tuple);
                    if join.constraints[ix].iter().all(|constraint| constraint.is_satisfied_by(&tuples[..])) {
                        join_step(join, inputs, tuples, index)
                    }
                    tuples.pop();
                }

            }
        }
    }
}

impl View {
    pub fn run(&self, old_output: &Relation, inputs: &[&Relation]) -> Option<Relation> {
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), inputs.len());
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                for select in union.selects.iter() {
                    for values in select.select(&inputs[..]) {
                        output.index.insert(values);
                    }
                }
                Some(output)
            }
            View::Join(ref join) => {
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                let mut tuples = Vec::with_capacity(join.sources.len());
                join_step(join, inputs, &mut tuples, &mut output.index);
                Some(output)
            }
            View::Aggregate(ref aggregate) => {
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                let mut outer = aggregate.outer.select(&inputs[..]);
                let mut inner = aggregate.inner.select(&inputs[..]);
                outer.sort();
                outer.dedup();
                inner.sort();
                let mut group_start = 0;
                for outer_values in outer.iter() {
                    let mut group_end = group_start;
                    while (group_end < inner.len())
                    && (inner[group_end][0..outer_values.len()] == outer_values[..]) {
                        group_end += 1;
                    }
                    let outer_tuple = Tuple{
                        fields: &aggregate.outer.fields[..],
                        names: &aggregate.outer.fields[..],
                        values: &outer_values[..]
                    };
                    let inputs = &[outer_tuple];
                    let limit_from = match aggregate.limit_from {
                        None => group_start,
                        Some(ref reference) => group_start + reference.resolve(inputs).as_usize(),
                    };
                    let limit_to = match aggregate.limit_to {
                        None => group_end,
                        Some(ref reference) => group_start + reference.resolve(inputs).as_usize(),
                    };
                    let limit_from = ::std::cmp::min(::std::cmp::max(limit_from, group_start), group_end);
                    let limit_to = ::std::cmp::min(::std::cmp::max(limit_to, limit_from), group_end);
                    for inner_values in &inner[limit_from..limit_to] {
                        let inner_tuple = Tuple{
                            fields: &aggregate.inner.fields[..],
                            names: &aggregate.inner.fields[..],
                            values: &inner_values[..]
                        };
                        output.index.insert(aggregate.select.select(&[inner_tuple]));
                    }
                    group_start = group_end;
                }
                Some(output)
            }
        }
    }
}