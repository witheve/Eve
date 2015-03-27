#[macro_use] extern crate eve;

use eve::compiler::*;

fn main() {
    let x: Option<String> = None;
    hope!( Some(a) = x;
    println!("{:?}", a)
    )
}