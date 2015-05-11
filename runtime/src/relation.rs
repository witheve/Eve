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

pub fn with_mapping(tuple: &Tuple, mapping: &[usize]) -> Tuple {
    mapping.iter().map(|ix|
        tuple[*ix].clone()
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
        for tuple in changes.insert.iter() {
            self.index.insert(with_mapping(&tuple, &*mapping));
        }
        for tuple in changes.remove.iter() {
            self.index.remove(&with_mapping(&tuple, &*mapping));
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