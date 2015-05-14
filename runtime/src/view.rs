use relation::{Relation, Select};

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Option<Select>,
    pub remove: Option<Select>,
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
    pub fn run(&self, old_output: &Relation, inputs: Vec<&Relation>) -> Option<Relation> {
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), inputs.len());
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                for (select, input) in union.selects.iter().zip(inputs.into_iter()) {
                    for values in select.select(input) {
                        output.index.insert(values);
                    }
                }
                Some(output)
            }
        }
    }
}