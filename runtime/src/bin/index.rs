extern crate eve;

use eve::index::*;

fn main() {
    use std::mem::size_of;
    println!("{:?}", size_of::<Node<Node4>>());
    println!("{:?}", size_of::<Node<Node16>>());
    println!("{:?}", size_of::<Node<Node48>>());
    println!("{:?}", size_of::<Node<Node256>>());
    let node = eg_node();
    println!("{:?}", node.num_entries);
    for child in node.children() {
        match *child {
            None => println!("None"),
            Some(ref child) => println!("{}", child.num_entries),
        }
    }
}