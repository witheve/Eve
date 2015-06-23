use std::cmp::Ordering;
use std::rc::Rc;
use std::mem::replace;

#[derive(Debug, Clone)]
pub struct Map<K,V> {
    chunks: Vec<Rc<Vec<(K,V)>>>,
}

fn merge<K: Ord + Default + Clone, V: Eq + Default + Clone>(old: &mut Vec<(K,V)>, new: &mut Vec<(K,V)>) -> Vec<(K,V)> {
    let mut merged = Vec::with_capacity(old.len() + new.len());
    let mut old_ix = 0;
    let mut new_ix = 0;
    while (old_ix < old.len()) && (new_ix < new.len()) {
        match old[old_ix].0.cmp(&new[new_ix].0) {
            Ordering::Greater => {
                merged.push(replace(&mut new[new_ix], Default::default()));
                new_ix += 1;
            }
            Ordering::Equal => {
                // new value wins
                merged.push(replace(&mut new[new_ix], Default::default()));
                old_ix += 1;
                new_ix += 1;
            }
            Ordering::Less => {
                merged.push(replace(&mut old[old_ix], Default::default()));
                old_ix += 1;
            }
        }
    }
    while old_ix < old.len() {
        merged.push(replace(&mut old[old_ix], Default::default()));
        old_ix += 1;
    }
    while new_ix < new.len() {
        merged.push(replace(&mut new[new_ix], Default::default()));
        new_ix += 1;
    }
    merged
}

impl<K: Ord + Default + Clone, V: Eq + Default + Clone> Map<K,V> {
    pub fn new() -> Self {
        Map{chunks: vec![]}
    }

    pub fn insert(&mut self, key: K, val: V) {
        self.chunks.push(Rc::new(vec![(key, val)]));
        for i in (1..self.chunks.len()).rev() {
            // if a chunk is not smaller than its neighbour, merge them both
            if self.chunks[i].len() >= self.chunks[i-1].len() {
                let mut new = self.chunks.remove(i);
                let mut old = self.chunks.remove(i-1);
                let merged = merge(old.make_unique(), new.make_unique());
                self.chunks.insert(i-1, Rc::new(merged));
            } else {
                break;
            }
        }
    }

    pub fn query(&mut self, key: &K) -> Option<&V> {
        for chunk in self.chunks.iter().rev() {
            match chunk.binary_search_by(|&(ref k, _)| k.cmp(key)) {
                Ok(ix) => return Some(&chunk[ix].1),
                Err(_) => (),
            }
        }
        return None
    }
}