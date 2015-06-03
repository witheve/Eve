use websocket::{client,Client,stream,Message,Sender,Receiver};
use hyper::Url;
use std::thread;
use rustc_serialize::json::*;

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

	sender.send_message(Message::Text(event.to_json().to_string())).unwrap();
}

pub fn create_table(table_name: &&str, table_fields: &Vec<&str>) -> Event {

	let table_string = Value::String(table_name.to_string());

	// Creates a vector of names of the form: "table_name: field_name"
	let concat_field_names = table_fields.iter()
										 .map(|field_name| Value::String(table_name.to_string() + ": " + field_name))
										 .collect::<Vec<_>>();

	// Concats a vector of display names of the form: (display name: id, display name: name)
	let display_name_fields = concat_field_names.iter()
												.zip(table_fields.iter())
												.map(|(concat_name,field_name)| vec![concat_name.clone(),Value::String(field_name.to_string())])
												.collect::<Vec<_>>();

	// Creates the display name insert
	let display_name_inserts = vec![vec![table_string.clone(),table_string.clone()]];
	display_name_inserts.iter().chain(display_name_fields.iter()).collect::<Vec<_>>();


	let display_name = ("display name".to_string(),Change {
												fields: vec!["display name: id".to_string(),"display name: name".to_string()],
												insert: display_name_inserts,
												remove: vec![],
											}
						);

	let view = ("view".to_string(),Change   {
												fields: vec!["view: view".to_string(),"view: kind".to_string()],
												insert: vec![
																vec![table_string.clone(),Value::String("table".to_string())],
															],
												remove: vec![],
											}
				);

	// Create field insert vector of the from: [field: view, field: field, "output"]
	let field_inserts = concat_field_names.iter()
										  .map(|concat_field| vec![table_string.clone(), concat_field.clone(), Value::String("output".to_string())])
										  .collect::<Vec<_>>();

	let field = ("field".to_string(),Change {
												fields: vec!["field: view".to_string(),"field: field".to_string(),"field: kind".to_string()],
												insert: field_inserts,
												remove: vec![],
											}
				);

	Event{changes: vec![display_name,view,field] }
}

// TODO make sure table exists before trying to insert a fact into it
pub fn insert_fact(table_name: &&str, table_fields: &Vec<&str>, row_data: &Vec<Value>) -> Event {

	assert_eq!(table_fields.len(),row_data.len());

	// Creates a vector of names of the form: "table_name: field_name"
	let concat_field_names = table_fields.iter()
										 .map(|field_name| table_name.to_string() + ": " + field_name)
										 .collect();

	Event{changes: vec![(table_name.to_string(),Change{
														fields: concat_field_names,
												    	insert: vec![row_data.clone()],
												      	remove: vec![],
												      }
						)]
		 }
}