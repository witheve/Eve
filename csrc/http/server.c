#include <runtime.h>

#include <http/http.h>
// rfc 2616

struct http_server {
    heap h;
    table content;
    table services;
};

typedef struct session {
    heap h;
    http_server parent;
    buffer_handler write;
} *session;

thunk ignore;


void send_http_response(heap h,
                        buffer_handler write,
                        string type,
                        buffer b)
{
    buffer o = allocate_buffer(h, 200);
    outline(o, "HTTP/1.1 200 OK");
    outline(o, "Content-Type: %b; charset=utf-8", type);
    outline(o, "Cache-Control: no-cache");
    outline(o, "Content-Length: %d", buffer_length(b));
    outline(o, "");
    apply(write, o, ignore);
    apply(write, b, ignore);
}


static CONTINUATION_1_3(dispatch_request, session, bag, uuid, register_read);
static void dispatch_request(session s, bag b, uuid i, register_read reg)
{
    buffer *c;

    if (b  == 0){
        prf ("http server shutdown\n");
        destroy(s->h);
        return;
    }

    estring url = lookupv(b, i, sym(url));
    if ((c = table_find(s->parent->services, url))) {
        apply((http_service)c, s->write, b, i, reg);
        return;
    } else {
        if ((c = table_find(s->parent->content, url))) {
            buffer k;
            if (c[2] && !(k = read_file(s->h, (char *)c[2])))
                // we're going to leak this buffer descriptor, but tcp write
                // expects that it
                k = wrap_buffer(s->h, bref(c[1], 0), buffer_length(c[1]));
            // reset connection state
            send_http_response(s->h, s->write, c[0], k);
        } else {
            prf("url not found %v\n", url);
            apply(s->write, sstring("HTTP/1.1 404 Not found\r\n"), ignore);
        }
    }

    // xxx - yeah, um there may have been a body here
    apply(reg, request_header_parser(s->h, cont(s->h, dispatch_request, s)));
}


CONTINUATION_1_3(new_connection, http_server, buffer_handler, station, register_read);
void new_connection(http_server s,
                    buffer_handler write,
                    station peer,
                    register_read reg)
{
    heap h = allocate_rolling(pages, sstring("connection"));
    session hs = allocate(h, sizeof(struct session));
    hs->write = write;
    hs->parent = s;
    hs->h = h;
    // this needs to be a parse header wired up to a body handler
    apply(reg, request_header_parser(h, cont(h, dispatch_request, hs)));
}

static CONTINUATION_0_0(ignoro);
static void ignoro(){}


void register_static_content(http_server h, char *url, char *content_type, buffer b, char *backing)
{
    buffer *x = allocate(h->h, 3*sizeof(buffer));
    x[0] = string_from_cstring(h->h,content_type);
    x[1] = b;
    x[2] = (buffer)backing;
    table_set(h->content, intern_cstring(url), x);
}

void http_register_service(http_server h, http_service r, string url)
{
    table_set(h->services, intern_buffer(url), r);
}


http_server create_http_server(station p)
{
    if (!ignore) ignore = cont(init, ignoro);
    heap h = allocate_rolling(pages, sstring("server"));
    http_server s = allocate(h, sizeof(struct http_server));
    s->content = create_value_table(h);
    s->services = create_value_table(h);
    s->h = allocate_rolling(pages, sstring("server"));
    tcp_create_server(h,
                      p,
                      cont(h, new_connection, s),
                      ignore);
    return(s);
}
