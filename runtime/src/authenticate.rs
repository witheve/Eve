use std::io::Read;
use std::error::Error;

use hyper;
use hyper::net::Fresh;
use hyper::server::{Server, Request, Response};
use hyper::uri::RequestUri;
use hyper::Url;
use hyper::header::{Headers,ContentType,Location,SetCookie};
use cookie::Cookie;

use websocket::{client,Client,stream,Message, Sender, Receiver};

use mime::Mime;

use url::SchemeData::Relative;

use rustc_serialize::json;
use rustc_serialize::json::ToJson;

use value::Value;
use server::Event;
use relation::Change;

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
pub struct Session {
	pub client: String,
	pub id: String,
	pub user_id: String,
	pub object: String,
	pub created_at: f64,
	pub expires_at: f64,
	pub ip: String,
	pub user: User,
}

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
pub struct User {
	pub custom: Custom,
	pub id: String,
	pub realm_id: String,
	pub username: String,
	pub state: String,
	pub user_type: String,
	pub reference: Option<String>,
	pub name: String,
	pub email: String,
	pub object: String,
	pub last_login_at: f64,
	pub last_login_on: f64,
	pub created_at: f64,
	pub first_name: Option<String>,
	pub last_name: Option<String>,
	pub credentials: Vec<Credential>,
	pub membership_count: f64,
}

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
pub struct Custom;

#[derive(RustcDecodable, RustcEncodable, Debug, Clone)]
pub struct Credential {
	id: String,
	credential_type: String,
	object: String,
}

pub fn run() {
    Server::http(auth).listen("0.0.0.0:8080").unwrap();
}

