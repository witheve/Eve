//---------------------------------------------------------------------
// Node Server Database
//---------------------------------------------------------------------

import {InsertAction} from "../../actions"
import {Changes} from "../../changes";
import {Evaluation, Database} from "../../runtime";

import * as url from "url";
import * as mqtt from "mqtt";

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
    console.log('mqttdatabase setting up');
    let broker = process.env.EVE_MQTT_BROKER || 'mqtt://localhost:1883';
    let parsed = url.parse(broker);
    let auth = (parsed.auth || ':').split(':');
    let options = {
      port: parsed.port,
      clientId: 'eve' + Math.random().toString(16).substr(2, 8),
      username: auth[0],
      password: auth[1]
    };
    let u = "mqtt://"+parsed.host;
    let client = mqtt.connect(u, options);
    let onMessage = this.handleMqttMessage.bind(this);
    this.client = client;
    client.on('error', function(err) {
      console.error('MQTT error', err);
    }); 
    client.on('connect', function() {
      console.log('MQTT connected');
      // TODO: be smarter, only subscribe to things there are bindings against
      client.subscribe("#", function(s) {
        client.on('message', onMessage);
        console.log('MQTT subscribed', s);
      });
    });
  }

  handleMqttMessage(topic, message, packet) {
    console.log('MQTT got message', topic, message);

    if(!this.receiving) {
      return console.log("Nothing is listening to MQTT messages");
    }

    let payload = message.toString();
    let parsed = payload;
    if (payload == 'true') {
      parsed = true;
    } else if (payload == 'false') {
      parsed = false;
    } else if (payload[0] == '{') {
      try {
        parsed = JSON.parse(payload);
      } catch (err) {
        console.error("JSON parsing of MQTT message failed", err);
      }
    } else {

    }

    let scopes = ["mqtt"];
    let requestId = `request|${this.requestId++}|${(new Date()).getTime()}`
    let actions = [
      new InsertAction("mqtt|tag", requestId, "tag", "message", undefined, scopes),
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

  sendMessage(requestId, msg) {
    console.log('MQTT senc message');
//    let response = this.requestToResponse[requestId];
//    response.statusCode = status;
//    response.end(body);
  }

  onFixpoint(evaluation: Evaluation, changes: Changes) {
    console.log('MQTT fixpoint');
    let name = evaluation.databaseToName(this);
    let result = changes.result({[name]: true});
    let handled = {};
    let index = this.index;
    let actions = [];
    for(let insert of result.insert) {
      let [e,a,v] = insert;
      if(!handled[e]) {
        handled[e] = true;
        if(index.lookup(e,"tag", "message") && !index.lookup(e, "tag", "sent")) {
          console.log('MQTT insert msg', e, a, v);


//          let responses = index.asValues(e, "response");
//          if(responses === undefined) continue;
//          let [response] = responses;
//          let {topic, payload} = index.asObject(response);
//          actions.push(new InsertAction("server|sender", e, "tag", "sent", undefined, [name]));
          let msg = "HARDCODED";
          this.sendMessage(e, msg);
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


