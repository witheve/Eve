use std::collections::BTreeMap;
use std::thread;
use std::sync::mpsc;
use websocket;
use websocket::{Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::io::prelude::*;
use std::fs::{OpenOptions};
use rustc_serialize::json::{Json, ToJson};
use cbor;
use std::env;

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
            Value::Row{ref view_id, ref field_ids, ref values} => {
                let keys = field_ids.iter().map(|field_id| field_id.to_owned());
                let vals = values.iter().map(ToJson::to_json);
                let mut object = keys.zip(vals).collect::<BTreeMap<_, _>>();
                object.insert("view id".to_owned(), view_id.to_json());
                Json::Object(object)
            }
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
            Json::Object(ref object) => {
                let view_id = object["view id"].as_string().unwrap().to_owned();
                let (keys, vals): (Vec<_>, Vec<_>) = object.iter().filter(|&(field_id, _)| field_id != "view id").unzip();
                let field_ids = keys.into_iter().map(|key| key.to_owned()).collect();
                let values = vals.into_iter().map(|val| FromJson::from_json(val)).collect();
                Value::Row{view_id: view_id, field_ids: field_ids, values: values}
            }
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
    let text = format!("{}", Event{changes: changes, commands: vec![]}.to_json());
    write_file(filename, &text[..]);
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

pub fn handle_event(server: &mut Server, event: Event, event_json: Json, saves_dir: &str) {
    let autosave_path = saves_dir.to_owned() + "autosave";

    // save the event
    {
        let mut autosave = OpenOptions::new().write(true).append(true).open(&*autosave_path).unwrap();
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
                load(&mut server.flow, "./bootstrap");
                load(&mut server.flow, filename);
                save(&server.flow, &*autosave_path);

                // Is there an easier way to get absolute path from a relative path?
                let current_dir = env::current_dir().unwrap();
                env::set_current_dir(saves_dir).unwrap();
                let absolute_saves_dir = env::current_dir();
                env::set_current_dir(current_dir).unwrap();
                response_commands.push(vec!["loaded".to_owned(), absolute_saves_dir.unwrap().to_str().unwrap().to_owned(), filename.to_owned()]);
            }
            ["save", filename] => {
                save(&server.flow, filename);
                let current_dir = env::current_dir().unwrap();
                env::set_current_dir(saves_dir).unwrap();
                let absolute_saves_dir = env::current_dir();
                env::set_current_dir(current_dir).unwrap();
                response_commands.push(vec!["saved".to_owned(), absolute_saves_dir.unwrap().to_str().unwrap().to_owned(), filename.to_owned()]);
            }
            ["get events", id] => {
                let events_string = read_file(&*autosave_path);
                response_commands.push(vec!["events got".to_owned(), id.to_owned(), events_string]);
            }
            ["set events", id, events_string] => {
                write_file(&*autosave_path, events_string);
                server.flow = Flow::new();
                load(&mut server.flow, "./bootstrap");
                load(&mut server.flow, &*autosave_path);
                response_commands.push(vec!["events set".to_owned(), id.to_owned()]);
            }
            other => panic!("Unknown command: {:?}", other),
        }
    }

    let changes = &server.flow.changes_from(old_flow);
    send_event(server, changes, &response_commands);
}

pub fn run(saves_dir: &str) {

    let autosave_path = saves_dir.to_owned() + "autosave";

    let mut flow = Flow::new();
    time!("reading saved state", {
        load(&mut flow, "./bootstrap");
        load(&mut flow, &*autosave_path);
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