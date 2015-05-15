use std::thread;
use std::sync::mpsc;
use websocket::{Server, Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::io::prelude::*;
use std::fs::OpenOptions;
use rustc_serialize::json::{Json, ToJson};

use value::Value;
use relation::Change;
use flow::{Changes, Flow};

trait FromJson {
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

pub struct Event {
    changes: Changes,
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
            )].into_iter().collect())
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
            }).collect()
        }
    }
}

pub enum ServerEvent {
    Change(String),
    Sync(sender::Sender<WebSocketStream>),
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
                let response = request.accept();
                let (mut sender, mut receiver) = response.send().unwrap().split();

                let ip = sender.get_mut().peer_addr().unwrap();
                println!("Connection from {}", ip);
                ::std::io::stdout().flush().unwrap(); // TODO is this actually necessary?

                // hand over sender
                event_sender.send(ServerEvent::Sync(sender)).unwrap();

                // handle messages
                for message in receiver.incoming_messages() {
                    let message = message.unwrap();
                    match message {
                        Message::Text(text) => {
                            event_sender.send(ServerEvent::Change(text)).unwrap();
                        }
                        _ => println!("Unknown message: {:?}", message)
                    }
                }
            });
        }
    });
    event_receiver
}

pub fn run() {
    let mut flow = Flow::new();

    time!("reading saved state", {
        let mut events = OpenOptions::new().create(true).open("./events").unwrap();
        let mut old_events = String::new();
        events.read_to_string(&mut old_events).unwrap();
        for line in old_events.lines() {
            let json = Json::from_str(&line).unwrap();
            let event: Event = FromJson::from_json(&json);
            flow = flow.quiesce(event.changes);
        }
    });

    let mut events = OpenOptions::new().write(true).append(true).open("./events").unwrap();
    let mut senders: Vec<sender::Sender<_>> = Vec::new();
    for server_event in serve() {
        match server_event {

            ServerEvent::Sync(mut sender) => {
                time!("syncing", {
                    let changes = flow.as_changes();
                    let text = format!("{}", Event{changes: changes}.to_json());
                    match sender.send_message(Message::Text(text)) {
                        Ok(_) => (),
                        Err(error) => println!("Send error: {}", error),
                    };
                    senders.push(sender)
                })
            }

            ServerEvent::Change(input_text) => {
                time!("changing", {
                    println!("{:?}", input_text);
                    let json = Json::from_str(&input_text).unwrap();
                    let event: Event = FromJson::from_json(&json);
                    events.write_all(input_text.as_bytes()).unwrap();
                    events.write_all("\n".as_bytes()).unwrap();
                    let old_flow = flow.clone();
                    flow = flow.quiesce(event.changes);
                    let changes = flow.changes_from(old_flow);
                    let output_text = format!("{}", Event{changes: changes}.to_json());
                    events.flush().unwrap();
                    for sender in senders.iter_mut() {
                        match sender.send_message(Message::Text(output_text.clone())) {
                            Ok(_) => (),
                            Err(error) => println!("Send error: {}", error),
                        };
                    }
                })
            }

        }
    }
}
