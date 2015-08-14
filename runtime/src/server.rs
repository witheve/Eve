use std::thread;
use std::sync::mpsc;
use websocket;
use websocket::{Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use websocket::message::CloseData;
use std::io::prelude::*;
use std::fs::{OpenOptions};
use std::net::Shutdown;
use rustc_serialize::json::{Json, ToJson};
use cbor;
use hyper::header::Cookie;

use value::Value;
use relation::Change;
use flow::{Changes, Flow};

// The server manages a single Eve program and handles communication with the editor and clients
// TODO needs review / refactoring, especially session handling

pub struct Server {
    pub flow: Flow,
    pub senders: Vec<sender::Sender<WebSocketStream>>,
}

#[derive(Debug, Clone)]
pub struct Event {
    pub changes: Changes,
    pub session: String,
    // commands that affect the whole program state have to go through this side-channel rather than being added to a view
    pub commands: Vec<Vec<String>>,
}

pub enum ServerEvent {
    Change(Vec<u8>),
    Sync((sender::Sender<WebSocketStream>, Option<String>)),
    Terminate(Option<CloseData>),
}

// --- json encodings ---

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
            Value::Column(ref column) => Json::Array(column.iter().map(|v| v.to_json()).collect()),
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
            Json::Array(ref array) => Value::Column(array.iter().map(FromJson::from_json).collect()),
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
            ("commands".to_string(), self.commands.to_json()),
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
            commands: FromJson::from_json(json.as_object().unwrap().get("commands").unwrap_or(&Json::Array(vec![]))),
        }
    }
}

// --- persistence ---

pub fn read_file(filename: &str) -> String {
    let mut file = OpenOptions::new().create(true).open(filename).unwrap();
    let mut contents = String::new();
    file.read_to_string(&mut contents).unwrap();
    contents
}

pub fn write_file(filename: &str, contents: &str) {
    let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(filename).unwrap();
    file.write_all(contents.as_bytes()).unwrap();
}

pub fn load(flow: &mut Flow, filename: &str) {
    for line in read_file(filename).lines() {
        let json = Json::from_str(&line).unwrap();
        let event: Event = FromJson::from_json(&json);
        flow.quiesce(event.changes);
    }
}

// TODO should probably just save changes, not the whole event
pub fn save(flow: &Flow, filename: &str) {
    let changes = flow.as_changes();
    let text = format!("{}", Event{changes: changes, session: "".to_owned(), commands: vec![]}.to_json());
    write_file(filename, &text[..]);
}

// --- server ---

