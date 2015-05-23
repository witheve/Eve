use relation::Change;
use flow::Flow;
use value::{Value};

#[derive(Clone, Debug, Copy)]
pub enum Primitive {
    Add,
    Subtract,
    Count,
}

impl Primitive {
    pub fn eval<'a>(self, arguments: &[&Value]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        match (self, arguments) {
            (Add, [&Float(a), &Float(b)]) => vec![vec![Float(a+b)]],
            (Subtract, [&Float(a), &Float(b)]) => vec![vec![Float(a-b)]],
            (Count, _) => unimplemented!(), // what would the interface even be...  eval_scalar vs eval_vector?
            _ => panic!("Type error while calling: {:?} {:?}", self, &arguments)
        }
    }

    pub fn from_str(string: &str) -> Self {
        match string {
            "add" => Primitive::Add,
            "subtract" => Primitive::Subtract,
            "count" => Primitive::Count,
            _ => panic!("Unknown primitive: {:?}", string),
        }
    }
}

pub fn primitives() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>)> {
    vec![
        ("add", vec!["in A", "in B"], vec![], vec!["out"]),
        ("subtract", vec!["in A", "in B"], vec![], vec!["out"]),
        ("count", vec![], vec!["in"], vec!["out"]),
    ]
}

pub fn install(flow: &mut Flow) {
    let mut view_values = Vec::new();
    let mut field_values = Vec::new();
    let mut display_name_values = Vec::new();
    for (name, scalar_inputs, vector_inputs, outputs) in primitives().into_iter() {
        view_values.push(vec![string!("{}", name), string!("primitive")]);
        display_name_values.push(vec![string!("{}", name), string!("{}", name)]);
        for field in scalar_inputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("scalar input")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
        for field in vector_inputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("vector input")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
        for field in outputs.into_iter() {
            field_values.push(vec![string!("{}: {}", name, field), string!("{}", name), string!("output")]);
            display_name_values.push(vec![string!("{}: {}", name, field), string!("{}", field)]);
        }
    }
    flow.get_output_mut("view").change(Change{
        fields: vec!["view: view".to_owned(), "view: kind".to_owned()],
        insert: view_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("field").change(Change{
        fields: vec!["field: field".to_owned(), "field: view".to_owned(), "field: kind".to_owned()],
        insert: field_values,
        remove: Vec::new(),
    });
    flow.get_output_mut("display name").change(Change{
        fields: vec!["display name: id".to_owned(), "display name: name".to_owned()],
        insert: display_name_values,
        remove: Vec::new(),
    });
}