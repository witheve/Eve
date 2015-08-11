use std::collections::btree_set::BTreeSet;
use std::iter::Iterator;
use std::cmp::Ordering;
use std::ops::IndexMut;

use value::{Value, Id};

// The value of an Eve view at a specific time is a Relation - a set of tuples with named fields
// The tuples are stored in a BTreeSet, sorted in lexicographic order
// The order of the fields is an implementation detail and is not visible to the user.
#[derive(Clone, Debug)]
pub struct Relation {
    pub view: Id, // view id is useful for debugging
    pub names: Vec<String>, // human readable field names - currently used in the compiler to select fields
    pub fields: Vec<Id>,
    pub index: BTreeSet<Vec<Value>>,
}

// A change to be applied to a relation
#[derive(Clone, Debug)]
pub struct Change {
    pub fields: Vec<Id>, // might not be in the same order as the relation
    pub insert: Vec<Vec<Value>>,
    pub remove: Vec<Vec<Value>>,
}

pub fn mapping(from_fields: &[Id], to_fields: &[Id]) -> Option<Vec<usize>> {
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

impl Relation {
    pub fn new(view: String, fields: Vec<Id>, names: Vec<String>) -> Self {
        Relation{
            view: view,
            fields: fields,
            names: names,
            index: BTreeSet::new(),
        }
    }

    pub fn change(&mut self, change: Change) -> bool {
        assert_eq!(self.fields.len(), change.fields.len());
        let mapping = mapping(&*change.fields, &*self.fields).unwrap();
        let inserts = change.insert.into_iter().map(|row| with_mapping(row, &*mapping)).collect();
        let removes = change.remove.into_iter().map(|row| with_mapping(row, &*mapping)).collect();
        self.change_raw(inserts, removes)
    }

    // only used when we know that inserts/removes are already in the correct order
    pub fn change_raw(&mut self, mut inserts: Vec<Vec<Value>>, mut removes: Vec<Vec<Value>>) -> bool {
        inserts.sort();
        removes.sort();
        inserts.retain(|insert| removes.binary_search(&insert).is_err());
        removes.retain(|remove| inserts.binary_search(&remove).is_err());
        let mut index = &mut self.index;
        let mut changed = false;
        for insert in inserts {
            let inserted = index.insert(insert);
            changed = changed || inserted;
        }
        for remove in removes {
            let removed = index.remove(&remove);
            changed = changed || removed;
        }
        changed
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

    // x.change(y.change_from(x)) == y
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

    // return all rows that match the pattern, where nulls are treated as wildcards
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

    // return true if there are no matching rows
    pub fn dont_find<'a>(&self, pattern: Vec<&Value>) -> bool {
        assert_eq!(self.fields.len(), pattern.len());
        !self.index.iter().any(|values|
            pattern.iter().zip(values.iter()).all(|(pattern_value, value)|
                (**pattern_value == Value::Null) || (*pattern_value == value)
                )
            )
    }
}