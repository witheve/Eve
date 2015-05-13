#![feature(test)]

extern crate test;
extern crate eve;

use test::Bencher;
use std::collections::BTreeMap;
use std::io::prelude::*;
use std::fs::File;

use eve::map::*;

#[bench]
fn bench_insert_int_map_3(b: &mut Bencher) {
    b.iter(|| {
        let mut map = Map::new(3);
        for i in (0i64..1000000) {
            map.insert(i * 25214903917, 1);
        }
    });
}

#[bench]
fn bench_insert_int_map_1(b: &mut Bencher) {
    b.iter(|| {
        let mut map = Map::new(1);
        for i in (0i64..1000000) {
            map.insert(i * 25214903917, 1);
        }
    });
}

#[bench]
fn bench_insert_int_btree(b: &mut Bencher) {
    b.iter(|| {
        let mut map = BTreeMap::new();
        for i in (0i64..1000000) {
            map.insert(i * 25214903917, 1);
        }
    });
}

fn words() -> Vec<String> {
    let mut contents = String::new();
    File::open("/usr/share/dict/words").unwrap().read_to_string(&mut contents).unwrap();
    contents.lines().map(|word| word.to_owned()).collect()
}

#[bench]
fn bench_insert_string_map_3(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = Map::new(3);
        for word in words.iter() {
            map.insert(word.clone(), 1);
        }
    });
}

#[bench]
fn bench_insert_string_map_1(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = Map::new(1);
        for word in words.iter() {
            map.insert(word.clone(), 1);
        }
    });
}

#[bench]
fn bench_insert_string_btree(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = BTreeMap::new();
        for word in words.iter() {
            map.insert(word.clone(), 1);
        }
    });
}

#[allow(dead_code)]
fn main() {
    let mut map = Map::new(1);
    for i in (0..10) {
        map.insert(i, 1);
        println!("{:?}", map);
    }

    let mut map = Map::new(3);
    for i in (0..10) {
        map.insert(i, 1);
        println!("{:?}", map);
    }
}