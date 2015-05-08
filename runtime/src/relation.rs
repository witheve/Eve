use std::collections::hash_map::HashMap;
use std::collections::btree_set::BTreeSet;

use value::{Id, Tuple};

pub type Field = Id;

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

pub fn with_mapping(tuples: &[Tuple], mapping: &[usize]) -> Vec<Tuple> {
    tuples.iter().map(|tuple|
        mapping.iter().map(|ix|
            tuple[*ix].clone()
            ).collect()
        ).collect()
}

#[derive(Clone, Debug)]
pub struct Relation {
    pub fields: Vec<Field>,
    pub index: BTreeSet<Tuple>,
}

#[derive(Clone, Debug)]
pub struct Changes {
    pub fields: Vec<Field>,
    pub insert: Vec<Tuple>,
    pub remove: Vec<Tuple>,
}

impl Relation {
    pub fn with_fields(fields: Vec<Field>) -> Self {
        Relation{
            fields: fields,
            index: BTreeSet::new(),
        }
    }

    pub fn change(&mut self, changes: &Changes) {
        let mapping = mapping(&*changes.fields, &*self.fields).unwrap();
        for tuple in with_mapping(&*changes.insert, &*mapping) {
            self.index.insert(tuple);
        }
        for tuple in with_mapping(&*changes.remove, &*mapping) {
            self.index.remove(&tuple);
        }
    }

    pub fn as_changes(&self) -> Changes {
        Changes{
            fields: self.fields.clone(),
            insert: self.index.iter().map(|tuple| tuple.clone()).collect(),
            remove: Vec::new(),
        }
    }
}