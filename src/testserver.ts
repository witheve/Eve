import {eve} from "../src/app";
import * as dslparser from "../src/parser";

let uuid = require("uuid");
let WebSocketServer = require('ws').Server;
let wss = new WebSocketServer({ port: 8081 });

interface Result {
  id: string,
  type: string,
  fields: Array<string>,
  values: Array<Array<any>>,
  result: any,
}

interface Error {
  id: string,
  type: string,
  cause: string,
}

let clients: Array<WebSocket> = [];

wss.on('connection', function connection(ws: WebSocket) {
    
  ws.onmessage = function(e: MessageEvent) {
    let parse = JSON.parse(e.data);
    let id;
    let query;
    let queryResult;
    if (parse.type !== undefined && parse.type === "query") {
      id = parse.id;
      query = parse.query;
      try {
        queryResult = executeQuery(query);   
        let fields: Array<string> = [];
        let values: Array<Array<any>> = []; 
        // Format results for the protocol
        if (queryResult[0].results !== undefined) {
          let projected = queryResult[0].results;
          if (projected.length > 0) {
            fields = Object.keys(projected[0]);
            fields = fields.filter((k) => k !== "__id");
            values = projected.map((row) => {
              let rowstring = fields.map((key,i) => {
                if (key === "__id") {
                  return undefined;
                }
                let value = row[key];
                let display = eve.findOne("display name",{id: value});
                if (display !== undefined) {
                  value = display.name;
                }
                return value;
              });
              return rowstring.filter((r) => r !== undefined);
            });
          }
        }
        let result: Result = {
          id: id,
          type: "result",
          fields: fields,
          values: values,
          result: queryResult,
        }
        setTimeout(() => {
          ws.send(JSON.stringify(result));
        },250);
      }
      catch (err) {
        let queryError: Error = {
          id: id,
          type: "error",
          cause: err.message,
        }
        setTimeout(() => {
          ws.send(JSON.stringify(queryError));
        },250);
      }
    // Echo back a close
    } else if (parse.type !== undefined && parse.type === "close") {
      setTimeout(() => {
        ws.send(e.data);
      },250);
    // Save client on connection
    } else if (parse.type !== undefined && parse.type === "connect") {
      clients.push(ws);
    } else {
      let queryError: Error = {
        id: "",
        type: "error",
        cause: "Unknown protocol",
      }
      setTimeout(() => {
        ws.send(JSON.stringify(queryError));
      },250);
    }
  }
});

function executeQuery(query: string) {
  let resultsString: Array<string> = [];
  let queryString = query.toString();
  let artifacts = dslparser.parseDSL(queryString);
  let changeset = eve.diff();
  let results = [];
  for (let id in artifacts.views) {
    eve.asView(artifacts.views[id]); 
  }
  for (let id in artifacts.views) {
    results.push(artifacts.views[id].exec()); 
  }
  return results;
}