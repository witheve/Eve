use std::collections::btree_set;
use std::collections::btree_set::BTreeSet;
use std::iter::Iterator;
use std::cmp::Ordering;
use std::ops::IndexMut;

use value::{Value, Field, Tuple};

pub fn mapping(from_fields: &[Field], to_fields: &[Field]) -> Option<Vec<usize>> {
    let mut mapping = Vec::with_capacity(to_fields.len());
    for to_field in to_fields.iter() {
        match from_fields.iter().position(|from_field| from_field == to_field) {
            Some(ix) => mapping.push(ix),
            None => return None,
        }
    }
    return Some(mapping);
}

pub fn with_mapping(mut values: Vec<Value>, mapping: &[usize]) -> Vec<Value> {
    mapping.iter().map(|ix|
        ::std::mem::replace(values.index_mut(*ix), Value::Null)
        ).collect()
}

#[derive(Clone, Debug)]
pub struct Relation {
    pub fields: Vec<Field>,
    pub names: Vec<String>,
    pub index: BTreeSet<Vec<Value>>,
}

#[derive(Clone, Debug)]
pub struct Change {
    pub fields: Vec<Field>,
    pub insert: Vec<Vec<Value>>,
    pub remove: Vec<Vec<Value>>,
}

impl Relation {
    pub fn with_fields(fields: Vec<Field>, names: Vec<String>) -> Self {
        Relation{
            fields: fields,
            names: names,
            index: BTreeSet::new(),
        }
    }

    pub fn change(&mut self, changes: Change) {
        let mapping = mapping(&*changes.fields, &*self.fields).unwrap();
        for values in changes.insert.into_iter() {
            self.index.insert(with_mapping(values, &*mapping));
        }
        for values in changes.remove.into_iter() {
            self.index.remove(&with_mapping(values, &*mapping));
        }
    }

    pub fn as_insert(&self) -> Change {
        Change{
            fields: self.fields.clone(),
            insert: self.index.iter().map(|values| values.clone()).collect(),
            remove: Vec::new(),
        }
    }

    pub fn as_remove(&self) -> Change {
        Change{
            fields: self.fields.clone(),
            insert: Vec::new(),
            remove: self.index.iter().map(|values| values.clone()).collect(),
        }
    }

    pub fn change_from(&self, other: &Self) -> Change {
        assert_eq!(self.fields, other.fields);
        let mut befores = other.index.iter();
        let mut afters = self.index.iter();
        let mut before_opt = befores.next();
        let mut after_opt = afters.next();
        let mut insert = Vec::new();
        let mut remove = Vec::new();
        loop {
            match (before_opt, after_opt) {
                (None, None) => {
                    break;
                }
                (Some(before), None) => {
                    remove.push(before.clone());
                    before_opt = befores.next();
                }
                (None, Some(after)) => {
                    insert.push(after.clone());
                    after_opt = afters.next();
                }
                (Some(before), Some(after)) => {
                    match before.cmp(after) {
                        Ordering::Less => {
                            remove.push(before.clone());
                            before_opt = befores.next();
                        }
                        Ordering::Greater => {
                            insert.push(after.clone());
                            after_opt = afters.next();
                        }
                        Ordering::Equal => {
                            before_opt = befores.next();
                            after_opt = afters.next();
                        }
                    }
                }
            }
        }
        Change{fields: self.fields.clone(), insert: insert, remove: remove}
    }

    pub fn find_maybe(&self, name: &str, value: &Value) -> Option<Tuple> {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        self.index.iter().find(|values| values[ix] == *value).map(|values|
            Tuple{fields: &self.fields[..], names: &self.names[..], values: &values[..]}
            )
    }

    pub fn find_one(&self, name: &str, value: &Value) -> Tuple {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        let values = self.index.iter().find(|values| values[ix] == *value).unwrap();
        Tuple{fields: &self.fields[..], names: &self.names[..], values: &values[..]}
    }

    pub fn find_all(&self, name: &str, value: &Value) -> Vec<Tuple> {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        self.index.iter().filter(|values| values[ix] == *value)
            .map(|values| Tuple{fields: &self.fields[..], names: &self.names[..], values: &values[..]})
            .collect()
    }

    pub fn iter(&self) -> Iter {
        Iter{fields: &self.fields[..], names: &self.names[..], iter: self.index.iter()}
    }
}

pub struct Iter<'a> {
    fields: &'a [Field],
    names: &'a [String],
    iter: btree_set::Iter<'a, Vec<Value>>,
}

impl<'a> Iterator for Iter<'a> {
    type Item = Tuple<'a>;
    fn next(&mut self) -> Option<Tuple<'a>> {
        match self.iter.next() {
            None => None,
            Some(values) => Some(Tuple{fields: self.fields, names: self.names, values: &values[..]}),
        }
    }
}

#[derive(Clone, Debug)]
pub struct SingleSelect{
    pub source: usize,
    pub mapping: Vec<usize>,
    pub fields: Vec<Field>, // TODO remove when reference reform is done
}

impl SingleSelect {
    pub fn select(&self, inputs: &[&Relation]) -> Vec<Vec<Value>> {
        let relation = inputs[self.source];
        relation.index.iter().map(|values| with_mapping(values.clone(), &self.mapping[..])).collect()
    }
}

#[derive(Clone, Debug)]
pub enum Reference {
    Constant{value: Value},
    Variable{source: usize, field: Field}
}

impl Reference {
    pub fn resolve<'a>(&'a self, inputs: &'a [Tuple<'a>]) -> &Value {
        match *self {
            Reference::Constant{ref value} => value,
            Reference::Variable{source, ref field} => &inputs[source].field(&field[..]),
        }
    }
}

#[derive(Clone, Debug)]
pub struct MultiSelect{
    pub references: Vec<Reference>,
}

impl MultiSelect {
    pub fn select(&self, inputs: &[Tuple]) -> Vec<Value> {
        self.references.iter().map(|reference| reference.resolve(inputs).clone()).collect()
    }
}