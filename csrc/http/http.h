typedef struct http_server *http_server;
http_server create_http_server(station p, evaluation ev);

void http_send_request(buffer_handler w, bag b, uuid n);

void http_send_response(http_server hs, bag b, uuid root);

string base64_encode(heap h, buffer x);

void register_websocket_service(heap h,
                                http_server s,
                                string url,
                                thunk connect);

void register_static_content(http_server h, char *url, char *content_type, buffer b, char *);

#define outline(__b, __format, ...)\
    bbprintf(__b, sstring(__format), ## __VA_ARGS__);\
    buffer_append(__b, "\r\n", 2);

// i/o path for connection switching protocols...this needs to
// interact with a connection cache underneath...need a different
// siganture for more standard request/response guys
typedef closure(http_handler, bag, uuid, register_read);

endpoint websocket_send_upgrade(heap h,
                                endpoint down,
                                bag b,
                                uuid n);

// should be asynch...but you know
typedef closure(http_service, buffer_handler, bag, uuid, register_read);
void http_register_service(http_server, http_service, string);
// this has no backpressure
object_handler parse_json(heap h, endpoint e, object_handler j);
void print_value_json(buffer out, value v);
void print_value_vector_json(buffer out, vector vec);
void escape_json(buffer out, string current);

reader response_header_parser(heap, http_handler);
reader request_header_parser(heap, http_handler);

typedef struct client *client;
client open_http_client(heap h, bag s, uuid request, http_handler response);

void http_send_header(buffer_handler w, bag b, uuid n, value first, value second, value third);

endpoint websocket_client(heap h, bag request, uuid rid);

buffer json_encode(heap, bag b, uuid n);
endpoint http_ws_upgrade(http_server s, bag b, uuid root);
