#[macro_use]
extern crate eve;
extern crate test;

use test::Bencher;
use eve::interpreter::*;

fn main() {

	// Test Some General Math Ops: (((1.3 + 2) * 3) + (7 - 4) / 10) ^ 2
	let c1 = Call{op: Op::Add, args: exprvec![1.3,2]};			// C1 = 1.3 + 2
	let c2 = Call{op: Op::Multiply, args: exprvec![c1,3]};		// C2 = C1 * 3
	let c3 = Call{op: Op::Subtract, args: exprvec![7,4]};		// C3 = 7 - 4
	let c4 = Call{op: Op::Divide, args: exprvec![c3,10]};		// C4 = C3 / 1
	let c5 = Call{op: Op::Add, args: exprvec![c2,c4]};			// C5 = C2 + C
	let c6 = Call{op: Op::Exponentiate, args: exprvec![c5,2.5]};	// C6 = C5 ^ 2.5
	let e1 = c6.to_expr();
	let result = calculate(&e1);
	println!("{:?}",result);
	
	// Test a trig function 
	let pi = 3.14159265358979f64;
	let c8 = Call{op: Op::Sin, args: exprvec![pi]};
	let e3 = c8.to_expr();
	let result = calculate(&e3);
	println!("{:?}",result);

	// Test a text replacement
	let c7 = Call{op: Op::StrReplace, args: exprvec!["Hello World","l","q"] };
	let e2 = c7.to_expr();
	let result = calculate(&e2);
	println!("{:?}",result);

}

#[bench]
fn benchcalc(b: &mut Bencher) {

	// Test Some General Math Ops: (((1 + 2) * 3) + (7 - 4) / 10) ^ 2
	let c1 = Call{op: Op::Add, args: exprvec![1,2]};			// C1 = 1 + 2
	let c2 = Call{op: Op::Multiply, args: exprvec![c1,3]};		// C2 = C1 * 3
	let c3 = Call{op: Op::Subtract, args: exprvec![7,4]};		// C3 = 7 - 4
	let c4 = Call{op: Op::Divide, args: exprvec![c3,10]};		// C4 = C3 / 1
	let c5 = Call{op: Op::Add, args: exprvec![c2,c4]};			// C5 = C2 + C
	let c6 = Call{op: Op::Exponentiate, args: exprvec![c5,2]};	// C6 = C5 ^ 2
	let e1 = c6.to_expr();
	b.iter(|| {
		calculate(&e1)
	});
}
