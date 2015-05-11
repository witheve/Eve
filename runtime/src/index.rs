use std::collections::btree_map;
use std::collections::btree_map::{BTreeMap, Entry};
use std::iter::{FromIterator, IntoIterator};
use std::cmp::{Ordering};

#[derive(Clone, Debug, PartialOrd, PartialEq, Ord, Eq)]
pub struct Index<T> {
    items: BTreeMap<T, i64>,
}

// Keys does not implement Debug :(
pub struct Iter<'a, T> where T: 'a {
    iter: btree_map::Iter<'a, T, i64>,
}

#[derive(Clone, Debug)]
pub struct Changes<T> {
    pub inserted: Vec<T>,
    pub removed: Vec<T>,
}

impl<T: Ord + Clone> Index<T> {
    pub fn new() -> Self {
        Index{items: BTreeMap::new()}
    }

    pub fn insert(&mut self, item: T) {
        match self.items.entry(item) {
            Entry::Vacant(vacant) => {
                vacant.insert(1);
            }
            Entry::Occupied(mut occupied) => {
                let existing_count = *occupied.get();
                occupied.insert(existing_count + 1);
            }
        }
    }

    pub fn remove(&mut self, item: T) {
        match self.items.entry(item) {
            Entry::Vacant(vacant) => {
                vacant.insert(-1);
            }
            Entry::Occupied(mut occupied) => {
                let new_count = *occupied.get() - 1;
                if new_count != 0 {
                    occupied.insert(new_count);
                } else {
                    occupied.remove();
                }
            }
        }
    }

    pub fn iter(&self) -> Iter<T> {
        Iter{iter: self.items.iter()}
    }

    pub fn change(&mut self, changes: Changes<T>) {
        for item in changes.removed {
            self.remove(item);
        }
        for item in changes.inserted {
            self.insert(item);
        }
    }

    pub fn changes_since(&self, before: &Index<T>) -> Changes<T> {
            let mut before_keys = before.items.keys();
            let mut after_keys = self.items.keys();
            let mut before_key = before_keys.next();
            let mut after_key = after_keys.next();
            let mut inserted = Vec::new();
            let mut removed = Vec::new();
            loop {
                match (before_key, after_key) {
                    (None, None) => {
                        break;
                    }
                    (Some(before), None) => {
                        removed.push(before.clone());
                        before_key = before_keys.next();
                    }
                    (None, Some(after)) => {
                        inserted.push(after.clone());
                        after_key = after_keys.next();
                    }
                    (Some(before), Some(after)) => {
                        match before.cmp(after) {
                            Ordering::Less => {
                                removed.push(before.clone());
                                before_key = before_keys.next();
                            }
                            Ordering::Greater => {
                                inserted.push(after.clone());
                                after_key = after_keys.next();
                            }
                            Ordering::Equal => {
                                before_key = before_keys.next();
                                after_key = after_keys.next();
                            }
                        }
                    }
                }
            }
            Changes{inserted: inserted, removed: removed}
    }
}

impl<'a, T: Ord> Iterator for Iter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<&'a T> {
        loop {
            match self.iter.next() {
                None => return None,
                Some((item, count)) if *count > 0 => return Some(item),
                _ => continue,
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.iter.size_hint()
    }
}

impl<T: Ord> FromIterator<T> for Index<T> {
    fn from_iter<I: IntoIterator<Item=T>>(iterable: I) -> Self {
        Index{items: BTreeMap::from_iter(
            iterable.into_iter().map(|item| (item, 1))
            )}
    }
}

pub struct IntoIter<T> {
    items: btree_map::IntoIter<T, i64>
}

impl<T: Ord> Iterator for IntoIter<T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        self.items.next().map(|(key, _)| key)
    }
}

impl<T: Ord> IntoIterator for Index<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;
    fn into_iter(self) -> IntoIter<T> {
        IntoIter{items: self.items.into_iter()}
    }
}