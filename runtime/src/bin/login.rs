#![feature(slice_patterns)]
#![feature(path_ext)]
extern crate eve;
extern crate hyper;
extern crate cookie;
extern crate mime;
extern crate url;
extern crate websocket;
extern crate rustc_serialize;
extern crate conduit_mime_types;

use std::io::Read;
use std::io::Write;
use std::fs::File;
use std::error::Error;
use hyper::net::Fresh;
use hyper::server::{Server, Request, Response};
use hyper::uri::RequestUri;
use hyper::Url;
use hyper::header::{Headers,ContentType,Location,SetCookie};
use cookie::Cookie;
use mime::Mime;
use url::SchemeData::Relative;
use rustc_serialize::json;
use websocket::{Message, Sender};
use std::path::Path;
use std::fs::PathExt;
use conduit_mime_types::Types;

use eve::client::*;
use eve::server;
use eve::value::Value;

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
struct Session {
	client: String,
	id: String,
	user_id: String,
	object: String,
	created_at: f64,
	expires_at: f64,
	ip: String,
	user: User,
}

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
struct User {
	custom: Custom,
	id: String,
	realm_id: String,
	username: String,
	state: String,
	user_type: String,
	reference: Option<String>,
	name: String,
	email: String,
	object: String,
	last_login_at: f64,
	last_login_on: f64,
	created_at: f64,
	first_name: Option<String>,
	last_name: Option<String>,
	credentials: Vec<Credential>,
	membership_count: f64,
}

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
struct Custom;

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
struct Credential {
	id: String,
	credential_type: String,
	object: String,
}

fn main() {
	Server::http(login).listen("0.0.0.0:8080").unwrap();
}

fn read_file_bytes(filename: &str) -> Vec<u8> {
    let mut file = File::open(&filename).unwrap();
    let mut contents: Vec<u8> = Vec::new();
	file.read_to_end(&mut contents).unwrap();
	contents
}

fn file_exists(path: &str) -> bool {
	let path_obj = Path::new(path);
	path_obj.is_file() && path_obj.exists()
}

fn serve_local_or_file(mut res: Response<Fresh>, path: &Vec<String>, default_file: &str) {
	let mime_types = Types::new().unwrap();
	let local_path = path[1..].iter().fold("../ui".to_owned(), |mut end, cur| {
		end = end + "/" + cur;
		end
	});
	let file;
	let file_path: &str;
	if file_exists(&local_path) {
		file = read_file_bytes(&local_path);
		file_path = &local_path;
	} else {
		let content = read_file_bytes(default_file);
		//@HACK, @TODO: absolutize the html file so that it looks in the right place
		//this allows us to use file:/// locally, while still doing the right thing
		//when we're hooked up to the server
		let mut str = String::from_utf8(content).unwrap();
		str = str.replace("href=\"", "href=\"/app/");
		str = str.replace("src=\"", "src=\"/app/");
		file = str.as_bytes().to_owned();
		file_path = default_file;
	}
	let mime: Mime = mime_types.mime_for_path(Path::new(&file_path)).parse().unwrap();
	res.headers_mut().set(ContentType(mime));
	let mut res = res.start().unwrap();
	res.write_all(&file).unwrap();
	res.end().unwrap();
}

