use relation::Change;
use flow::Flow;
use value::{Value, Field, Tuple};
use relation::Reference;

#[derive(Clone, Debug, Copy)]
pub enum Primitive {
    Add,
    Subtract,
    Count,
    Sum,
    Empty,
}

// TODO we hackily assign source numbers to inner and outer
//      will be fixed when Reference goes away
const OUTER: usize = 0;
const INNER: usize = 1;

impl Reference {
    pub fn resolve_as_vector<'a>(&'a self, outer: &'a Tuple, inner_fields: &[Field], inner_values: &'a [Vec<Value>]) -> Vec<&Value> {
        match *self {
            Reference::Constant{ref value} => {
                vec![value]
            },
            Reference::Variable{source, ref field} => {
                match source {
                    OUTER => {
                        vec![outer.field(field)]
                    }
                    INNER => {
                        let ix = inner_fields.iter().position(|inner_field| inner_field == field).unwrap();
                        inner_values.iter().map(|values| &values[ix]).collect()
                    }
                    _ => unreachable!(),
                }
            }
        }
    }
}

impl Primitive {
    pub fn eval_from_join<'a>(&self, arguments: &[Reference], inputs: &[Tuple]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        let values = arguments.iter().map(|reference|
            reference.resolve(&inputs[..])
            ).collect::<Vec<_>>();
        match (*self, &values[..]) {
            (Add, [&Float(a), &Float(b)]) => vec![vec![Float(a+b)]],
            (Subtract, [&Float(a), &Float(b)]) => vec![vec![Float(a-b)]],
            (Count, _) => panic!("Cannot use {:?} in a join", self),
            (Sum, _) => panic!("Cannot use {:?} in a join", self),
            (Empty, _) => panic!("Cannot use {:?} in a join", self),
            _ => panic!("Type error while calling: {:?} {:?}", self, &arguments)
        }
    }

    pub fn eval_from_aggregate<'a>(&self, arguments: &[Reference], outer: &Tuple, inner_fields: &[Field], inner_values: &[Vec<Value>]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        match (*self, arguments) {
            (Add, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Subtract, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Count, [_]) => {
                vec![vec![Float(inner_values.len() as f64)]]
            }
            (Sum, [ref in_ref]) => {
                let in_values = in_ref.resolve_as_vector(outer, inner_fields, inner_values);
                let sum = in_values.iter().fold(0f64, |sum, value|
                    match **value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, in_values),
                    });
                vec![vec![Float(sum)]]
            },
            (Empty, [ref in_ref]) => {
                let in_values = in_ref.resolve_as_vector(outer, inner_fields, inner_values);
                vec![vec![Bool(in_values.len() == 0)]]
            }
            _ => panic!("Wrong number of arguments while calling: {:?} {:?}", self, arguments),
        }
    }

    pub fn from_str(string: &str) -> Self {
        match string {
            "add" => Primitive::Add,
            "subtract" => Primitive::Subtract,
            "count" => Primitive::Count,
            "sum" => Primitive::Sum,
            "empty" => Primitive::Empty,
            _ => panic!("Unknown primitive: {:?}", string),
        }
    }
}

pub fn primitives() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>)> {
    vec![
        ("add", vec!["in A", "in B"], vec![], vec!["out"]),
        ("subtract", vec!["in A", "in B"], vec![], vec!["out"]),
        ("count", vec![], vec!["in"], vec!["out"]),
        ("sum", vec![], vec!["in"], vec!["out"]),
        ("empty", vec![], vec!["in"], vec!["out"]),
    ]
}