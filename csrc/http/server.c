#include <runtime.h>
#include <unix/unix.h>

#include <http/http.h>
// rfc 2616

struct http_server {
    heap h, p;
    table content;
};
    
static char separators[] = {' ',
                            ' ',
                            '\n',
                            ':',
                            ' ',
                            '\r',
                            '\n'};

typedef enum {
    method =0,
    url =1,
    version =2,
    name,
    skip,
    property,
    skip2,
    total_states
} header_state;
    
typedef struct session {
    heap h;
    buffer_handler write;
    buffer_handler child;
    string fields[total_states];
    header_state s;
    table content;
} *session; 

thunk ignore;


void send_http_response(heap h,
                        buffer_handler write,
                        string type, 
                        buffer b)
{
    buffer o = allocate_buffer(h, 200);
    outline(o, "HTTP/1.1 200 OK");
    outline(o, "Content-Type: %b", type);
    outline(o, "Cache-Control: no-cache");
    outline(o, "Content-Length: %d", buffer_length(b));
    outline(o, "");
    apply(write, o, ignore);
    apply(write, b, ignore);
}

void send_multipart_http_response(heap h,
                                  buffer_handler write,
                                  buffer b)
{
    apply(write, sstring("\r\n"), ignore);
    apply(write, b, ignore);
    
    buffer o = allocate_buffer(h, 200);
    outline(o, "");
    outline(o, "--xstringx");
    apply(write, o, ignore);
}

// take a session
void start_multipart_http_response(heap h, buffer_handler write)
{
    char *n = "Content-Type: multipart/x-mixed-replace; boundary=xstringx";
    buffer b = allocate_buffer(h, 200);
    outline(b, "HTTP/1.1 200 OK");
    outline(b, "Content-Type: multipart/x-mixed-replace; boundary=xstringx");
    outline(b, "");
    outline(b, "--xstringx");
    apply(write, b, ignore);
}

static void reset_session(session s)
{
    for (int i = 0; i<total_states ; i++) {
        buffer_clear(s->fields[i]);
    }
    s->s = method;
}

static CONTINUATION_1_2(session_buffer, session, buffer, thunk);
static void session_buffer(session s,
                           buffer b,
                           thunk rereg)
{
    if (!b) {
        prf("connection closed\n");
        return;
    }

    if ((s->s == method) && s->child) {
        apply(s->child, b, rereg);
    } else {
        string_foreach(c, b) {
            if (c == separators[s->s]) {
                if (++s->s == total_states)  {
                    // xxx - fix plumbing..so sad
                    if (string_equal(s->fields[name], sstring("Sec-WebSocket-Key"))) {
                        s->child = websocket_send_upgrade(s->h, ignore, s->fields[property], s->write);
                    }
                    buffer_clear(s->fields[name]);
                    buffer_clear(s->fields[property]);
                    s->s = 3;
                }
            } else {
                if ((s->s == name) && (c == '\n')) {
                    buffer *c;
                    if (!s->child) { // sadness
                        if ((c = table_find(s->content, s->fields[url]))) {
                            // reset connection state
                            send_http_response(s->h, s->write, c[0], c[1]);
                        } else {
                            apply(s->write, sstring("HTTP/1.1 404 Not found\r\n"), ignore);
                        }
                    }
                    reset_session(s);
                } else {
                    buffer_write_byte(s->fields[s->s], c);
                }
            }
        }
        apply(rereg);
    }
}

CONTINUATION_1_3(new_connection, http_server, buffer_handler, buffer_handler_handler, station);
void new_connection(http_server s,
                    buffer_handler write,
                    buffer_handler_handler read,
                    station peer)
{
    heap h = allocate_rolling(pages);
    session hs = allocate(h, sizeof(struct session));
    apply(read, cont(h, session_buffer, hs));
    hs->child = 0;
    hs->write = write;
    hs->content = s->content;
    hs->h = h;
    for (int i = 0; i < total_states ; i++ ){
        hs->fields[i] = allocate_buffer(h, 20); 
    }
    reset_session(hs);
}

static CONTINUATION_0_0(ignoro);
static void ignoro(){}

    
void register_static_content(http_server h, char *url, char *content_type, buffer b)
{
    buffer *x = allocate(h->h, 2*sizeof(buffer));
    x[0] = string_from_cstring(h->h,content_type);
    x[1] = b;
    table_set(h->content, string_from_cstring(h->h, url), x);
}

http_server create_http_server(heap h, station p)
{
    if (!ignore) ignore = cont(init, ignoro);
    //    heap q = allocate_leaky_heap(h);
    http_server s = allocate(h, sizeof(struct http_server));
    s->content = allocate_table(h, string_hash, string_equal);
    s->p = h;
    s->h = h;
    tcp_create_server(h,
                      p,
                      cont(h, new_connection, s),
                      ignore);
    return(s);
}
