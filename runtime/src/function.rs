use relation::Change;
use flow::Flow;
use value::Value;

#[derive(Clone, Debug, Copy)]
pub enum Function {
    Add
}

pub fn eval(function: Function, arguments: &[Value]) -> Value {
    use function::Function::*;
    use value::Value::*;
    match (function, arguments) {
        (Add, [Float(a), Float(b)]) => Float(a+b),
        _ => panic!("Type error from calling: {:?} {:?}", function, &arguments)
    }
}

pub fn from_str(string: &str) -> Function {
    match string {
        "add" => Function::Add,
        _ => panic!("Unknown function: {:?}", string),
    }
}

pub fn functions() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>)> {
    vec![
        ("add", vec!["in A", "in B"], vec![], vec!["out"]),
    ]
}

pub fn install(flow: &mut Flow) {
    let mut view_values = Vec::new();
    let mut field_values = Vec::new();
    let mut display_name_values = Vec::new();
    for (name, scalar_inputs, vector_inputs, outputs) in functions().into_iter() {
        view_values.push(vec![string!("{}", name), string!("primitive")]);
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