extern crate std;
use std::rc;
use std::rc::Rc;
use std::mem::{replace, copy_mut_lifetime};
use std::ops::IndexMut;

struct QQLeaf<K,V> {
    key: K,
    value: V,
}

#[derive(Clone)]
struct QQBranch<K,V> {
    children: Vec<QQNode<K,V>>,
}

#[derive(Clone)]
enum QQNode<K,V> {
    Empty,
    Leaf(Rc<QQLeaf<K,V>>),
    Branch(Rc<QQBranch<K,V>>),
}

#[derive(Clone)]
pub struct QQTree<K,V> {
    root: QQNode<K,V>,
}

pub trait Nibbled {
    fn nibble(&self, i: usize) -> Option<u8>;
}

fn nibbled_eq<K: Nibbled>(key1: &K, key2: &K, from_depth: usize) -> bool {
    let mut depth = from_depth;
    loop {
        let n1 = key1.nibble(depth);
        let n2 = key2.nibble(depth);
        if n1 != n2 { return false; }
        if n1 == None { return true; }
        depth += 1;
    }
}

static FOREVER: &'static () = &();

impl<K,V> QQTree<K,V> {
    pub fn empty() -> Self {
        QQTree{root: QQNode::Empty}
    }
}

impl<K: Nibbled + Clone, V: Clone> QQTree<K,V> {
    pub fn insert(self, key: K, value: V) -> Self {
        let mut root_ref = Box::new(self.root);
        {
            let mut node_ref = &mut *root_ref;
            let mut depth = 0;
            loop {
                let node = replace(node_ref, QQNode::Empty); // take ownership
                match node {
                    QQNode::Empty => {
                        *node_ref = QQNode::Leaf(Rc::new(QQLeaf{key: key, value: value}));
                        break;
                    },
                    QQNode::Leaf(leaf_rc) => {
                        // check if this is the same key
                        if nibbled_eq(&key, &leaf_rc.key, depth) {
                            // if so, just overwrite it
                            *node_ref = QQNode::Leaf(Rc::new(QQLeaf{key: key, value: value}));
                            break;
                        } else {
                            // otherwise, insert a branch between parent and node
                            let mut children = vec![QQNode::Empty; 17];
                            let leaf_node = QQNode::Leaf(leaf_rc.clone()); // only clones the ref
                            match key.nibble(depth) {
                                Some(nibble) => children[nibble as usize] = leaf_node,
                                None => children[16] = leaf_node,
                            }
                            let node = QQNode::Branch(Rc::new(QQBranch{children: children}));
                            *node_ref = node;
                        }
                    },
                    QQNode::Branch(branch_rc) => {
                        // make branch_rc editable
                        let mut branch = match rc::try_unwrap(branch_rc) {
                            Ok(branch) => branch,
                            Err(branch_rc) => (*branch_rc).clone(),
                        };
                        match key.nibble(depth) {
                            None => {
                                // key ends here, can just overwrite the slot
                                branch.children[16] = QQNode::Leaf(Rc::new(QQLeaf{key: key, value: value}));
                                *node_ref = QQNode::Branch(Rc::new(branch));
                                break;
                            }
                            Some(nibble) => {
                                // put this branch back, look at the child instead
                                let child_ref = unsafe {
                                    // we are attaching the branch to the new tree, so this reference is valid for the whole function
                                    copy_mut_lifetime(FOREVER, branch.children.index_mut(&(nibble as usize)))
                                };
                                *node_ref = QQNode::Branch(Rc::new(branch));
                                node_ref = child_ref;
                                depth += 1;
                                continue;
                            }
                        }
                    }
                }
            }
        }
        QQTree{root: (*root_ref).clone()}
    }
}


impl Nibbled for String {
    fn nibble(&self, i: usize) -> Option<u8> {
        if i < self.len() {
            // TODO lies and wrongness
            Some(self.as_bytes()[i] & 0xF)
        } else {
            None
        }
    }
}