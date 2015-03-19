#![feature(core)]
#![allow(dead_code)] // TODO remove

// based on http://www3.informatik.tu-muenchen.de/~leis/papers/ART.pdf
// TODO once we know the size of Node<> resize the bodies to fit into default jemalloc size classes

use std::mem;

// K and V must be sized so we don't end up with fat pointers messing up the transmutes
struct Leaf<K: Sized, V: Sized> {
    key: K,
    val: V,
    children: [Option<Box<Node<Unknown>>>; 0], // just for Node.children
}

pub struct Node4 { // if paths[i] = byte then follow children[i]
    paths: [u8; 4],
    children: [Option<Box<Node<Unknown>>>; 4],
}

pub struct Node16 { // if paths[i] = byte then follow children[i]
    paths: [u8; 16],
    children: [Option<Box<Node<Unknown>>>; 16],
}

pub struct Node48 { // if paths[byte] = i then follow children[i]
    paths: [u8; 256],
    children: [Option<Box<Node<Unknown>>>; 48],
}

pub struct Node256 { // follow children[byte]
    children: [Option<Box<Node<Unknown>>>; 256],
}

pub struct Node<T> {
    pub num_entries: u8,
    // TODO ref count
    // TODO info on collapsed paths
    body: T, // one of Leaf, Node4, Node16, Node48, Node256
}

#[test]
fn transmutes_are_safe() {
    // TODO test Leaf<Value,
    use std::mem::size_of;
    assert_eq!(size_of::<&Node<Unknown>>(), size_of::<&Node<Leaf<String, String>>>());
    assert_eq!(size_of::<&Node<Unknown>>(), size_of::<&Node<Node4>>());
    assert_eq!(size_of::<&Node<Unknown>>(), size_of::<&Node<Node16>>());
    assert_eq!(size_of::<&Node<Unknown>>(), size_of::<&Node<Node48>>());
    assert_eq!(size_of::<&Node<Unknown>>(), size_of::<&Node<Node256>>());
    assert_eq!(size_of::<Box<Node<Unknown>>>(), size_of::<Box<Node<Leaf<String, String>>>>());
    assert_eq!(size_of::<Box<Node<Unknown>>>(), size_of::<Box<Node<Node4>>>());
    assert_eq!(size_of::<Box<Node<Unknown>>>(), size_of::<Box<Node<Node16>>>());
    assert_eq!(size_of::<Box<Node<Unknown>>>(), size_of::<Box<Node<Node48>>>());
    assert_eq!(size_of::<Box<Node<Unknown>>>(), size_of::<Box<Node<Node256>>>());
}

// TODO needs custom drop?

pub enum Unknown {}

impl Node<Unknown> {
    pub fn children(&self) -> &[Option<Box<Node<Unknown>>>] {
        if self.num_entries == 1 {
            panic!("Handle generics later");
        } else if self.num_entries <= 4 {
            unsafe {
                let node = mem::transmute_copy::<&Node<Unknown>, &Node<Node4>>(&self);
                let children = mem::copy_lifetime(self, &node.body.children);
                children
            }
        } else {
            panic!("Other node types");
        }
    }
}

pub fn eg_node() -> Box<Node<Unknown>> {
    let node = Box::new(
        Node{
            num_entries: 3,
            body: Node4{
                paths: [0; 4],
                children: [None, None, None, None]
            }
        });
    unsafe {
        mem::transmute_copy::<Box<Node<Node4>>, Box<Node<Unknown>>>(&node)
    }
}

struct Art {
    root: Node<Unknown>,
}