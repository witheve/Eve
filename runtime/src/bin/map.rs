#![feature(test)]

extern crate test;
extern crate eve;
extern crate rand;

use test::Bencher;
use std::collections::{BTreeMap, HashMap};
use std::io::prelude::*;
use std::fs::File;
use rand::Rng;

use eve::map::*;

fn nums() -> Vec<i64> {
    let mut rng = rand::thread_rng();
    (0..100_000).map(|_| rng.gen()).collect()
}

#[bench]
fn bench_insert_int_map(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = Map::new();
        for num in nums.iter() {
            map.insert(*num, 1);
        }
        map
    });
}

#[bench]
fn bench_insert_int_btree(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = BTreeMap::new();
        for num in nums.iter() {
            map.insert(*num, 1);
        }
        map
    });
}

#[bench]
fn bench_insert_int_hash(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = HashMap::new();
        for num in nums.iter() {
            map.insert(*num, 1);
        }
        map
    });
}

#[bench]
fn bench_insert_int_sorted(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = nums.clone();
        map.sort();
        map
    });
}

#[bench]
fn bench_query_int_map(b: &mut Bencher) {
    let nums = nums();
    let mut map = Map::new();
    for num in nums.iter() {
        map.insert(*num, 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            results.push(map.query(&nums[(*num as usize) % nums.len()]).is_some());
        }
        results
    });
}

#[bench]
fn bench_query_int_btree(b: &mut Bencher) {
    let nums = nums();
    let mut map = BTreeMap::new();
    for num in nums.iter() {
        map.insert(*num, 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            results.push(map.contains_key(&nums[(*num as usize) % nums.len()]));
        }
        results
    });
}

#[bench]
fn bench_query_int_hash(b: &mut Bencher) {
    let nums = nums();
    let mut map = HashMap::new();
    for num in nums.iter() {
        map.insert(*num, 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            results.push(map.contains_key(&nums[(*num as usize) % nums.len()]));
        }
        results
    });
}

#[bench]
fn bench_query_int_sorted(b: &mut Bencher) {
    let nums = nums();
    let mut map = nums.clone();
    map.sort();
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            let key = &nums[(*num as usize) % nums.len()];
            results.push(map.binary_search(key).is_ok());
        }
        results
    });
}

fn words() -> Vec<String> {
    let mut contents = String::new();
    File::open("/usr/share/dict/words").unwrap().read_to_string(&mut contents).unwrap();
    let mut words = contents.lines().map(|word| word.to_owned()).collect::<Vec<_>>();
    // pick some deterministic but non-useful order
    words.sort_by(|a,b| {
        let ra = a.chars().rev().collect::<String>();
        let rb = b.chars().rev().collect::<String>();
        ra.cmp(&rb)
    });
    words
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
fn bench_insert_string_hash(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = HashMap::new();
        for word in words.iter() {
            map.insert(word.clone(), 1);
        }
        map
    });
}

#[bench]
fn bench_insert_string_sorted(b: &mut Bencher) {
    let words = words();
    b.iter(|| {
        let mut map = words.clone();
        map.sort();
        map
    });
}

#[bench]
fn bench_query_string_map(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = Map::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            let word = &words[(*num as usize) % words.len()];
            results.push(None != map.query(word));
        }
        results
    });
}

#[bench]
fn bench_query_string_btree(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = BTreeMap::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            let word = &words[(*num as usize) % words.len()];
            results.push(map.contains_key(word));
        }
        results
    });
}

#[bench]
fn bench_query_string_hash(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = HashMap::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            let word = &words[(*num as usize) % words.len()];
            results.push(map.contains_key(word));
        }
        results
    });
}

#[bench]
fn bench_query_string_sorted(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = words.clone();
    map.sort();
    b.iter(|| {
        let mut results = vec![];
        for num in nums.iter() {
            let key = &words[(*num as usize) % words.len()];
            results.push(map.binary_search(key).is_ok());
        }
        results
    });
}

#[bench]
fn bench_iter_string_map(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = Map::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        map.iter().collect::<Vec<_>>()
    });
}

#[bench]
fn bench_iter_string_btree(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = BTreeMap::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        map.iter().collect::<Vec<_>>()
    });
}

#[bench]
fn bench_iter_string_hash(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = HashMap::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    b.iter(|| {
        map.iter().collect::<Vec<_>>()
    });
}

#[bench]
fn bench_iter_string_sorted(b: &mut Bencher) {
    let words = words();
    let nums = nums();
    let mut map = words.clone();
    map.sort();
    b.iter(|| {
        map.iter().collect::<Vec<_>>()
    });
}

// TODO bench_clone_* are not very useful at such small sizes

#[bench]
fn bench_clone_int_map(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = Map::new();
        let mut maps = Vec::new();
        for num in nums[..1000].iter() {
            map.insert(*num, 1);
            maps.push(map.clone());
        }
        maps
    });
}

#[bench]
fn bench_clone_int_btree(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = BTreeMap::new();
        let mut maps = Vec::new();
        for num in nums[..1000].iter() {
            map.insert(*num, 1);
            maps.push(map.clone());
        }
        maps
    });
}

#[bench]
fn bench_clone_int_hash(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = BTreeMap::new();
        let mut maps = Vec::new();
        for num in nums[..1000].iter() {
            map.insert(*num, 1);
            maps.push(map.clone());
        }
        maps
    });
}

#[bench]
fn bench_clone_int_sorted(b: &mut Bencher) {
    let nums = nums();
    b.iter(|| {
        let mut map = Vec::new();
        let mut maps = Vec::new();
        for num in nums[..1000].iter() {
            match map.binary_search(num) {
                Ok(ix) => map[ix] = *num,
                Err(ix) => map.insert(ix, *num),
            }
            maps.push(map.clone());
        }
        maps
    });
}

// TODO sorted iter is too slow
// #[test]
// fn test_iter_is_sorted() {
//     let words = words();
//     let mut map = Map::new();
//     for word in words.iter() {
//         map.insert(word.clone(), 1);
//     }
//     let words_a = map.iter().collect::<Vec<_>>();
//     let mut words_b = map.iter().collect::<Vec<_>>();
//     words_b.sort();
//     assert_eq!(words_a, words_b);
// }


#[allow(dead_code)]
fn main() {
    let words = words();
    let nums = nums();
    let mut map = Map::new();
    for word in words.iter() {
        map.insert(word.clone(), 1);
    }
    let words_a = map.iter().collect::<Vec<_>>();
    let mut words_b = map.iter().collect::<Vec<_>>();
    words_b.sort();
    assert_eq!(words_a, words_b);
    // for _ in (0..50) {
    //     for num in nums.iter() {
    //         let word = &words[(*num as usize) % words.len()];
    //         test::black_box(map.query(word));
    //     }
    // }
}