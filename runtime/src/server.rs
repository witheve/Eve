use std::thread;
use std::sync::mpsc;
use websocket::{Server, Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use websocket::message::CloseData;
use std::io::prelude::*;
use std::fs::OpenOptions;
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

#[derive(Debug)]
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
                }).collect())
            ),("session".to_string(),Json::String(self.session.clone()))].into_iter().collect())
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
pub fn serve() -> mpsc::Receiver<ServerEvent> {
    let (event_sender, event_receiver) = mpsc::channel();
    thread::spawn(move || {
        let server = Server::bind("0.0.0.0:2794").unwrap();
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

pub fn load(filename: &str) -> Flow {
    let mut flow = Flow::new();
    let mut events = OpenOptions::new().create(true).open(filename).unwrap();
    let mut old_events = String::new();
    events.read_to_string(&mut old_events).unwrap();
    for line in old_events.lines() {
        let json = Json::from_str(&line).unwrap();
        let event: Event = FromJson::from_json(&json);
        flow = flow.quiesce(event.changes);
    }
    flow
}

pub fn run() {
    let mut flow;
    time!("reading saved state", {
        flow = load("./events");
    });

    let mut events = OpenOptions::new().write(true).append(true).open("./events").unwrap();
    let mut senders: Vec<sender::Sender<_>> = Vec::new();

    // Create sessions table
    let mut sessions_table = client::create_table(&"sessions",&vec!["id","user id","status"],None);
    sessions_table = client::insert_fact(&"tag",&vec!["view","tag"],&vec![Value::String("sessions".to_string()),Value::String("remote".to_string())],Some(sessions_table));
    flow = flow.quiesce(sessions_table.changes);

    for server_event in serve() {
        match server_event {

            ServerEvent::Sync((mut sender,user_id)) => {

                // If we have a user ID, create a new session
                let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
                match user_id {
                    Some(user_id) => {
                        let add_session = client::insert_fact(&"sessions",&vec!["id","user id","status"],&vec![Value::String(session_id.clone()),
                                                                                                               Value::String(user_id),
                                                                                                               Value::Float(1f64)
                                                                                                              ],None);
                        flow = send_changes(add_session,flow,&mut senders);
                    },
                    None => {
                        let add_session = client::insert_fact(&"sessions",&vec!["id","user id","status"],&vec![Value::String(session_id.clone()),
                                                                                                               Value::String("".to_string()),
                                                                                                               Value::Float(1f64)
                                                                                                              ],None);
                        flow = send_changes(add_session,flow,&mut senders);
                    },
                };

                time!("syncing", {
                    let changes = flow.as_changes();
                    let text = format!("{}", Event{changes: changes, session: session_id}.to_json());
                    match sender.send_message(Message::Text(text)) {
                        Ok(_) => (),
                        Err(error) => println!("Send error: {}", error),
                    };
                    senders.push(sender)
                })
            }

            ServerEvent::Change(input_bytes) => {
                time!("changing", {
                    // TODO we throw cbor in here to avoid https://github.com/rust-lang/rustc-serialize/issues/113
                    let mut decoder = cbor::Decoder::from_bytes(&input_bytes[..]);
                    let cbor = decoder.items().next().unwrap().unwrap();
                    let json = cbor.to_json();
                    events.write_all(format!("{}", json).as_bytes()).unwrap();
                    events.write_all("\n".as_bytes()).unwrap();
                    events.flush().unwrap();
                    let event: Event = FromJson::from_json(&json);
                    flow = send_changes(event,flow,&mut senders);
                })
            }

            ServerEvent::Terminate(m) => {
                let terminate_ip = m.unwrap().reason;
                println!("Closing connection from {}...",terminate_ip);
                // Find the index of the connection's sender
                let ip_ix = senders.iter_mut().position(|mut sender| {
                                                          let ip = format!("{}",sender.get_mut().peer_addr().unwrap());
                                                          ip == terminate_ip
                                                        });

                // Properly clean up connections and the session table
                match ip_ix {
                    Some(ix) => {
                        // Close the connection
                        let _ = senders[ix].send_message(Message::Close(None));

                        match senders[ix].get_mut().shutdown(Shutdown::Both) {
                            Ok(_) => {
                                println!("Connection from {} has closed successfully.",terminate_ip);
                            },
                            Err(e) => println!("Connection from {} failed to shut down properly: {}",terminate_ip,e),
                        }
                        senders.remove(ix);

                        // Update the session table
                        let sessions = flow.get_output("sessions").clone();
                        let ip_string = Value::String(terminate_ip.clone());
                        match sessions.index.iter().find(|session| session[0] == ip_string) {
                            Some(session) => {
                                let mut closed_session = session.clone();
                                // TODO Shouldn't use a hardcoded index to access the field
                                closed_session[1] = Value::Float(0f64); // Set status to 0
                                let change = Change {
                                                        fields: sessions.fields.clone(),
                                                        insert: vec![closed_session.clone()],
                                                        remove: vec![session.clone()],
                                                    };
                                let make_session_inactive = Event{changes: vec![("sessions".to_string(),change)], session: "".to_string()};
                                flow = send_changes(make_session_inactive,flow,&mut senders);

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

fn send_changes(event: Event, mut flow: Flow, mut senders: &mut Vec<sender::Sender<WebSocketStream>>) -> Flow {

    let old_flow = flow.clone();
    flow = flow.quiesce(event.changes);
    let changes = flow.changes_from(old_flow);
    let changes_json = changes_to_json(changes.clone());
    for sender in senders.iter_mut() {
    	let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
		// TODO this is a hack to avoid having to json an event for every sender
		let output_text = format!("{{\"changes\":{},\"session\":\"{}\"}}",changes_json,session_id.clone());
        match sender.send_message(Message::Text(output_text.clone())) {
            Ok(_) => (),
            Err(error) => println!("Send error: {}", error),
        };
    }
    flow
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


fn changes_to_json(changes: Changes) -> Json {
    Json::Array(changes.iter().map(|&(ref view_id, ref view_changes)| {
        Json::Array(vec![
            view_id.to_json(),
            view_changes.fields.to_json(),
            view_changes.insert.to_json(),
            view_changes.remove.to_json(),
            ])
    }).collect())
}
