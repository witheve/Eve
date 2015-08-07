use std::collections::BTreeSet;

use value::{Value, Id};
use relation::{Relation, IndexSelect};
use primitive::{Primitive};
use std::cmp::Ordering;
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
    pub id: Id, // used for reporting errors
    pub input: Input,
    pub grouped_fields: Vec<usize>,
    pub sorted_fields: Vec<(usize, Direction)>,
    pub chunked: bool,
    pub negated: bool,
    pub constraint_bindings: Vec<(usize, usize)>,
    pub output_bindings: Vec<(usize, usize)>,
}

impl Source {
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

#[derive(Clone, Debug)]
pub struct Join {
    pub constants: Vec<Value>,
    pub sources: Vec<Source>,
    pub select: Vec<usize>,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
    Union(Union),
    Join(Join),
}

// TODO this algorithm is incredibly naive and also clones excessively
fn join_step(join: &Join, ix: usize, inputs: &[Vec<Vec<Value>>], state: &mut Vec<Value>, index: &mut BTreeSet<Vec<Value>>, errors: &mut Vec<Vec<Value>>) {
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
                    let satisfies_constraints = source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == values[field_ix]
                        );
                    match (source.negated, satisfies_constraints) {
                            (false, false) => (), // skip row
                            (false, true) => join_step(join, ix+1, inputs, state, index, errors), // choose row and continue
                            (true, false) => (), // skip row
                            (true, true) => return, // bail out
                    }
                }
                if source.negated {
                    // if we haven't bailed out yet, continue
                    join_step(join, ix+1, inputs, state, index, errors);
                }
            }
            Input::Primitive{primitive, ref input_bindings} => {
                // values returned from primitives don't include inputs, so we will have to offset accesses by input_len
                let input_len = input_bindings.len();
                for mut values in primitive.eval(&input_bindings[..], &state[..], &source.id, errors).into_iter() {
                    for &(field_ix, variable_ix) in source.output_bindings.iter() {
                        state[variable_ix] = replace(&mut values[field_ix - input_len], Value::Null);
                    }
                    if source.constraint_bindings.iter().all(|&(field_ix, variable_ix)|
                        state[variable_ix] == values[field_ix - input_len]
                    ) {
                        join_step(join, ix+1, inputs, state, index, errors);
                    }
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
                join_step(join, 0, &inputs[..], &mut state, &mut output.index, errors);
                Some(output)
            }
        }
    }
}