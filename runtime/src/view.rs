#[derive(Clone, Debug)]
pub struct Table;

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
}