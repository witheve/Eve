use std::iter::IntoIterator;

use value::{Value, Tuple, Relation};
use interpreter;

#[derive(PartialEq, Eq, Clone, Debug)]
pub enum ConstraintOp {
    LT,
    LTE,
    EQ,
    NEQ,
    GT,
    GTE,
}

#[derive(Clone, Debug)]
pub enum Ref {
    Constant{value: Value},
    Value{clause: usize, column: usize},
    Tuple{clause: usize},
    Relation{clause: usize},
}

impl Ref {
    // TODO extra_row is a gross hack to handle constraints where both sides reference the same source
    pub fn resolve<'a>(&'a self, result: &'a Vec<Value>, extra_row: Option<&'a Vec<Value>>) -> &'a Value {
        match *self {
            Ref::Constant{ref value} => {
                value
            },
            Ref::Value{clause, column} => {
                if clause == result.len() {
                    &extra_row.unwrap()[column]
                } else {
                    match result[clause] {
                        Value::Tuple(ref tuple) => {
                            &tuple[column]
                        },
                        _ => panic!("Expected a tuple"),
                    }
                }
            },
            Ref::Tuple{clause} => {
                if clause == result.len() {
                    panic!("Can't refer to whole tuple of same source")
                } else {
                    let value = &result[clause];
                    match *value {
                        Value::Tuple(_) => {
                            value
                        },
                        _ => panic!("Expected a tuple"),
                    }
                }
            },
            Ref::Relation{clause} =>{
                if clause == result.len() {
                    panic!("Can't refer to whole relation of same source")
                } else {
                    let value = &result[clause];
                    match *value {
                        Value::Relation(_) => {
                            value
                        },
                        _ => panic!("Expected a relation"),
                    }
                }
            },
        }
    }
}

#[derive(Clone, Debug)]
pub struct Constraint {
    pub my_column: usize,
    pub op: ConstraintOp,
    pub other_ref: Ref,
}

impl Constraint {
    // bearing in mind that Value is only PartialOrd so this may do weird things with NaN
    fn test(&self, result: &Vec<Value>, row: &Vec<Value>) -> bool {
        let my_value = &row[self.my_column];
        let other_value = self.other_ref.resolve(result, Some(row));
        match self.op {
            ConstraintOp::LT => my_value < other_value,
            ConstraintOp::LTE => my_value <= other_value,
            ConstraintOp::EQ => my_value == other_value,
            ConstraintOp::NEQ => my_value != other_value,
            ConstraintOp::GT => my_value > other_value,
            ConstraintOp::GTE => my_value >= other_value,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Source {
    pub relation: usize,
    pub constraints: Vec<Constraint>,
}

impl Source {
    fn constrained_to(&self, inputs: &Vec<&Relation>, result: &Vec<Value>) -> Relation {
        let input = inputs[self.relation];
        input.iter().filter(|row| self.constraints
                                      .iter()
                                      .all(|constraint| constraint.test(result, row)))
                    .map(|row| row.clone())
                    .collect()
    }
}

#[derive(Clone, Debug)]
pub enum Clause {
    Tuple(Source),
    Relation(Source),
    Expression(interpreter::Expression),
}

impl Clause {
    fn constrained_to(&self, inputs: &Vec<&Relation>, result: &Vec<Value>) -> Vec<Value> {
        match *self {
            Clause::Tuple(ref source) => {
                let relation = source.constrained_to(inputs, result);
                relation.into_iter().map(|tuple| Value::Tuple(tuple)).collect()
            }
            Clause::Relation(ref source) => {
                let relation = source.constrained_to(inputs, result);
                vec![Value::Relation(relation)]
            }
            Clause::Expression(ref expression) => {
                expression.constrained_to(result)
            }
        }
    }
}

#[derive(Clone, Debug)]
pub struct Query {
    pub clauses: Vec<Clause>,
}

// an iter over results of the query, where each result is either:
// * a `max_len` tuple indicating a valid result
// * a smaller tuple indicating a backtrack point
pub struct QueryIter<'a> {
    query: &'a Query,
    inputs: Vec<&'a Relation>,
    max_len: usize, // max length of a result
    now_len: usize, // ixes[0..now_len] and values[0..now_len] are all valid for the next result
    has_next: bool, // are there any more results to be found
    ixes: Vec<usize>, // index of the value last returned by each clause
    values: Vec<Vec<Value>>, // the constrained relations representing each clause
}

impl Query {
    pub fn iter<'a>(&'a self, inputs: Vec<&'a Relation>) -> QueryIter {
        let max_len = self.clauses.len();
        QueryIter{
            query: &self,
            inputs: inputs,
            max_len: max_len,
            now_len: 0,
            has_next: true, // can always return at least the early fail
            ixes: vec![0; max_len],
            values: vec![vec![]; max_len]
        }
    }
}

impl<'a> Iterator for QueryIter<'a> {
    type Item = Tuple;

    fn next(&mut self) -> Option<Tuple> {
        if !self.has_next { return None };

        let mut result = vec![];

        // set known values
        for i in (0 .. self.now_len) {
            result.push(self.values[i][self.ixes[i]].clone());
        }

        // determine the values that changed since last time
        for i in (self.now_len .. self.max_len) {
            let values = self.query.clauses[i].constrained_to(&self.inputs, &result);
            if values.len() == 0 {
                break;
            } else {
                self.now_len = i + 1;
                result.push(values[0].clone());
                self.values[i] = values;
                self.ixes[i] = 0;
            }
        }

        // see if there is a next result
        self.has_next = false;
        for i in (0 .. self.now_len).rev() {
            let ix = self.ixes[i] + 1;
            if ix < self.values[i].len() {
                self.ixes[i] = ix;
                self.has_next = true;
                self.now_len = i + 1;
                break;
            }
        }

        Some(result)
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        (0, None) // ie no hints
    }
}