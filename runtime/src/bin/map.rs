#![feature(test)]

extern crate test;
extern crate eve;

use test::Bencher;
use std::collections::BTreeMap;
use std::io::prelude::*;
use std::fs::File;

use eve::map::*;

#[bench]
fn bench_insert_int_map(b: &mut Bencher) {
    b.iter(|| {
        let mut map = Map::new();
        for i in (0i64..1000000) {
            map.insert(i * 25214903917, 1);
        }
        map
    });
}

#[bench]
fn bench_insert_int_btree(b: &mut Bencher) {
    b.iter(|| {
        let mut map = BTreeMap::new();
        for i in (0i64..1000000) {
            map.insert(i * 25214903917, 1);
        }
        map
    });
}

#[bench]
fn bench_query_int_map(b: &mut Bencher) {
    let mut map = Map::new();
    for i in (0i64..1000000) {
        map.insert(i * 25214903917, 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for i in (0i64..1000) {
            results.push(None != map.query(&(i * 1000 * 25214903917)));
        }
        results
    });
}

#[bench]
fn bench_query_int_btree(b: &mut Bencher) {
    let mut map = BTreeMap::new();
    for i in (0i64..1000000) {
        map.insert(i * 25214903917, 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for i in (0i64..1000) {
            results.push(map.contains_key(&(i * 1000 * 25214903917)));
        }
        results
    });
}

fn words() -> Vec<String> {
    let mut contents = String::new();
    File::open("/usr/share/dict/words").unwrap().read_to_string(&mut contents).unwrap();
    contents.lines().map(|word| word.to_owned()).collect()
}

#[bench]
fn bench_insert_string_map(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = Map::new();
        for word in words.iter() {
            map.insert(word.clone(), 1);
        }
        map
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
        map
    });
}

#[bench]
fn bench_query_string_map(b: &mut Bencher) {
    let words = words();
    let mut map = Map::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for i in (0..words.len()) {
            let word = &words[(i * 25214903917) % words.len()];
            results.push(None != map.query(word));
        }
        results
    });
}

#[bench]
fn bench_query_string_btree(b: &mut Bencher) {
    let words = words();
    let mut map = BTreeMap::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for i in (0..words.len()) {
            let word = &words[(i * 25214903917) % words.len()];
            results.push(map.contains_key(word));
        }
        results
    });
}

#[bench]
fn bench_clone_int_map(b: &mut Bencher) {
    b.iter(|| {
        let mut map = Map::new();
        let mut maps = Vec::new();
        for i in (0i64..100) {
            for j in (0i64..100) {
                map.insert(((i*100) + j) * 25214903917, 1);
            }
            maps.push(map.clone());
        }
        maps
    });
}

#[bench]
fn bench_clone_int_btree(b: &mut Bencher) {
    b.iter(|| {
        let mut map = BTreeMap::new();
        let mut maps = Vec::new();
        for i in (0i64..100) {
            for j in (0i64..100) {
                map.insert(((i*100) + j) * 25214903917, 1);
            }
            maps.push(map.clone());
        }
        maps
    });
}

#[allow(dead_code)]
fn main() {
    let mut map = Map::new();
    for i in (0..10) {
        map.insert(i, 1);
        println!("{:?}", map);
    }
    for i in (10..20).rev() {
        map.insert(i, 1);
        println!("{:?}", map);
    }
    for i in (0..10) {
        map.insert(i, -i);
        println!("{:?}", map);
    }
    for i in (0..20) {
        println!("q: {:?}", map.query(&i));
    }
}