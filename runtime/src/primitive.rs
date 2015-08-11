use value::{Value};
use std::str::FromStr;
use std::f64;

// Primitive views are how Eve programs access built-in functions
#[derive(Clone, Debug, Copy)]
pub enum Primitive {
    LT,
    LTE,
    NEQ,
    Add,
    Subtract,
    Multiply,
    Divide,
    Remainder,
    Round,
    Split,
    Concat,
    ParseFloat,
    Count,
    Contains,
    Sum,
    Mean,
    StandardDeviation,
}

impl Primitive {
    pub fn eval<'a>(&self, input_bindings: &[(usize, usize)], inputs: &[Value], source: &str, errors: &mut Vec<Vec<Value>>) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        let values = input_bindings.iter().enumerate().map(|(ix, &(field_ix, variable_ix))| {
            assert_eq!(ix, field_ix);
            &inputs[variable_ix]
        }).collect::<Vec<_>>();
        match (*self, &values[..]) {
            // NOTE be aware that arguments will be in alphabetical order by field id
            (LT, [ref a, ref b]) => if a < b {vec![vec![]]} else {vec![]},
            (LTE, [ref a, ref b]) => if a <= b {vec![vec![]]} else {vec![]},
            (NEQ, [ref a, ref b]) => if a != b {vec![vec![]]} else {vec![]},
            (Add, [&Float(a), &Float(b)]) => vec![vec![Float(a+b)]],
            (Subtract, [&Float(a), &Float(b)]) => vec![vec![Float(a-b)]],
            (Multiply, [&Float(a), &Float(b)]) => vec![vec![Float(a*b)]],
            (Divide, [&Float(a), &Float(b)]) => vec![vec![Float(a/b)]],
            (Remainder, [&Float(a), &Float(b)]) => vec![vec![Float(a%b)]], // akin to C-like languages, the % operator is remainder,
            (Round, [&Float(a), &Float(b)]) => vec![vec![Float((a*10f64.powf(b)).round()/10f64.powf(b))]],
            (Contains, [&String(ref inner), &String(ref outer)]) => {
              let inner_lower = &inner.to_lowercase();
              let outer_lower = &outer.to_lowercase();
              vec![vec![Bool(outer_lower.contains(inner_lower))]]
            },
            (Split, [&String(ref split), &String(ref string)]) => {
                string.split(split).enumerate().map(|(ix, segment)| vec![Float(ix as f64), String(segment.to_owned())]).collect()
            },
            (Concat, [ref a, ref b]) => vec![vec![string!("{}{}", a, b)]],
            (ParseFloat, [&String(ref a)]) => {
                match f64::from_str(&a) {
                    Ok(v) => vec![vec![Float(v), Bool(true)]],
                    _ => vec![vec![Float(f64::MAX), Bool(false)]]
                }
            },
            (Count, [&Column(ref column)]) => vec![vec![Float(column.len() as f64)]],
            (Sum, [&Column(ref column)]) => {
                let sum = column.iter().fold(0f64, |sum, value|
                    match *value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, column),
                    });
                vec![vec![Float(sum)]]
            }
            (Mean, [&Column(ref column)]) => {
                let sum = column.iter().fold(0f64, |sum, value|
                    match *value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, column),
                    });
                let mean = sum / (column.len() as f64);
                vec![vec![Float(mean)]]
            },
            (StandardDeviation, [&Column(ref column)]) => {
                let sum = column.iter().fold(0f64, |sum, value|
                    match *value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, column),
                    });
                let sum_squares = column.iter().fold(0f64, |sum, value|
                    match *value {
                        Float(float) => sum + float.powi(2),
                        _ => panic!("Type error while calling: {:?} {:?}", self, column),
                    });
                let standard_deviation = ((sum_squares - sum.powi(2)) / (column.len() as f64)).sqrt();
                vec![vec![Float(standard_deviation)]]
            }
            _ => {
                errors.push(vec![
                    String(source.to_owned()),
                    string!("Type error while calling: {:?} {:?}", self, values)
                ]);
                vec![]
            }
        }
    }

    pub fn from_str(string: &str) -> Self {
        match string {
            "<" => Primitive::LT,
            "<=" => Primitive::LTE,
            "!=" => Primitive::NEQ,
            "+" => Primitive::Add,
            "-" => Primitive::Subtract,
            "*" => Primitive::Multiply,
            "/" => Primitive::Divide,
            "remainder" => Primitive::Remainder,
            "round" => Primitive::Round,
            "contains" => Primitive::Contains,
            "split" => Primitive::Split,
            "concat" => Primitive::Concat,
            "parse float" => Primitive::ParseFloat,
            "count" => Primitive::Count,
            "sum" => Primitive::Sum,
            "mean" => Primitive::Mean,
            "standard deviation" => Primitive::StandardDeviation,
            _ => panic!("Unknown primitive: {:?}", string),
        }
    }
}

// List of (view_id, scalar_input_field_ids, vector_input_field_ids, output_field_ids)
pub fn primitives() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>)> {
    vec![
        ("<", vec!["in A", "in B"], vec![], vec![]),
        ("<=", vec!["in A", "in B"], vec![], vec![]),
        ("!=", vec!["in A", "in B"], vec![], vec![]),
        ("+", vec!["in A", "in B"], vec![], vec!["out"]),
        ("-", vec!["in A", "in B"], vec![], vec!["out"]),
        ("*", vec!["in A", "in B"], vec![], vec!["out"]),
        ("/", vec!["in A", "in B"], vec![], vec!["out"]),
        ("remainder", vec!["in A", "in B"], vec![], vec!["out"]),
        ("round", vec!["in A", "in B"], vec![], vec!["out"]),
        ("contains", vec!["inner", "outer"], vec![], vec!["out"]),
        ("split", vec!["split", "string"], vec![], vec!["ix", "segment"]),
        ("concat", vec!["a", "b"], vec![], vec!["out"]),
        ("parse float", vec!["a"], vec![], vec!["out", "valid"]),
        ("count", vec![], vec!["in"], vec!["out"]),
        ("sum", vec![], vec!["in"], vec!["out"]),
        ("mean", vec![], vec!["in"], vec!["out"]),
        ("standard deviation", vec![], vec!["in"], vec!["out"]),
    ]
}
