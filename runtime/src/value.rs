use std::ops;
use std::num::ToPrimitive;
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
            _ => panic!("Indexing a non-tuple value"),
        }
    }
}

impl ToPrimitive for Value {
    fn to_f64(&self) -> Option<f64> {
        match *self {
            Value::Float(ref float) => float.to_f64(),
            _ => None,
        }
    }
    fn to_i64(&self) -> Option<i64> {
        match *self {
            Value::Float(ref float) => float.to_i64(),
            _ => None,
        }
    }
    fn to_u64(&self) -> Option<u64> {
        match *self {
            Value::Float(ref float) => float.to_u64(),
            _ => None,
        }
    }
}

impl Value {
    pub fn as_str(&self) -> &str {
        match *self {
            Value::String(ref string) => &*string,
            _ => panic!("Not a string: {:?}", self),
        }
    }

    pub fn as_slice(&self) -> &[Value] {
        match *self {
            Value::Tuple(ref tuple) => &*tuple,
            _ => panic!("Not a tuple: {:?}", self),
        }
    }
}