pub fn send_event(server: &mut Server, changes: &Changes, commands: &Vec<Vec<String>>) {
    for sender in server.senders.iter_mut() {
        let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
        let event = Event{changes: changes.clone(), session: session_id, commands: commands.clone()};
        let text = format!("{}", event.to_json());
        match sender.send_message(Message::Text(text)) {
            Ok(_) => (),
            Err(error) => println!("Send error: {}", error),
        };
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

// rust-websocket is blocking, so we have to spawn a thread per connection
// each thread sends events back to a central channel
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

                // get the User ID from a cookie in the headers
                let user_id = get_user_id(request.headers.get::<Cookie>());

                let response = request.accept();
                let (mut sender, mut receiver) = response.send().unwrap().split();

                let ip = sender.get_mut().peer_addr().unwrap();
                println!("Connection from {}", ip);
                ::std::io::stdout().flush().unwrap(); // TODO is this actually necessary?

                // hand over the sender
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

pub fn handle_event(server: &mut Server, event: Event, event_json: Json) {
    // save the event
    {
        let mut autosave = OpenOptions::new().write(true).append(true).open("./autosave").unwrap();
        autosave.write_all(format!("{}", event_json).as_bytes()).unwrap();
        autosave.write_all("\n".as_bytes()).unwrap();
        autosave.flush().unwrap();
    }

    // copy the old flow so we can compare to the new flow for changes
    let old_flow = server.flow.clone();

    // run the flow until it reaches fixpoint
    server.flow.quiesce(event.changes);

    // handle commands
    for command in event.commands.iter() {
        let borrowed_words = command.iter().map(|word| &word[..]).collect::<Vec<_>>();
        match &borrowed_words[..] {
            ["load", filename] => {
                server.flow = Flow::new();
                load(&mut server.flow, "./bootstrap");
                load(&mut server.flow, filename);
                save(&server.flow, "./autosave");
                let current_dir = ::std::env::current_dir().unwrap().to_str().unwrap().to_owned();
                send_event(server, &vec![], &vec![
                    vec!["loaded".to_owned(), current_dir, filename.to_owned()]
                    ]);
            }
            ["save", filename] => {
                save(&server.flow, filename);
                let current_dir = ::std::env::current_dir().unwrap().to_str().unwrap().to_owned();
                send_event(server, &vec![], &vec![
                    vec!["saved".to_owned(), current_dir, filename.to_owned()]
                    ]);
            }
            ["get events", id] => {
                let events_string = read_file("./autosave");
                send_event(server, &vec![], &vec![
                    vec!["got events".to_owned(), id.to_owned(), events_string]
                    ]);
            }
            ["set events", events_string] => {
                write_file("./autosave", events_string);
                server.flow = Flow::new();
                load(&mut server.flow, "./bootstrap");
                load(&mut server.flow, "./autosave");
            }
            other => panic!("Unknown command: {:?}", other),
        }
    }

    let changes = &server.flow.changes_from(old_flow);
    send_event(server, changes, &vec![]);
}

pub fn run() {
    let mut flow = Flow::new();
    time!("reading saved state", {
        load(&mut flow, "./bootstrap");
        load(&mut flow, "./autosave");
    });

    let senders: Vec<sender::Sender<WebSocketStream>> = Vec::new();

    let mut server = Server{flow: flow, senders: senders};

    for server_event in server_events() {
        match server_event {

            // a new client has connected and needs to sync its state
            ServerEvent::Sync((mut sender, user_id)) => {
                let mut changes = vec![];

                // add a session to the session table
                let session_id = format!("{}", sender.get_mut().peer_addr().unwrap());
                changes.push(("sessions".to_owned(),
                    Change{
                        fields: vec!["sessions: id".to_owned(), "sessions: status".to_owned()],
                        insert: vec![vec![Value::String(session_id.clone()), Value::Float(1f64)]],
                        remove: vec![],
                    }));

                // if we have a user ID, add a mapping from the session ID to the user ID
                if let Some(user_id) = user_id {
                    changes.push(("session id to user id".to_owned(),
                        Change{
                            fields: vec!["session id to user id: session id".to_owned(), "session id to user id: user id".to_owned()],
                            insert: vec![vec![Value::String(session_id.clone()), Value::String(user_id)]],
                            remove: vec![]
                        }));
                }

                // handle the session change
                let event = Event{changes: changes, session: session_id.clone(), commands: vec![]};
                let json = event.to_json();
                handle_event(&mut server, event, json);

                // sync the new client
                let changes = server.flow.as_changes();
                let event = Event{changes: changes, session: session_id, commands: vec![]};
                let text = format!("{}", event.to_json());
                match sender.send_message(Message::Text(text)) {
                    Ok(_) => (),
                    Err(error) => println!("Send error: {}", error),
                };
                server.senders.push(sender)
            }

            // an existing client has sent a new message
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

                // find the index of the connection's sender
                let ip_ix = server.senders.iter_mut().position(|mut sender| {
                    let ip = format!("{}",sender.get_mut().peer_addr().unwrap());
                    ip == terminate_ip
                });

                match ip_ix {
                    Some(ix) => {
                        // close the connection
                        let _ = server.senders[ix].send_message(Message::Close(None));
                        match server.senders[ix].get_mut().shutdown(Shutdown::Both) {
                            Ok(_) => println!("Connection from {} has closed successfully.",terminate_ip),
                            Err(e) => println!("Connection from {} failed to shut down properly: {}",terminate_ip,e),
                        }
                        server.senders.remove(ix);

                        // update the session table
                        let sessions = server.flow.get_output("sessions").clone();
                        let ip_string = Value::String(terminate_ip.clone());

                        // change the session status to 0
                        for row in sessions.find(vec![&ip_string, &Value::Null]) {
                            match row {
                                [_, ref status] => {
                                    let change = Change {
                                        fields: sessions.fields.clone(),
                                        insert: vec![vec![ip_string.clone(), Value::Float(0f64)]],
                                        remove: vec![vec![ip_string.clone(), status.clone()]],
                                    };
                                    let event = Event{changes: vec![("sessions".to_string(),change)], session: "".to_string(), commands: vec![]};
                                    let json = event.to_json();
                                    handle_event(&mut server, event, json);
                                }
                                _ => unreachable!(),
                            }
                        }

                    },
                    None => panic!("IP address {} is not connected",terminate_ip),
                }
            }
        }
    }
}