use value::Value;
use index::Index;

#[derive(PartialEq, Eq, Clone, Debug)]
pub enum Reference {
    Constant{value: Value},
    Variable{source: usize, field: usize},
}

impl Reference {
    pub fn resolve<'a>(&'a self, results: &'a[&'a [Value]]) -> &Value {
        match *self {
            Reference::Constant{ref value} => value,
            Reference::Variable{source, field} => &results[source][field],
        }
    }
}

#[derive(PartialEq, Eq, Clone, Debug)]
pub enum ConstraintOperation {
    LT,
    LTE,
    EQ,
    NEQ,
    GT,
    GTE,
}

#[derive(PartialEq, Eq, Clone, Debug)]
pub struct Constraint {
    left: Reference,
    operation: ConstraintOperation,
    right: Reference,
}

impl Constraint {
    pub fn satisfied_by(&self, results: &[&[Value]]) -> bool {
        let left = self.left.resolve(results);
        let right = self.right.resolve(results);
        match self.operation {
            ConstraintOperation::LT => left < right,
            ConstraintOperation::LTE => left <= right,
            ConstraintOperation::EQ => left == right,
            ConstraintOperation::NEQ => left != right,
            ConstraintOperation::GT => left > right,
            ConstraintOperation::GTE => left >= right,
        }
    }
}

struct Join {
    constraints: Vec<Vec<Constraint>>,
    selects: Vec<Reference>,
}

type Source = Index<Vec<Value>>;

impl Join {
    pub fn calculate(&self, sources: Vec<Source>) -> Vec<Vec<Value>> {
        unimplemented!()
    }
}



// vec [source ix -> &row]
// vec [source ix -> iter]
// next bounces the current iter
// up drops an iter and nexts and downs
// down installs a new iter
// go down, install new iter, hit next until find a match
// if reach end, return and next
// if hit none, drop iter and up and next