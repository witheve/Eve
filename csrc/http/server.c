#include <runtime.h>
#include <http/http.h>
// rfc 2616

struct http_server {
    heap h;
    evaluation ev;
    table sessions;
};

typedef struct session {
    // the evaluator is throwing away our headers,
    // so we stash them here and cant execute piplined or
    // out of order
    bag last_headers;
    bag last_headers_root;

    heap h;
    uuid self;
    http_server parent;
    evaluation ev;
    endpoint e;
} *session;

static CONTINUATION_1_3(dispatch_request, session, bag, uuid, register_read);

void http_send_response(http_server s, bag b, uuid root)
{
    bag shadow = (bag)b;
    estring body;
    session hs = table_find(s->sessions, root);

    // type checking or coersion
    value response = lookupv((edb)b, root, sym(response));
    if (hs && response) {
        value header = lookupv((edb)b, response, sym(header));

        if ((body = lookupv((edb)b, response, sym(content))) && (type_of(body) == estring_space)) {
            // dont shadow because http header can't handle it because edb_foreach
            //                shadow = (bag)create_edb(hs->h, 0, build_vector(hs->h, s));
            apply(shadow->insert, header, sym(Content-Length), box_float(body->length), 1, 0);
        }

        http_send_header(hs->e->w, shadow, header,
                         sym(HTTP/1.1),
                         lookupv((edb)shadow, response, sym(status)),
                         lookupv((edb)shadow, response, sym(reason)));
        if (body) {
            // xxx - leak the wrapper
            buffer b = wrap_buffer(hs->h, body->body, body->length);
            apply(hs->e->w, b, ignore);
        }

        // xxx - if this doesn't correlate, we wont continue to read from
        // this connection
        apply(hs->e->r, request_header_parser(s->h, cont(s->h, dispatch_request, hs)));
    }
}


static void dispatch_request(session s, bag b, uuid i, register_read reg)
{
    buffer *c;

    if (b == 0){
        // tell evie?
        prf ("http connection shutdown\n");
        destroy(s->h);
        return;
    }

    bag event = (bag)create_edb(s->h, build_vector(s->h, b));
    uuid x = generate_uuid();

    // multi- sadness
    s->last_headers = b;
    s->last_headers_root = i;
    table_set(s->parent->sessions, x, s);

    apply(event->insert, x, sym(tag), sym(http-request), 1, 0);
    apply(event->insert, x, sym(request), i, 1, 0);
    apply(event->insert, x, sym(connection), s->self, 1, 0);

    inject_event(s->parent->ev,event);
    s->e->r = reg;
}

CONTINUATION_1_2(new_connection, http_server, endpoint, station);
void new_connection(http_server s,
                    endpoint e,
                    station peer)
{
    heap h = allocate_rolling(tcontext()->page_heap, sstring("connection"));
    session hs = allocate(h, sizeof(struct session));
    hs->parent = s;
    hs->h = h;
    hs->e = e;
    hs->self = generate_uuid();
    table_set(s->sessions, hs->self, hs);

    // as it stands, no one really cares about new connects arriving,
    // but it seems at minumum we might want to log and keep track
    apply(e->r, request_header_parser(h, cont(h, dispatch_request, hs)));
}

static CONTINUATION_3_2(http_eval_result, http_server, process_bag, uuid,
                        multibag, multibag);
static void http_eval_result(http_server s, process_bag pb, uuid where,
                             multibag t, multibag f)
{
    bag b;

    if (!t || (!(b=table_find(t, where)))) {
        prf("empty http eval result t: %d f: %d %b\n",
            t?table_elements(t):0,
            f?table_elements(f):0,
            (f && table_find(f, where))?edb_dump(init,
                                                 ((edb)table_find(f, where)))
            :sstring("empty"));


    } else {
        edb_foreach_ev((edb)b, e, sym(response), response, m){
            // xxx we're using e as a very weak correlator to the connection
            http_send_response(s, b, e);
            return;
        }

        edb_foreach_ev((edb)b, e, sym(upgrade), child, m){
            session hs = table_find(s->sessions, e);
            heap jh = allocate_rolling(init, sstring("json session"));
            evaluation ev = process_resolve(pb, child);
            if (ev) {
                endpoint ws =  websocket_send_upgrade(hs->h, hs->e,
                                      hs->last_headers,
                                      hs->last_headers_root);
                parse_json(jh, ws, create_json_session(jh, ev, ws));
                bag session_connect = (bag)create_edb(jh, 0);

                apply(session_connect->insert,
                      generate_uuid(),
                      sym(tag),
                      sym(session-connect), 1, 0);
                inject_event(ev, session_connect);
            } else {
                prf ("unable to correlate upgrade process\n");
            }
        }
    }
}



http_server create_http_server(station p, evaluation ev, process_bag pb)
{
    heap h = allocate_rolling(pages, sstring("server"));
    http_server s = allocate(h, sizeof(struct http_server));

    s->h = h;
    s->ev = ev;

    s->sessions = create_value_table(h);

    bag sib = (bag)create_edb(h, 0);
    uuid sid = generate_uuid();
    table_set(ev->t_input, sid, sib);
    table_set(ev->scopes, sym(server), sid);
    vector_insert(ev->default_scan_scopes, sid);
    vector_insert(ev->default_insert_scopes, sid);

    // use a listener instead
    ev->complete = cont(h, http_eval_result, s, pb, sid),

    tcp_create_server(h,
                      p,
                      cont(h, new_connection, s),
                      ignore);
    return(s);
}
