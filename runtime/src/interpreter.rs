use value::*;
use value::Value::Float;
use query::Ref;
use self::EveFn::*;


// Enums...
// Expression Enum ------------------------------------------------------------
#[derive(Clone, Debug)]
pub enum Expression {
	Constant(Constant),
	Variable(Variable),
	Call(Call),
	Match(Box<Match>),
	Value(Value),
}

impl Expression {
    pub fn constrained_to(&self, result: &Vec<Value>) -> Vec<Value> {
        match *self {
            Expression::Call(ref call) => {
                let value = call.eval(result);
                vec![value]
            }
            Expression::Match(ref evematch) => {
                let value = evematch.eval(result);
                vec![value]
            }
            _ => unimplemented!(),
        }
    }
}

// End Expression Enum --------------------------------------------------------

#[derive(Clone,Debug)]
pub enum EveFn {
	// Basic ops
	Add,Subtract,Multiply,Divide,Exponentiate,

	// General math
	Sqrt,Log,Log10,Log2,Ln,Abs,Sign,Exp,

	//Trig
	Sin,Cos,Tan,ASin,ACos,ATan,ATan2,

	// Aggregates
	Sum,Prod,

	// Strings
	StrConcat,StrUpper,StrLower,StrLength,StrReplace,StrSplit,
}

#[derive(Clone,Debug)]
pub struct Match {
	pub input: Expression,
	pub patterns: PatternVec,
	pub handlers: ExpressionVec,
}

impl Match {
    fn eval(&self, result: &Vec<Value>) -> Value {

        evaluate(&Expression::Match(Box::new(self.clone())),result)

    }
}


// Begin Pattern Enum ---------------------------------------------------------
#[derive(Clone,Debug)]
pub enum Pattern {
	Constant(Constant),
	Variable(Variable),
	Tuple(PatternVec),
}

/*
impl<'a> PartialEq<Value> for &'a Pattern {
	fn eq(&self, other: &Value) -> bool {
		match self {
			&&Pattern::Constant(ref x) => eval_constant(x) == *other,
			&&Pattern::Variable(_) => panic!("Cannot match Variable against Value"),
			&&Pattern::Tuple(_) => panic!("Cannot match Tuple against Value"),
		}
	}
}
*/
// End Pattern Enum -----------------------------------------------------------

#[derive(Clone,Debug)]
pub struct Call {
	pub fun: EveFn,
	pub args: ExpressionVec,
}

impl Call {
    pub fn eval(&self, result: &Vec<Value>) -> Value {
        evaluate(&Expression::Call(self.clone()),result)
    }
}

#[derive(Clone,Debug)]
pub enum Constant {
	Value(Value),
	Ref(Ref),
}

// Some type aliases
pub type Variable = String;
pub type PatternVec = Vec<Pattern>;
pub type ExpressionVec = Vec<Expression>;

// This is the main interface to the interpreter. Pass in an expression, get
// back a value
pub fn evaluate(e: & Expression, result: &Vec<Value>) -> Value {

	eval_expression(e,result)

}

fn eval_expression(e: &Expression, result: &Vec<Value>) -> Value {

	match *e {
		Expression::Call(ref x) => eval_call(x,result),
		Expression::Constant(ref x) => eval_constant(x,result),
		Expression::Value(ref x) => x.clone(),
		Expression::Match(ref x) => eval_match(x,result),
		_ => unimplemented!(),
	}
}

fn eval_constant(c: &Constant, result: &Vec<Value>) -> Value {
	match c {
		&Constant::Value(ref x) => x.clone(),
		&Constant::Ref(ref x) => x.resolve(result,None).clone(),
	}
}


