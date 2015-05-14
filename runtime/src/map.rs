use std::cmp::Ordering;
use std::rc::Rc;

#[derive(Debug, Clone)]
pub struct Map<K,V> {
    max_adjacent_chunks: usize,
    chunks: Vec<Rc<Chunk<K,V>>>,
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

fn merge<K: Ord + Clone, V: Eq + Monoid + Clone>(a: &mut Chunk<K,V>, b: &mut Chunk<K,V>) -> Chunk<K,V> {
    // TODO requires that Monoid::add is commutative because we don't track which side the pivot came from
    assert!(a.size > 0);
    assert!(b.size > 0);
    let size = a.size + b.size;
    let mut items = Vec::with_capacity(size);
    let mut active_iter = a.items.drain(..);
    let mut waiting_iter = b.items.drain(..);
    let (mut pivot_k, mut pivot_v) = waiting_iter.next().unwrap();
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

impl<K: Ord + Clone, V: Eq + Monoid + Clone> Map<K,V> {
    pub fn new(max_adjacent_chunks: usize) -> Self {
        Map{
            max_adjacent_chunks: max_adjacent_chunks,
            chunks: vec![],
        }
    }

    pub fn insert(&mut self, key: K, val: V) {
        if val != Monoid::zero() {
            self.chunks.push(Rc::new(Chunk{size: 1, items: vec![(key, val)]}));
            for i in (self.max_adjacent_chunks..self.chunks.len()).rev() {
                // if there are more than self.max_adjacent_chunks with the same size, merge two of them
                if self.chunks[i].size == self.chunks[i-self.max_adjacent_chunks].size {
                    let mut right = self.chunks.remove(i-self.max_adjacent_chunks+1);
                    let mut left = self.chunks.remove(i-self.max_adjacent_chunks);
                    let merged = Rc::new(merge(left.make_unique(), right.make_unique()));
                    self.chunks.insert(i-self.max_adjacent_chunks, merged);
                }
            }
        }
    }
}

impl Monoid for i64 {
    fn zero() -> i64 { 0 }
    fn add(a: i64, b: i64) -> i64 { a + b }
}