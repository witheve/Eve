use std::collections::BitSet;
use std::mem::replace;
use std::cell::{RefCell, Ref, RefMut};

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
    pub dirty: BitSet,
}

impl Flow {
    pub fn new() -> Self {
        let mut flow = Flow {
            nodes: Vec::new(),
            outputs: Vec::new(),
            dirty: BitSet::new(),
        };
        let schema = compiler::schema();
        for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
            let node = Node{
                id: (*id).to_owned(),
                view: View::Table(Table),
                upstream: Vec::new(),
                downstream: Vec::new(),
            };
            let mut fields = unique_fields.iter().chain(other_fields.iter())
                .map(|&field| field.to_owned()).collect::<Vec<_>>();
            fields.sort(); // fields are implicitly sorted in the compiler - need to use the same ordering here
            let relation = RefCell::new(Relation::with_fields(fields));
            flow.nodes.push(node);
            flow.outputs.push(relation);
        }
        let mut view_values = Vec::new();
        let mut field_values = Vec::new();
        for &(ref id, ref unique_fields, ref other_fields) in schema.iter() {
            view_values.push(vec![
                Value::String((*id).to_owned()),
                Value::String("table".to_owned())
                ]);
            for &field in unique_fields.iter().chain(other_fields.iter()) {
                field_values.push(vec![
                    Value::String((*field).to_owned()),
                    Value::String((*id).to_owned()),
                    Value::String("output".to_owned()),
                    ]);
            }
        }
        flow.get_output_mut("view").change(&Change{
            fields: vec!["view".to_owned(), "kind".to_owned()],
            insert: view_values,
            remove: Vec::new(),
        });
        flow.get_output_mut("field").change(&Change{
            fields: vec!["field".to_owned(), "view".to_owned(), "kind".to_owned()],
            insert: field_values,
            remove: Vec::new(),
        });
        flow
    }

    pub fn get_ix(&self, id: &str) -> Option<usize> {
        self.nodes.iter().position(|node| &node.id[..] == id)
    }

    pub fn get_output(&self, id: &str) -> Ref<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow()
    }

    pub fn get_output_mut(&self, id: &str) -> RefMut<Relation> {
        self.outputs[self.get_ix(id).unwrap()].borrow_mut()
    }

    pub fn set_output(&mut self, id: &str, output: RefCell<Relation>) {
        let ix = self.get_ix(id).unwrap();
        self.outputs[ix] = output;
    }

    pub fn change(&mut self, changes: &Changes) {
        for &(ref id, ref changes) in changes.iter() {
            match self.get_ix(&*id) {
                Some(ix) => match self.nodes[ix].view {
                    View::Table(_) => {
                        self.outputs[ix].borrow_mut().change(changes);
                        self.dirty.insert(ix);
                    }
                    _ => panic!("Tried to insert into a non-table view with id: {:?}", id),
                },
                None => panic!("Tried to insert into a non-existent view with id: {:?}", id),
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

    pub fn recalculate(&mut self, changes: &mut Changes) {
        while let Some(ix) = self.dirty.iter().next() {
            self.dirty.remove(&ix);
            let node = &self.nodes[ix];
            let new_output = {
                let upstream = node.upstream.iter().map(|&ix| self.outputs[ix].borrow()).collect::<Vec<_>>();
                let sources = upstream.iter().map(|borrowed| &**borrowed).collect();
                node.view.run(&*self.outputs[ix].borrow(), sources)
            };
            match new_output {
                None => (), // view does not want to update
                Some(new_output) => {
                    let change = new_output.change_from(&*self.outputs[ix].borrow());
                    if (change.insert.len() > 0) || (change.remove.len() > 0) {
                        changes.push((node.id.clone(), change));
                        for &ix in node.downstream.iter() {
                            self.dirty.insert(ix);
                        }
                    }
                    self.outputs[ix] = RefCell::new(new_output);
                }
            }
        }
    }

    pub fn tick(&mut self, changes: &mut Changes) {
        // TODO
    }

    pub fn quiesce(mut self, mut changes: Changes) -> (Self, Changes) {
        self.change(&changes);
        let mut changes_seen = 0;
        loop {
            if compiler::needs_recompile(&changes[changes_seen..]) {
                self = compiler::recompile(self, &mut changes);
            }
            changes_seen = changes.len();
            self.recalculate(&mut changes);
            self.tick(&mut changes);
            if changes.len() == changes_seen {
                break;
            }
        }
        (self, changes)
    }
}
