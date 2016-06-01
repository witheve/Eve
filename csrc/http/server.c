#include <runtime.h>
#include <unix/unix.h>

#include <http/http.h>
// rfc 2616

struct http_server {
    heap h, p;
    table content;
};
    
static char separators[] = {' ',' ','\n',':','\n'};

typedef enum {
    method =0,
    url =1,
    version =2,
    name,
    property
} header_state;
    
typedef struct session {
    heap h;
    synchronous_buffer write;
    synchronous_buffer child;
    string fields[5];
    header_state s;
    table content;
} *session; 

thunk ignore;

void outline(synchronous_buffer write, string s)
{

    if (buffer_length(s))
        apply(write, s, ignore);

    apply(write, sstring("\r\n"), ignore);
}


void send_http_response(heap h,
                        synchronous_buffer write,
                        string type, 
                        buffer b)
{
    outline(write, sstring("HTTP/1.1 200 OK"));
    outline(write, aprintf(h, "Content-Type: %b", type));
    outline(write, sstring("Cache-Control: no-cache"));
    outline(write, aprintf(h, "Content-Length: %d", 
                           buffer_length(b)));
    outline(write, sstring(""));
    apply(write, b, ignore);
}

void send_multipart_http_response(synchronous_buffer write,
                                  buffer b)
{
    outline(write, sstring(""));
    apply(write, b, ignore);
    outline(write, sstring(""));
    outline(write, sstring("--xstringx"));
}

void start_multipart_http_response(synchronous_buffer write)
{
    char *n = "Content-Type: multipart/x-mixed-replace; boundary=xstringx";
    outline(write, sstring("HTTP/1.1 200 OK"));
    string t = sstring(n);
    outline(write, t);
    outline(write, sstring(""));
    outline(write, sstring("--xstringx"));
}

static void line(http_server s, synchronous_buffer write, string l);


static inline void clear_buffer(buffer b)
{
    b->start = b->end = 0;
}

static CONTINUATION_1_2(session_buffer, session, buffer, thunk);
static void session_buffer(session s,
                           buffer b,
                           thunk rereg)
{

    // we don't actually handle unicode framing in the header.
    if (s->child) {
        apply(s->child, b, rereg);
    } else {
        for (int i=0;i<buffer_length(b);i++) {
            character c = *(u8)bref(b, i);
            
            if (c == separators[s->s]) {
                if (++s->s == 5)  {
                    clear_buffer(s->fields[3]);
                    clear_buffer(s->fields[4]);
                    s->s = 3;
                }
            } else {
                if ((s->s == 3) && (c == '\n')) {
                    buffer c;
                    if ((c = table_find(s->content, s->fields[1]))) {
                        send_http_response(s->h, s->write, sstring("application/html"), c);
                    }
                    // send a 404 buddy
                } else {
                    buffer_write_byte(s->fields[s->s], c);
                }
            }
        }
    }
}

CONTINUATION_1_3(new_connection, http_server, synchronous_buffer, synchronous_buffer_handler, station);
void new_connection(http_server s,
                    synchronous_buffer write,
                    synchronous_buffer_handler read,
                    station peer)
{
    heap h = allocate_rolling(pages);
    session hs = allocate(h, sizeof(struct session));
    apply(read, cont(h, session_buffer, hs));
    hs->child = 0;
    hs->write = write;
    hs->content = s->content;
    hs->h = h;
    for (int i = 0; i < 5 ; i++ ){
        hs->fields[i] = allocate_buffer(h, 20); 
    }
    
    hs->s = method;
}

static CONTINUATION_0_0(ignoro);
static void ignoro(){}

// content type
void register_static_content(http_server h, char *url, buffer b)
{
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
