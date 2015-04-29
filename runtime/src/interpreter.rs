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
		Expression::Variable(ref v) => eval_variable(v,result),
	}
}

// Returns the value of the first matching variable in the results vector
fn eval_variable(v: &Variable, result: &Vec<Value>) -> Value {

	let find_variable = result.iter()
							  .find(|value| {
									match *value {
										&Value::Tuple(ref x) => {
											match &x[..] {
												[Value::String(ref s),_] => {
													if v.variable == s.clone() {
														true
													}
													else { false }

												},
												_ => false,
											}
										},
										_ => false,
									}
								});

	match find_variable {
		Some(x) => x[1].clone(),
		None => panic!("Could not match {:?} to a pattern.",v),
	}
}


fn eval_match(m: &Match, result: &Vec<Value>) -> Value {

	// Make sure we have the correct number of patterns and handlers
	assert_eq!(m.patterns.len(),m.handlers.len());

	let input = eval_expression(&m.input,result);

	for (pattern, handler) in m.patterns.iter().zip(m.handlers.iter()) {
		match test_pattern(&input,&pattern) {
			(false, _) => continue,
			(true, None) => return eval_expression(&handler,result),
			(true, Some(ref x)) => {
				let mut pattern_result: Vec<Value> = Vec::new();
				pattern_result.push_all(result);
				pattern_result.push_all(x);
				return eval_expression(&handler,&pattern_result)
			},
		}
	};

	// The last handler is used to perform the default case
	panic!("Could not match {:?} to any pattern",input);

}

fn test_pattern(input: &Value, pattern: &Pattern) -> (bool,Option<Vec<Value>>) {

	match pattern {
		&Pattern::Constant(ref c) => {
			match c {
				&Ref::Constant{ref value} => {
					if input == value {
						return (true,None)
					}
					else { return (false,None) }
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
											 .map(|(ref input, ref pattern)| test_pattern(input,pattern))
											 .collect::<Vec<_>>();

						// If any of the test results are false, the match
						// fails. Otherwise return true and any variables
						let mut variables = Vec::new();
						for result in test_results {
							match result {
								(true, Some(ref x)) => variables.push_all(x),
								(true, None) => continue,
								(false,_) => return (false,None),
							};
						}

						if variables.len() == 0 {
							(true,None)
						}
						else {(true,Some(variables))}
					}
					else { (false,None) }
				},
				_ => (false,None),
        	}
		},
		// Returns a vec<value::tuple> containing (var_name,var_value).
		&Pattern::Variable(ref v) => (true,Some(vec![Value::Tuple(vec![Value::String(v.variable.clone()),input.clone()])])),
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

	match e {
		&Expression::Ref(ref r) => {
			match r {
				&Ref::Value{column,..} => {
					rel.iter().map(|r| r[column].clone()).collect()
				},
				_ => panic!("Expected Ref::Value"),
			}
		},
		_ => panic!("Expected an Expression::Ref"),
	}
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
