#![feature(test)]
#![feature(core)]
#![allow(unused_imports)]

extern crate eve;
extern crate test;
extern crate core;

use eve::interpreter::*;
use eve::value::*;
use eve::test::*;
use eve::query::Ref;

// Macro for creating expression vectors
macro_rules! exprvec {
    ( $( $x:expr ),* ) => {
    	{
    		vec![$($x.to_expr(),)*]
        }
    };
}


#[allow(dead_code)]
fn main() {

}


#[test]
fn match_test(){

	// Test a single match
	let input2 = Expression::Ref(Ref::Constant{value: 4.to_value()});

	let patterns2 = vec!(Pattern::Constant(Ref::Constant{value: 1.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 2.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 3.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 4.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 5.to_value()}),
					   );
	let handlers2 = exprvec!["oneone","twotwo","threethree","fourfour","fivefive"];

	let m2 = Match{input: input2, patterns: patterns2, handlers: handlers2};

	let result = evaluate(&m2.clone().to_expr(),&vec![]);

	assert_eq!(result,"fourfour".to_value());

	// Test a nested match
	let input = Expression::Ref(Ref::Constant{value: 3.to_value()});

	let patterns = vec!(Pattern::Constant(Ref::Constant{value: 1.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 2.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 3.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 4.to_value()}),
					     Pattern::Constant(Ref::Constant{value: 5.to_value()}),
					   );
	let handlers = exprvec!["one","two",m2,"four","five"];

	let m1 = Match{input: input, patterns: patterns, handlers: handlers};

	let result = evaluate(&m1.to_expr(),&vec![]);

	assert_eq!(result,"fourfour".to_value());
}


#[test]
fn opstest() {

	// Test Some General Math Ops: (((1.3 + 2) * 3) + (7 - 4) / 10) ^ 2.5
	let c1 = Call{fun: EveFn::Add, args: exprvec![1.3,2]};				// C1 = 1.3 + 2
	let c2 = Call{fun: EveFn::Multiply, args: exprvec![c1,3]};			// C2 = C1 * 3
	let c3 = Call{fun: EveFn::Subtract, args: exprvec![7,4]};			// C3 = 7 - 4
	let c4 = Call{fun: EveFn::Divide, args: exprvec![c3,10]};			// C4 = C3 / 10
	let c5 = Call{fun: EveFn::Add, args: exprvec![c2,c4]};				// C5 = C2 + C4
	let c6 = Call{fun: EveFn::Exponentiate, args: exprvec![c5,2.5]};	// C6 = C5 ^ 2.5
	let result = evaluate(&c6.to_expr(),&vec![]);
	assert_eq!(result,(((1.3f64 + 2f64) * 3f64) + (7f64 - 4f64) / 10f64).powf(2.5f64).to_value());

}

#[test]
fn stringtest() {

	// Test a text replacement
	let c1 = Call{fun: EveFn::StrReplace, args: exprvec!["Hello World","l","q"] };
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result.as_str(),"Heqqo Worqd");

	// Test splitting words
	let c1 = Call{fun: EveFn::StrSplit, args: exprvec!["Hello World"] };
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result[0].as_str(),"Hello");
	assert_eq!(result[1].as_str(),"World");

}

#[test]
fn trigtest() {

	let pi = std::f64::consts::PI;

	// sin
	let c1 = Call{fun: EveFn::Sin, args: exprvec![pi]};
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result,pi.sin().to_value());

	// cos
	let c1 = Call{fun: EveFn::Cos, args: exprvec![pi]};
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result,pi.cos().to_value());

	// tan
	let c1 = Call{fun: EveFn::Tan, args: exprvec![pi]};
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result,pi.tan().to_value());

	// atan2
	let c1 = Call{fun: EveFn::ATan2, args: exprvec![1.2,2.3]};
	let result = evaluate(&c1.to_expr(),&vec![]);
	assert_eq!(result,1.2f64.atan2(2.3f64).to_value());
}

