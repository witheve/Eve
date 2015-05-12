use relation::{Relation, Select};

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Select,
    pub remove: Select,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub selects: Vec<Select>,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
    Union(Union),
}

impl View {
    pub fn run(&self, old_output: &Relation, sources: Vec<&Relation>) -> Option<Relation> {
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), sources.len());
                let mut output = Relation::with_fields(old_output.fields.clone());
                for (select, upstream) in union.selects.iter().zip(sources.into_iter()) {
                    select.select_into(&mut output, upstream);
                }
                Some(output)
            }
        }
    }
}