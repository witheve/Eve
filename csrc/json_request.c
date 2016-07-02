#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>
#include <unistd.h>

static char separator[] = {'{', '"', '"', ':', '"', '"', ','};

typedef enum {
    top = 0,
    tag_start,
    tag,
    tvsep,
    val_start,
    val,
    sep
} states;


typedef struct json_session {
    heap h;
    table evaluations;
    table current_delta;
    buffer_handler write; // to weboscket
    table scopes;
    bag root, session;
    boolean tracing;
    evaluation s;
} *json_session;

extern bag my_awesome_bag;
extern thunk ignore;

static void print_value_json(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        bprintf(out , "{\"type\" : \"uuid\", \"value\" : \"%X\"}", wrap_buffer(init, v, UUID_LENGTH));
        break;
    case float_space:
        bprintf(out, "%v", v);
        break;
    case estring_space:
        {
            estring si = v;
            bprintf(out , "\"");
            buffer_append(out, si->body, si->length);
            bprintf(out , "\"");
        }
        break;
    default:
        if(v == etrue)
            bprintf(out, "true");
        else if( v == efalse)
            bprintf(out, "false");
        else
            write (1, "wth!@\n", 6);
    }

}

static CONTINUATION_1_0(send_destroy, heap);
static void send_destroy(heap h)
{
    //    destroy(h);
}

// always call this guy independent of commit so that we get an update,
// even on empty, after the first evaluation
static void send_guy(buffer_handler output, values_diff diff)
{
    heap h = allocate_rolling(pages);
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"result\", \"insert\":[");

    int start = 0;
    vector_foreach(diff->insert, i){
        int count = 0;
        if (start++ != 0) bprintf(out, ",");
        bprintf(out, "[");
        vector_foreach(i, j){
            print_value_json(out, j);
            if (count ++ < 2) {
                bprintf(out, ",  ");
            }
        }
        bprintf(out, "]");
    }

    bprintf(out, "], \"remove\": [");

    start = 0;

    vector_foreach(diff->remove, i){
        int count = 0;
        if (start++ != 0) bprintf(out, ",");
        bprintf(out, "[");
        vector_foreach(i, j){
            print_value_json(out, j);
            if (count ++ < 2) {
                bprintf(out, ",  ");
            }
        }
        bprintf(out, "]");
    }

    bprintf(out, "]}");
    apply(output, out, cont(h, send_destroy, h));
}

// for tracing we want to be able to send the structure of the machines
// that we build as a json message
static void send_node_graph(buffer_handler output, node head, table counts)
{
    heap h = allocate_rolling(pages);
    string out = allocate_string(h);
    iu64 time = (iu64)table_find(counts, intern_cstring("time"));
    long iterations = (long)table_find(counts, intern_cstring("iterations"));
    bprintf(out, "{\"type\":\"node_graph\", \"total_time\": %t, \"iterations\": %d, \"head\": \"%v\", \"nodes\":{", time, iterations, head->id);

    vector to_scan = allocate_vector(h, 10);
    vector_insert(to_scan, head);
    int nodeComma = 0;
    vector_foreach(to_scan, n){
        node current = (node) n;
        if(nodeComma) {
            bprintf(out, ",");
        }
        bprintf(out, "\"%v\": {\"id\": \"%v\", \"type\": %v, \"arms\": [", current->id, current->id, current->type);
        int needsComma = 0;
        vector_foreach(current->arms, arm) {
            vector_insert(to_scan, arm);
            if(needsComma) {
                bprintf(out, ",");
            }
            bprintf(out, "\"%v\"", ((node)arm)->id);
            needsComma = 1;
        }
        bprintf(out, "]");
        int* count = table_find(counts, current);
        if(count) {
          bprintf(out, ", \"count\": %u", *count);
        }
        if(current->type == intern_cstring("scan")) {
            bprintf(out, ", \"scan_type\": %v", vector_get(vector_get(current->arguments, 0), 0));
        }
        bprintf(out, "}");
        nodeComma = 1;
    }

    bprintf(out, "}, \"parse\": ");

    estring parse = vector_get(vector_get(head->arguments, 1), 0);
    buffer_append(out, parse->body, parse->length);
    bprintf(out, "}");
    // reclaim
    apply(output, out, cont(h, send_destroy, h));
}


