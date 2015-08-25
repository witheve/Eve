use std::collections::BTreeSet;

use value::{Value, Id};
use relation::{Relation};
use primitive::{Primitive};
use std::cmp::Ordering;
use std::mem::replace;

// Every non-primitive view in Eve is one of...
#[derive(Clone, Debug)]
pub enum View {
    Table, // stateful - currently can only be mutated from the outside world, not from Eve code
    Union(Union), // a union of zero or more other views - not fully implemented yet
    Join(Join), // a constrained join of zero or more other views
    Disabled, // triggered a compiler error and is frozen until fixed
}

#[derive(Clone, Debug)]
pub struct Member {
    pub input_ix: usize,
    pub mapping: Vec<usize>,
    pub negated: bool,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub members: Vec<Member>,
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
        input_bindings: Vec<(usize, usize)>, // (field_ix, variable_ix)
    },
    View{
        input_ix: usize,
    },
}

#[derive(Clone, Debug)]
pub struct Join {
    pub constants: Vec<Value>,
    pub sources: Vec<Source>,
    pub select: Vec<usize>, // variable_ix
}

#[derive(Clone, Debug)]
pub struct Source {
    pub id: Id, // used for reporting errors
    pub input: Input,
    pub grouped_fields: Vec<usize>, // field_ix
    pub sorted_fields: Vec<(usize, Direction)>, // field_ix
    pub chunked: bool,
    pub negated: bool,
    pub constraint_bindings: Vec<(usize, usize)>, // (field_ix, variable_ix)
    pub output_bindings: Vec<(usize, usize)>, // (field_ix, variable_ix)
}

impl Source {
    // Handles grouping, sorting and ordinals
    fn prepare(&self, mut rows: Vec<Vec<Value>>) -> Vec<Vec<Value>> {
        // TODO compensate for inputs if primitive

        // sort rows by self.grouped_fields and self.sorted_fields
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

        // group rows by self.grouped_fields
        let mut rows_iter = rows.into_iter();
        let mut groups = Vec::new();
        match rows_iter.next() {
            Some(row) => {
                let mut group = vec![row];
                for row in rows_iter {
                    if self.grouped_fields.iter().any(|&ix| row[ix] != group[0][ix]) {
                        groups.push(group);
                        group = vec![];
                    }
                    group.push(row);
                }
                groups.push(group);
            }
            None => ()
        }

        // collapse groups if self.chunked
        if self.chunked {
            let mut chunk_group = vec![];
            for group in groups.drain(..) {
                let mut chunk = vec![Value::Column(vec![]); group[0].len()];
                for mut row in group.into_iter() {
                    for &ix in self.grouped_fields.iter() {
                        chunk[ix] = replace(&mut row[ix], Value::Null);
                    }
                    for &(ix, _) in self.sorted_fields.iter() {
                        chunk[ix].as_column_mut().push(replace(&mut row[ix], Value::Null));
                    }
                }
                chunk_group.push(chunk);
            }
            groups.push(chunk_group);
        }

        // append ordinals
        for group in groups.iter_mut() {
            for (ordinal, row) in group.iter_mut().enumerate() {
                row.push(Value::Float((ordinal + 1) as f64));
            }
        }

        // flatten groups
        groups.into_iter().flat_map(|group| group).collect()
    }
}

// Naive backtracking search
// TODO this algorithm is incredibly naive and also clones excessively
//      will be replaced by something smarted when the language settles down
fn join_step(join: &Join, ix: usize, inputs: &[Vec<Vec<Value>>], state: &mut Vec<Value>, index: &mut BTreeSet<Vec<Value>>, errors: &mut Vec<Vec<Value>>) {
    if ix == join.sources.len() {
        // done, push the result
        index.insert(join.select.iter().map(|ix| state[*ix].clone()).collect());
    } else {
        let source = &join.sources[ix];
        match source.input {
            Input::View{..} => {
                // grab rows from the input view
                for row in inputs[ix].iter() {
                    // write variables which are bound for the first time
                    for &(field_ix, variable_ix) in source.output_bindings.iter() {
                        state[variable_ix] = row[field_ix].clone();
                    }
                    // check equality for variables which were bound by a previous source
                    let satisfies_constraints = source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == row[field_ix]
                        );
                    match (source.negated, satisfies_constraints) {
                            (false, false) => (), // skip row
                            (false, true) => join_step(join, ix+1, inputs, state, index, errors), // choose row and continue
                            (true, false) => (), // skip row
                            (true, true) => return, // backtrack
                    }
                }
                if source.negated {
                    // if we haven't backtracked yet, continue once
                    join_step(join, ix+1, inputs, state, index, errors);
                }
            }
            Input::Primitive{primitive, ref input_bindings} => {
                // NOTE rows returned from primitives don't include inputs, so we have to offset accesses by input_len
                let input_len = input_bindings.len();
                // call the primitive
                for mut row in primitive.eval(&input_bindings[..], &state[..], &source.id, errors).into_iter() {
                    // write variables which are bound for the first time
                    for &(field_ix, variable_ix) in source.output_bindings.iter() {
                        state[variable_ix] = replace(&mut row[field_ix - input_len], Value::Null);
                    }
                    // check equality for variables which were bound by a previous source
                    let satisfies_constraints = source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == row[field_ix - input_len]
                        );
                    if satisfies_constraints {
                        // continue
                        join_step(join, ix+1, inputs, state, index, errors);
                    } // else backtrack
                }
            }
        }
    }
}

impl View {
    pub fn run(&self, old_output: &Relation, upstream: &[&Relation], errors: &mut Vec<Vec<Value>>) -> Option<Relation> {
        let mut output = Relation::new(
            old_output.view.clone(),
            old_output.fields.clone(),
            old_output.names.clone()
            );
        match *self {
            View::Table => None,
            View::Union(ref union) => {
                assert_eq!(union.members.len(), upstream.len());
                for member in union.members.iter() {
                    for old_row in upstream[member.input_ix].index.iter() {
                        let new_row = member.mapping.iter().map(|ix| old_row[*ix].clone()).collect();
                        if member.negated {
                            output.index.remove(&new_row);
                        } else {
                            output.index.insert(new_row);
                        }
                    }
                }
                Some(output)
            }
            View::Join(ref join) => {
                let mut state = join.constants.clone();
                // prepare any non-primitive upstream relations
                let inputs = join.sources.iter().map(|source|
                    match source.input {
                        Input::Primitive{..} => {
                            vec![]
                        }
                        Input::View{input_ix, ..} => {
                            source.prepare(upstream[input_ix].index.iter().map(|row| row.clone()).collect())
                        }
                    }).collect::<Vec<_>>();
                if inputs.len() > 0 {
                    join_step(join, 0, &inputs[..], &mut state, &mut output.index, errors);
                }
                Some(output)
            }
            View::Disabled => None,
        }
    }
}