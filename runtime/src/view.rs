#[derive(Clone, Debug)]
pub struct Table;

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
}

impl View {
    pub fn is_table(&self) -> bool {
        match *self {
            View::Table(_) => true,
        }
    }
}