use std::fmt::{Debug,Formatter,Result};
use std::num::Float;
use std::num::ToPrimitive;
use value::{Value,Tuple,ToValue};

// Enums...
// Expression Enum ------------------------------------------------------------
#[derive(Clone)]
pub enum Expression {
	Constant(Constant),
	Variable(Variable),
	Call(Call),
	Match(Match),
	Value(Value),
}

impl Debug for Expression {

	fn fmt(&self, f: &mut Formatter) -> Result {
		match *self {
			Expression::Constant(ref x) => write!(f,"{:?}",*x),
			Expression::Call(ref x) => write!(f,"{:?}",*x),
			_ => unimplemented!(),
		}
	}
}

pub trait ToExpression { fn to_expr(self) -> Expression; }

impl ToExpression for Expression { fn to_expr(self) -> Expression { self } }
impl ToExpression for Constant { fn to_expr(self) -> Expression { Expression::Constant(self) } }
impl ToExpression for Call { fn to_expr(self) -> Expression { Expression::Call(self) } }
impl ToExpression for i32 { fn to_expr(self) -> Expression { Expression::Value(self.to_value()) } }
impl ToExpression for f64 { fn to_expr(self) -> Expression { Expression::Value(self.to_value()) } }
impl<'a> ToExpression for &'a str { fn to_expr(self) -> Expression { Expression::Value(self.to_value()) } }


// End Expression Enum --------------------------------------------------------

#[derive(Clone,Debug)]
pub enum Op {
	Add,
	Subtract,
	Multiply,
	Divide,
	Exponentiate,
	Exp,
	Sqrt,
	Log,
	Log10,
	Log2,
	Ln,
	Abs,
	Sign,
	Sin,
	Cos,
	Tan,
	ASin,
	ACos,
	ATan,
	ATan2,
	Sum,
	Prod,
	StrConcat,
	StrUpper,
	StrLower,
	StrLength,
	StrReplace,
	StrSplit,
	None,
}

#[derive(Clone)]
pub enum Variable {
	Variable(String),
}

#[derive(Clone)]
pub enum Pattern {
	Constant(Constant),
	Tuple(Tuple),
}

/*
#[derive(Clone)]
pub enum Tuple {
	Patterns(PatternVec),
}
*/

// Constant Enum --------------------------------------------------------------
#[derive(Clone,PartialEq)]
pub enum Constant {
	StringConstant(String),
	Value(Value),
}

impl Debug for Constant {

	fn fmt(&self, f: &mut Formatter) -> Result {
		match *self {
			Constant::StringConstant(ref x) => write!(f,"{:?}",*x),
			_ => unimplemented!(),
		}
	}
}

pub trait ToConstant { fn to_const(&self) -> Constant; }

impl ToConstant for Constant { fn to_const(&self) -> Constant { self.clone() } }
impl ToConstant for f64 { fn to_const(&self) -> Constant { Constant::Value(self.to_value()) } }
impl ToConstant for i32 { fn to_const(&self) -> Constant { Constant::Value(self.to_value()) } }
impl ToConstant for usize { fn to_const(&self) -> Constant { Constant::Value(self.to_value()) } }
impl ToConstant for str { fn to_const(&self) -> Constant { Constant::StringConstant(self.to_string()) } }
impl ToConstant for String { fn to_const(&self) -> Constant { Constant::StringConstant(self.clone())} }

impl ToString for Constant {
	fn to_string(&self) -> String {
		match self {
			&Constant::StringConstant(ref x) => x.clone(),
			_ => unimplemented!(),
		}
	}
}


// End Constant Enum ----------------------------------------------------------

// Structs...
#[derive(Clone,Debug)]
pub struct Call {
	pub op: Op,
	pub args: ExpressionVec,
}

#[derive(Clone)]
pub struct Match {
	pub patterns: PatternVec,
	pub handlers: ExpressionVec,
}

// Some type aliases
pub type PatternVec = Vec<Pattern>;
pub type ExpressionVec = Vec<Expression>;

// Macro for creating expression vectors
#[macro_export]
macro_rules! exprvec {
    ( $( $x:expr ),* ) => {
        {
            let mut temp_vec = ExpressionVec::new();
            $(
                temp_vec.push($x.to_expr());
            )*
            temp_vec
        }
    };
}

// This is the main interface to the interpreter. Pass in an expression, get a constant back
pub fn calculate(e: & Expression) -> Value {

	process_expression(e)

}

fn process_expression(e: & Expression) -> Value {

	match *e {
		//Expression::Constant(ref x) =>  x.clone(),
		Expression::Call(ref x) => process_call(x),
		//Expression::Constant(ref x) => process_constant(x),
		Expression::Value(ref x) => x.clone(),
		_ => unimplemented!(),
	}
}

