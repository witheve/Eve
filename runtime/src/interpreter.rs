use std;
use std::ops::Add;
use std::num::Float;
use std::num::ToPrimitive;

// Enums...
// Expression Enum ------------------------------------------------------------
#[derive(Clone)]
pub enum Expression {
	Constant(Constant),
	Variable(Variable),
	Call(Call),
	Match(Match),
}

impl std::fmt::Debug for Expression {

	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		match *self {
			Expression::Constant(ref x) => write!(f,"{:?}",*x),
			Expression::Call(ref x) => write!(f,"{:?}",*x),
			_ => unimplemented!(),
		}
	}
}

pub trait ToExpression { fn to_expr(&self) -> Expression; }

impl ToExpression for Expression { fn to_expr(&self) -> Expression { self.clone() } }
impl ToExpression for Constant { fn to_expr(&self) -> Expression { Expression::Constant(self.clone()) } }
impl ToExpression for Call { fn to_expr(&self) -> Expression { Expression::Call(self.clone()) } }
impl ToExpression for Numeric { fn to_expr(&self) -> Expression { Expression::Constant(self.to_const()) } }
impl ToExpression for i32 { fn to_expr(&self) -> Expression { Expression::Constant(self.to_const()) } }
impl ToExpression for f64 { fn to_expr(&self) -> Expression { Expression::Constant(self.to_const()) } }
impl ToExpression for str { fn to_expr(&self) -> Expression { Expression::Constant(self.to_const()) } }

// End Expression Enum --------------------------------------------------------

#[derive(Clone,Debug)]
pub enum Op {
	Add,
	Subtract,
	Multiply,
	Divide,
	Exponentiate,
	Sin,
	Cos,
	Tan,
	StrConcat,
	StrUpper,
	StrLower,
	StrLength,
	StrReplace,
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

#[derive(Clone)]
pub enum Tuple {
	Patterns(PatternVec),
}

// Constant Enum --------------------------------------------------------------
#[derive(Clone)]
pub enum Constant {
	StringConstant(String),
	NumericConstant(Numeric),
}

impl std::fmt::Debug for Constant {

	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		match *self {
			Constant::NumericConstant(ref x) => write!(f,"{:?}",*x),
			Constant::StringConstant(ref x) => write!(f,"{:?}",*x),
		}
	}
}

trait ToConstant { fn to_const(&self) -> Constant; }

impl ToConstant for Constant { fn to_const(&self) -> Constant { self.clone() } }
impl ToConstant for Numeric { fn to_const(&self) -> Constant { Constant::NumericConstant(self.clone()) } }
impl ToConstant for f64 { fn to_const(&self) -> Constant { Constant::NumericConstant(self.to_numeric()) } }
impl ToConstant for i32 { fn to_const(&self) -> Constant { Constant::NumericConstant(self.to_numeric()) } }
impl ToConstant for usize { fn to_const(&self) -> Constant { Constant::NumericConstant(self.to_numeric()) } }
impl ToConstant for str { fn to_const(&self) -> Constant { Constant::StringConstant(self.to_string()) } }
impl ToConstant for String { fn to_const(&self) -> Constant { Constant::StringConstant(self.clone())} }

impl ToString for Constant {
	fn to_string(&self) -> String {
		match self {
			&Constant::NumericConstant(_) => panic!("ToString for Constant: Cannot convert numeric constant to string!"),
			&Constant::StringConstant(ref x) => x.clone(),
		}
	}
}


// End Constant Enum ----------------------------------------------------------

// Numeric Enum ---------------------------------------------------------------
#[derive(Clone,PartialOrd,PartialEq,Copy)]
pub enum Numeric {
	Integer(i64),
	Float(f64),
}

trait ToNumeric { fn to_numeric(&self) -> Numeric; }

impl ToNumeric for f32 { fn to_numeric(&self) -> Numeric { Numeric::Float(*self as f64) } }
impl ToNumeric for f64 { fn to_numeric(&self) -> Numeric { Numeric::Float(*self) } }
impl ToNumeric for i64 { fn to_numeric(&self) -> Numeric { Numeric::Integer(*self) } }
impl ToNumeric for i32 { fn to_numeric(&self) -> Numeric { Numeric::Integer(*self as i64) } }
impl ToNumeric for usize { fn to_numeric(&self) -> Numeric { Numeric::Integer(*self as i64) } }
impl ToNumeric for Constant { 

	fn to_numeric(&self) -> Numeric {
	
		match self {
			&Constant::NumericConstant(ref x) => x.clone(),
			&Constant::StringConstant(_) => panic!("Cannot convert string to numeric"),
		}
	}
}

impl std::fmt::Debug for Numeric {

	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		match *self {
			Numeric::Integer(ref x) => write!(f,"{:?}",*x),
			Numeric::Float(ref x) => write!(f,"{:?}",*x),
		}
	}
}

impl std::ops::Neg for Numeric {
    type Output = Numeric;
    fn neg(self) -> Numeric { (-unwrap_numeric(&self)).to_numeric() }
}


impl std::num::ToPrimitive for Numeric {

	fn to_i64(&self) -> Option<i64> { unimplemented!() }
	fn to_u64(&self) -> Option<u64> { unimplemented!() }
}

