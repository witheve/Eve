use value::{Value};

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
    AsNumber,
    AsText,
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
        let mut type_error = || {
            errors.push(vec![
                String(source.to_owned()),
                string!("Type error while calling: {:?} {:?}", self, &values)
                ]);
            vec![]
        };
        match (*self, &values[..]) {
            // NOTE be aware that arguments will be in alphabetical order by field id
            (LT, [ref a, ref b]) => if a < b {vec![vec![]]} else {vec![]},
            (LTE, [ref a, ref b]) => if a <= b {vec![vec![]]} else {vec![]},
            (NEQ, [ref a, ref b]) => if a != b {vec![vec![]]} else {vec![]},
            (Add, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(a), Some(b)) => vec![vec![Float(a+b)]],
                    _ => type_error(),
                }
            }
            (Subtract, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(a), Some(b)) => vec![vec![Float(a-b)]],
                    _ => type_error(),
                }
            }
            (Multiply, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(a), Some(b)) => vec![vec![Float(a*b)]],
                    _ => type_error(),
                }
            }
            (Divide, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(_), Some(0f64)) => type_error(),
                    (Some(a), Some(b)) => vec![vec![Float(a/b)]],
                    _ => type_error(),
                }
            }
            (Remainder, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(a), Some(b)) => vec![vec![Float(a%b)]],
                    _ => type_error(),
                }
            }
            (Round, [ref a, ref b]) => {
                match (a.parse_as_f64(), b.parse_as_f64()) {
                    (Some(a), Some(b)) => vec![vec![Float((a*10f64.powf(b)).round()/10f64.powf(b))]],
                    _ => type_error(),
                }
            }
            (Contains, [ref inner, ref outer]) => {
              let inner_lower = format!("{}", inner).to_lowercase();
              let outer_lower = format!("{}", outer).to_lowercase();
              vec![vec![Bool(outer_lower.contains(&inner_lower))]]
            },
            (Split, [ref delimiter, ref text]) => {
                format!("{}", text).split(&format!("{}", delimiter)).enumerate().map(|(ix, segment)|
                    vec![Float((ix + 1) as f64), String(segment.to_owned())]
                    ).collect()
            },
            (Concat, [ref a, ref b]) => vec![vec![string!("{}{}", a, b)]],
            (AsNumber, [ref a]) => {
                match a.parse_as_f64() {
                    Some(a) => vec![vec![Float(a)]],
                    None => type_error(),
                }
            }
            (AsText, [ref a]) => vec![vec![string!("{}", a)]],
            (Count, [&Column(ref column)]) => vec![vec![Float(column.len() as f64)]],
            (Sum, [ref a]) => {
                match a.parse_as_f64_vec() {
                    Some(a) => {
                        if a.len() == 0 {
                            vec![vec![Float(0f64)]]
                        } else {
                            let sum = a.iter().fold(0f64, |acc, value| { acc + value });
                            vec![vec![Float(sum)]]
                        }
                    }
                    None => type_error(),
                }
            }
            (Mean, [ref a]) => {
                match a.parse_as_f64_vec() {
                    Some(a) => {
                        if a.len() == 0 {
                            vec![vec![Float(0f64)]]
                        } else {
                            let sum = a.iter().fold(0f64, |acc, value| { acc + value });
                            let mean = sum / (a.len() as f64);
                            vec![vec![Float(mean)]]
                        }
                    }
                    None => type_error(),
                }
            }
            (StandardDeviation, [ref a]) => {
                match a.parse_as_f64_vec() {
                    Some(a) => {
                        if a.len() == 0 {
                            vec![vec![Float(0f64)]]
                        } else {
                            let sum = a.iter().fold(0f64, |acc, value| { acc + value });
                            let mean = sum / (a.len() as f64);
                            let sum_squares = a.iter().fold(0f64, |acc, value| { acc + value.powi(2) });
                            let standard_deviation = ((sum_squares / (a.len() as f64)) - mean.powi(2)).sqrt();
                            vec![vec![Float(standard_deviation)]]
                        }
                    }
                    None => type_error(),
                }
            }
            _ => type_error(),
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
            "as number" => Primitive::AsNumber,
            "as text" => Primitive::AsText,
            "count" => Primitive::Count,
            "sum" => Primitive::Sum,
            "mean" => Primitive::Mean,
            "standard deviation" => Primitive::StandardDeviation,
            _ => panic!("Unknown primitive: {:?}", string),
        }
    }
}

// List of (view_id, scalar_input_field_ids, vector_input_field_ids, output_field_ids, description)
pub fn primitives() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>, &'static str)> {
    vec![
        ("<", vec!["A", "B"], vec![], vec![], "Is A less than B?"),
        ("<=", vec!["A", "B"], vec![], vec![], "Is A less than or equal to B?"),
        ("!=", vec!["A", "B"], vec![], vec![], "Is A not equal to B?"),
        ("+", vec!["A", "B"], vec![], vec!["result"], "A plus B."),
        ("-", vec!["A", "B"], vec![], vec!["result"], "A minus B."),
        ("*", vec!["A", "B"], vec![], vec!["result"], "A times B."),
        ("/", vec!["A", "B"], vec![], vec!["result"], "A divided by B."),
        ("remainder", vec!["A", "B"], vec![], vec!["result"], "The remainder of A after dividing by B."),
        ("round", vec!["A", "B"], vec![], vec!["result"], "Round A to B decimal places."),
        ("contains", vec!["inner", "outer"], vec![], vec!["result"], "Does the outer text contain the inner text?"),
        ("split", vec!["delimiter", "text"], vec![], vec!["ix", "segment"], "Split the text into a new segment at each occurence of the delimiter."),
        ("concat", vec!["A", "B"], vec![], vec!["result"], "Join the texts A and B together."),
        ("as number", vec!["A"], vec![], vec!["result"], "Store A internally as a number."),
        ("as text", vec!["A"], vec![], vec!["result"], "Store A internally as text."),
        ("count", vec![], vec!["A"], vec!["result"], "Count the number of elements in A."),
        ("sum", vec![], vec!["A"], vec!["result"], "Sum together the elements of A."),
        ("mean", vec![], vec!["A"], vec!["result"], "Take the mean of the elements of A."),
        ("standard deviation", vec![], vec!["A"], vec!["result"], "Take the standard deviation of the elements of A."),
    ]
}
