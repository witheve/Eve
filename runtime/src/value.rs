use std::ops;
use std::cmp::Ordering;

use index::Index;

#[derive(Clone, Debug, PartialOrd, PartialEq)]
pub enum Value {
    String(String),
    Float(f64),
    Tuple(Tuple),
    Relation(Relation),
}
pub type Tuple = Vec<Value>;
pub type Relation = Index<Vec<Value>>; // a set of tuples

impl Ord for Value {
    fn cmp(&self, other: &Value) -> Ordering {
        self.partial_cmp(other).unwrap() // TODO this will panic on NaN
    }
}

impl Eq for Value {} // TODO this is unsafe for NaN

impl ops::Index<usize> for Value {
    type Output = Value;

    fn index(&self, index: &usize) -> &Value {
        match *self {
            Value::Tuple(ref tuple) => tuple.index(index),
            _ => panic!("Indexing a non-tuple value"),
        }
    }
}

trait ToValue {
    fn to_value(self) -> Value;
}

impl<'a> ToValue for &'a str {
    fn to_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl ToValue for String {
    fn to_value(self) -> Value {
        Value::String(self)
    }
}

impl ToValue for f64 {
    fn to_value(self) -> Value {
        Value::Float(self)
    }
}

impl<A: ToValue> ToValue for (A,) {
    fn to_value(self) -> Value {
        let (a,) = self;
        Value::Tuple(vec![a.to_value()])
    }
}

impl<A: ToValue, B: ToValue> ToValue for (A,B) {
    fn to_value(self) -> Value {
        let (a,b) = self;
        Value::Tuple(vec![a.to_value(), b.to_value()])
    }
}

impl<A: ToValue, B: ToValue, C: ToValue> ToValue for (A,B,C) {
    fn to_value(self) -> Value {
        let (a,b,c) = self;
        Value::Tuple(vec![a.to_value(), b.to_value(), c.to_value()])
    }
}

impl<A: ToValue, B: ToValue, C: ToValue, D: ToValue> ToValue for (A,B,C,D) {
    fn to_value(self) -> Value {
        let (a,b,c,d) = self;
        Value::Tuple(vec![a.to_value(), b.to_value(), c.to_value(), d.to_value()])
    }
}

impl<A: ToValue, B: ToValue, C: ToValue, D: ToValue, E: ToValue> ToValue for (A,B,C,D,E) {
    fn to_value(self) -> Value {
        let (a,b,c,d,e) = self;
        Value::Tuple(vec![a.to_value(), b.to_value(), c.to_value(), d.to_value(), e.to_value()])
    }
}