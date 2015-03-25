use std::collections::btree_map;
use std::collections::btree_map::{BTreeMap, Entry, Keys};
use std::iter::{FromIterator, IntoIterator};

use value::{Value, ToValue};

#[derive(Clone, Debug, PartialOrd, PartialEq, Ord, Eq)]
pub struct Index<T> {
    items: BTreeMap<T, usize>,
}

// #[derive(Debug)] Keys does not implement Debug :(
pub struct Iter<'a, T> where T: 'a {
    keys: Keys<'a, T, usize>,
}

impl<T: Ord> Index<T> {
    pub fn new() -> Self {
        Index{items: BTreeMap::new()}
    }

    pub fn insert(&mut self, item: T, count: usize) {
        match self.items.entry(item) {
            Entry::Vacant(vacant) => {
                vacant.insert(count);
            }
            Entry::Occupied(mut occupied) => {
                let existing_count = *occupied.get();
                occupied.insert(existing_count + count);
            }
        }
    }

    pub fn remove(&mut self, item: T, count: usize) {
        match self.items.entry(item) {
            Entry::Vacant(_) => {
                panic!("Removed a non-existing entry");
            }
            Entry::Occupied(mut occupied) => {
                let new_count = *occupied.get() - count;
                if new_count > 0 {
                    occupied.insert(new_count);
                } else if new_count == 0 {
                    occupied.remove();
                } else {
                    panic!("Removed a non-existing entry");
                }
            }
        }
    }

    pub fn iter(&self) -> Iter<T> {
        Iter{keys: self.items.keys()}
    }

    pub fn find_all<F: Fn(&T) -> bool>(&self, filter: F) -> Vec<&T> {
        self.iter().filter(|t| filter(*t)).collect()
    }

    pub fn find_one<F: Fn(&T) -> bool>(&self, filter: F) -> &T {
        match &*self.find_all(filter) {
            [] => panic!("None found"),
            [t] => t,
            _ => panic!("Too many found"),
        }
    }
}

impl<'a, T: Ord> Iterator for Iter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<&'a T> {
        self.keys.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.keys.size_hint()
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
    items: btree_map::IntoIter<T, usize>
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

pub mod diff {
    use std::collections::btree_map::Keys;
    use std::cmp::{max, Ordering};

    #[derive(Debug)]
    pub struct Diff<'a, T> where T: 'a {
        pub before: &'a super::Index<T>,
        pub after: &'a super::Index<T>,
    }

    #[derive(Debug)]
    pub enum Change {
        Inserted,
        Unchanged,
        Removed,
    }

    // #[derive(Debug)] Keys does not implement Debug :(
    pub struct Iter<'a, T> where T: 'a {
        before_keys: Keys<'a, T, usize>,
        after_keys: Keys<'a, T, usize>,
        before_key: Option<&'a T>,
        after_key: Option<&'a T>,
    }

    impl<'a, T: Ord> Diff<'a, T> {
        pub fn iter(&self) -> Iter<'a, T> {
            let mut before_keys = self.before.items.keys();
            let mut after_keys = self.after.items.keys();
            let before_key = before_keys.next();
            let after_key = after_keys.next();
            Iter{before_keys: before_keys, after_keys: after_keys, before_key: before_key, after_key: after_key}
        }
    }

    impl<'a, T: Ord> Iterator for Iter<'a, T> {
        type Item = (Change, &'a T);

        fn next(&mut self) -> Option<(Change, &'a T)> {
            match (self.before_key, self.after_key) {
                (None, None) => {
                    return None;
                }
                (Some(before), None) => {
                    self.before_key = self.before_keys.next();
                    return Some((Change::Removed, before));
                }
                (None, Some(after)) => {
                    self.after_key = self.after_keys.next();
                    return Some((Change::Inserted, after));
                }
                (Some(before), Some(after)) => {
                    match before.cmp(after) {
                        Ordering::Less => {
                            self.before_key = self.before_keys.next();
                            return Some((Change::Removed, before));
                        }
                        Ordering::Greater => {
                            self.after_key = self.after_keys.next();
                            return Some((Change::Inserted, after));
                        }
                        Ordering::Equal => {
                            self.before_key = self.before_keys.next();
                            self.after_key = self.after_keys.next();
                            return Some((Change::Unchanged, before));
                        }
                    }
                }
            }
        }

        fn size_hint(&self) -> (usize, Option<usize>) {
            let (before_lower, before_upper) = self.before_keys.size_hint();
            let (after_lower, after_upper) = self.after_keys.size_hint();
            let lower = max(before_lower, after_lower);
            let upper = match (before_upper, after_upper) {
                (Some(before_upper), Some(after_upper)) => Some(before_upper + after_upper),
                _ => None
            };
            (lower, upper)
        }
    }
}