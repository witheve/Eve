//---------------------------------------------------------------------
// Node Server Database
//---------------------------------------------------------------------

import {InsertAction} from "../../actions"
import {Changes} from "../../changes";
import {Evaluation, Database} from "../../runtime";

import * as url from "url";
import * as mqtt from "mqtt";


function serializeMessage(payload : any) : string {
    let serialized = payload.toString();
    if (typeof payload == 'boolean') {
      serialized = payload ? 'true' : 'false';
    } else if (typeof payload == 'object') {
      serialized = (payload) ? JSON.stringify(payload) : 'null';
    } else {
      // treat as string
    }
    return serialized;
}

function deserializeMessage(payload : string) : any {
  let parsed : any = payload;
  if (payload == 'true') {
    parsed = true;
  } else if (payload == 'false') {
    parsed = false;
  } else if (payload[0] == '{' || payload[0] == '[') {
    try {
      parsed = JSON.parse(payload);
    } catch (_) {
    }
  } else {
    try {
      parsed = parseFloat(payload);
    } catch (_) {
    }
  }
  return parsed;
}

export class MqttDatabase extends Database {

  receiving: boolean;
  requestId: number;
  client: mqtt.Client;

  constructor() {
    super();
    this.requestId = 0;
    this.receiving = false;
    this.client = null;
  }

  setup() {
    let broker = process.env.EVE_MQTT_BROKER || 'mqtt://localhost:1883';
    let parsed = url.parse(broker);
    let auth = (parsed.auth || ':').split(':');
    let options = {
      port: parsed.port || 1883,
      clientId: 'eve' + Math.random().toString(16).substr(2, 8),
      username: auth[0],
      password: auth[1]
    };
    let cleanedUrl = "mqtt://"+parsed.host;
    let client = mqtt.connect(cleanedUrl, options);
    let onMessage = this.handleMqttMessage.bind(this);
    this.client = client;
    client.on('error', function(err) {
      console.error('MQTT error', err);
    }); 
    client.on('connect', function() {
      // TODO: be smarter, only subscribe to things there are bindings against
      client.subscribe("#", function(s) {
        client.on('message', onMessage);
        console.log('MQTT subscribed to', cleanedUrl);
      });
    });
  }

  handleMqttMessage(topic, message, packet) {
    console.log('MQTT got message', topic, message.length);

    if(!this.receiving) {
      return console.log("Nothing is listening to MQTT messages");
    }

    // NOTE: assumes UTF-8, no support for binary/Buffer data
    let parsed = deserializeMessage(message.toString());

    let scopes = ["mqtt"];
    let requestId = `request|${this.requestId++}|${(new Date()).getTime()}`
    let actions = [
      new InsertAction("mqtt|tag", requestId, "tag", "message", undefined, scopes),
      new InsertAction("mqtt|tag", requestId, "tag", "incoming", undefined, scopes),
      new InsertAction("mqtt|topic", requestId, "topic", topic, undefined, scopes),
    ];

// TODO: implement entry setting like server.ts does?
//    if(parsed && typeof parsed === "object") {
//      let bodyId = `${requestId}|body`;
//      for(let key of Object.keys(body)) {
//        actions.push(new InsertAction("mqtt|message-entry", bodyId, key, body[key], undefined, scopes));
//      }
//      body = bodyId;
//    }
    actions.push(new InsertAction("mqtt|message-payload", requestId, "payload", parsed, undefined, scopes))

    let evaluation = this.evaluations[0];
    evaluation.executeActions(actions);
  }

  analyze(evaluation: Evaluation, db: Database) {
    for(let block of db.blocks) {
      for(let scan of block.parse.scanLike) {
        if(scan.type === "record" && scan.scopes.indexOf("mqtt") > -1) {
          for(let attribute of scan.attributes) {
            if(attribute.attribute === "tag" && attribute.value.value === "message") {
              console.log('MQTT found listener');
              this.receiving = true;
            }
          }
        }
      }
    }
  }

  sendMessage(requestId, topic, payload) {
    console.log('MQTT sendMessage', topic);
    const serialized = serializeMessage(payload);
    this.client.publish(topic, serialized);
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true});
    let handled = {};
    let index = this.index;
    let actions = [];
    for(let insert of result.insert) {
      let [e,a,v] = insert;
      if(!handled[e]) {
        handled[e] = true;
        let isOutgoingMessage = index.lookup(e,"tag", "message") && index.lookup(e,"tag", "outgoing");
        let isSent = index.lookup(e, "tag", "sent");
        if(isOutgoingMessage && !isSent) {
          // TODO: error/warn if multiple payloads (not supported)
          let payloads = index.asValues(e, "payload");
          if (payloads === undefined) {
            console.error("no payloads for outgoing message")
            continue;
          }
          let [payload] = payloads;

          // TODO: support multiple topics, or error/warn
          let topics = index.asValues(e, "topic");
          let [topic] = topics;

          actions.push(new InsertAction("mqtt|message-sent", e, "tag", "sent", undefined, [name]));

          this.sendMessage(e, topic, payload);
        }
      }
    }
    if(actions.length) {
      process.nextTick(() => {
        evaluation.executeActions(actions);
      })
    }
  }
}


