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
```javascript
{
  "type": "query" ,
  "query": "(.... )", 
  "id": "id" 
}
```

`query` is a string as specified in language.md

## Close
```javascript
{
  "type": "close",
  "id": "id"
}
```

shut down a query

## Result
```javascript
{
  "type": "result",
  "fields": ["x", "y"] ,
  "values": [[  ], [  ] ... [ ]],
  "id": "id" 
}
```

An asynchronous partial query result. The fields and their ordering
are assigned by the server, and correspond to the names of the free
variables in top level query as specified by the user (?). The values
field is a set of vectors, each of which corresponds to the ordering
specified in fields.

Note that the underlying type information for the fields is currently
lost, as we're using generic JSON types. The fix for this is TDB,
but most likely shouldn't involve adding type information to the
fields result, as there is no guarentee of type uniformity in the result
tuples.
   
## Error
```javascript
{
  "type": "error" ,
  "id": "id" ,
  "cause": "unsufficient EveSaver miles" 
}
```

Server driven query shutdown. The cause text is currently unstructured, but
we'll play with this.
