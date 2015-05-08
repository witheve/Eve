use std::cell::RefCell;

use relation::{Changes, Relation};

#[derive(Clone, Debug)]
pub struct Table {
    pub relation: RefCell<Relation>,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
}

impl View {
    pub fn as_changes(&self) -> Changes {
        match *self {
            View::Table(ref table) => table.relation.borrow().as_changes()
        }
    }
}