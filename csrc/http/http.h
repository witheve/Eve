typedef struct http_server *http_server;
http_server create_http_server(heap h, station p);
/*void start_multipart_http_response(buffer_handler write);
void send_multipart_http_response(buffer_handler write,
                                  buffer b);
*/
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

// maybe deconstruct the headers across the interface instead of the raw business
typedef closure(http_handler, table headers, station, buffer_handler);

buffer_handler websocket_send_upgrade(heap h,
                                      table headers,
                                      buffer_handler down,
                                      buffer_handler up,
                                      buffer_handler *from_above);

// should be asynch...but you know
typedef  closure(http_service, buffer_handler, table, buffer_handler *);
void http_register_service(http_server, http_service, string);
