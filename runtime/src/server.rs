use std::thread;
use std::sync::mpsc;
use websocket;
use websocket::{Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use websocket::message::CloseData;
use std::io::prelude::*;
use std::fs::{OpenOptions, File};
use std::net::Shutdown;
use rustc_serialize::json::{Json, ToJson};
use cbor;
use hyper::header::Cookie;

use value::Value;
use relation::Change;
use flow::{Changes, Flow};
use client;

pub trait FromJson {
    fn from_json(json: &Json) -> Self;
}

impl ToJson for Value {
    fn to_json(&self) -> Json {
        match *self {
            Value::Null => panic!("Cannot allow the client to see nulls"),
            Value::Bool(bool) => Json::Boolean(bool),
            Value::String(ref string) => Json::String(string.clone()),
            Value::Float(float) => Json::F64(float),
        }
    }
}

impl FromJson for Value {
    fn from_json(json: &Json) -> Self {
        match *json {
            Json::Boolean(bool) => Value::Bool(bool),
            Json::String(ref string) => Value::String(string.clone()),
            Json::F64(float) => Value::Float(float),
            Json::I64(int) => Value::Float(int as f64),
            Json::U64(uint) => Value::Float(uint as f64),
            _ => panic!("Cannot decode {:?} as Value", json),
        }
    }
}

impl FromJson for String {
    fn from_json(json: &Json) -> Self {
        json.as_string().unwrap().to_owned()
    }
}

impl<T: FromJson> FromJson for Vec<T> {
    fn from_json(json: &Json) -> Self {
        json.as_array().unwrap().iter().map(|t| FromJson::from_json(t)).collect()
    }
}

#[derive(Debug, Clone)]
pub struct Event {
    pub changes: Changes,
    pub session: String,
}

impl ToJson for Event {
    fn to_json(&self) -> Json {
        Json::Object(vec![
            ("changes".to_string(), Json::Array(
                self.changes.iter().map(|&(ref view_id, ref view_changes)| {
                    Json::Array(vec![
                        view_id.to_json(),
                        view_changes.fields.to_json(),
                        view_changes.insert.to_json(),
                        view_changes.remove.to_json(),
                        ])
                }).collect()
                )
            ),
            ("session".to_string(), self.session.to_json()),
        ].into_iter().collect())
    }
}

impl FromJson for Event {
    fn from_json(json: &Json) -> Self {
        Event{
            changes: json.as_object().unwrap()["changes"]
            .as_array().unwrap().iter().map(|change| {
                let change = change.as_array().unwrap();
                assert_eq!(change.len(), 4);
                let view_id = FromJson::from_json(&change[0]);
                let fields = FromJson::from_json(&change[1]);
                let insert = FromJson::from_json(&change[2]);
                let remove = FromJson::from_json(&change[3]);
                (view_id, Change{fields:fields, insert: insert, remove: remove})
            }).collect(),
            session: "".to_string(),
        }
    }
}

pub enum ServerEvent {
    Change(Vec<u8>),
    Sync((sender::Sender<WebSocketStream>,Option<String>)),
    Terminate(Option<CloseData>),
}

// TODO holy crap why is everything blocking? this is a mess
pub fn server_events() -> mpsc::Receiver<ServerEvent> {
    let (event_sender, event_receiver) = mpsc::channel();
    thread::spawn(move || {
        let server = websocket::Server::bind("0.0.0.0:2794").unwrap();
        for connection in server {
            let event_sender = event_sender.clone();
            thread::spawn(move || {
                // accept request
                let request = connection.unwrap().read_request().unwrap();
                request.validate().unwrap();

                // Get the User ID from a cookie in the headers
                let user_id = get_user_id(request.headers.get::<Cookie>());

                let response = request.accept();
                let (mut sender, mut receiver) = response.send().unwrap().split();

                let ip = sender.get_mut().peer_addr().unwrap();
                println!("Connection from {}", ip);
                ::std::io::stdout().flush().unwrap(); // TODO is this actually necessary?

                // hand over sender
                event_sender.send(ServerEvent::Sync((sender,user_id))).unwrap();

                // handle messages
                for message in receiver.incoming_messages() {
                    let message = match message {
                        Ok(m) => m,
                        Err(_) => return,
                    };
                    match message {
                        Message::Binary(bytes) => {
                            event_sender.send(ServerEvent::Change(bytes)).unwrap();
                        }
                        Message::Close(_) => {
                            let ip_addr = format!("{}", ip);
                            println!("Received close message from {}.",ip_addr);
                            let close_message = CloseData{status_code: 0, reason: ip_addr};
                            event_sender.send(ServerEvent::Terminate(Some(close_message))).unwrap();
                        }
                        _ => println!("Unknown message: {:?}", message)
                    }
                }
            });
        }
    });
    event_receiver
}

pub fn load(flow: &mut Flow, filename: &str) {
    let mut events = OpenOptions::new().create(true).open(filename).unwrap();
    let mut old_events = String::new();
    events.read_to_string(&mut old_events).unwrap();
    for line in old_events.lines() {
        let json = Json::from_str(&line).unwrap();
        let event: Event = FromJson::from_json(&json);
        flow.quiesce(event.changes);
    }
}

pub struct Server {
    pub flow: Flow,
    pub events: File,
    pub senders: Vec<sender::Sender<WebSocketStream>>,
}

pub fn handle_event(server: &mut Server, event: Event, event_json: Json) {
    server.events.write_all(format!("{}", event_json).as_bytes()).unwrap();
    server.events.write_all("\n".as_bytes()).unwrap();
    server.events.flush().unwrap();
    let old_flow = time!("cloning", {
        server.flow.clone()
    });
    server.flow.quiesce(event.changes);
    let changes = time!("diffing", {
        server.flow.changes_from(old_flow)
    });
    for sender in server.senders.iter_mut() {
        let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
        let text = format!("{}", Event{changes: changes.clone(), session: session_id}.to_json());
        match sender.send_message(Message::Text(text)) {
            Ok(_) => (),
            Err(error) => println!("Send error: {}", error),
        };
    }
}

pub fn run() {
    let mut flow = Flow::new();
    time!("reading saved state", {
        load(&mut flow, "./bootstrap");
        load(&mut flow, "./events");
    });

    let events = OpenOptions::new().write(true).append(true).open("./events").unwrap();
    let senders: Vec<sender::Sender<WebSocketStream>> = Vec::new();

    let mut server = Server{flow: flow, events: events, senders: senders};

    for server_event in server_events() {
        match server_event {

            ServerEvent::Sync((mut sender,user_id)) => {

                // Add a session to the session table
                let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
				let mut add_session = client::insert_fact(&"sessions",&vec!["id","status"],&vec![Value::String(session_id.clone()),
				                                                                       		     Value::Float(1f64)
				                                                                      	        ],None);

				// If we have a user ID, add a mapping from the session ID to the user ID
                add_session = match user_id {
                    Some(user_id) => {

                        client::insert_fact(&"session id to user id",&vec!["session id","user id"],&vec![Value::String(session_id.clone()),
                                                                                                 Value::String(user_id),
                                                                                                ],Some(add_session))
                    },
                    None => add_session,
                };
                let json = add_session.to_json();
                handle_event(&mut server, add_session, json);

                let changes = server.flow.as_changes();
                let text = format!("{}", Event{changes: changes, session: session_id}.to_json());
                match sender.send_message(Message::Text(text)) {
                    Ok(_) => (),
                    Err(error) => println!("Send error: {}", error),
                };
                server.senders.push(sender)
            }

            ServerEvent::Change(input_bytes) => {
                // TODO we throw cbor in here to avoid https://github.com/rust-lang/rustc-serialize/issues/113
                let mut decoder = cbor::Decoder::from_bytes(&input_bytes[..]);
                let cbor = decoder.items().next().unwrap().unwrap();
                let json = cbor.to_json();
                let event = FromJson::from_json(&json);
                handle_event(&mut server, event, json);
            }

            ServerEvent::Terminate(m) => {

                let terminate_ip = m.unwrap().reason;
                println!("Closing connection from {}...",terminate_ip);
                // Find the index of the connection's sender
                let ip_ix = server.senders.iter_mut().position(|mut sender| {
                                                          let ip = format!("{}",sender.get_mut().peer_addr().unwrap());
                                                          ip == terminate_ip
                                                        });

                // Properly clean up connections and the session table
                match ip_ix {
                    Some(ix) => {
                        // Close the connection
                        let _ = server.senders[ix].send_message(Message::Close(None));

                        match server.senders[ix].get_mut().shutdown(Shutdown::Both) {
                            Ok(_) => println!("Connection from {} has closed successfully.",terminate_ip),
                            Err(e) => println!("Connection from {} failed to shut down properly: {}",terminate_ip,e),
                        }
                        server.senders.remove(ix);

                        // Update the session table
                        let sessions = server.flow.get_output("sessions").clone();
                        let ip_string = Value::String(terminate_ip.clone());

                        match sessions.find_maybe("id",&ip_string) {
                            Some(session) => {
                            	let closed_session = session.clone();
                                let mut close_session_values = &mut closed_session.values.to_vec();
                                let status_ix = match closed_session.names.iter().position(|name| name == "status") {
                                	Some(ix) => ix,
                                	None => panic!("No field named \"status\""),
                                };
                                close_session_values[status_ix] = Value::Float(0f64);

                                let change = Change {
                                                        fields: sessions.fields.clone(),
                                                        insert: vec![close_session_values.clone()],
                                                        remove: vec![session.values.to_vec().clone()],
                                                    };
                                let event = Event{changes: vec![("sessions".to_string(),change)], session: "".to_string()};
                                let json = event.to_json();
                                handle_event(&mut server, event, json);

                            },
                            None => println!("No session found"),
                        }

                    },
                    None => panic!("IP address {} is not connected",terminate_ip),
                }
            }
        }
    }
}

pub fn get_user_id(cookies: Option<&Cookie>) -> Option<String> {
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