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
    table session_delta;
    boolean tracing;
    evaluation s;
} *json_session;

extern bag my_awesome_bag;
extern thunk ignore;

static CONTINUATION_2_4(collect_results, heap, table, value, value, value, eboolean)
     static void collect_results(heap h, table out, value e, value a,  value v, eboolean nothing)
{
    table_set(out, build_vector(h, e, a, v), etrue);
}


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
    destroy(h);
}

// always call this guy independent of commit so that we get an update,
// even on empty, after the first evaluation
static void send_guy(heap h, buffer_handler output, values_diff diff)
{
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
            if (count ++ <2) {
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
static void send_node_graph(heap h, buffer_handler output, node head, table counts)
{
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
    estring parse = vector_get(vector_get(head->arguments, 0), 0);
    buffer_append(out, parse->body, parse->length);
    bprintf(out, "}");
    // reclaim
    apply(output, out, ignore);
}


static CONTINUATION_1_0(terminal, json_session)
static void terminal(json_session j)
{
    table results = create_value_vector_table(j->h);
    bag session_bag = table_find(j->s->solution, edb_uuid(j->session));
    prf("session bag facts: %d\n", session_bag?edb_size(session_bag): 0);
    
    if (session_bag) {
        edb_scan(session_bag, 0, cont(j->h, collect_results, j->h, results), 0, 0, 0);
    }
    
    values_diff diff = diff_value_vector_tables(j->h, j->current_delta, results);
    send_guy(j->h, j->write, diff);
    
    // FIXME: we need to clean up the old delta, we're currently just leaking it
    // this has to be a copy
    j->current_delta = results;
    table_foreach(j->scopes, k, scopeBag) {
        table_foreach(edb_implications(scopeBag), k, impl) {
            send_node_graph(j->h, j->write, impl, j->s->counters);
        }
    }
    // FIXME: we need to clean up the old delta, we're currently just leaking it
    // this has to be a copy
    j->current_delta = results;
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
                node headNode = compile_eve(query, j->tracing);
                inject_event(j->s, headNode);
                run_evaluation(j->s);
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

    json_session j = allocate(h, sizeof(struct json_session));
    j->root = root;
    j->tracing = tracing;
    j->evaluations = allocate_table(h, string_hash, string_equal);
    j->scopes = create_value_table(j->h);
    j->session = create_bag(generate_uuid());
    j->current_delta = create_value_vector_table(j->h);

    table persisted = create_value_table(h);
    table_set(persisted, edb_uuid(j->root), j->root);

    // FIXME - for the moment we're just going to accrete the events so that
    // the quasi-incremental guy knows what to do, we'd like to clean up
    // a big for long lived sessions
    bag event = create_bag(generate_uuid());
    table_set(j->scopes, intern_cstring("event"), event);

    table_set(j->scopes, intern_cstring("session"), j->session);
    table_set(j->scopes, intern_cstring("all"), root);
    j->s = build_evaluation(h, j->scopes, persisted, counts, cont(h, terminal, j));
    *handler = websocket_send_upgrade(h, headers, write, cont(h, handle_json_query, j), &j->write);
    run_evaluation(j->s);
}

void init_json_service(http_server h, bag root, boolean tracing)
{
    http_register_service(h, cont(init, new_json_session, root, tracing), sstring("/ws"));
}
