extern crate eve;

use eve::index::*;

fn main() {
    let mut tree = QQTree::empty();
    for i in (0..100) {
        tree = tree.insert(format!("user{}", i), i)
    }
}