/*
fn process_constant(c: & Constant) -> &Value {

	match *c {
		Constant::NumericConstant(ref x) => unwrap_numeric(x).to_value(),
		Constant::StringConstant(ref x) => x.to_value(),
		_ => unimplemented!(),
	}
}
*/
fn process_call(c: &Call) -> Value {


	match c.op {
		// Infix ops
		Op::Add => twoargs(|x,y|{x+y},&c.args),
		Op::Subtract => twoargs(|x,y|{x-y},&c.args),
		Op::Multiply => twoargs(|x,y|{x*y},&c.args),
		Op::Divide => twoargs(|x,y|{x/y},&c.args),
		Op::Exponentiate => twoargs(|x,y|{x.powf(y)},&c.args),

		// Some general math functions
		Op::Abs => onearg(|x|{x.abs()},&c.args),
		Op::Sqrt => onearg(|x|{x.sqrt()},&c.args),
		Op::Sign => onearg(|x|{x.signum()},&c.args),
		Op::Exp => onearg(|x|{x.exp()},&c.args),
		Op::Ln => onearg(|x|{x.ln()},&c.args),
		Op::Log => twoargs(|x,y|{x.log(y)},&c.args),
		Op::Log10 => onearg(|x|{x.log10()},&c.args),
		Op::Log2 => onearg(|x|{x.log2()},&c.args),

		// Trig functions
		Op::Sin => onearg(|x|{x.sin()},&c.args),
		Op::Cos => onearg(|x|{x.cos()},&c.args),
		Op::Tan => onearg(|x|{x.tan()},&c.args),
		Op::ASin => onearg(|x|{x.atan()},&c.args),
		Op::ACos => onearg(|x|{x.atan()},&c.args),
		Op::ATan => onearg(|x|{x.atan()},&c.args),
		Op::ATan2 => twoargs(|x,y|{x.atan2(y)},&c.args),

		// Aggregate functions
		Op::Sum => general_agg(|x,y|{x+y},0f64,&c.args),
		Op::Prod => general_agg(|x,y|{x*y},1f64,&c.args),

		// String functions
		Op::StrConcat => str_cat(&c.args),
		Op::StrUpper => str_to_upper(&c.args),
		Op::StrLower => str_to_lower(&c.args),
		Op::StrLength => str_length(&c.args),
		Op::StrReplace => str_replace(&c.args),
		Op::StrSplit => str_split(&c.args),

		_ => unimplemented!(),
	}

}

// Math Functions  ------------------------------------------------------------

// Execute a provided function that takes one argument in an expression vector
fn onearg<F: Fn(f64) -> f64>(f: F, args: &ExpressionVec) -> Value {

	argcheck(args,1);

	let x = process_expression(&args[0]).to_f64().unwrap();

	f(x).to_value()
}

// Execute a provided function that takes two arguments in an expression vector
fn twoargs<F: Fn(f64,f64) -> f64>(f: F, args: &ExpressionVec) -> Value {

	argcheck(args,2);

	let x = process_expression(&args[0]).to_f64().unwrap();
	let y = process_expression(&args[1]).to_f64().unwrap();

	f(x,y).to_value()

}

// End Math Functions  --------------------------------------------------------

// Aggregate Functions --------------------------------------------------------

fn general_agg<F: Fn(f64,f64) -> f64>(f: F, base: f64, args: &ExpressionVec) -> Value {

	// Some fold magic!
	let acc = args.iter().fold(base,|acc,next_arg| f(acc,process_expression(next_arg).to_f64().unwrap()) );

	acc.to_value()

}

// End Aggregate Functions ----------------------------------------------------


// String Functions  ----------------------------------------------------------
fn str_cat(args: &ExpressionVec) -> Value {

	argcheck(args,2);

	let s1 = process_expression(&args[0]).to_string();
	let s2 = process_expression(&args[1]).to_string();

	(s1 + &s2[..]).to_value()

}

// Convert all characters to upper case
fn str_to_upper(args: &ExpressionVec) -> Value {

	argcheck(args,1);

	process_expression(&args[0])
		.to_string()
		.to_uppercase()
		.to_value()
}

// Convert all characters to lower case
fn str_to_lower(args: &ExpressionVec) -> Value {

	argcheck(args,1);

	process_expression(&args[0])
		.to_string()
		.to_lowercase()
		.to_value()
}

// Return length of the string
fn str_length(args: &ExpressionVec) -> Value {

	argcheck(args,1);

	process_expression(&args[0])
		.to_string()
		.len()
		.to_value()
}

// Replace all occurances of a query string with a new string
fn str_replace(args: &ExpressionVec) -> Value {

	argcheck(args,3);

	let s = process_expression(&args[0]).to_string();
	let query = process_expression(&args[1]).to_string();
	let replacement = process_expression(&args[2]).to_string();

	s.replace(&query[..],&replacement[..]).to_value()

}

// Spits
fn str_split(args: &ExpressionVec) -> Value {

	argcheck(args,1);

	let s = process_expression(&args[0]).to_string();

	let words = s.words();

	let mut t = Tuple::new();

	for word in words {

		t.push(word.to_string().to_value());

	}

	t.to_value()

}

// End String Functions -------------------------------------------------------


// Helper Functions -----------------------------------------------------------

fn argcheck(args: &ExpressionVec, n: usize) {
	if args.len() != n { panic!("argcheck: Incorrect number of arguments! Expected {}. Given {}.",n,args.len()) };
}

// End Helper Functions -------------------------------------------------------