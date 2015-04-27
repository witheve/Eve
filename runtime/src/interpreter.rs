use value::*;
use value::Value::Float;
use query::Ref;
use self::EveFn::*;

// Enums...
// Expression Enum ------------------------------------------------------------
#[derive(Clone, Debug)]
pub enum Expression {
	Ref(Ref),
	Variable(Variable),
	Call(Call),
	Match(Box<Match>),
}

// End Expression Enum --------------------------------------------------------

#[derive(Clone,Debug)]
pub enum EveFn {
	// Basic ops
	Add,Subtract,Multiply,Divide,Exponentiate,

	// General math
	Sqrt,Log,Log10,Log2,Ln,Abs,Sign,Exp,

	// Trig
	Sin,Cos,Tan,ASin,ACos,ATan,ATan2,

	// Aggregates
	Sum,Prod,

	// Relations
	Limit,

	// Strings
	StrConcat,StrUpper,StrLower,StrLength,StrReplace,StrSplit,
}

#[derive(Clone,Debug)]
pub struct Match {
	pub input: Expression,
	pub patterns: PatternVec,
	pub handlers: ExpressionVec,
}

// Begin Pattern Enum ---------------------------------------------------------
#[derive(Clone,Debug)]
pub enum Pattern {
	Constant(Ref),
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
		Expression::Ref(ref r) => r.resolve(result,None).clone(),
		Expression::Call(ref c) => eval_call(c,result),
		Expression::Match(ref m) => eval_match(m,result),
		_ => unimplemented!(),
	}
}


fn eval_match(m: &Match, result: &Vec<Value>) -> Value {

	// Before we do anything, make sure we have the same number of patterns and
	// handlers
	assert_eq!(m.patterns.len(),m.handlers.len());

	let input = eval_expression(&m.input,result);


	for (pattern, handler) in m.patterns.iter().zip(m.handlers.iter()) {
		match pattern {
			&Pattern::Constant(ref x) => {
				match x {
					&Ref::Constant{ref value} => {
						if input == value.clone() {
							return eval_expression(&handler,result)
						}
					}
					_ => panic!("TODO"),
				}
			}
			_ => panic!("TODO"),
		}
	};

	Value::String(String::from_str("TODO: No match found"))
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
			let w: Vec<Value> = s.split_whitespace().map(|x| Value::String(String::from_str(x))).collect();
			Value::Tuple(w)
		},

		// Aggregate functions
		(&Sum,[Value::Relation(ref rel)]) => {

			assert_eq!(c.args.len(),1);

			let sum = rel.iter()
						 .map(|r| r[get_ref_column(&c.args[0])].clone())
						 .fold(0f64,|acc,x| {
							acc + match x {
								Value::Float(y) => y,
							  	other => panic!("Cannot accumulate {:?}",other),
						 	}
						 });

			Value::Float(sum)
		},

		/*
		(&Prod,[Value::Tuple(ref x)]) => {
			Value::Float(x.iter().fold(1f64, |acc: f64, ref item| {
				match item {
					&&Value::Float(ref y) => acc*y,
					x => panic!("Cannot aggregate {:?}",x),
				}
			}))
		},
		*/

		// Relation returning functions
		(&Limit,[Value::Relation(ref rel),Float(n)]) => {

			// TODO should limit to more elements than we have
			// give an error?

			let q: Vec<_> = rel.iter()
							   .map(|r| r.clone())
							   .take(n as usize)
							   .collect();

 			Value::Relation(q.into_iter().collect())

		}

		// Returns an empty string for the purpose of handling incomplete function
		(_, _) => Value::String(String::from_str("Could not match with any function")),
	}
}

// This is as little hacky, but works for now
fn get_ref_column(e: &Expression) -> usize {

	match e {
		&Expression::Ref(ref r) => match r {
			&Ref::Value{column,..} => column,
			_ => panic!("Expected Ref::Value"),
		},
		_ => panic!("Expected Expression::Ref"),
	}

}