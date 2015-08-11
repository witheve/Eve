use websocket::{client,Client,stream,Message,Sender,Receiver};
use hyper::Url;
use std::thread;
use rustc_serialize::json::*;
use cbor::ToCbor;
use cbor;

use value::Value;
use server::Event;
use relation::Change;

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

pub fn send_event(event: &Event,sender: &mut client::sender::Sender<stream::WebSocketStream>) {

	let mut e = cbor::Encoder::from_memory();
	let json = event.to_json();
	let cbor = json.to_cbor();
	e.encode(vec![cbor]).unwrap();
	sender.send_message(Message::Binary(e.into_bytes())).unwrap();
}

// TODO make sure table exists before trying to insert a fact into it
pub fn insert_fact(table_name: &&str, table_fields: &Vec<&str>, row_data: &Vec<Value>, old_event: Option<Event>) -> Event {

	assert_eq!(table_fields.len(),row_data.len());

	// Creates a vector of names of the form: "table_name: field_name"
	let concat_field_names = table_fields.iter()
										 .map(|field_name| table_name.to_string() + ": " + field_name)
										 .collect();

	let change = Change{
						fields: concat_field_names,
						insert: vec![row_data.clone()],
						remove: vec![],
					   };

	match old_event {
		Some(mut event) => {
			event.changes.push((table_name.to_string(),change));
			event
		},
		// TODO add session
		None => Event{changes: vec![(table_name.to_string(),change)], session: "".to_string(), commands: vec![]},
	}

}