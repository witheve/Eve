use value::{Value};
use value;
use self::EveFn::*;
use value::Value::Float;

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

// Begin Pattern Enum ---------------------------------------------------------
#[derive(Clone,Debug)]
pub enum Pattern {
	Constant(Constant),
	Variable(Variable),
	Tuple(PatternVec),
}

impl<'a> PartialEq<Value> for &'a Pattern {
	fn eq(&self, other: &Value) -> bool {
		match self {
			&&Pattern::Constant(ref x) => x == other,
			&&Pattern::Variable(_) => panic!("Cannot match Variable against Value"),
			&&Pattern::Tuple(_) => panic!("Cannot match Tuple against Value"),
		}
	}
}
// End Pattern Enum -----------------------------------------------------------

#[derive(Clone,Debug)]
pub struct Call {
	pub fun: EveFn,
	pub args: ExpressionVec,
}

// Some type aliases
pub type Constant = Value;
pub type Variable = String;
pub type PatternVec = Vec<Pattern>;
pub type ExpressionVec = Vec<Expression>;

// This is the main interface to the interpreter. Pass in an expression, get
// back a value
pub fn evaluate(e: & Expression) -> Value {

	eval_expression(e)

}

fn eval_expression(e: &Expression) -> Value {

	match *e {
		Expression::Call(ref x) => eval_call(x),
		Expression::Constant(ref x) => x.clone(),
		Expression::Value(ref x) => x.clone(),
		Expression::Match(ref x) => eval_match(x),
		_ => unimplemented!(),
	}
}

fn eval_match(m: &Match) -> Value {

	// Before we do anything, make sure we have the same number of patterns and
	// handlers
	assert_eq!(m.patterns.len(),m.handlers.len());

	let input = eval_expression(&m.input);
	let tests: Vec<Value> = m.patterns.iter()
						  			  .zip(m.handlers.iter())
						  			  .filter_map(|(pattern,handler)| -> Option<Value> {
													if pattern == input { Some(eval_expression(&handler)) }
													else { None }
												})
						  			  .take(1)
						  			  .collect();

	Value::Tuple(tests)
}

fn eval_call(c: &Call) -> Value {

	let args: Vec<Value> = c.args.iter().map(eval_expression).collect();

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
			let w: Vec<Value> = s.words().map(|x| Value::String(x.to_string())).collect();
			Value::Tuple(w)
		},

		// Aggregate functions
		(&Sum,[Value::Tuple(ref x)]) => general_agg(x),
		//&Prod => general_agg(|x,y|{x*y},1f64,&c.args),

		// Returns an empty string for the purpose of handling incomplete function
		(_, _) => Value::String("No Result".to_string()),
	}
}


// Aggregate Functions --------------------------------------------------------

//fn general_agg<F: Fn(f64,f64) -> f64>(f: F, base: f64, args: &ExpressionVec) -> Value {
fn general_agg(x: &value::Tuple) -> Value {

	// Some fold magic!
	println!("{:?}",x);

	Value::Float(10f64)

}
// End Aggregate Functions ----------------------------------------------------
