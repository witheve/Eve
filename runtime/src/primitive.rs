use value::{Value};

#[derive(Clone, Debug, Copy)]
pub enum Primitive {
    Add,
    Subtract,
    Count,
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
    pub fn eval_from_join<'a>(&self, arguments: &[usize], inputs: &[&Value]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        let values = arguments.iter().map(|ix| inputs[*ix]).collect::<Vec<_>>();
        match (*self, &values[..]) {
            (Add, [&Float(a), &Float(b)]) => vec![vec![Float(a+b)]],
            (Subtract, [&Float(a), &Float(b)]) => vec![vec![Float(a-b)]],
            (Count, _) => panic!("Cannot use {:?} in a join", self),
            (Sum, _) => panic!("Cannot use {:?} in a join", self),
            (Mean, _) => panic!("Cannot use {:?} in a join", self),
            (StandardDeviation, _) => panic!("Cannot use {:?} in a join", self),
            (Empty, _) => panic!("Cannot use {:?} in a join", self),
            _ => panic!("Type error while calling: {:?} {:?}", self, &arguments)
        }
    }

    pub fn eval_from_aggregate<'a>(&self, arguments: &[usize], constants: &[Value], outer: &[Value], inner: &[Vec<Value>]) -> Vec<Vec<Value>> {
        use primitive::Primitive::*;
        use value::Value::*;
        match (*self, arguments) {
            (Add, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Subtract, _) => panic!("Cannot use {:?} in an aggregate", self),
            (Count, [_]) => {
                vec![vec![Float(inner.len() as f64)]]
            }
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
            "mean" => Primitive::Mean,
            "standard deviation" => Primitive::StandardDeviation,
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
        ("mean", vec![], vec!["in"], vec!["out"]),
        ("standard deviation", vec![], vec!["in"], vec!["out"]),
        ("empty", vec![], vec!["in"], vec!["out"]),
    ]
}