extern crate time;

extern crate eve;

use eve::index::*;

#[allow(dead_code)]
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

    let changes = after.changes_since(&before);
    println!("changes {:?}", changes);
}