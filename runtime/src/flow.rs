use std::collections::{BitSet, BTreeSet};
use std::cell::{RefCell, Ref, RefMut};
use std::mem::replace;

use value::{Id, Value};
use relation::{Change, Relation};
use view::{View, Table};
use compiler;

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub view: View,
    pub upstream: Vec<usize>,
    pub downstream: Vec<usize>,
}

pub type Changes = Vec<(Id, Change)>;

#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
    pub outputs: Vec<RefCell<Relation>>,
    pub errors: Vec<Vec<Vec<Value>>>,
    pub dirty: BitSet,
    pub needs_recompile: bool,
}

impl Flow {
    pub fn new() -> Self {
        let mut flow = Flow {
            nodes: Vec::new(),
            outputs: Vec::new(),
            errors: Vec::new(),
            dirty: BitSet::new(),
            needs_recompile: true,
        };
        compiler::bootstrap(&mut flow);
        flow
    }

    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn get_node(&self, id: &str) -> &Node {
        self.nodes.iter().find(|node| &node.id[..] == id).unwrap()
    }

    pub fn get_output(&self, id: &str) -> Ref<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow()
    }

    pub fn get_output_mut(&self, id: &str) -> RefMut<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow_mut()
    }

    pub fn overwrite_output(&self, id: &str) -> RefMut<Relation> {
        let mut output = self.get_output_mut(id);
        output.index = BTreeSet::new();
        output
    }

    pub fn change(&mut self, changes: Changes) {
        let code_schema = compiler::code_schema();
        for (id, change) in changes.into_iter() {
            match self.get_ix(&*id) {
                Some(ix) => {
                    match self.nodes[ix].view {
                        View::Table(_) => (),
                        _ => println!("Warning: changing a non-table view with id: {:?}", id),
                    }
                    // TODO should we be checking diffs after the fact?
                    self.outputs[ix].borrow_mut().change(change);
                    if code_schema.iter().find(|&&(ref code_id, _)| **code_id == id).is_some() {
                        self.needs_recompile = true;
                    }
                    for ix in self.nodes[ix].downstream.iter() {
                        self.dirty.insert(*ix);
                    }
                }
                None => {
                    println!("Warning: creating a dummy view because you tried to change a non-existing view with id: {:?}", id);
                    self.nodes.push(Node{
                        id: id.to_owned(),
                        view: View::Table(Table{
                            insert:None,
                            remove:None,
                        }),
                        upstream: Vec::new(),
                        downstream: Vec::new(),
                    });
                    let fields = change.fields.clone();
                    // compiler tables will never be missing, so it's safe to just put dummy names in here
                    let names = change.fields.iter().map(|_| "".to_owned()).collect();
                    self.outputs.push(RefCell::new(Relation::new(id.to_owned(), fields, names)));
                    self.outputs[self.outputs.len()-1].borrow_mut().change(change);
                }
            }
        }
    }

    pub fn as_changes(&self) -> Changes {
        (0..self.nodes.len()).map(|ix|
            (
                self.nodes[ix].id.clone(),
                self.outputs[ix].borrow().as_insert()
            )
        ).collect()
    }

    pub fn changes_from(&self, old_self: Self) -> Changes {
        let mut changes = Vec::new();
        for (ix, node) in self.nodes.iter().enumerate() {
            match old_self.get_ix(&node.id[..]) {
                Some(old_ix) => {
                    let new_output = self.outputs[ix].borrow();
                    let old_output = old_self.outputs[old_ix].borrow();
                    if new_output.fields == old_output.fields {
                        let change = new_output.change_from(&*old_output);
                        changes.push((node.id.clone(), change));
                    } else {
                        changes.push((node.id.clone(), old_output.as_remove()));
                        changes.push((node.id.clone(), new_output.as_insert()));
                    }
                }
                None => {
                    let new_output = self.outputs[ix].borrow();
                    changes.push((node.id.clone(), new_output.as_insert()));
                }
            }
        }
        for (old_ix, old_node) in old_self.nodes.iter().enumerate() {
            match self.get_ix(&old_node.id[..]) {
                Some(_) => {
                    () // already handled above
                }
                None => {
                    let old_output = old_self.outputs[old_ix].borrow();
                    changes.push((old_node.id.clone(), old_output.as_remove()));
                }
            }
        }
        changes
    }

    pub fn recalculate(&mut self) {
        let error_ix = self.get_ix("error").unwrap();
        let Flow{ref nodes, ref mut outputs, ref mut errors, ref mut dirty, ..} = *self;
        let code_schema = compiler::code_schema();
        while let Some(ix) = dirty.iter().next() {
            dirty.remove(&ix);
            let node = &nodes[ix];
            let mut new_errors = &mut errors[ix];
            let mut old_errors = replace(new_errors, vec![]);
            let new_output = {
                let upstream = node.upstream.iter().map(|&ix| outputs[ix].borrow()).collect::<Vec<_>>();
                let inputs = upstream.iter().map(|borrowed| &**borrowed).collect::<Vec<_>>();
                node.view.run(&*outputs[ix].borrow(), &inputs[..], &mut new_errors)
            };
            let errors_changed = outputs[error_ix].borrow_mut().change_raw(new_errors.clone(), old_errors);
            if errors_changed {
                for ix in nodes[error_ix].downstream.iter() {
                    dirty.insert(*ix);
                }
            }
            match new_output {
                None => (), // view does not want to update
                Some(new_output) => {
                    let change = new_output.change_from(&*outputs[ix].borrow());
                    if (change.insert.len() != 0) || (change.remove.len() != 0) {
                        if code_schema.iter().find(|&&(ref code_id, _)| **code_id == node.id).is_some() {
                            self.needs_recompile = true;
                        }
                        for ix in node.downstream.iter() {
                            dirty.insert(*ix);
                        }
                    }
                    outputs[ix] = RefCell::new(new_output);
                }
            }
        }
    }

    pub fn tick(&mut self) -> bool {
        let code_schema = compiler::code_schema();
        let mut flow_changed = false;
        for (ix, node) in self.nodes.iter().enumerate() {
            match node.view {
                View::Table(Table{ref insert, ref remove}) => {
                    let view_changed = {
                        let upstream = node.upstream.iter().map(|ix| self.outputs[*ix].borrow()).collect::<Vec<_>>();
                        let inputs = upstream.iter().map(|borrowed| &**borrowed).collect::<Vec<_>>();
                        let mut inserts = match *insert {
                            Some(ref select) => select.select(&inputs[..]),
                            None => vec![],
                        };
                        let mut removes = match *remove {
                            Some(ref select) => select.select(&inputs[..]),
                            None => vec![],
                        };
                        self.outputs[ix].borrow_mut().change_raw(inserts, removes)
                    };
                    if view_changed {
                        if code_schema.iter().find(|&&(ref code_id, _)| **code_id == node.id).is_some() {
                            self.needs_recompile = true;
                        }
                        for ix in node.downstream.iter() {
                            self.dirty.insert(*ix);
                        }
                    }
                    flow_changed = flow_changed || view_changed;
                }
                _ => () // only tables tick
            }
        }
        flow_changed
    }

    pub fn quiesce(&mut self, changes: Changes)  {
        time!("changing", {
            self.change(changes);
        });
        loop {
            if self.needs_recompile {
                time!("compiling", {
                    compiler::recompile(self);
                });
            }
            time!("calculating", {
                self.recalculate();
            });
            let changed = time!("ticking", {
                self.tick()
            });
            if !changed {
                break
            }
        }
    }
}
