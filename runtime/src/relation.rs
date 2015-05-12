use std::collections::btree_set;
use std::collections::btree_set::BTreeSet;
use std::iter::Iterator;
use std::cmp::Ordering;

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

pub fn with_mapping(values: &[Value], mapping: &[usize]) -> Vec<Value> {
    mapping.iter().map(|ix|
        values[*ix].clone()
        ).collect()
}

#[derive(Clone, Debug)]
pub struct Relation {
    pub fields: Vec<Field>,
    pub index: BTreeSet<Vec<Value>>,
}

#[derive(Clone, Debug)]
pub struct Change {
    pub fields: Vec<Field>,
    pub insert: Vec<Vec<Value>>,
    pub remove: Vec<Vec<Value>>,
}

impl Relation {
    pub fn with_fields(fields: Vec<Field>) -> Self {
        Relation{
            fields: fields,
            index: BTreeSet::new(),
        }
    }

    pub fn change(&mut self, changes: &Change) {
        let mapping = mapping(&*changes.fields, &*self.fields).unwrap();
        for values in changes.insert.iter() {
            self.index.insert(with_mapping(&values, &*mapping));
        }
        for values in changes.remove.iter() {
            self.index.remove(&with_mapping(&values, &*mapping));
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

    pub fn find_one(&self, field: &str, value: &Value) -> Tuple {
        let ix = self.fields.iter().position(|my_field| &my_field[..] == field).unwrap();
        let values = self.index.iter().find(|values| values[ix] == *value).unwrap();
        Tuple{fields: &self.fields[..], values: &values[..]}
    }

    pub fn find_all(&self, field: &str, value: &Value) -> Vec<Tuple> {
        let ix = self.fields.iter().position(|my_field| &my_field[..] == field).unwrap();
        self.index.iter().filter(|values| values[ix] == *value)
            .map(|values| Tuple{fields: &self.fields[..], values: &values[..]})
            .collect()
    }

    pub fn iter(&self) -> Iter {
        Iter{fields: &self.fields[..], iter: self.index.iter()}
    }
}

pub struct Iter<'a> {
    fields: &'a [Field],
    iter: btree_set::Iter<'a, Vec<Value>>,
}

impl<'a> Iterator for Iter<'a> {
    type Item = Tuple<'a>;
    fn next(&mut self) -> Option<Tuple<'a>> {
        match self.iter.next() {
            None => None,
            Some(values) => Some(Tuple{fields: self.fields, values: &values[..]}),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Select{
    pub fields: Vec<Field>,
}

impl Select {
    pub fn select(&self, input: &Relation) -> Vec<Vec<Value>> {
        let mapping = mapping(&input.fields[..], &self.fields[..]).unwrap();
        input.index.iter().map(|values| with_mapping(&values[..], &mapping[..])).collect()
    }
}