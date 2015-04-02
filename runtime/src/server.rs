use std::thread;
use std::sync::mpsc;
use websocket::{Server, Message, Sender, Receiver};
use websocket::server::sender;
use websocket::stream::WebSocketStream;
use std::collections::{HashMap, BitSet};
use std::io::prelude::*;

use flow::{Changes, FlowState, Flow};
use compiler::{compile, World};
use rustc_serialize::json;

struct Instance {
    input: World,
    flow: Flow,
    output: FlowState,
}

impl Instance {
    pub fn change(&mut self, changes: Changes) -> Changes {
        self.input.change(changes);
        let mut input_clone = self.input.clone();
        let (flow, mut output) = compile(&mut input_clone);
        flow.run(&mut output);
        let changes = flow.changes_since(&output, &self.flow, &self.output);
        self.flow = flow;
        self.output = output;
        changes
    }
}

// TODO holy crap why is everything blocking? this is a mess
pub fn serve() -> (mpsc::Receiver<Changes>, mpsc::Receiver<sender::Sender<WebSocketStream>>) {
    let (input_sender, input_receiver) = mpsc::channel();
    let (sender_sender, sender_receiver) = mpsc::channel();
    thread::spawn(move || {
        let server = Server::bind("127.0.0.1:2794").unwrap();
        for connection in server {
            let input_sender = input_sender.clone();
            let sender_sender = sender_sender.clone();
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
                sender_sender.send(sender).unwrap();

                // handle messages
                for message in receiver.incoming_messages() {
                    let message = message.unwrap();
                    match message {
                        Message::Text(text) => {
                            let changes = json::decode(&text).unwrap();
                            input_sender.send(changes).unwrap();
                        }
                        _ => panic!("Unknown message: {:?}", message)
                    }
                }
            });
        }
    });
    (input_receiver, sender_receiver)
}

pub fn run() {
    let empty_world = World{views: HashMap::new()};
    let empty_flow = Flow{nodes: Vec::new()};
    let empty_output = FlowState{outputs: Vec::new(), dirty: BitSet::new()};
    let mut instance = Instance{
        input: empty_world,
        flow: empty_flow.clone(),
        output: empty_output.clone(),
    };
    let mut senders: Vec<sender::Sender<_>> = Vec::new();
    let (input_receiver, sender_receiver) = serve();
    loop {
        select!(
            input = input_receiver.recv() => {
                let input = input.unwrap();
                let changes = instance.change(input);
                let text = json::encode(&changes).unwrap();
                for sender in senders.iter_mut() {
                    sender.send_message(Message::Text(text.clone())).unwrap();
                }
            },
            sender = sender_receiver.recv() => {
                let mut sender = sender.unwrap();
                let changes = instance.flow.changes_since(&instance.output, &empty_flow, &empty_output);
                let text = json::encode(&changes).unwrap();
                sender.send_message(Message::Text(text)).unwrap();
                senders.push(sender)
            }
            )
    }
}