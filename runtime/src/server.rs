use std::thread;
use std::sync::mpsc;
use websocket::{Server, Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::io::prelude::*;
use std::fs::OpenOptions;
use rustc_serialize::json::{Json, ToJson};

use value::{Value, Tuple};
use index;
use flow::{Changes, Flow};

trait FromJson {
    fn from_json(json: &Json, next_eid: &mut u64) -> Self;
}

impl ToJson for Value {
    fn to_json(&self) -> Json {
        match *self {
            Value::Bool(bool) => Json::Boolean(bool),
            Value::String(ref string) => Json::String(string.clone()),
            Value::Float(float) => Json::F64(float),
            Value::Tuple(ref tuple) => tuple.to_json(),
            Value::Relation(ref relation) => Json::Object(vec![
                ("relation".to_string(), relation.iter().map(ToJson::to_json).collect::<Vec<_>>().to_json())
                ].into_iter().collect()),
        }
    }
}

impl FromJson for Value {
    fn from_json(json: &Json, next_eid: &mut u64) -> Self {
        match *json {
            Json::Boolean(bool) => Value::Bool(bool),
            Json::String(ref string) => Value::String(string.clone()),
            Json::F64(float) => Value::Float(float),
            Json::I64(int) => Value::Float(int as f64),
            Json::U64(uint) => Value::Float(uint as f64),
            Json::Array(ref array) => Value::Tuple(array.iter().map(|j| Value::from_json(j, next_eid)).collect()),
            Json::Object(ref object) => {
                assert!(object.len() == 1);
                match object.get("eid") {
                    Some(value) => {
                        assert_eq!(value.as_string().unwrap(), "auto");
                        let eid = next_eid.clone() as f64;
                        *next_eid += 1;
                        Value::Float(eid)
                    }
                    None => {
                        let relation: Vec<Tuple> = FromJson::from_json(&object["relation"], next_eid);
                        Value::Relation(relation.into_iter().collect())
                    }
                }
            },
            _ => panic!("Cannot decode {:?} as Value", json),
        }
    }
}

impl<T: FromJson> FromJson for Vec<T> {
    fn from_json(json: &Json, next_eid: &mut u64) -> Self {
        json.as_array().unwrap().iter().map(|t| FromJson::from_json(t, next_eid)).collect()
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
                        view_changes.inserted.to_json(),
                        view_changes.removed.to_json(),
                        ])
                }).collect())
            )].into_iter().collect())
    }
}

impl FromJson for Event {
    fn from_json(json: &Json, next_eid: &mut u64) -> Self {
        Event{
            changes: json.as_object().unwrap()["changes"]
            .as_array().unwrap().iter().map(|change| {
                let change = change.as_array().unwrap();
                assert_eq!(change.len(), 3);
                let view_id = change[0].as_string().unwrap().to_string();
                let inserted = FromJson::from_json(&change[1], next_eid);
                let removed = FromJson::from_json(&change[2], next_eid);
                (view_id, index::Changes{inserted: inserted, removed: removed})
            }).collect()
        }
    }
}

pub enum ServerEvent {
    Message(String),
    NewClient(sender::Sender<WebSocketStream>),
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
                event_sender.send(ServerEvent::NewClient(sender)).unwrap();

                // handle messages
                for message in receiver.incoming_messages() {
                    let message = message.unwrap();
                    match message {
                        Message::Text(text) => {
                            event_sender.send(ServerEvent::Message(text)).unwrap();
                        }
                        _ => println!("Unknown message: {:?}", message)
                    }
                }
            });
        }
    });
    event_receiver
}

// TODO arbitrary limit - needs tuning
static MAX_BATCH_SIZE: usize = 100;

// TODO can batching cause missed outputs?
fn recv_batch(event_receiver: &mpsc::Receiver<ServerEvent>, server_events: &mut Vec<ServerEvent>) {
    server_events.push(event_receiver.recv().unwrap()); // block until first event
    for _ in 0..MAX_BATCH_SIZE {
        match event_receiver.try_recv() {
            Ok(event) => server_events.push(event),
            Err(mpsc::TryRecvError::Empty) => break,
            Err(mpsc::TryRecvError::Disconnected) => panic!(),
        }
    }
}

pub fn run() {
    let empty_flow = Flow::new();
    let next_eid = &mut 0;
    let mut flow = Flow::new();

    time!("reading saved state", {
        let mut events = OpenOptions::new().create(true).open("./events").unwrap();
        let mut old_events = String::new();
        events.read_to_string(&mut old_events).unwrap();
        for line in old_events.lines() {
            let json = Json::from_str(&line).unwrap();
            let event: Event = FromJson::from_json(&json, next_eid);
            flow.change(event.changes);
        }
        drop(events);
        flow = flow.compile_and_run();
        flow.take_changes();
        });

    let mut events = OpenOptions::new().write(true).append(true).open("./events").unwrap();
    let mut senders: Vec<sender::Sender<_>> = Vec::new();
    let mut server_events: Vec<ServerEvent> = Vec::with_capacity(MAX_BATCH_SIZE);
    let event_receiver = serve();
    loop {
        recv_batch(&event_receiver, &mut server_events);
        println!("batch size: {:?}", server_events.len());

        time!("entire batch", {
            for event in server_events.drain(..) {
                match event {
                    ServerEvent::NewClient(mut sender) => {
                        time!("sending initial state", {
                            let changes = flow.changes_since(&empty_flow);
                            let text = format!("{}", Event{changes: changes}.to_json());
                            match sender.send_message(Message::Text(text)) {
                                Ok(_) => (),
                                Err(error) => println!("Send error: {}", error),
                            };
                            senders.push(sender)
                        })
                    }
                    ServerEvent::Message(input_text) => {
                        time!("applying update", {
                            println!("{:?}", input_text);
                            let json = Json::from_str(&input_text).unwrap();
                            let input_event: Event = FromJson::from_json(&json, next_eid);
                            events.write_all(input_text.as_bytes()).unwrap();
                            events.write_all("\n".as_bytes()).unwrap();
                            flow.change(input_event.changes);
                        })
                    }
                }
            }

            time!("running batch", {
                flow = flow.compile_and_run();
            });
            time!("sending update", {
                let changes = flow.take_changes();
                let output_event = Event{changes: changes};
                let output_text = format!("{}", output_event.to_json());
                events.flush().unwrap();
                for sender in senders.iter_mut() {
                    match sender.send_message(Message::Text(output_text.clone())) {
                        Ok(_) => (),
                        Err(error) => println!("Send error: {}", error),
                    };
                }
            });
        })
    }
}
