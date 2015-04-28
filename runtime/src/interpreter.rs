use value::*;
use value::Value::Float;
use query::Ref;
use self::EveFn::*;

#[derive(Clone, Debug)]
pub enum Expression {
	Ref(Ref),
	Variable(Variable),
	Call(Call),
	Match(Box<Match>),
}

#[derive(Clone,Debug)]
pub enum EveFn {
	// Basic ops
	Add,Subtract,Multiply,Divide,Exponentiate,

	// General math
	Sqrt,Log,Log10,Log2,Ln,Abs,Sign,Exp,

	// Trig
	Sin,Cos,Tan,ASin,ACos,ATan,ATan2,

	// Aggregates
	Sum,Prod,Min,Max,

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

#[derive(Clone,Debug)]
pub enum Pattern {
	Constant(Ref),
	Variable(Variable),
	Tuple(PatternVec),
}

#[derive(Clone,Debug)]
pub struct Call {
	pub fun: EveFn,
	pub args: ExpressionVec,
}

#[derive(Clone,Debug)]
pub struct Variable { pub variable: String }

pub type PatternVec = Vec<Pattern>;
pub type ExpressionVec = Vec<Expression>;

// This is the main interface to the interpreter. Pass in an expression, get
// back a value
pub fn evaluate(e: & Expression, result: &Vec<Value>) -> Value {

	eval_expression(e,result)

}

fn eval_expression(e: &Expression, result: &Vec<Value>) -> Value {

	match *e {
		Expression::Ref(ref r) => resolve_ref(r,result).clone(),
		Expression::Call(ref c) => eval_call(c,result),
		Expression::Match(ref m) => eval_match(m,result),
		Expression::Variable(ref v) => panic!("TODO: Evaluate Variable {:?}",v),
	}
}


fn eval_match(m: &Match, result: &Vec<Value>) -> Value {

	// Before we do anything, make sure we have the correct number of patterns
	// and handlers
	assert_eq!(m.patterns.len(),m.handlers.len()-1);


	let input = eval_expression(&m.input,result);

	for (pattern, handler) in m.patterns.iter().zip(m.handlers.iter()) {
		match test_pattern(&input,&pattern) {
			PatternTestResult::False => continue,
			_ => return eval_expression(&handler,result),
		}
	};

	// The last handler is used to perform the default case
	eval_expression(&m.handlers.iter().last().unwrap(),result)

}

#[derive(Clone,Debug)]
enum PatternTestResult {
	True,
	False,
	Variables(Vec<Value>),
}

fn test_pattern(input: &Value, pattern: &Pattern) -> PatternTestResult {

	match pattern {
		&Pattern::Constant(ref c) => {
			match c {
				&Ref::Constant{ref value} => {
					if input == value {
						return PatternTestResult::True
					}
					else { return PatternTestResult::False }
				}
				_ => panic!("Expected constant reference"),
			}
		},
		&Pattern::Tuple(ref pattern_tuple) => {
			match input {
            	&Value::Tuple(ref input_tuple) => {

            		// Only test the pattern if we have the same number of
            		// elements in the input and pattern tuples
            		if input_tuple.len() == pattern_tuple.len() {

            			// Test each pattern against the input
            			let test_results = input_tuple.iter()
            								 .zip(pattern_tuple.iter())
            								 .map(|(ref input,ref pattern)| test_pattern(input,pattern))
            								 .collect::<Vec<_>>();

            			// If any of the test results are false, the match
            			// fails. Otherwise return the variables, or true
            			let any_false = test_results.iter()
            										.any(|r| match r {
            													&PatternTestResult::False => true,
            													_ => false,
            												}
            											);
            			if !any_false { PatternTestResult::True }
            			else { PatternTestResult::False }
            		}
            		else { PatternTestResult::False }
            	},
            	_ => PatternTestResult::False,
        	}
		},
		&Pattern::Variable(ref v) => PatternTestResult::Variables(
										vec![
											Value::Tuple( vec![Value::String(v.clone().variable),input.clone()] )
											]
									 ),
	}
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

			let sum = get_ref_column(&rel,&c.args[0]).iter()
						 .fold(0f64,|acc,x| {
							acc + match x {
								&Value::Float(y) => y,
							  	other => panic!("Cannot accumulate {:?}",other),
						 	}
						 });

			Value::Float(sum)
		},
		(&Prod,[Value::Relation(ref rel)]) => {

			assert_eq!(c.args.len(),1);

			let prod = get_ref_column(&rel,&c.args[0]).iter()
						 .fold(1f64,|acc,x| {
							acc * match x {
								&Value::Float(y) => y,
							  	other => panic!("Cannot accumulate {:?}",other),
						 	}
						 });

			Value::Float(prod)
		},
		// TODO should min/max with columns of mixed types throw an error?
		(&Max,[Value::Relation(ref rel)]) => {

			assert_eq!(c.args.len(),1);

			let column = get_ref_column(&rel,&c.args[0]);
			let max = column.iter().max();

			match max {
				Some(x) => x.clone(),
				None => panic!("Could not compare elements."),
			}
		},
		(&Min,[Value::Relation(ref rel)]) => {

			assert_eq!(c.args.len(),1);

			let column = get_ref_column(&rel,&c.args[0]);
			let min = column.iter().min();

			match min {
				Some(x) => x.clone(),
				None => panic!("Could not compare elements."),
			}
		},

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
fn get_ref_column(rel: &Relation, e: &Expression) -> Vec<Value> {

	let column = match e {
		&Expression::Ref(ref r) => {
			match r {
				&Ref::Value{column,..} => {
					column
				},
				_ => panic!("Expected Ref::Value"),
			}
		},
		_ => panic!("Expected an Expression::Ref"),
	};

	rel.iter().map(|r| r[column].clone()).collect::<Vec<_>>().clone()
}

fn resolve_ref<'a>(reference: &'a Ref, result: &'a Vec<Value>) -> &'a Value {
	match *reference {
	    Ref::Value{clause, ..} => {
			match result[clause] {
			    Value::Relation(_) => {
			    	&result[clause]
			    },
			    _ => reference.resolve(result,None),
			}
	    },
	    _ => reference.resolve(result,None),
	}
}
