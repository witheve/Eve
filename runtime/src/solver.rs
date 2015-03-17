#[derive(PartialEq, Clone, PartialOrd, Debug)] // TODO can't lookup NaN
pub enum Value {
    String(String),
    Float(f64),
    Tuple(Tuple),
    Relation(Relation),
}

pub type Tuple = Vec<Value>;
pub type Relation = Vec<Vec<Value>>; // a set of tuples

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
pub enum ConstraintReference {
    Constant{value: Value},
    Value{clause: usize, column: usize},
}

#[derive(Clone, Debug)]
pub struct Constraint {
    pub my_column: usize,
    pub op: ConstraintOp,
    pub other_ref: ConstraintReference,
}

impl Constraint {
    fn prepare<'a>(&'a self, result: &'a Vec<Value>) -> &'a Value {
        match self.other_ref {
            ConstraintReference::Constant{ref value} =>
                value,
            ConstraintReference::Value{clause, column} => {
                match result[clause] {
                    Value::Tuple(ref tuple) => &tuple[column],
                    _ => panic!("Expected a tuple"),
                }
            }
        }
    }

    // bearing in mind that Value is only PartialOrd so this may do weird things with NaN
    fn test(&self, my_row: &Vec<Value>, other_value: &Value) -> bool {
        let my_value = &my_row[self.my_column];
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
    pub relation: Relation,
    pub constraints: Vec<Constraint>,
}

impl Source {
    fn constrained_to(&self, result: &Vec<Value>) -> Relation {
        // TODO apply constraints
        let prepared: Vec<&Value> = self.constraints.iter().map(|constraint| constraint.prepare(result)).collect();
        self.relation.iter().filter(|row|
            self.constraints.iter().zip(prepared.iter()).all(|(constraint, value)|
                constraint.test(row, value)
            )
        ).map(|row| row.clone()).collect()
    }
}

#[derive(Clone, Debug)]
pub enum Clause {
    Tuple(Source),
    Relation(Source),
    // Function(...),
}

impl Clause {
    fn constrained_to(&self, result: &Vec<Value>) -> Vec<Value> {
        match self {
            &Clause::Tuple(ref source) => {
                let relation = source.constrained_to(result);
                relation.into_iter().map(|tuple| Value::Tuple(tuple)).collect()
            },
            &Clause::Relation(ref source) => {
                let relation = source.constrained_to(result);
                vec![Value::Relation(relation)]
            }
        }
    }
}

pub struct Query {
    pub clauses: Vec<Clause>,
}

// an iter over results of the query, where each result is either:
// * a `max_len` tuple indicating a valid result
// * a smaller tuple indicating a backtrack point
pub struct QueryIter<'a> {
    query: &'a Query,
    max_len: usize, // max length of a result
    now_len: usize, // ixes[0..now_len] and values[0..now_len] are all valid for the next result
    has_next: bool, // are there any more results to be found
    ixes: Vec<usize>, // index of the value last returned by each clause
    values: Vec<Vec<Value>>, // the constrained relations representing each clause
}

impl Query {
    pub fn iter(&self) -> QueryIter {
        let max_len = self.clauses.len();
        QueryIter{
            query: &self,
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
            let values = self.query.clauses[i].constrained_to(&result);
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