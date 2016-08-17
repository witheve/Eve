typedef struct http_server *http_server;
http_server create_http_server(station p, buffer eve);

void http_send_request(buffer_handler w, bag b, uuid n);

void send_http_response(heap h,
                        buffer_handler write,
                        string type,
                        buffer b);

void register_http_service(http_server s,
                           string url,
                           thunk apply);

void register_http_file(http_server s,
                        string url,
                        string pathname,
                        string mimetype);


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

buffer_handler websocket_send_upgrade(heap h,
                                      bag b,
                                      uuid n,
                                      buffer_handler down,
                                      buffer_handler up,
                                      register_read reg);

// should be asynch...but you know
typedef closure(http_service, buffer_handler, bag, uuid, register_read);
void http_register_service(http_server, http_service, string);
// this has no backpressure
typedef closure(json_handler, bag, uuid);
reader parse_json(heap h, json_handler j);
void print_value_json(buffer out, value v);

reader response_header_parser(heap, http_handler);
reader request_header_parser(heap, http_handler);

typedef struct client *client;
client open_http_client(heap h, bag s, uuid request, http_handler response);

void http_send_header(buffer_handler w, bag b, uuid n, value first, value second, value third);

buffer_handler websocket_client(heap h, bag request, uuid rid, reader up);

buffer json_encode(heap, bag b, uuid n);
