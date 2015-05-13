extern crate eve;

use eve::map::*;

#[allow(dead_code)]
fn main() {
    let mut map = Map::new();
    for i in (0..10) {
        map.insert(i, 1);
        println!("{:?}", map);
    }
}