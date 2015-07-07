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
    pub view: String,
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
    pub fn new(view: String, fields: Vec<Field>, names: Vec<String>) -> Self {
        Relation{
            view: view,
            fields: fields,
            names: names,
            index: BTreeSet::new(),
        }
    }

    pub fn change(&mut self, change: Change) {
        assert_eq!(self.fields.len(), change.fields.len());
        let mapping = mapping(&*change.fields, &*self.fields).unwrap();
        for values in change.insert.into_iter() {
            assert_eq!(values.len(), mapping.len());
            self.index.insert(with_mapping(values, &*mapping));
        }
        for values in change.remove.into_iter() {
            assert_eq!(values.len(), mapping.len());
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

    pub fn find<'a>(&self, pattern: Vec<&Value>) -> Vec<&[Value]> {
        assert_eq!(self.fields.len(), pattern.len());
        self.index.iter().filter(|values|
            pattern.iter().zip(values.iter()).all(|(pattern_value, value)|
                (**pattern_value == Value::Null) || (*pattern_value == value)
            )
        ).map(|values|
            &values[..] // for easy pattern matching later
        ).collect()
    }

    pub fn dont_find<'a>(&self, pattern: Vec<&Value>) -> bool {
        assert_eq!(self.fields.len(), pattern.len());
        !self.index.iter().any(|values|
            pattern.iter().zip(values.iter()).all(|(pattern_value, value)|
                (**pattern_value == Value::Null) || (*pattern_value == value)
                )
            )
    }

    pub fn find_maybe(&self, name: &str, value: &Value) -> Option<Tuple> {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        self.index.iter().find(|values| values[ix] == *value).map(|values|
            Tuple{view: &self.view[..], names: &self.names[..], values: &values[..]}
            )
    }

    pub fn find_one(&self, name: &str, value: &Value) -> Tuple {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        let values = self.index.iter().find(|values| values[ix] == *value).unwrap();
        Tuple{view: &self.view[..], names: &self.names[..], values: &values[..]}
    }

    pub fn find_all(&self, name: &str, value: &Value) -> Vec<Tuple> {
        let ix = self.names.iter().position(|my_name| &my_name[..] == name).unwrap();
        self.index.iter().filter(|values| values[ix] == *value)
            .map(|values| Tuple{view: &self.view[..], names: &self.names[..], values: &values[..]})
            .collect()
    }

    pub fn iter(&self) -> Iter {
        Iter{view: &self.view[..], names: &self.names[..], iter: self.index.iter()}
    }
}

pub struct Iter<'a> {
    view: &'a str,
    names: &'a [String],
    iter: btree_set::Iter<'a, Vec<Value>>,
}

impl<'a> Iterator for Iter<'a> {
    type Item = Tuple<'a>;
    fn next(&mut self) -> Option<Tuple<'a>> {
        match self.iter.next() {
            None => None,
            Some(values) => Some(Tuple{view: self.view, names: self.names, values: &values[..]}),
        }
    }
}

#[derive(Clone, Debug)]
pub struct IndexSelect{
    pub source: usize,
    pub mapping: Vec<usize>,
}

impl IndexSelect {
    pub fn select(&self, inputs: &[&Relation]) -> Vec<Vec<Value>> {
        let relation = inputs[self.source];
        relation.index.iter().map(|values|
            self.mapping.iter().map(|ix|
                values[*ix].clone()
            ).collect()
        ).collect()
    }
}

#[derive(Clone, Debug)]
pub struct ViewSelect{
    pub mapping: Vec<usize>,
}

impl ViewSelect {
    pub fn select(&self, input: &[&Value]) -> Vec<Value> {
        self.mapping.iter().map(|ix|
            input[*ix].clone()
        ).collect()
    }
}