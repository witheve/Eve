#[derive(PartialEq, Clone, Debug)] // TODO can't lookup NaN
pub enum Value {
    String(String),
    Float(f64),
    Tuple(Tuple),
    Relation(Relation),
}

pub type Tuple = Vec<Value>;
pub type Relation = Vec<Vec<Value>>; // a set of tuples

// #[derive(PartialEq, Eq, Clone, Debug)]
// enum ConstraintOp {
//     LT,
//     LTE,
//     EQ,
//     NEQ,
//     GT,
//     GTE,
// }

// #[derive(Clone, Debug)]
// struct Constraint {
//     op: ConstraintOp,
//     left: ConstraintReference,
//     right: ConstraintReference,
// }

#[derive(Clone, Debug)]
pub struct Source {
    pub relation: Relation,
    // constraints: Vec<Constraint>,
}

impl Source {
    fn constrained_to(&self, result: &Vec<Value>) -> &Relation {
        // TODO apply constraints
        &self.relation
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
            &Clause::Tuple(ref source) => source.constrained_to(result).iter().map(|tuple| Value::Tuple(tuple.clone())).collect(),
            &Clause::Relation(ref source) => vec![Value::Relation(source.constrained_to(result).clone())]
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