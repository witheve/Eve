#[derive(Debug, Clone)]
pub struct Map<K,V> {
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

fn merge<K: Ord, V>(a: Chunk<K,V>, mut b: Chunk<K,V>) -> Chunk<K,V> {
    // TODO non-stupid merge
    // TODO need to merge vals for dup keys and remove zeroes
    let size = a.size + b.size;
    let mut items = a.items;
    items.append(&mut b.items);
    items.sort_by(|&(ref k1, _), &(ref k2, _)| k1.cmp(k2));
    Chunk{size: size, items: items}
}

static MAX_ADJACENT_CHUNKS: usize = 3;

impl<K: Ord, V: Eq + Monoid> Map<K,V> {
    pub fn new() -> Self {
        Map{chunks: vec![]}
    }

    pub fn insert(&mut self, key: K, val: V) {
        if val != Monoid::zero() {
            self.chunks.push(Chunk{size: 1, items: vec![(key, val)]});
            for i in (MAX_ADJACENT_CHUNKS..self.chunks.len()).rev() {
                // if there are more than MAX_ADJACENT_CHUNKS with the same size, merge two of them
                if self.chunks[i].size == self.chunks[i-MAX_ADJACENT_CHUNKS].size {
                    let right = self.chunks.remove(i-MAX_ADJACENT_CHUNKS+1);
                    let left = self.chunks.remove(i-MAX_ADJACENT_CHUNKS);
                    self.chunks.insert(i-MAX_ADJACENT_CHUNKS, merge(left, right));
                }
            }
        }
    }
}

impl Monoid for i64 {
    fn zero() -> i64 { 0 }
    fn add(a: i64, b: i64) -> i64 { a + b }
}