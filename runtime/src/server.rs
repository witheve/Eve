use std::thread;
use std::sync::mpsc;
use websocket;
use websocket::{Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::io::prelude::*;
use std::fs::{OpenOptions};
use std::path::Path;
use rustc_serialize::json::{Json, ToJson};
use cbor;

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
    // commands that affect the whole program state have to go through this side-channel rather than being added to a view
    pub commands: Vec<Vec<String>>,
}

pub enum ServerEvent {
    Change(Vec<u8>),
    Sync(sender::Sender<WebSocketStream>),
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
            ("commands".to_string(), self.commands.to_json()),
            ("session".to_string(), "super unique session id!".to_json()), // TODO restore session handling
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
            commands: FromJson::from_json(json.as_object().unwrap().get("commands").unwrap_or(&Json::Array(vec![]))),
        }
    }
}

// --- persistence ---

pub fn read_file<P: AsRef<Path>>(path: P) -> String {
    let mut file = OpenOptions::new().create(true).open(path).unwrap();
    let mut contents = String::new();
    file.read_to_string(&mut contents).unwrap();
    contents
}

pub fn write_file<P: AsRef<Path>>(path: P, contents: &str) {
    let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(path).unwrap();
    file.write_all(contents.as_bytes()).unwrap();
}

pub fn load<P: AsRef<Path>>(flow: &mut Flow, path: P) {
    for line in read_file(path).lines() {
        let json = Json::from_str(&line).unwrap();
        let event: Event = FromJson::from_json(&json);
        flow.quiesce(event.changes);
    }
}

// TODO should probably just save changes, not the whole event
pub fn save<P: AsRef<Path>>(flow: &Flow, path: P) {
    let changes = flow.as_changes();
    let text = format!("{}", Event{changes: changes, commands: vec![]}.to_json());
    write_file(path, &text[..]);
}

// --- server ---

pub fn send_event(server: &mut Server, changes: &Changes, commands: &Vec<Vec<String>>) {
    for sender_ix in (0..server.senders.len()).rev() {
        let event = Event{changes: changes.clone(), commands: commands.clone()};
        let text = format!("{}", event.to_json());
        match server.senders[sender_ix].send_message(Message::Text(text)) {
            Ok(_) => (),
            Err(error) => {
                println!("Send error on event: {}", error);
                server.senders.swap_remove(sender_ix);
            }
        };
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
                let response = request.accept();
                let (sender, mut receiver) = response.send().unwrap().split();

                // hand over the sender
                event_sender.send(ServerEvent::Sync(sender)).unwrap();

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
                        Message::Close(_) => (), // the sender will get dropped next time we try to send
                        _ => println!("Unknown message: {:?}", message)
                    }
                }
            });
        }
    });
    event_receiver
}

pub fn handle_event(server: &mut Server, event: Event, event_json: Json, saves_dir: &Path) {
    // save the event
    {
        let mut autosave = OpenOptions::new().write(true).append(true).open(saves_dir.join("autosave")).unwrap();
        autosave.write_all(format!("{}", event_json).as_bytes()).unwrap();
        autosave.write_all("\n".as_bytes()).unwrap();
        autosave.flush().unwrap();
    }

    // copy the old flow so we can compare to the new flow for changes
    let old_flow = server.flow.clone();

    // run the flow until it reaches fixpoint
    server.flow.quiesce(event.changes);

    // handle commands
    let mut response_commands = vec![];
    for command in event.commands.iter() {
        let borrowed_words = command.iter().map(|word| &word[..]).collect::<Vec<_>>();
        match &borrowed_words[..] {
            ["load", filename] => {
                server.flow = Flow::new();
                load(&mut server.flow, saves_dir.join(filename));
                save(&server.flow, saves_dir.join("autosave"));
                response_commands.push(vec!["loaded".to_owned(), saves_dir.join(filename).to_str().unwrap().to_owned()]);
            }
            ["save", filename] => {
                save(&server.flow, saves_dir.join(filename));
                response_commands.push(vec!["saved".to_owned(), saves_dir.join(filename).to_str().unwrap().to_owned()]);
            }
            ["get events", id] => {
                let events_string = read_file(saves_dir.join("autosave"));
                response_commands.push(vec!["events got".to_owned(), id.to_owned(), events_string]);
            }
            ["set events", id, events_string] => {
                write_file(saves_dir.join("autosave"), events_string);
                server.flow = Flow::new();
                load(&mut server.flow, saves_dir.join("autosave"));
                response_commands.push(vec!["events set".to_owned(), id.to_owned()]);
            }
            other => panic!("Unknown command: {:?}", other),
        }
    }

    let changes = &server.flow.changes_from(old_flow);
    send_event(server, changes, &response_commands);
}

pub fn run(saves_dir: &Path) {

    let mut flow = Flow::new();
    time!("reading saved state", {
        load(&mut flow, saves_dir.join("autosave"));
    });

    let senders: Vec<sender::Sender<WebSocketStream>> = Vec::new();

    let mut server = Server{flow: flow, senders: senders};

    for server_event in server_events() {
        match server_event {

            // a new client has connected and needs to sync its state
            ServerEvent::Sync(mut sender) => {
                let changes = server.flow.as_changes();
                let event = Event{changes: changes, commands: vec![]};
                let text = format!("{}", event.to_json());
                match sender.send_message(Message::Text(text)) {
                    Ok(_) => server.senders.push(sender),
                    Err(error) => println!("Send error on sync: {}", error),
                };
            }

            // an existing client has sent a new message
            ServerEvent::Change(input_bytes) => {
                // TODO we throw cbor in here to avoid https://github.com/rust-lang/rustc-serialize/issues/113
                let mut decoder = cbor::Decoder::from_bytes(&input_bytes[..]);
                let cbor = decoder.items().next().unwrap().unwrap();
                let json = cbor.to_json();
                let event = FromJson::from_json(&json);
                handle_event(&mut server, event, json, saves_dir);
            }
        }
    }
}