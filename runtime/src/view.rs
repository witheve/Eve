use value::{Field, Value, Tuple};
use relation::{Relation, SingleSelect, Reference, MultiSelect};

#[derive(Clone, Debug)]
pub struct Table {
    pub insert: Option<SingleSelect>,
    pub remove: Option<SingleSelect>,
}

#[derive(Clone, Debug)]
pub struct Union {
    pub selects: Vec<SingleSelect>,
}

#[derive(Clone, Debug)]
pub enum ConstraintOp {
    EQ,
    NEQ,
    LT,
    GT,
    LTE,
    GTE,
}

#[derive(Clone, Debug)]
pub struct Constraint {
    pub left: Reference,
    pub op: ConstraintOp,
    pub right: Reference,
}

impl Constraint {
    fn is_satisfied_by(&self, tuples: &[Tuple]) -> bool {
        let left = self.left.resolve(tuples);
        let right = self.right.resolve(tuples);
        match self.op {
            ConstraintOp::EQ => left == right,
            ConstraintOp::NEQ => left != right,
            ConstraintOp::LT => left < right,
            ConstraintOp::GT => left > right,
            ConstraintOp::LTE => left <= right,
            ConstraintOp::GTE => left >= right,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Join {
    pub constraints: Vec<Vec<Constraint>>,
    pub select: MultiSelect,
}

#[derive(Clone, Debug)]
pub enum View {
    Table(Table),
    Union(Union),
    Join(Join),
}

#[derive(Clone, Debug)]
enum Action {
    Up,
    Next,
    Down,
}

impl View {
    pub fn run(&self, old_output: &Relation, inputs: Vec<&Relation>) -> Option<Relation> {
        match *self {
            View::Table(_) => None,
            View::Union(ref union) => {
                assert_eq!(union.selects.len(), inputs.len());
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                for (select, input) in union.selects.iter().zip(inputs.into_iter()) {
                    for values in select.select(input) {
                        output.index.insert(values);
                    }
                }
                Some(output)
            }
            View::Join(ref join) => {
                assert_eq!(join.constraints.len(), inputs.len());
                let mut output = Relation::with_fields(old_output.fields.clone(), old_output.names.clone());
                let num_inputs = inputs.len();
                let mut iters = Vec::with_capacity(num_inputs);
                let mut tuples = Vec::with_capacity(num_inputs);
                let mut next_action = Action::Down;
                loop {
                    match next_action {
                        Action::Down => {
                            if tuples.len() == num_inputs {
                                output.index.insert(join.select.select(&tuples[..]));
                                next_action = Action::Next;
                            } else {
                                let iter = inputs[tuples.len()].iter();
                                iters.push(iter);
                                tuples.push(Tuple{fields: &[], names: &[], values: &[]}); // dummy value
                                next_action = Action::Next;
                            }
                        }
                        Action::Next => {
                            let ix = iters.len() - 1;
                            match iters[ix].next() {
                                Some(tuple) => {
                                    tuples[ix] = tuple;
                                    if join.constraints[ix].iter().all(|constraint|
                                        constraint.is_satisfied_by(&tuples[..])) {
                                        next_action = Action::Down;
                                    } else {
                                        next_action = Action::Next;
                                    }
                                }
                                None => {
                                    next_action = Action::Up;
                                }
                            }
                        }
                        Action::Up => {
                            if tuples.len() == 0 {
                                break;
                            } else {
                                iters.pop();
                                tuples.pop();
                                next_action = Action::Next;
                            }
                        }
                    }
                }
                Some(output)
            }
        }
    }
}