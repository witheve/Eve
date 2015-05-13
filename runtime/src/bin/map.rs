#![feature(test)]

extern crate test;
extern crate eve;

use test::Bencher;
use std::collections::BTreeMap;

use eve::map::*;

#[bench]
fn bench_insert_map(b: &mut Bencher) {
    b.iter(|| {
        let mut map = Map::new();
        for i in (0..1000000) {
            map.insert(i, 1);
        }
    });
}

#[bench]
fn bench_insert_btree(b: &mut Bencher) {
    b.iter(|| {
        let mut map = BTreeMap::new();
        for i in (0..1000000) {
            map.insert(i, 1);
        }
    });
}

#[allow(dead_code)]
fn main() {
    let mut map = Map::new();
    for i in (0..10) {
        map.insert(i, 1);
        println!("{:?}", map);
    }
}