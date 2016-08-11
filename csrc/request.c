#include <runtime.h>
#include <http/http.h>

typedef struct request {
    heap h;
    bag b;
    uuid req;
    buffer_handler w;
    evaluation ev;
} *request;

static CONTINUATION_1_2(eve_json_input, request, bag, uuid);

// oh, small ints
static value ek = 0;
static value ak;
static value vk;

static value translate_eve_value(bag b, uuid v, value key)
{
    value x = lookupv((edb)b, v, key);

    if (lookupv((edb)b, x, sym(type)) == sym(uuid)) {
        estring e = lookupv((edb)b, x, sym(value));
        value u = parse_uuid(alloca_wrap_buffer(e->body, e->length));
        return u;
    }
    return x;
}

static void merge_remote(bag d, bag s, uuid set, multiplicity m)
{
    // should have a block id
    edb_foreach_av((edb)s, set, a, fact, _) {
        if (a != sym(tag)) {
            value e = translate_eve_value(s, fact, ek);
            value a = translate_eve_value(s, fact, ak);
            value v = translate_eve_value(s, fact, vk);
            prf("merge %v %v %v\n", e, a, v);
            apply(d->insert, e, a, v, m, 0);
        }
    }
}

static void eve_json_input(request r, bag from_server, uuid n)
{
    value type = lookupv((edb)from_server, n, sym(type));
    if (type == sym(result)) {
        if (!ek) {
            // sadness - make a json vectory thingy
            ek = box_float((float)0);
            ak = box_float((float)1);
            vk = box_float((float)2);
        }
        merge_remote(r->b, from_server, lookupv((edb)from_server, n, sym(insert)), 1);
        merge_remote(r->b, from_server, lookupv((edb)from_server, n, sym(remove)), -1);
        inject_event(r->ev, aprintf(r->h,"init!\n```\nbind [#eve-response]\n```"), 0);
    }
}


// we have alot of options for plumbing here:
//   tcp
//   http
//   http-json
//   http-ws-json
//   udp
//   udp-json
//   etc...
extern thunk ignore;
static CONTINUATION_2_2(bag_update, table, bag, evaluation, bag);
static void bag_update(table idmap, bag root, evaluation ev, bag deltas)
{
    heap h = init;

    edb_foreach_e((edb)deltas, e, sym(tag), sym(http-request), c) {
        //        open_http_client(h, root, e, cont(h, response, root, e));
    }

    edb_foreach_e((edb)deltas, e, sym(tag), sym(json-request), c) {
        value k = lookupv((edb)deltas, e, sym(connection));
        request r = table_find(idmap, k);
        value message = lookupv((edb)deltas, e, sym(message));
        buffer b = json_encode(r->h, root, message);
        apply(r->w, b, ignore);
    }

    edb_foreach_e((edb)deltas, e, sym(tag), sym(eve-connection), c) {
        heap h = init;
        request r = allocate(h, sizeof(struct request));
        r->h = h;
        r->ev = ev;
        // xxx - not super general
        r->b = table_find(ev->persisted, table_find(ev->scopes, sym(remote)));
        r->w = websocket_client(h, root, e,
                                parse_json(h, cont(h, eve_json_input, r)));
        table_set(idmap, e, r);
    }
}


// ok, this is more of an experiment to see if we can
// manage state sympathetically with an eve program
void init_request_service(bag b)
{
    table idmap = create_value_table(init);
    // temporary - going to be implemented just as a bag handler
    table_set(b->delta_listeners, cont(init, bag_update, idmap, b), (void *)1);
}
