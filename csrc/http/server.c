#include <runtime.h>
#include <json_request.h>
#include <http/http.h>
// rfc 2616

struct http_server {
    heap h;
    table content;
    table services;
    vector implications;
};

typedef struct session {
    bag b;
    heap h;
    http_server parent;
    buffer_handler write;
    evaluation ev;
    uuid event_id;
    uuid request_id;
    uuid session_id;
} *session;

void send_http_response(heap h,
                        buffer_handler write,
                        char * status,
                        string type,
                        buffer b)
{
    buffer o = allocate_buffer(h, 200);
    outline(o, "HTTP/1.1 %s", status);
    outline(o, "Content-Type: %b; charset=utf-8", type);
    outline(o, "Cache-Control: no-cache");
    outline(o, "Content-Length: %d", buffer_length(b));
    outline(o, "");
    apply(write, o, ignore);
    apply(write, b, ignore);
}

static CONTINUATION_1_3(handle_error, session, char *, bag, uuid);
static void handle_error(session session, char * message, bag data, uuid data_id) {
    heap h = allocate_rolling(pages, sstring("error handler"));
    buffer out = format_error_json(h, message, data, data_id);
    send_http_response(h, session->write, "500 Internal Server Error", string_from_cstring(h, "application/json"), out);
    destroy(h);
}


static CONTINUATION_1_3(http_request_complete, session, multibag, multibag, table);
static void http_request_complete(session hs, multibag f_solution, multibag t_solution, table counters)
{
    edb s = table_find(t_solution, hs->session_id);

    if (s) {
        edb_foreach_e(s, e, sym(tag), sym(http-response), m) {
            bag shadow = (bag)s;
            estring body;
            // type checking or coersion
            value header = lookupv(s, e, sym(header));
            if ((body = lookupv(s, e, sym(body))) && (type_of(body) == estring_space)) {
                // dont shadow because http header can't handle it
                //                shadow = (bag)create_edb(hs->h, 0, build_vector(hs->h, s));
                apply(shadow->insert, header, sym(Content-Length), box_float(body->length), 1, 0);
            }
            http_send_header(hs->write, shadow, header,
                             sym(HTTP/1.1),
                             lookupv((edb)shadow, e, sym(status)),
                             lookupv((edb)shadow, e, sym(reason)));
            if (body) {
                // xxx - leak
                buffer b = wrap_buffer(hs->h, body->body, body->length);
                apply(hs->write, b, ignore);
            }
        }
    }
}

static CONTINUATION_1_3(dispatch_request, session, bag, uuid, register_read);
static void dispatch_request(session s, bag b, uuid i, register_read reg)
{
    buffer *c;

    if (b == 0){
        prf ("http server shutdown\n");
        destroy(s->h);
        return;
    }

    // currently treat the pre-registered content urls
    // at the highest priority, then refer to eve
    // as a last report...thats not a good long term plan
    estring url = lookupv((edb)b, i, sym(url));
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
            send_http_response(s->h, s->write, "200 OK", c[0], k);
        } else {
            if (s->ev) {
                // add to the evaluation read set
                table_set(s->ev->t_input, s->event_id, b);
                table_set(s->ev->t_input, s->session_id, create_edb(s->h, s->session_id, 0));

                inject_event(s->ev,
                             aprintf(s->h,"init!\n```\nbind\n[#http-request request:%v]\n```",
                                     i),
                             false); // tracing
            } else {
                prf("url not found %v\n", url);
                apply(s->write, sstring("HTTP/1.1 404 Not found\r\n"), ignore);

            }
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
    hs->ev = 0;

    if (s->implications){
        hs->session_id = generate_uuid();
        hs->event_id = generate_uuid();
        hs->request_id = generate_uuid();
        // sad, only to pass the implications over
        table scopes = create_value_table(h);
        table_set(scopes, intern_cstring("event"), hs->event_id);
        table_set(scopes, intern_cstring("session"), hs->session_id);
        table_set(scopes, intern_cstring("request"), 0);
        table_set(scopes, intern_cstring("file"), filebag_init(sstring("."), generate_uuid()));

        table persisted = create_value_table(h);
        edb session = create_edb(h, hs->session_id, 0);
        table_set(persisted, hs->session_id, session);

        vector_foreach(s->implications, i)
            table_set(session->b.implications, i, (void *)1);
        hs->ev = build_evaluation(scopes, persisted,
                                  cont(h, http_request_complete, hs),
                                  cont(h, handle_error, hs));
    }
    apply(reg, request_header_parser(h, cont(h, dispatch_request, hs)));
}

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


http_server create_http_server(station p, buffer eve)
{
    heap h = allocate_rolling(pages, sstring("server"));
    http_server s = allocate(h, sizeof(struct http_server));
    s->content = create_value_table(h);
    s->services = create_value_table(h);
    s->h = allocate_rolling(pages, sstring("server"));
    bag compiler_bag; // @FIXME: What do we do with the compiler_bag here?
    if (eve) {
        // tracing
        s->implications = compile_eve(s->h, eve, false, &compiler_bag);
    } else {
        s->implications = 0;
    }

    tcp_create_server(h,
                      p,
                      cont(h, new_connection, s),
                      ignore);
    return(s);
}
