use std::thread;
use std::sync::mpsc;
use websocket::{Server, Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::io::prelude::*;
use std::fs::OpenOptions;
use std::num::ToPrimitive;
use rustc_serialize::json::{Json, ToJson};

use value::{Value, Tuple};
use index;
use flow::{Changes, Flow};
use compiler::compile;

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
            Json::I64(int) => Value::Float(int.to_f64().unwrap()),
            Json::U64(uint) => Value::Float(uint.to_f64().unwrap()),
            Json::Array(ref array) => Value::Tuple(array.iter().map(|j| Value::from_json(j, next_eid)).collect()),
            Json::Object(ref object) => {
                assert!(object.len() == 1);
                match object.get("eid") {
                    Some(value) => {
                        assert_eq!(value.as_string().unwrap(), "auto");
                        let eid = next_eid.to_f64().unwrap();
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
            ("changes".to_string(), Json::Object(
                self.changes.iter().map(|&(ref view_id, ref view_changes)| {
                    (view_id.to_string(), Json::Object(vec![
                        ("inserted".to_string(), view_changes.inserted.to_json()),
                        ("removed".to_string(), view_changes.removed.to_json()),
                        ].into_iter().collect()))
                }).collect()))].into_iter().collect())
    }
}

impl FromJson for Event {
    fn from_json(json: &Json, next_eid: &mut u64) -> Self {
        Event{
            changes: json.as_object().unwrap()["changes"]
            .as_object().unwrap().iter().map(|(view_id, view_changes)| {
                (view_id.to_string(), index::Changes{
                    inserted: FromJson::from_json(&view_changes.as_object().unwrap()["inserted"], next_eid),
                    removed: FromJson::from_json(&view_changes.as_object().unwrap()["removed"], next_eid),
                })
            }).collect()
        }
    }
}

struct Instance {
    flow: Flow,
    next_eid: u64,
}

impl Instance {
    pub fn run(&mut self) -> Changes {
        let mut flow = compile(self.flow.clone());
        flow.run();
        let changes = flow.changes_since(&self.flow);
        self.flow = flow;
        changes
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
    let mut instance = Instance{
        flow: empty_flow.clone(),
        next_eid: 0,
    };

    time!("reading saved state", {
        let mut events = OpenOptions::new().create(true).open("./events").unwrap();
        let mut old_events = String::new();
        events.read_to_string(&mut old_events).unwrap();
        for line in old_events.lines() {
            let event: Event = {
                let Instance {ref mut next_eid, ..} = instance;
                let json = Json::from_str(&line).unwrap();
                FromJson::from_json(&json, next_eid)
            };
            instance.flow.change(event.changes);
        }
        drop(events);
        instance.run();
        });

    let mut events = OpenOptions::new().write(true).append(true).open("./events").unwrap();
    let mut senders: Vec<sender::Sender<_>> = Vec::new();
    let mut server_events: Vec<ServerEvent> = Vec::with_capacity(MAX_BATCH_SIZE);
    let event_receiver = serve();
    loop {
        time!("entire batch", {
            recv_batch(&event_receiver, &mut server_events);
            println!("batch size: {:?}", server_events.len());

            for event in server_events.drain() {
                match event {
                    ServerEvent::NewClient(mut sender) => {
                        time!("sending initial state", {
                            let changes = instance.flow.changes_since(&empty_flow);
                            let text = format!("{}", Event{changes: changes}.to_json());
                            match sender.send_message(Message::Text(text)) {
                                Ok(_) => (),
                                Err(error) => println!("Send error: {}", error),
                            };
                            senders.push(sender)
                        })
                    }
                    ServerEvent::Message(input_text) => {
                        time!("sending update", {
                            let input_event: Event = {
                                let Instance {ref mut next_eid, ..} = instance;
                                let json = Json::from_str(&input_text).unwrap();
                                FromJson::from_json(&json, next_eid)
                            };
                            events.write_all(input_text.as_bytes()).unwrap();
                            events.write_all("\n".as_bytes()).unwrap();
                            instance.flow.change(input_event.changes);
                        })
                    }
                }
            }

            let output_event = Event{changes: instance.run()};
            let output_text = format!("{}", output_event.to_json());
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
