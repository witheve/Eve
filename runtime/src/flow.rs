use std::collections::{BTreeSet};
use std::cell::{RefCell, Ref, RefMut};
use std::mem::replace;

use bit_set::BitSet;

use value::{Id, Value};
use relation::{Change, Relation};
use view::{View};
use compiler;

// The flow graph tracks the state of each view and is responsible for keeping them up-to-date
#[derive(Clone, Debug)]
pub struct Flow {
    pub nodes: Vec<Node>,
    pub outputs: Vec<RefCell<Relation>>, // the current state of eachview
    pub errors: Vec<Vec<Vec<Value>>>, // the errors caused by the last run of each view
    pub dirty: BitSet, // a set of views which need to be rerun
    pub needs_recompile: bool, // when a code view is changed, the flow needs to be recompiled before the next tick
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub view: View, // specifies how to run this view
    pub upstream: Vec<usize>, // list of views which directly affect the state of this view
    pub downstream: Vec<usize>, // list of views whose state is directly affected by this view
}

pub type Changes = Vec<(Id, Change)>;

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
                    let changed = self.outputs[ix].borrow_mut().change(change);
                    if changed {
                        if code_schema.iter().find(|&&(ref code_id, _)| **code_id == id).is_some() {
                            self.needs_recompile = true;
                        }
                        for ix in self.nodes[ix].downstream.iter() {
                            self.dirty.insert(*ix);
                        }
                    }
                }
                None => {
                    println!("Warning: creating a dummy view because you tried to change a non-existing view with id: {:?}", id);
                    self.nodes.push(Node{
                        id: id.to_owned(),
                        view: View::Table,
                        upstream: Vec::new(),
                        downstream: Vec::new(),
                    });
                    let fields = change.fields.clone();
                    // compiler tables will never be missing and it's safe to just put dummy names in for other tables
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

    // x.change(y.changes_from(x)) == y
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
                        // if the fields have changed we need to produce two separate changes
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

    // Run all views until fixpoint is reached
    pub fn recalculate(&mut self) {
        let error_ix = self.get_ix("error").unwrap();
        let Flow{ref nodes, ref mut outputs, ref mut errors, ref mut dirty, ..} = *self;
        let code_schema = compiler::code_schema();
        while let Some(ix) = dirty.iter().next() {
            dirty.remove(&ix);
            let node = &nodes[ix];
            let mut new_errors = &mut errors[ix];
            let old_errors = replace(new_errors, vec![]);
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

    // Tick until fixpoint
    pub fn quiesce(&mut self, changes: Changes)  {
        self.change(changes);
        loop {
            if self.needs_recompile {
                compiler::recompile(self);
            }
            self.recalculate();
            let changed = false; // TODO once we have internal state change we need to check diffs
            if !changed && !self.needs_recompile {
                break
            }
        }
    }
}