fn eval_match(m: &Match, result: &Vec<Value>) -> Value {

	// Before we do anything, make sure we have the same number of patterns and
	// handlers
	assert_eq!(m.patterns.len(),m.handlers.len());

	let input = eval_expression(&m.input,result);
	let tests: Vec<Value> = m.patterns.iter()
						  			  .zip(m.handlers.iter())
						  			  .filter_map(|(pattern,handler)| -> Option<Value> {
						  			  				match pattern {
						  			  					&Pattern::Constant(ref x) => {
						  			  						if eval_expression(&Expression::Constant(x.clone()),result) == input { Some(eval_expression(&handler,result)) }
															else { None }
						  			  					}
						  			  					_ => panic!("TODO"),
						  			  				}
												})
						  			  .take(1)
						  			  .collect();

	Value::Tuple(tests)
}


fn eval_call(c: &Call, result: &Vec<Value>) -> Value {

	let args: Vec<Value> = c.args.iter().map(|ref e| eval_expression(e,result)).collect();

	match(&c.fun, &args[..]) {

		// Basic Math
		(&Add,[Float(x),Float(y)]) => Float(x+y),
		(&Subtract,[Float(x),Float(y)]) => Float(x-y),
		(&Multiply,[Float(x),Float(y)]) => Float(x*y),
		(&Divide,[Float(x),Float(y)]) => {
			match (x,y) {
				(_,0f64) => panic!("Error: Division by 0"),
				(x,y) => Float(x/y),
			}
		},
		(&Exponentiate,[Float(x),Float(y)]) => Float(x.powf(y)),

		// Some general math functions
		(&Abs,[Float(x)]) => Float(x.abs()),
		(&Sqrt,[Float(x)]) => Float(x.sqrt()),
		(&Sign,[Float(x)]) => Float(x.signum()),
		(&Exp,[Float(x)]) => Float(x.exp()),
		(&Ln,[Float(x)]) => {
			if x <= 0f64 {panic!("Error: ln(x<=0) is undefined")}
			else {Float(x.ln())}
		},
		(&Log10,[Float(x)]) => {
			if x <= 0f64 {panic!("Error: log10(x<=0) is undefined")}
			else {Float(x.log10())}
		},
		(&Log2,[Float(x)]) => {
			if x <= 0f64 {panic!("Error: log2(x<=0) is undefined")}
			else {Float(x.log2())}
		},

		// Trig functions
		(&Sin,[Float(x)]) => Float(x.sin()),
		(&Cos,[Float(x)]) => Float(x.cos()),
		(&Tan,[Float(x)]) => Float(x.tan()),
		(&ASin,[Float(x)]) => Float(x.asin()),
		(&ACos,[Float(x)]) => Float(x.acos()),
		(&ATan,[Float(x)]) => Float(x.atan()),
		(&ATan2,[Float(x),Float(y)]) => Float(x.atan2(y)),

		// String functions
		(&StrConcat,[Value::String(ref s1),Value::String(ref s2)]) => Value::String(s1.to_string()+&s2[..]),
		(&StrUpper,[Value::String(ref s)]) => Value::String(s.to_uppercase()),
		(&StrLower,[Value::String(ref s)]) => Value::String(s.to_lowercase()),
		(&StrLength,[Value::String(ref s)]) => Float(s.len() as f64),
		(&StrReplace,[Value::String(ref s),Value::String(ref q),Value::String(ref r)]) => Value::String(s.replace(&q[..],&r[..])),
		(&StrSplit,[Value::String(ref s)]) => {
			let w: Vec<Value> = s.words().map(|x| Value::String(String::from_str(x))).collect();
			Value::Tuple(w)
		},

		/*
		// Aggregate functions
		(&Sum,[Value::Tuple(ref x)]) => {
			Value::Float(x.iter().fold(0f64, |acc: f64, ref item| {
				match item {
					&&Value::Float(ref y) => acc+y,
					x => panic!("Cannot aggregate {:?}",x),
				}
			}))
		},
		(&Prod,[Value::Tuple(ref x)]) => {
			Value::Float(x.iter().fold(1f64, |acc: f64, ref item| {
				match item {
					&&Value::Float(ref y) => acc*y,
					x => panic!("Cannot aggregate {:?}",x),
				}
			}))
		},
		*/

		// Returns an empty string for the purpose of handling incomplete function
		(_, _) => Value::String(String::from_str("Could not match with any function")),
	}
}