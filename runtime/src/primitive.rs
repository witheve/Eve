use value::{Value};
use std::str::FromStr;
use std::f64;

#[derive(Clone, Debug, Copy)]
pub enum Primitive {
    LT,
    LTE,
    NEQ,
    Add,
    Subtract,
    Multiply,
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
    Empty,
}

pub fn resolve_as_scalar<'a>(mut ix: usize, constants: &'a [Value], outer: &'a [Value]) -> &'a Value {
    if ix < constants.len() {
        return &constants[ix];
    } else {
        ix = ix - constants.len()
    }
    return &outer[ix];
}

pub fn resolve_as_vector<'a>(mut ix: usize, constants: &'a [Value], outer: &'a [Value], inner: &'a [Vec<Value>]) -> Vec<&'a Value> {
    if ix < constants.len() {
        return vec![&constants[ix]; inner.len()];
    } else {
        ix = ix - constants.len()
    }
    if ix < outer.len() {
        return vec![&outer[ix]; inner.len()];
    } else {
        ix = ix - outer.len()
    }
    return inner.iter().map(|values| &values[ix]).collect();
}

impl Primitive {
    pub fn eval_from_join<'a>(&self, input_bindings: &[(usize, usize)], inputs: &[Value]) -> Vec<Vec<Value>> {
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
            (Concat, [&String(ref a), &String(ref b)]) => vec![vec![String(a.to_owned() + b)]],
            (Concat, [&String(ref a), &Float(ref b)]) => vec![vec![String(a.to_owned() + &format!("{}", b))]],
            (Concat, [&Float(ref a), &String(ref b)]) => vec![vec![String(format!("{}", a) + b)]],
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
            (Empty, _) => vec![vec![Bool(false)]], // TODO empty doesn't make sense with non-outer joins
            _ => panic!("Type error while calling: {:?} {:?}", self, values)
        }
    }

    pub fn eval_from_aggregate<'a>(&self, arguments: &[usize], constants: &[Value], outer: &[Value], inner: &[Vec<Value>]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        match (*self, arguments) {
            // NOTE be aware that arguments will be in alphabetical order by field id
            (LT, _) => panic!("Cannot use {:?} in an aggregate", self),
            (LTE, _) => panic!("Cannot use {:?} in an aggregate", self),
            (NEQ, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Add, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Subtract, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Multiply, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Remainder, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Round, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Contains, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Split, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Concat, _) => panic!("Cannot use {:?} in an aggregate", self),
            (ParseFloat, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Count, [_]) => {
                vec![vec![Float(inner.len() as f64)]]
            },
            (Sum, [in_ix]) => {
                let in_values = resolve_as_vector(in_ix, constants, outer, inner);
                let sum = in_values.iter().fold(0f64, |sum, value|
                    match **value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, in_values),
                    });
                vec![vec![Float(sum)]]
            },
            (Mean, [in_ix]) => {
                let in_values = resolve_as_vector(in_ix, constants, outer, inner);
                let sum = in_values.iter().fold(0f64, |sum, value|
                    match **value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, in_values),
                    });
                let mean = sum / (in_values.len() as f64);
                vec![vec![Float(mean)]]
            },
            (StandardDeviation, [in_ix]) => {
                let in_values = resolve_as_vector(in_ix, constants, outer, inner);
                let sum = in_values.iter().fold(0f64, |sum, value|
                    match **value {
                        Float(float) => sum + float,
                        _ => panic!("Type error while calling: {:?} {:?}", self, in_values),
                    });
                let sum_squares = in_values.iter().fold(0f64, |sum, value|
                    match **value {
                        Float(float) => sum + float.powi(2),
                        _ => panic!("Type error while calling: {:?} {:?}", self, in_values),
                    });
                let standard_deviation = ((sum_squares - sum.powi(2)) / (in_values.len() as f64)).sqrt();
                vec![vec![Float(standard_deviation)]]
            },
            (Empty, [in_ix]) => {
                let in_values = resolve_as_vector(in_ix, constants, outer, inner);
                vec![vec![Bool(in_values.len() == 0)]]
            },
            _ => panic!("Wrong number of arguments while calling: {:?} {:?}", self, arguments),
        }
    }

    pub fn from_str(string: &str) -> Self {
        match string {
            "<" => Primitive::LT,
            "<=" => Primitive::LTE,
            "!=" => Primitive::NEQ,
            "add" => Primitive::Add,
            "subtract" => Primitive::Subtract,
            "multiply" => Primitive::Multiply,
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
            "empty" => Primitive::Empty,
            _ => panic!("Unknown primitive: {:?}", string),
        }
    }
}

pub fn primitives() -> Vec<(&'static str, Vec<&'static str>, Vec<&'static str>, Vec<&'static str>)> {
    vec![
        ("<", vec!["in A", "in B"], vec![], vec![]),
        ("<=", vec!["in A", "in B"], vec![], vec![]),
        ("!=", vec!["in A", "in B"], vec![], vec![]),
        ("add", vec!["in A", "in B"], vec![], vec!["out"]),
        ("subtract", vec!["in A", "in B"], vec![], vec!["out"]),
        ("multiply", vec!["in A", "in B"], vec![], vec!["out"]),
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
        ("empty", vec![], vec!["in"], vec!["out"]),
    ]
}
