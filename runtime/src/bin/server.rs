extern crate eve;

use std::thread;

use eve::server;
use eve::login;

#[allow(dead_code)]
fn main() {
    thread::spawn(login::run);
    server::run();
}