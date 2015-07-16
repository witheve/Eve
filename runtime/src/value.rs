use std::cmp::Ordering;
use std::ops::Index;

#[derive(Clone, PartialOrd, PartialEq)]
pub enum Value {
    Null, // only used internally - not visible to users
    Bool(bool),
    String(String),
    Float(f64),
    Column(Vec<Value>),
}

impl ::std::fmt::Debug for Value {
    fn fmt(&self, formatter: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        match *self {
            Value::Null => formatter.write_str("null").unwrap(),
            Value::Bool(bool) => bool.fmt(formatter).unwrap(),
            Value::String(ref string) => string.fmt(formatter).unwrap(),
            Value::Float(float) => float.fmt(formatter).unwrap(),
            Value::Column(ref column) => column.fmt(formatter).unwrap(),
        };
        Ok(())
    }
}

pub type Id = String; // TODO use uuid?

impl Ord for Value {
    fn cmp(&self, other: &Value) -> Ordering {
        self.partial_cmp(other).unwrap() // TODO this will panic on NaN
    }
}

impl Eq for Value {} // TODO this is unsafe for NaN

impl Value {
    pub fn as_str(&self) -> &str {
        match *self {
            Value::String(ref string) => &*string,
            _ => panic!("Cannot convert this to string: {:?}", self),
        }
    }

    pub fn as_f64(&self) -> f64 {
        match *self {
            Value::Float(float) => float,
            _ => panic!("Cannot convert this to f64: {:?}", self),
        }
    }

    pub fn as_i64(&self) -> i64 {
        match *self {
            Value::Float(float) => {
                let result = float as i64;
                if float == (result as f64) {
                    result
                } else {
                    panic!("Cannot convert this to i64: {:?}", self)
                }
            }
            _ => panic!("Cannot convert this to i64: {:?}", self),
        }
    }

    pub fn as_usize(&self) -> usize {
        match *self {
            Value::Float(float) => {
                let result = float as usize;
                if float == (result as f64) {
                    result
                } else {
                    panic!("Cannot convert this to usize: {:?}", self)
                }
            },
            _ => panic!("Cannot convert this to usize: {:?}", self),
        }
    }
}

pub type Field = Id;

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Tuple<'a> {
    pub view: &'a str,
    pub names: &'a [String],
    pub values: &'a [Value],
}

impl<'a, 'b> Index<&'b str> for Tuple<'a> {
    type Output = Value;
    fn index<'c>(&'c self, index: &'b str) -> &'c Value {
        let ix = self.names.iter().position(|name| &name[..] == index).unwrap();
        &self.values[ix]
    }
}

impl<'a> ::std::fmt::Debug for Tuple<'a> {
    fn fmt(&self, formatter: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        let mut debug_struct = formatter.debug_struct(self.view);
        for (name, value) in self.names.iter().zip(self.values.iter()) {
            debug_struct.field(name, value);
        }
        debug_struct.finish().unwrap();
        Ok(())
    }
}
