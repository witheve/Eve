use std::cmp::Ordering;
use std::rc::Rc;
use std::mem::replace;

// This is intended to be a replacement for BTreeSet in Relation.
// Main goals are faster iteration and cheap clones.
// Based on https://www.youtube.com/watch?v=6nh6LpcXGsI
// Each chunk is ordered and is twice the length of the previous chunk.
#[derive(Debug, Clone)]
pub struct Map<K,V> {
    chunks: Vec<Rc<Vec<(K,V)>>>,
}

// Merge two chunks into a single chunk
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
        // push a new chunk with length 1
        self.chunks.push(Rc::new(vec![(key, val)]));
        for i in (1..self.chunks.len()).rev() {
            // fix invariants - if a chunk is not smaller than its neighbour, merge them both
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
        // binary search each chunk
        for chunk in self.chunks.iter().rev() {
            match chunk.binary_search_by(|&(ref k, _)| k.cmp(key)) {
                Ok(ix) => return Some(&chunk[ix].1),
                Err(_) => (),
            }
        }
        return None
    }

    pub fn iter(&self) -> Iter<K, V> {
        let mut chunk_iter = self.chunks.iter();
        let item_iter = chunk_iter.next().map_or([].iter(), |chunk| chunk.iter());
        Iter{chunk_iter: chunk_iter, item_iter: item_iter}
    }
}

pub struct Iter<'a, K, V> where K: 'a, V: 'a {
    chunk_iter: ::std::slice::Iter<'a, Rc<Vec<(K,V)>>>,
    item_iter: ::std::slice::Iter<'a, (K,V)>,
}

// TODO this is not ordered - it just iters through each chunk in turn
impl<'a, K, V> Iterator for Iter<'a, K,V> where K: Ord {
    type Item = &'a (K,V);

    fn next(&mut self) -> Option<&'a (K,V)> {
        match self.item_iter.next() {
            Some(item) => Some(item),
            None => {
                match self.chunk_iter.next() {
                    Some(chunk) => {
                        self.item_iter = chunk.iter();
                        self.item_iter.next()
                    }
                    None => None
                }
            }
        }
    }
}