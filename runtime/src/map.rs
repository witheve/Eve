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
    assert!(a.size > 0);
    assert!(b.size > 0);
    let size = a.size + b.size;
    let mut items = Vec::with_capacity(size);
    let mut active_iter = a.items.into_iter();
    let mut waiting_iter = b.items.into_iter();
    let (mut pivot_k, mut pivot_v) = waiting_iter.next().unwrap(); // we have at least one item
    // invariant: pivot is always smaller than anything in waiting_iter
    loop {
        match active_iter.next() {
            None => {
                items.push((pivot_k, pivot_v));
                for (k, v) in waiting_iter {
                    items.push((k, v))
                }
                break;
            }
            Some((mut k, mut v)) => {
                match k.cmp(&pivot_k) {
                    Ordering::Less => {
                        items.push((k,v));
                    }
                    Ordering::Equal => {
                        pivot_v = Monoid::add(v, pivot_v);
                    }
                    Ordering::Greater => {
                        ::std::mem::swap(&mut k, &mut pivot_k);
                        ::std::mem::swap(&mut v, &mut pivot_v);
                        ::std::mem::swap(&mut active_iter, &mut waiting_iter);
                        items.push((k,v));
                    }
                }
            }
        }
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