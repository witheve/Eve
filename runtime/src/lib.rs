#![feature(core)]
#![feature(collections)]
#![feature(slice_patterns)]
#![feature(str_words)]

extern crate rustc_serialize;
extern crate websocket;
extern crate time;

macro_rules! time {
    ($name:expr, $expr:expr) => {{
        let start = ::time::precise_time_s();
        let result = $expr;
        let end = ::time::precise_time_s();
        println!("{} took {}s", $name, end - start);
        result
    }};
}

pub mod value;
pub mod index;
pub mod interpreter;
pub mod query;
pub mod flow;
pub mod compiler;
pub mod server;
