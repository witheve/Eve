#include <runtime.h>
#include <http/http.h>

typedef struct request {
    heap h;
    bag b;
    uuid req;
    buffer_handler w;
} *request;

static CONTINUATION_1_2(json_input, request, bag, uuid);
static void json_input(request r, bag from_server, uuid n)
{
    value type = lookupv(from_server, n, sym(type));
    if (type == sym(result)) {
        prf("jsoninput: %b\n", bag_dump(init, from_server));
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
static CONTINUATION_1_2(bag_update, bag, evaluation, bag);
static void bag_update(bag root, evaluation ev, bag deltas)
{
    heap h = init;

    bag_foreach_e(deltas, e, sym(tag), sym(http-request), c) {
        //        open_http_client(h, root, e, cont(h, response, root, e));
    }

    bag_foreach_e(deltas, e, sym(tag), sym(eve-connection), c) {
        heap h = init;
        request r = allocate(h, sizeof(struct request));
        r->h = h;
        // mututally recursive continuations :(
        r->w = websocket_client(h, root, e,
                                parse_json(h, cont(h, json_input, r)));
    }
}


void init_request_service(bag b)
{
    register_delta_listener(b, cont(init, bag_update, b));
}
