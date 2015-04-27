use value::{Value, Tuple, Relation};
use interpreter::{Call, Match, Expression};
use query::Ref;

// Convenient hacks for writing tests
// Do not use in production code

pub trait ToValue {
    fn to_value(self) -> Value;
}

pub trait ToTuple {
    fn to_tuple(self) -> Tuple;
}

pub trait ToRelation {
    fn to_relation(self) -> Relation;
}

impl ToValue for Value {
    fn to_value(self) -> Value {
        self
    }
}

impl ToValue for bool {
    fn to_value(self) -> Value {
        Value::Bool(self)
    }
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

impl ToValue for i32 {
     fn to_value(self) -> Value {
        Value::Float(self.clone() as f64)
    }
}

impl ToValue for i64 {
     fn to_value(self) -> Value {
        Value::Float(self.clone() as f64)
    }
}

impl ToValue for Tuple {
    fn to_value(self) -> Value {
        Value::Tuple(self)
    }

}

impl ToValue for usize {
    fn to_value(self) -> Value {
        Value::Float(self as f64)
    }
}

// impl<T: ToTuple> ToValue for T {
//     fn to_value(self) -> Value {
//         Value::Tuple(self.to_tuple())
//     }
// }

// impl<T: ToRelation> ToValue for T where T: !ToTuple {
//     fn to_value(self) -> Value {
//         Value::Relation(self.to_relation())
//     }
// }

impl<A: ToValue> ToTuple for (A,) {
    fn to_tuple(self) -> Vec<Value> {
        let (a,) = self;
        vec![a.to_value()]
    }
}

impl<A: ToValue, B: ToValue> ToTuple for (A,B) {
    fn to_tuple(self) -> Vec<Value> {
        let (a,b) = self;
        vec![a.to_value(), b.to_value()]
    }
}

impl<A: ToValue, B: ToValue, C: ToValue> ToTuple for (A,B,C) {
    fn to_tuple(self) -> Vec<Value> {
        let (a,b,c) = self;
        vec![a.to_value(), b.to_value(), c.to_value()]
    }
}

impl<A: ToValue, B: ToValue, C: ToValue, D: ToValue> ToTuple for (A,B,C,D) {
    fn to_tuple(self) -> Vec<Value> {
        let (a,b,c,d) = self;
        vec![a.to_value(), b.to_value(), c.to_value(), d.to_value()]
    }
}

impl<A: ToValue, B: ToValue, C: ToValue, D: ToValue, E: ToValue> ToTuple for (A,B,C,D,E) {
    fn to_tuple(self) -> Vec<Value> {
        let (a,b,c,d,e) = self;
        vec![a.to_value(), b.to_value(), c.to_value(), d.to_value(), e.to_value()]
    }
}

impl<T: ToTuple> ToRelation for Vec<T> {
    fn to_relation(self) -> Relation {
        self.into_iter().map(|t| t.to_tuple()).collect()
    }
}

pub trait ToExpression { fn to_expr(self) -> Expression; }

impl ToExpression for Expression { fn to_expr(self) -> Expression { self } }
impl ToExpression for Call { fn to_expr(self) -> Expression { Expression::Call(self) } }
impl ToExpression for i32 { fn to_expr(self) -> Expression { Expression::Ref(Ref::Constant{value: self.to_value()}) } }
impl ToExpression for f64 { fn to_expr(self) -> Expression { Expression::Ref(Ref::Constant{value: self.to_value()}) } }
impl<'a> ToExpression for &'a str { fn to_expr(self) -> Expression { Expression::Ref(Ref::Constant{value: self.to_value()}) } }
impl ToExpression for Match { fn to_expr(self) -> Expression { Expression::Match( Box::new(self)) } }