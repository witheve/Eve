#include <runtime.h>
#include <unix/unix.h>

#include <http/http.h>
// rfc 2616

struct http_server {
    heap h, p;
    table dispatch;
};

typedef enum {
    header =1,
    name,
    property
} header_state;
    
typedef struct session {
    heap h;
    synchronous_buffer child;
    buffer prop;
    buffer value;
    header_state s;
    string method;
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


static CONTINUATION_1_2(session_buffer, session, buffer, thunk);
static void session_buffer(session s,
                           buffer b,
                           thunk rereg)
{
    character i;

    // we don't actually handle unicode framing in the header.
    if (s->child) {
        apply(s->child, b, rereg);
    } else {
        if (i == '\n') {

        } else {
            switch(s->s) {
            case header:
            case name:
            case property:
                break;
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
    //    register_io_handler();
    //    return(cont(h, session_buffer, hs));
}

static CONTINUATION_0_0(ignoro);
static void ignoro(){}

http_server create_http_server(heap h, table p)
{
    if (!ignore) ignore = cont(init, ignoro);
    //    heap q = allocate_leaky_heap(h);
    http_server s = allocate(h, sizeof(struct http_server));
    s->dispatch = allocate_table(h, 0, 0);
    s->p = h;
    s->h = h;
    tcp_create_server(h,
                      p,
                      cont(h, new_connection, s),
                      ignore);
    return(s);
}
