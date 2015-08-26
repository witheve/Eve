 #![feature(core)]
 #![feature(path_ext)]
extern crate eve;
extern crate getopts;
extern crate url;
extern crate core;

use std::thread;
use std::env;
use std::fs::PathExt;
use getopts::Options;
use std::net::SocketAddr;
use core::str::FromStr;

use eve::server;
use eve::login;

#[allow(dead_code)]
fn main() {

	// handle command line arguments
	let args: Vec<String> = env::args().collect();

	// define the command line arguments
	let mut opts = Options::new();
    opts.optopt("f", "file-server-address", "specify a socket address for the static file server. Defaults to 0.0.0.0:8080","SOCKET ADDRESS");
    opts.optopt("s", "saves", "specify the location of the saves directory","PATH");
    opts.optflag("h", "help", "prints all options and usage");

    // parse raw input arguments into options
    let matches = match opts.parse(&args[1..]) {
        Ok(m) => { m }
        Err(f) => { panic!(f.to_string()) }
    };

    // print the help menu
    if matches.opt_present("h") {
        print!("{}", opts.usage(""));
        return;
    }

    // parse static file server address
    let default_addr = SocketAddr::from_str("0.0.0.0:8080").unwrap();
    let addr = match matches.opt_str("f") {
		Some(ip) => {
			match SocketAddr::from_str(&*ip) {
				Ok(addr) => addr,
				Err(_) => {
					println!("WARNING: Could not parse static file server address.\nDefaulting to {:?}",default_addr);
					default_addr
				}
			}
		},
		None => default_addr,
	};

	// parse the autosave file location
    let default_saves_dir = "../saves/".to_owned();
    let saves_dir = match matches.opt_str("s") {
		Some(saves_dir) => saves_dir,
		None => default_saves_dir,
	};
    let absolute_saves_dir = env::current_dir().unwrap().join(saves_dir).canonicalize().unwrap();

	thread::spawn(move || login::run(addr.clone()));
    server::run(absolute_saves_dir.as_path());
}