fn login(req: Request, mut res: Response<Fresh>) {

	match (&req.method.clone(), &req.uri.clone()) {
		(&hyper::Get, &RequestUri::AbsolutePath(ref relative_path)) => {

			// Form a url from the path
			let absolute_path = "http://localhost".to_string() + relative_path;
			let url = Url::parse(&*absolute_path).unwrap();

			// Get the file name
			let scheme_data = &url.scheme_data;

			let requested_file = match scheme_data {
				&Relative(ref rsd) => rsd.path[0].clone(),
				_ => panic!("Expected relative path"),
			};
			let path_info = match scheme_data {
				&Relative(ref rsd) => rsd,
				_ => panic!("Expected relative path"),
			};

			// Parse the query string
			let query_pairs = &url.query_pairs();

			// Handle login
			match &*requested_file {
				"app" => {
					serve_local_or_file(res, &path_info.path, "../ui/app.html");
				},
				"editor" => {
					serve_local_or_file(res, &path_info.path, "../ui/editor.html");
				},
				"login.html" => {
					println!("Authenticating User");
					let pairs = query_pairs.clone().unwrap();
					match &pairs[..] {
						[(ref token_type, ref token), ..] if token_type.clone() == "token".to_string() => {

							// We have a login token, now to authenticate
							let mut client = hyper::client::Client::new();
							let api_call = "https://api-e1.authrocket.com/v1/sessions/".to_string() + token;
							let req = client.request(hyper::method::Method::Get,&*api_call);

							// Set the appropriate headers for authorocket
							let mut headers = Headers::new();
							let json: Mime = "application/json".parse().unwrap();
							let content_type = ContentType(json);
							headers.set_raw("X-Authrocket-Account",vec!["org_0vC7wPw9XphPGQnSqYB6bz".to_string().into_bytes()]);
							headers.set_raw("X-Authrocket-Api-Key",vec!["key_jtnCRWxQvDD0p5HATR9RBIe4WnxnwV6pWNzwmZQLnSZ".to_string().into_bytes()]);
							headers.set_raw("X-Authrocket-Realm",vec!["rl_0vC7wd03CqwhpK7kT8fvAc".to_string().into_bytes()]);
							headers.set_raw("Accept",vec!["application/json".to_string().into_bytes()]);
							headers.set(content_type);

							// Send the request and receive a response with session data
							let mut client_res = req.headers(headers).send().unwrap();

							match client_res.status_raw() {

								&hyper::http::RawStatus(200,_) => {

									let mut body = String::new();
									client_res.read_to_string(&mut body).unwrap();
									let session_data: Session = json::decode(&body).unwrap();
									println!("Welcome to Eve, {:?}!",session_data.user.username);
									println!("Login Successful. Redirecting to user area.");

									// Connect to the Eve runtime and add the user to the eveusers table
									let ws_result = open_websocket("ws://192.168.137.38:2794");
									match ws_result {
										// If things went okay, redirect to the Eve UI
										Ok(mut sender) => {
											// Form the response
											*res.status_mut() = hyper::status::StatusCode::PermanentRedirect;

											// Form the response headers
											let mut headers = Headers::new();
											let location = Location("http://192.168.137.38:1234/editor.html".to_string());
											let user_cookie = Cookie::new("userid".to_string(),session_data.user.id.clone());
											let cookies = SetCookie(vec![user_cookie]);
											headers.set(location);
											headers.set(cookies);
											*res.headers_mut() = headers;

											// Create eveusers table and insert the new user
											let table_name = "eveusers";
											let table_fields = vec!["id","username"];
											let row_data = vec![
																Value::String(session_data.user.id.clone()),
																Value::String(session_data.user.username.clone())
														   	   ];
											let mut create_eveusers_table = create_table(&table_name,&table_fields,None);
											create_eveusers_table = insert_fact(&"tag",&vec!["view","tag"],&vec![Value::String("eveusers".to_string()),Value::String("remote".to_string())],Some(create_eveusers_table));
											let insert_user = insert_fact(&table_name,&table_fields,&row_data,None);
											send_event(&create_eveusers_table,&mut sender);
											send_event(&insert_user,&mut sender);
											let _ = sender.send_message(Message::Close(None));
										}
										// Otherwise, throw an error... maybe redirect to a special page.
										Err(e) => {
											println!("ERROR: Had trouble connecting to the Eve runtime: {}. Is the server running?",e);
											*res.status_mut() = hyper::status::StatusCode::NotFound;
											panic!("Oh no!");
											//serve_file("404.html",res);
										}
									}

									println!("Login complete.");
								}
								_ => {
									println!("ERROR: Could not authenticate user with token {}",token);
									*res.status_mut() = hyper::status::StatusCode::Forbidden;
									panic!("Oh no!");
									//serve_file("404.html",res);
								}
							};
						},
						_ => panic!("Oh no!"), //serve_file("404.html",res),
					}
				},
				"logout.html" => {
					println!("Logging out...");
					let user_id = server::get_user_id(req.headers.get::<hyper::header::Cookie>());
                	println!("{:?}",user_id);
				},
				"favicon.ico" => (),
				other => panic!("Cannot serve {}",other), //serve_file(&*requested_file,res),
			};
		}
		_ => panic!("Oh no!"),
	}
}