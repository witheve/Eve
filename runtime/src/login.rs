use std::io::{Read, Write};
use std::io;
use std::fs::File;
use std::error::Error;
use hyper;
use hyper::net::Fresh;
use hyper::server::{Server, Request, Response};
use hyper::uri::RequestUri;
use hyper::Url;
use hyper::header::{Headers,ContentType,Location,SetCookie};
use hyper::header;
use cookie::Cookie;
use mime::Mime;
use url::SchemeData::Relative;
use rustc_serialize::json;
use rustc_serialize::json::ToJson;
use std::path::Path;
use std::fs::PathExt;
use conduit_mime_types::Types;
use std::str::FromStr;
use std::env;
use websocket::{client,Client,stream,Message,Sender,Receiver};
use std::thread;
use cbor;
use cbor::ToCbor;

use value::Value;
use server::Event;
use relation::Change;

// The (increasingly misnamed) login server is responsible for:
// * handling authentication via authrocket
// * serving static files for the editor and clients
// TODO needs review

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

pub fn run(socket_addr: ::std::net::SocketAddr) {

    // TODO high thread-count is a workaround for https://github.com/hyperium/hyper/issues/368
    Server::http(socket_addr).unwrap().handle_threads(login, 100).unwrap();
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

fn serve_local_or_file(mut res: Response<Fresh>, path: &Vec<String>, default_file: &str) -> io::Result<()> {
    let mime_types = Types::new().unwrap();
    let local_path = path[1..].iter().fold("../ui".to_owned(), |end, cur| end + "/" + cur);
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
        str = str.replace("/app/http", "http");
        file = str.as_bytes().to_owned();
        file_path = default_file;
    }
    let mime: Mime = Mime::from_str(mime_types.mime_for_path(Path::new(&file_path))).unwrap();
    res.headers_mut().set(ContentType(mime));
    let mut res = try!(res.start());
    try!(res.write_all(&file));
    try!(res.end());
    Ok(())
}

pub fn get_user_id(cookies: Option<&header::Cookie>) -> Option<String> {
    match cookies {
        Some(cookies) => {
            match cookies.iter().find(|cookie| cookie.name == "userid") {
                Some(user_id) => Some(user_id.value.clone()),
                None => None,
            }
        },
        None => None,
    }
}

fn login(req: Request, mut res: Response<Fresh>) {

    // Don't use a port if we're running in local mode
    let mut port = ":8000";
    for argument in env::args() {
        match &*argument {
            "local" => {
                port = "";
            },
            _ => continue,
        }
    }

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
                "app.html" | "app" => {
                    let result = serve_local_or_file(res, &path_info.path, "../ui/app.html");
                    if let Err(error) = result {
                        println!("Warning: serve error {:?}", error);
                    }
                },
                "editor.html" | "editor" | "" => {
                    let result = serve_local_or_file(res, &path_info.path, "../ui/editor.html");
                    if let Err(error) = result {
                        println!("Warning: serve error {:?}", error);
                    }
                },
                "login.html" => {
                    println!("Authenticating User");

                    let referer = format!("{}",req.headers.get::<hyper::header::Referer>().unwrap());
                    let referer_url = Url::parse(&*referer).unwrap();

                    let pairs = query_pairs.clone().unwrap();
                    match &pairs[..] {
                        [(_ , ref page), (ref token_type, ref token), ..] if token_type.clone() == "token".to_string() => {

                            // We have a login token, now to authenticate
                            let client = hyper::client::Client::new();
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
                                    let ws_result = open_websocket("ws://0.0.0.0:2794");
                                    match ws_result {
                                        // If things went okay, redirect to the Eve UI
                                        Ok(mut sender) => {
                                            // Form the response
                                            *res.status_mut() = hyper::status::StatusCode::PermanentRedirect;

                                            // Form the response headers
                                            let mut headers = Headers::new();
                                            let redirect_url = referer_url.scheme.clone() + "://" + referer_url.domain().unwrap().clone() + port + "/" + page;
                                            let location = Location(redirect_url);
                                            let user_cookie = Cookie::new("userid".to_string(),session_data.user.id.clone());
                                            let cookies = SetCookie(vec![user_cookie]);
                                            headers.set(location);
                                            headers.set(cookies);
                                            *res.headers_mut() = headers;

                                            // Create eveusers table and insert the new user
                                            let change = ("eveusers".to_owned(),
                                                Change{
                                                    fields: vec!["eveusers: id".to_owned(), "eveusers: username".to_owned()],
                                                    insert: vec![vec![
                                                        Value::String(session_data.user.id.clone()),
                                                        Value::String(session_data.user.username.clone())
                                                    ]],
                                                    remove: vec![],
                                                });
                                            let event = Event{changes: vec![change], commands: vec![]};
                                            send_event(event, &mut sender);
                                            let _ = sender.send_message(Message::Close(None));
                                        }
                                        // Otherwise, throw an error... maybe redirect to a special page.
                                        Err(e) => {
                                            println!("ERROR: Had trouble connecting to the Eve runtime: {}. Is the server running?",e);
                                            *res.status_mut() = hyper::status::StatusCode::NotFound;
                                            panic!("Oh no!");
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
                        _ => {
                        	*res.status_mut() = hyper::status::StatusCode::NotFound;
                        	let result = serve_local_or_file(res, &path_info.path, "../ui/404.html");
                        	if let Err(error) = result {
                        		println!("Warning: serve error {:?}", error);
                        	}
                        },
                    }
                },
                "logout.html" => {
                    println!("Logging out...");
                    let user_id = get_user_id(req.headers.get::<hyper::header::Cookie>());
                    println!("{:?}",user_id);
                },
                "favicon.ico" => (),
                _ => {
					*res.status_mut() = hyper::status::StatusCode::NotFound;
					let result = serve_local_or_file(res, &path_info.path, "../ui/404.html");
					if let Err(error) = result {
						println!("Warning: serve error {:?}", error);
					}
                }
            };
        }
        _ => panic!("Oh no!"),
    }
}

pub fn open_websocket(url_string: &str) -> Result<client::sender::Sender<stream::WebSocketStream>,String> {

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

    match response.validate() {
        Ok(_) => println!("Response valid. Start sending/receiving..."),
        Err(e) => {
            return Err(format!("{}", e).to_string());
        }
    };

    let (sender, mut receiver) = response.begin().split();

    thread::spawn(move || {
        for message in receiver.incoming_messages() {
            let message = match message {
                Ok(m) => m,
                Err(_) => return,
            };
            match message {
                Message::Text(_) => {
                    //let json = Json::from_str(&text).unwrap();
                    //let event: Event = FromJson::from_json(&json);
                },
                Message::Close(_) => {
                    println!("Received close message");
                    return;
                }
                _ => println!("Unknown message: {:?}", message)
            }
        }
    });

    Ok(sender)
}

pub fn send_event(event: Event, sender: &mut client::sender::Sender<stream::WebSocketStream>) {
    let mut e = cbor::Encoder::from_memory();
    let json = event.to_json();
    let cbor = json.to_cbor();
    e.encode(vec![cbor]).unwrap();
    sender.send_message(Message::Binary(e.into_bytes())).unwrap();
}