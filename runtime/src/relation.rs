use std::collections::btree_set;
use std::collections::btree_set::BTreeSet;
use std::iter::Iterator;

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