impl std::ops::Add for Numeric {
	type Output = Numeric;
	fn add(self, _rhs: Numeric) -> Numeric { (unwrap_numeric(&self) + unwrap_numeric(&_rhs)).to_numeric() }
}

impl std::ops::Sub for Numeric {
	type Output = Numeric;
	fn sub(self, _rhs: Numeric) -> Numeric { (unwrap_numeric(&self) - unwrap_numeric(&_rhs)).to_numeric() }
}

impl std::ops::Mul for Numeric {
	type Output = Numeric;
	fn mul(self, _rhs: Numeric) -> Numeric { (unwrap_numeric(&self) * unwrap_numeric(&_rhs)).to_numeric() }
}

impl std::ops::Div for Numeric {
	type Output = Numeric;
	fn div(self, _rhs: Numeric) -> Numeric { (unwrap_numeric(&self) / unwrap_numeric(&_rhs)).to_numeric() }
}

fn unwrap_numeric(n: &Numeric) -> f64 {
	
	match n {
		&Numeric::Integer(ref x) => x.clone() as f64,
		&Numeric::Float(ref x) => x.clone(),
	}
}

// End Numeric Enum -----------------------------------------------------------


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
pub type NumericVec = Vec<Numeric>;

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
pub fn calculate(e: & Expression) -> Constant {

	process_expression(e)

}

fn process_expression(e: & Expression) -> Constant {
	
	match *e {
		Expression::Constant(ref x) =>  x.clone(),
		Expression::Call(ref x) => process_call(x),
		_ => unimplemented!(),
	}
}


/*
fn process_constant(c: & Constant) -> Numeric {

	match *c {
		Constant::NumericConstant(ref x) => x.clone(),
		Constant::StringConstant(_) => unimplemented!(),
	}
}
*/

fn process_call(c: & Call) -> Constant {

	match c.op {
		// Math functions
		Op::Add => infix(|x,y|{x+y},&c.args),
		Op::Subtract => infix(|x,y|{x-y},&c.args),
		Op::Multiply => infix(|x,y|{x*y},&c.args),
		Op::Divide => infix(|x,y|{x/y},&c.args),
		Op::Exponentiate => infix(|x,y|{x.powf(y)},&c.args),
		Op::Sin => onearg(|x|{x.sin()},&c.args),
		
		// String functions
		Op::StrConcat => str_cat(&c.args),
		Op::StrUpper => str_to_upper(&c.args),
		Op::StrLower => str_to_lower(&c.args),
		Op::StrLength => str_length(&c.args,),
		Op::StrReplace => str_replace(&c.args,),
		_ => unimplemented!(),
	}
}

// Math Functions  ------------------------------------------------------------

// Perform a provided function that takes one argument
fn onearg<F: Fn(f64) -> f64>(f: F, args: &ExpressionVec) -> Constant {
	argcheck(args,1);
	let x = unwrap_numeric(&process_expression(&args[0]).to_numeric());
	f(x).to_const()
}

// Perform a provided infix operation on two arguments in an expression vector
fn infix<F: Fn(f64,f64) -> f64>(f: F, args: &ExpressionVec) -> Constant {

	argcheck(args,2);

	let lhs = unwrap_numeric(&process_expression(&args[0]).to_numeric());
	let rhs = unwrap_numeric(&process_expression(&args[1]).to_numeric());
	
	f(lhs,rhs).to_const()
	
}

// End Math Functions  --------------------------------------------------------

// String Functions  ----------------------------------------------------------

fn str_cat(args: &ExpressionVec) -> Constant {
	
	argcheck(args,2);

	let s1 = process_expression(&args[0]).to_string();
	let s2 = process_expression(&args[1]).to_string();
	
	(s1 + s2.as_slice()).to_const()

}

// Convert all characters to upper case
fn str_to_upper(args: &ExpressionVec) -> Constant {
	argcheck(args,1);
	process_expression(&args[0])
		.to_string()
		.to_uppercase()
		.to_const()
}

// Convert all characters to lower case
fn str_to_lower(args: &ExpressionVec) -> Constant {
	argcheck(args,1);
	process_expression(&args[0])
		.to_string()
		.to_lowercase()
		.to_const()
}

// Return length of the string
fn str_length(args: &ExpressionVec) -> Constant {
	argcheck(args,1);
	process_expression(&args[0])
		.to_string()
		.len()
		.to_const()
}

// Replace all occurances of a query string with a new string
fn str_replace(args: &ExpressionVec) -> Constant {
	argcheck(args,3);
	
	let s = process_expression(&args[0]).to_string();
	let query = process_expression(&args[1]).to_string();
	let replacement = process_expression(&args[2]).to_string();

	s.replace(query.as_slice(),replacement.as_slice()).to_const()

}

// End String Functions -------------------------------------------------------


// Helper Functions -----------------------------------------------------------

fn argcheck(args: &ExpressionVec, n: usize) {
	if args.len() != n { panic!("argcheck: Incorrect number of arguments! Expected {}. Given {}.",n,args.len()) };
}

// End Helper Functions -------------------------------------------------------


