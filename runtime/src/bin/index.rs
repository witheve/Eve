extern crate time;

extern crate eve;

use eve::index::*;

fn main() {
    let mut before = Index::new();
    before.insert("foo");
    before.insert("bar");
    before.insert("quux");
    before.insert("quux");
    println!("before {:?}", before);

    let mut after = before.clone();
    after.remove("foo");
    after.remove("quux");
    after.insert("bar");
    after.insert("baz");
    println!("after {:?}", after);

    let diff = diff::Diff{before: &before, after: &after};
    let changes = diff.iter().collect::<Vec<_>>();
    println!("changes {:?}", changes);
}