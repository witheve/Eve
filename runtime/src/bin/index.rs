extern crate time;

extern crate eve;

use eve::index::*;

fn main() {
    let mut before = Index::new();
    before.insert("foo", 1);
    before.insert("bar", 1);
    before.insert("quux", 1);
    before.insert("quux", 1);
    println!("before {:?}", before);

    let mut after = before.clone();
    after.remove("foo", 1);
    after.remove("quux", 1);
    after.insert("bar", 1);
    after.insert("baz", 1);
    println!("after {:?}", after);

    let diff = diff::Diff{before: &before, after: &after};
    let changes = diff.iter().collect::<Vec<_>>();
    println!("changes {:?}", changes);
}