# Protocol

The current client interface to the server cluster is a JSON based exchange over a websocket, where
each JSON object is a logical message. Each message contains a type field, the currently defined
message types are:

 * query  (client to server)
 * close  (client to server) 
 * result (server to client)
 * error (server to client)

Each message contains an "id" field, assigned by the client, which
defines the context of the messages, which allows multiple query
streams to be multiplexed over a single websocket connection.

Queries are initiated by the client `query` message, which specifies a
new "id" string unique only to this session, which is used as a handle
for this query. The initial results will be returned in a `result`
message, and each update to the database after the point will cause a
new `result` set to be issued.

The query remains open until either closed by the user with a `close`
message, terminated by the server with an `error` message, or on the
shutdown of the transport (websocket) connection.

## Query
  {
    type: "query" 
    query: "(.... )" 
    id: "id" 
   }

query is a string as specified in language.md

## Close
  {
    type: "query" 
    query: "(.... )" 
    id: "id" 
   }

shut down a query

## Result
  {
    type: "result" 
    fields: ["x", "y"] 
    values: [[  ], [  ] ... [ ]] 
    id: "id" 
   }
   
An asynchronous partial query result. The fields and their ordering
are assigned by the server, and correspond to the names of the free
variables in top level query as specified by the user (?).
   
## Error
  {
    type: "error" 
    id: "id" 
    cause: "unsufficient EveSaver miles" 
  }

Server driven query shutdown. The cause text is currently unstructured, but
we'll play with this.