fn auth(req: Request, mut res: Response<Fresh>) {

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

			// Parse the query string
			let query_pairs = &url.query_pairs();

			// Handle login
			match &*requested_file {
				"auth.html" => {
					println!("Authenticating User");
					let pairs = query_pairs.clone().unwrap();
					match &pairs[..] {
						[(ref token_type, ref token)] if token_type.clone() == "token".to_string() => {

							// We have a login token, now to authenticate
							let mut client = hyper::client::Client::new();
							let api_call = "https://api-e1.authrocket.com/v1/sessions/".to_string() + token;
							let req = client.request(hyper::method::Method::Get,&*api_call);

							// Set the appropriate headers for authorocket
							let json: Mime = "application/json".parse().unwrap();
							let accept = Accept("application/json".to_string());
							let content_type = ContentType(json);
							let account = AuthrocketAccount("org_0vC7wPw9XphPGQnSqYB6bz".to_string());
							let key = AuthrocketApiKey("key_jtnCRWxQvDD0p5HATR9RBIe4WnxnwV6pWNzwmZQLnSZ".to_string());
							let realm = AuthrocketRealm("rl_0vC7wd03CqwhpK7kT8fvAc".to_string());

							let mut headers = Headers::new();
							headers.set(account);
							headers.set(key);
							headers.set(realm);
							headers.set(accept);
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

									// Connect to the Eve runtime and add the user to the eveuser table
									let ws_result = open_websocket("ws://192.168.137.38:2794",vec![session_data.user.id.clone(),
																								   session_data.user.username.clone()]);
									match ws_result {
										// If things went okay, redirect to the Eve UI
										Ok((send_loop,receive_loop)) => {
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

											let _ = send_loop.join();
											let _ = receive_loop.join();
										}
										// Otherwise,
										Err(e) => {
											println!("ERROR: Had trouble connecting to the Eve runtime: {}",e);
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
				_ => panic!("Oh no!"), //serve_file(&*requested_file,res),
			};
		}
		_ => panic!("Oh no!"),
	}
}

fn open_websocket(url_string: &str,data: Vec<String>) -> Result<(::std::thread::JoinGuard<()>,::std::thread::JoinGuard<()>),String> {

	use std::thread;
	use std::sync::mpsc::channel;

	//let mut context = SslContext::new(SslMethod::Tlsv1).unwrap();
	//let _ = context.set_certificate_file(&(Path::new("server.crt")), X509FileType::PEM);
	//let _ = context.set_private_key_file(&(Path::new("server.key")), X509FileType::PEM);
	let url = Url::parse(url_string).unwrap();
	println!("Connecting to {}", url);
	let request = match Client::connect(url) {
		Ok(t) => t,
		Err(e) => {
			return Err(format!("{}", e).to_string());
		}
	};

	let response = match request.send() {
		Ok(t) => t,
		Err(e) => {
			return Err(format!("{}", e).to_string());
		}
	};

	response.validate().unwrap();
	let (sender, receiver) = response.begin().split();
	let (tx, rx) = channel();

	// Send an initial ping to the server
	tx.send(Message::Ping(vec![0])).unwrap();

	let send_loop = thread::scoped(move || { send_handler(sender,&rx) } );
	let receive_loop = thread::scoped(move || { receive_handler(receiver,&tx,data) } );
	Ok((send_loop,receive_loop))
}

fn send_handler(ref mut sender: client::sender::Sender<stream::WebSocketStream>, rx: &::std::sync::mpsc::Receiver<Message>) {

	loop {

		let message = match rx.recv() {
			Ok(m) => m,
			Err(e) => {
				println!("Send Message Error: {:?}", e);
				return;
			}
		};
		match message {
			Message::Close(_) => {
				println!("Received close connection message");
				let _ = sender.send_message(message);
				return;
			}
			_ => (),
		}
		// Send the message
		match sender.send_message(message) {
			Ok(()) => {
				println!("Sending a message");
				()
			},
			Err(e) => {
				println!("Cannot send message, sending close connection instead: {:?}", e);
				let _ = sender.send_message(Message::Close(None));
				return;
			}
		}
	}

}

fn receive_handler(ref mut receiver: client::receiver::Receiver<stream::WebSocketStream>, tx: &::std::sync::mpsc::Sender<Message>, data: Vec<String>) {

	let mut response_count = 0;

	// Receive loop
	for message in receiver.incoming_messages() {

		let message = match message {
			Ok(m) => m,
			Err(e) => {
				println!("Receive Loop1: {:?}", e);
				let _ = tx.send(Message::Close(None));
				return;
			}
		};

		match message {
			Message::Close(_) => {
				let _ = tx.send(Message::Close(None));
				return;
			},
			Message::Text(_) => {
				println!("Received Text");

				// Create an eveuser table
				let create_table = Event{changes: vec![("display name".to_string(),Change {
																		     fields: vec!["display name: id".to_string(),"display name: name".to_string()],
																		     insert: vec![
																		  		 	     	vec![Value::String("eveuser".to_string()),Value::String("eveuser".to_string())],
																		  		 	     	vec![Value::String("eveuser: id".to_string()),Value::String("id".to_string())],
																		  		 	     	vec![Value::String("eveuser: username".to_string()),Value::String("username".to_string())],
																		  	     		 ],
																		     remove: vec![],
																		    }
												),
												("view".to_string(),Change {
																		     fields: vec!["view: view".to_string(),"view: kind".to_string()],
																		     insert: vec![
																		  		 	     	vec![Value::String("eveuser".to_string()),Value::String("table".to_string())],
																		  	     		 ],
																		     remove: vec![],
																		    }
												),
												("field".to_string(),Change {
																		     fields: vec!["field: view".to_string(),"field: field".to_string(),"field: kind".to_string()],
																		     insert: vec![
																		  		 	     	vec![Value::String("eveuser".to_string()),Value::String("eveuser: id".to_string()),Value::String("output".to_string())],
																		  		 	     	vec![Value::String("eveuser".to_string()),Value::String("eveuser: username".to_string()),Value::String("output".to_string())],
																		  	     		 ],
																		     remove: vec![],
																		    }
												),
											   ]
								 };

					// Insert the logged in user to the eveuser table
					let insert_user = Event{changes: vec![("eveuser".to_string(),Change {
																		     fields: vec!["eveuser: id".to_string(),"eveuser: username".to_string()],
																		     insert: vec![
																		  		 	     	vec![Value::String(data[0].clone()),Value::String(data[1].clone())],
																		  	     		 ],
																		     remove: vec![],
																		    }
												),
											   ]
								 };

				// First we create the eveuser table
				if response_count == 0 {
					let json_event = create_table.to_json();
					let _ = tx.send(Message::Text(json_event.to_string()));
					response_count = response_count + 1;
				// We get back a response from the server, now insert the user
				} else if response_count == 1 {
					let json_event = insert_user.to_json();
					let _ = tx.send(Message::Text(json_event.to_string()));
					response_count = response_count + 1;
				// We get back a response again, so we've done our job. Close the connection
				} else {
					tx.send(Message::Close(None)).unwrap();
					return;
				}
			},
			_ => println!("Unhandled message type"),
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct AuthrocketAccount(pub String);

impl hyper::header::Header for AuthrocketAccount {
	fn header_name() -> &'static str {
	    "X-Authrocket-Account"
	}
	fn parse_header(raw: &[Vec<u8>]) -> Option<Self> {
	    hyper::header::parsing::from_one_raw_str(raw).map(AuthrocketAccount)
	}
}

impl hyper::header::HeaderFormat for AuthrocketAccount {
	fn fmt_header(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

impl ::std::fmt::Display for AuthrocketAccount {
	fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct AuthrocketApiKey(pub String);

impl hyper::header::Header for AuthrocketApiKey {
	fn header_name() -> &'static str {
	    "X-Authrocket-Api-Key"
	}
	fn parse_header(raw: &[Vec<u8>]) -> Option<Self> {
	    hyper::header::parsing::from_one_raw_str(raw).map(AuthrocketApiKey)
	}
}

impl hyper::header::HeaderFormat for AuthrocketApiKey {
	fn fmt_header(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

impl ::std::fmt::Display for AuthrocketApiKey {
	fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct AuthrocketRealm(pub String);

impl hyper::header::Header for AuthrocketRealm {
	fn header_name() -> &'static str {
	    "X-Authrocket-Realm"
	}
	fn parse_header(raw: &[Vec<u8>]) -> Option<Self> {
	    hyper::header::parsing::from_one_raw_str(raw).map(AuthrocketRealm)
	}
}

impl hyper::header::HeaderFormat for AuthrocketRealm {
	fn fmt_header(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

impl ::std::fmt::Display for AuthrocketRealm {
	fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct Accept(pub String);

impl hyper::header::Header for Accept {
	fn header_name() -> &'static str {
	    "Accept"
	}
	fn parse_header(raw: &[Vec<u8>]) -> Option<Self> {
	    hyper::header::parsing::from_one_raw_str(raw).map(Accept)
	}
}

impl hyper::header::HeaderFormat for Accept {
	fn fmt_header(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}

impl ::std::fmt::Display for Accept {
	fn fmt(&self, f: &mut ::std::fmt::Formatter) -> ::std::fmt::Result {
	    ::std::fmt::Display::fmt(&self.0, f)
	}
}