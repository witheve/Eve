use std::cmp::Ordering;
use std::str::FromStr;
use std::f64;

// A single Eve value
#[derive(Clone, PartialOrd, PartialEq)]
pub enum Value {
    Null, // only used internally - not visible to users
    Bool(bool),
    String(String),
    Float(f64),
    Column(Vec<Value>),
    Row{ // planning to replace this with a much smaller representation
        view_id: String,
        field_ids: Vec<String>,
        values: Vec<Value>,
    }
}

impl ::std::fmt::Debug for Value {
    fn fmt(&self, formatter: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        match *self {
            Value::Null => formatter.write_str("null"),
            Value::Bool(bool) => bool.fmt(formatter),
            Value::String(ref string) => string.fmt(formatter),
            Value::Float(float) => float.fmt(formatter),
            Value::Column(ref column) => column.fmt(formatter),
            Value::Row{ref view_id, ref field_ids, ref values} => {
                let mut debug_struct = formatter.debug_struct(view_id);
                for (field_id, value) in field_ids.iter().zip(values.iter()) {
                    debug_struct.field(field_id, value);
                }
                debug_struct.finish()
            }
        }
    }
}

impl ::std::fmt::Display for Value {
    fn fmt(&self, formatter: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        match *self {
            Value::Null => formatter.write_str("null"),
            Value::Bool(bool) => bool.fmt(formatter),
            Value::String(ref string) => string.fmt(formatter),
            Value::Float(float) => float.fmt(formatter),
            Value::Column(ref column) => formatter.debug_list().entries(column.iter()).finish(),
            Value::Row{..} => ::std::fmt::Debug::fmt(self, formatter), // TODO how should we coerce rows to string?
        }
    }
}

pub type Id = String; // TODO we will eventually add a UUID type

impl Ord for Value {
    fn cmp(&self, other: &Value) -> Ordering {
        self.partial_cmp(other).expect("Found a NaN") // TODO this will panic on NaN - maybe NaN should go through error pathway instead?
    }
}

impl Eq for Value {} // TODO this is panic on NaN - maybe NaN should go through error pathway instead?

impl Value {
    pub fn as_str(&self) -> &str {
        match *self {
            Value::String(ref string) => &*string,
            _ => panic!("Cannot convert this to string: {:?}", self),
        }
    }

    pub fn as_bool(&self) -> bool {
        match *self {
            Value::Bool(bool) => bool,
            _ => panic!("Cannot convert this to bool: {:?}", self),
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

    pub fn as_column(&self) -> &Vec<Value> {
        match *self {
            Value::Column(ref column) => column,
            _ => panic!("Cannot convert this to column: {:?}", self),
        }
    }

    pub fn as_column_mut(&mut self) -> &mut Vec<Value> {
        match *self {
            Value::Column(ref mut column) => column,
            _ => panic!("Cannot convert this to column: {:?}", self),
        }
    }

    pub fn parse_as_f64(&self) -> Option<f64> {
        match *self {
            Value::Float(float) => Some(float),
            Value::String(ref string) => {
                match f64::from_str(string) {
                    Ok(float) => Some(float),
                    Err(_) => None,
                }
            }
            _ => None,
        }
    }

    pub fn parse_as_f64_vec(&self) -> Option<Vec<f64>> {
        match *self {
            Value::Column(ref column) => {
                let mut floats = Vec::with_capacity(column.len());
                for value in column.iter() {
                    match value.parse_as_f64() {
                        Some(float) => floats.push(float),
                        None => return None,
                    }
                }
                return Some(floats)
            }
            _ => None,
        }
    }
}