#[test]
fn bigmathtest() {

	let wa = 1.5;
	let ma = 2.3;
	let va = 11.3;
	let ga = 0.34;
	let mu = 1.50;
	let gd = 3.14;
	let g = 9.8;
	let wx = 0.04;
	let ps = 0.013;
	let rh = 1.74;

	let c1 = Call{fun: EveFn::Sin, args: exprvec![ga]}; 			// sin(ga)
	let c2 = Call{fun: EveFn::Exponentiate, args: exprvec![c1,2]}; 	// sin(ga)^2
	let c3 = Call{fun: EveFn::Multiply, args: exprvec![wx,c2]}; 	// wx*sin(ga)^2
	let c4 = Call{fun: EveFn::Sin, args: exprvec![ps]}; 			// sin(ps)
	let c5 = Call{fun: EveFn::Multiply, args: exprvec![c3,c4]}; 	// wx*sin(ga)^2*sin(ps)

	let c6 = Call{fun: EveFn::Cos, args: exprvec![ga]}; 			// cos(ga)
	let c7 = Call{fun: EveFn::Multiply, args: exprvec![g,c6]}; 		// g*cos(ga)
	let c8 = Call{fun: EveFn::Divide, args: exprvec![c7,va]}; 		// g*cos(ga)/va
	let c9 = Call{fun: EveFn::Add, args: exprvec![gd,c8]}; 			// gd+g*cos(ga)/va

	let c10 = Call{fun: EveFn::Subtract, args: exprvec![c9,c5]}; 	// (gd+g*cos(ga)/va) - (wx*sin(ga)^2*sin(ps))

	let c11 = Call{fun: EveFn::Multiply, args: exprvec![wa,rh]};	// wa*rh
	let c12 = Call{fun: EveFn::Multiply, args: exprvec![c11,va]};	// wa*rh*va
	let c13 = Call{fun: EveFn::Cos, args: exprvec![mu]}; 			// cos(mu)
	let c14 = Call{fun: EveFn::Multiply, args: exprvec![c12,c13]};	// wa*rh*va*cos(mu)

	let c15 = Call{fun: EveFn::Multiply, args: exprvec![2,ma]};		// 2*ma

	let c16 = Call{fun: EveFn::Divide, args: exprvec![c15,c14]};	// 2*ma/wa*rh*va*cos(mu)

	let c17 = Call{fun: EveFn::Multiply, args: exprvec![c16,c10]};	// (2*ma/wa*rh*va*cos(mu)) * (gd+g*cos(ga)/va) - (wx*sin(ga)^2*sin(ps))

	let result = evaluate(&c17.to_expr(),&vec![]);

	assert_eq!(result,(2f64*ma/(wa*rh*va*mu.cos())*(gd+g*ga.cos()/va-wx*(ga.sin().powf(2f64))*ps.sin())).to_value());

}


#[bench]
fn opsbench(b: &mut test::Bencher) {

	// Test Some General Math Ops: (((1 + 2) * 3) + (7 - 4) / 10) ^ 2
	let c1 = Call{fun: EveFn::Add, args: exprvec![1.3,2]};				// C1 = 1.3 + 2
	let c2 = Call{fun: EveFn::Multiply, args: exprvec![c1,3]};			// C2 = C1 * 3
	let c3 = Call{fun: EveFn::Subtract, args: exprvec![7,4]};			// C3 = 7 - 4
	let c4 = Call{fun: EveFn::Divide, args: exprvec![c3,10]};			// C4 = C3 / 10
	let c5 = Call{fun: EveFn::Add, args: exprvec![c2,c4]};				// C5 = C2 + C4
	let c6 = Call{fun: EveFn::Exponentiate, args: exprvec![c5,2.5]};	// C6 = C5 ^ 2.5
	let e1 = c6.to_expr();

	b.iter(|| {
		evaluate(&e1,&vec![])
	});
}

#[bench]
fn bigmathbench(b: &mut test::Bencher) {

	let wa = 1.5;
	let ma = 2.3;
	let va = 11.3;
	let ga = 0.34;
	let mu = 1.50;
	let gd = 3.14;
	let g = 9.8;
	let wx = 0.04;
	let ps = 0.013;
	let rh = 1.74;

	let c1 = Call{fun: EveFn::Sin, args: exprvec![ga]}; 			// sin(ga)
	let c2 = Call{fun: EveFn::Exponentiate, args: exprvec![c1,2]}; 	// sin(ga)^2
	let c3 = Call{fun: EveFn::Multiply, args: exprvec![wx,c2]}; 	// wx*sin(ga)^2
	let c4 = Call{fun: EveFn::Sin, args: exprvec![ps]}; 			// sin(ps)
	let c5 = Call{fun: EveFn::Multiply, args: exprvec![c3,c4]}; 	// wx*sin(ga)^2*sin(ps)

	let c6 = Call{fun: EveFn::Cos, args: exprvec![ga]}; 			// cos(ga)
	let c7 = Call{fun: EveFn::Multiply, args: exprvec![g,c6]}; 		// g*cos(ga)
	let c8 = Call{fun: EveFn::Divide, args: exprvec![c7,va]}; 		// g*cos(ga)/va
	let c9 = Call{fun: EveFn::Add, args: exprvec![gd,c8]}; 			// gd+g*cos(ga)/va

	let c10 = Call{fun: EveFn::Subtract, args: exprvec![c9,c5]}; 	// (gd+g*cos(ga)/va) - (wx*sin(ga)^2*sin(ps))

	let c11 = Call{fun: EveFn::Multiply, args: exprvec![wa,rh]};	// wa*rh
	let c12 = Call{fun: EveFn::Multiply, args: exprvec![c11,va]};	// wa*rh*va
	let c13 = Call{fun: EveFn::Cos, args: exprvec![mu]}; 			// cos(mu)
	let c14 = Call{fun: EveFn::Multiply, args: exprvec![c12,c13]};	// wa*rh*va*cos(mu)

	let c15 = Call{fun: EveFn::Multiply, args: exprvec![2,ma]};		// 2*ma

	let c16 = Call{fun: EveFn::Divide, args: exprvec![c15,c14]};	// 2*ma/wa*rh*va*cos(mu)

	let c17 = Call{fun: EveFn::Multiply, args: exprvec![c16,c10]};	// (2*ma/wa*rh*va*cos(mu)) * (gd+g*cos(ga)/va) - (wx*sin(ga)^2*sin(ps))

	let e1 = c17.to_expr();

	b.iter(|| {
		evaluate(&e1,&vec![])
	});

}