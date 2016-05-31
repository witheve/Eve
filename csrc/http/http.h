typedef struct http_server *http_server;
http_server create_http_server(heap h, table s);
void start_multipart_http_response(synchronous_buffer write);
void send_multipart_http_response(synchronous_buffer write,
                                  buffer b);
void send_http_response(heap h,
                        synchronous_buffer write,
                        string type, 
                        buffer b);
void register_http_service(http_server s,
                           string url,
                           thunk apply);

void register_http_file(http_server s,
                        string url,
                        string pathname,
                        string mimetype);

void outline(synchronous_buffer write, string s);

string base64_encode(heap h, buffer x);

void register_websocket_service(heap h,
                                http_server s, 
                                string url,
                                thunk connect);