static evaluation send_response(json_session js)
{
    heap h = allocate_rolling(pages);
    table results = create_value_vector_table(js->h);
    
    bag_foreach(js->session, e, a, v, c)
        table_set(results, build_vector(h, e, a, v), etrue);

    bag ev = table_find(js->s->solution, js->s->event_uuid);
    if (ev){
        bag_foreach(ev, e, a, v, c)
            table_set(results, build_vector(h, e, a, v), etrue);
    }

    table_foreach(js->s->persisted, k, scopeBag) {
        table_foreach(edb_implications(scopeBag), k, impl) {
            send_node_graph(js->write, impl, js->s->counters);
        }
    }

    values_diff diff = diff_value_vector_tables(h, js->current_delta, results);
    send_guy(js->write, diff);
    
    // FIXME: we need to clean up the old delta, we're currently just leaking it
    // this has to be a copy
    js->current_delta = results;
    return 0;
}

CONTINUATION_1_2(handle_json_query, json_session, buffer, thunk);
void handle_json_query(json_session j, buffer in, thunk c)
{
    states s = top;
    buffer bt = allocate_buffer(j->h, 10);
    buffer bv = allocate_buffer(j->h, 100);
    buffer id, type, query, scope;
    boolean backslash = false;

    string_foreach(in, c) {
        if (s == sep) {
            if (string_equal(bt, sstring("query"))) {
                query = bv;
                bv = allocate_buffer(j->h, 100);
            }
            if (string_equal(bt, sstring("id"))) {
                id = bv;
                bv = allocate_buffer(j->h, 100);
            }
            if (string_equal(bt, sstring("scope"))) {
                scope = bv;
                bv = allocate_buffer(j->h, 100);
            }
            if (string_equal(bt, sstring("type"))) {
                type = bv;
                bv = allocate_buffer(j->h, 100);
            }
            buffer_clear(bt);
            buffer_clear(bv);
        }

        if ((c == '}')  && (s== sep)) {
            if (string_equal(type, sstring("query"))) {
                vector nodes = compile_eve(query, j->tracing);
                inject_event(j->s, nodes);
                send_response(j);
            }
        }

        if ((c == separator[s]) && !backslash) {
            if (s == sep) s = tag_start;
            else s++;
        } else {
            // utf8
            if (backslash && (c == 'n')) c = '\n';
            if (c == '\\') {
                backslash = true;
            }  else {
                backslash = false;
                if (s == tag) buffer_write_byte(bt, c);
                if (s == val) buffer_write_byte(bv, c);
            }
        }
    }
}


CONTINUATION_2_3(new_json_session, bag, boolean, buffer_handler, table, buffer_handler *)
void new_json_session(bag root, boolean tracing, buffer_handler write, table headers, buffer_handler *handler)
{
    heap h = allocate_rolling(pages);
    // ok, now counts just accrete forever
    table counts = allocate_table(h, key_from_pointer, compare_pointer);
    uuid su = generate_uuid();
    json_session js = allocate(h, sizeof(struct json_session));
    js->h = h;
    js->root = root;
    js->tracing = tracing;
    js->evaluations = allocate_table(h, string_hash, string_equal);
    js->scopes = create_value_table(js->h);
    js->session = create_bag(su);
    js->current_delta = create_value_vector_table(js->h);

    table persisted = create_value_table(h);
    uuid ru = edb_uuid(root);
    table_set(persisted, ru, js->root);
    table_set(persisted, su, js->session);
    table_set(js->scopes, intern_cstring("session"), su);
    table_set(js->scopes, intern_cstring("all"), ru);
    js->s = build_evaluation(h, js->scopes, persisted, counts);
    
    *handler = websocket_send_upgrade(h, headers, write, cont(h, handle_json_query, js), &js->write);
    run_solver(js->s);
    send_response(js);
}

void init_json_service(http_server h, bag root, boolean tracing)
{
    http_register_service(h, cont(init, new_json_session, root, tracing), sstring("/ws"));
}
