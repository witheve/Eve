use std::fmt::{Debug,Formatter,Result};
use value::{Value,ToValue,Tuple,ToTuple};
use self::EveFn::*;
use value::Value::Float;

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
impl ToExpression for Value { fn to_expr(self) -> Expression { Expression::Value(self) } }

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

// End Constant Enum ----------------------------------------------------------

// Structs...
#[derive(Clone,Debug)]
pub struct Call {
	pub fun: EveFn,
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

// This is the main interface to the interpreter. Pass in an expression, get a value back
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

	let args: Vec<Value> = c.args.iter().map(process_expression).collect();

	match(&c.fun, &args[..]) {

		// Basic Math
		(&Add,[Float(x),Float(y)]) => Float(x+y),
		(&Subtract,[Float(x),Float(y)]) => Float(x-y),
		(&Multiply,[Float(x),Float(y)]) => Float(x*y),
		(&Divide,[Float(x),Float(y)]) => Float(x/y),
		(&Exponentiate,[Float(x),Float(y)]) => Float(x.powf(y)),

		// Some general math functions
		(&Abs,[Float(x)]) => Float(x.abs()),
		(&Sqrt,[Float(x)]) => Float(x.sqrt()),
		(&Sign,[Float(x)]) => Float(x.signum()),
		(&Exp,[Float(x)]) => Float(x.exp()),
		(&Ln,[Float(x)]) => Float(x.ln()),
		(&Log10,[Float(x)]) => Float(x.log10()),
		(&Log2,[Float(x)]) => Float(x.log2()),

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
			let w: Vec<Value> = s.words().map(|x| x.to_value()).collect();
			Value::Tuple(w)
		},

		// Aggregate functions
		//&Sum => general_agg(|x,y|{x+y},0f64,&c.args),
		//&Prod => general_agg(|x,y|{x*y},1f64,&c.args),

		// Returns an empty string for the purpose of handling incomplete function
		(fun, args) => Value::String("".to_string()),
	}
}

/*
// Aggregate Functions --------------------------------------------------------

fn general_agg<F: Fn(f64,f64) -> f64>(f: F, base: f64, args: &ExpressionVec) -> Value {

	// Some fold magic!
	let acc = args.iter().fold(base,|acc,next_arg| f(acc,process_expression(next_arg).to_f64().unwrap()) );

	acc.to_value()

}
// End Aggregate Functions ----------------------------------------------------
*/