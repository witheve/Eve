extern crate time;

extern crate eve;

use eve::index::*;

fn main() {
    let mut tree = QQTree::empty();
    let start = time::precise_time_s();
    for i in (0..100_000_000) {
        tree = tree.insert(format!("user{}", i), i)
    }
    let end = time::precise_time_s();
    println!("index: {}s", end - start);
}