use std::cmp::Ordering;
use std::fmt::Debug;

#[derive(Debug, Clone)]
pub struct Map<K,V> {
    max_adjacent_chunks: usize,
    chunks: Vec<Chunk<K,V>>,
}

#[derive(Debug, Clone)]
struct Chunk<K,V> {
    size: usize,
    items: Vec<(K, V)>,
}

pub trait Monoid {
    fn zero() -> Self;
    fn add(v1: Self, v2: Self) -> Self;
}

fn merge<K: Ord + Debug, V: Eq + Monoid + Debug>(a: Chunk<K,V>, b: Chunk<K,V>) -> Chunk<K,V> {
    // TODO just use ixes and replace instead? or dump into vec and then merge?
    let size = a.size + b.size;
    let mut items = Vec::with_capacity(size);
    let mut a_iter = a.items.into_iter();
    let mut b_iter = b.items.into_iter();
    let mut a_next = a_iter.next();
    let mut b_next = b_iter.next();
    loop {
        let cmp = {
            match (&a_next, &b_next) {
                (&Some((ref ka, _)), &Some((ref kb, _))) => ka.cmp(kb),
                _ => break,
            }
        };
        match cmp {
            Ordering::Less => {
                let (ka, va) = ::std::mem::replace(&mut a_next, a_iter.next()).unwrap();
                items.push((ka,va));
            }
            Ordering::Equal => {
                let (ka, va) = ::std::mem::replace(&mut a_next, a_iter.next()).unwrap();
                let (_kb, vb) = ::std::mem::replace(&mut b_next, b_iter.next()).unwrap();
                let v = Monoid::add(va, vb);
                if (v != Monoid::zero()) {
                    items.push((ka, v));
                }
            }
            Ordering::Greater => {
                let (kb, vb) = ::std::mem::replace(&mut b_next, b_iter.next()).unwrap();
                items.push((kb,vb));
            }
        }
    }
    match a_next {
        Some((ka, va)) => items.push((ka, va)),
        None => (),
    }
    match b_next {
        Some((kb, vb)) => items.push((kb, vb)),
        None => (),
    }
    for (k,v) in a_iter {
        items.push((k,v));
    }
    for (k,v) in b_iter {
        items.push((k,v));
    }
    Chunk{size: size, items: items} // TODO size should be next power of two >= items.len()
}

impl<K: Ord + Debug, V: Eq + Monoid + Debug> Map<K,V> {
    pub fn new(max_adjacent_chunks: usize) -> Self {
        Map{
            max_adjacent_chunks: max_adjacent_chunks,
            chunks: vec![],
        }
    }

    pub fn insert(&mut self, key: K, val: V) {
        if val != Monoid::zero() {
            self.chunks.push(Chunk{size: 1, items: vec![(key, val)]});
            for i in (self.max_adjacent_chunks..self.chunks.len()).rev() {
                // if there are more than self.max_adjacent_chunks with the same size, merge two of them
                if self.chunks[i].size == self.chunks[i-self.max_adjacent_chunks].size {
                    let right = self.chunks.remove(i-self.max_adjacent_chunks+1);
                    let left = self.chunks.remove(i-self.max_adjacent_chunks);
                    self.chunks.insert(i-self.max_adjacent_chunks, merge(left, right));
                }
            }
        }
    }
}

impl Monoid for i64 {
    fn zero() -> i64 { 0 }
    fn add(a: i64, b: i64) -> i64 { a + b }
}