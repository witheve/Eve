typedef struct json_session {
    heap h;
    table current_session;
    table current_delta;
    table persisted;
    buffer_handler write; // to weboscket
    uuid event_uuid;
    buffer graph;
    table scopes;
    bag root, session;
    boolean tracing;
    evaluation ev;
    heap eh;
} *json_session;

buffer format_error_json(heap h, char* message, bag data, uuid data_id);
