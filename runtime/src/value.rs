use std::ops;
use std::cmp::Ordering;

use index::Index;

#[derive(Clone, Debug, PartialOrd, PartialEq)]
pub enum Value {
    Bool(bool),
    String(String),
    Float(f64),
    Tuple(Tuple),
    Relation(Relation),
}
pub type Tuple = Vec<Value>;
pub type Relation = Index<Vec<Value>>; // a set of tuples
pub type Id = String; // TODO use uuid?

impl Ord for Value {
    fn cmp(&self, other: &Value) -> Ordering {
        self.partial_cmp(other).unwrap() // TODO this will panic on NaN
    }
}

impl Eq for Value {} // TODO this is unsafe for NaN

impl ops::Index<usize> for Value {
    type Output = Value;

    fn index(&self, index: usize) -> &Value {
        match *self {
            Value::Tuple(ref tuple) => tuple.index(index),
            _ => panic!("Cannot index into this non-tuple value: {:?}", self),
        }
    }
}

impl Value {
    pub fn as_str(&self) -> &str {
        match *self {
            Value::String(ref string) => &*string,
            _ => panic!("Cannot convert this to string: {:?}", self),
        }
    }

    pub fn as_slice(&self) -> &[Value] {
        match *self {
            Value::Tuple(ref tuple) => &*tuple,
            _ => panic!("Cannot convert this to tuple: {:?}", self),
        }
    }
    pub fn to_f64(&self) -> Option<f64> {
        match *self {
            Value::Float(float) => Some(float),
            _ => None,
        }
    }
    pub fn to_i64(&self) -> Option<i64> {
        match *self {
            Value::Float(float) => {
                let result = float as i64;
                if float == (result as f64) {
                    Some(result)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
    pub fn to_usize(&self) -> Option<usize> {
        match *self {
            Value::Float(float) => {
                let result = float as usize;
                if float == (result as f64) {
                    Some(result)
                } else {
                    None
                }
            },
            _ => None,
        }
    }
}