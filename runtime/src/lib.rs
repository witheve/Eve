#![feature(collections)]
#![feature(collections_drain)]
#![feature(slice_patterns)]

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

macro_rules! string {
    ($($args:expr),*) => (::value::Value::String(format!($($args),*)))
}

pub mod value;
pub mod relation;
// pub mod query;
pub mod view;
pub mod flow;
pub mod compiler;
pub mod server;
// pub mod test;
