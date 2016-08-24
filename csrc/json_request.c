#include <runtime.h>
#include <json_request.h>
#include <http/http.h>
#include <luanne.h>


// FIXME: because we allow you to swap the program out, we have to have
// a way to swap out the root parse graph. For now, we're doing this as
// a global, which locks us into having only one program running, but
// we should figure out a way to close over this in some useful way, while
// allowing updating the program.
static buffer root_graph;
static char *exec_path;

extern thunk ignore;

static CONTINUATION_1_0(send_destroy, heap);
static void send_destroy(heap h)
{
    destroy(h);
}

static void format_vector(buffer out, vector v)
{
    int start = 0;
    vector_foreach(v, i){
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
}

buffer format_error_json(heap h, char* message, bag data, uuid data_id)
{
    string stack = allocate_string(h);
    get_stack_trace(&stack);

    uuid id = generate_uuid();
    vector includes = allocate_vector(h, 1);
    if(data != 0) {
      vector_set(includes, 0, data);
    }
    bag response = (bag)create_edb(h, id, includes);
    uuid root = generate_uuid();
    apply(response->insert, root, sym(type), sym(error), 1, 0);
    apply(response->insert, root, sym(stage), sym(executor), 1, 0);
    apply(response->insert, root, sym(message), intern_cstring(message), 1, 0);
    apply(response->insert, root, sym(offsets), intern_buffer(stack), 1, 0);
    if(data != 0) {
      apply(response->insert, root, sym(data), data_id, 1, 0);
    }
    return json_encode(h, response, root);
}

static CONTINUATION_1_3(handle_error, json_session, char *, bag, uuid);
static void handle_error(json_session session, char * message, bag data, uuid data_id) {
    heap h = allocate_rolling(pages, sstring("error handler"));
    buffer out = format_error_json(h, message, data, data_id);
    apply(session->write, out, cont(h, send_destroy, h));
}


// always call this guy independent of commit so that we get an update,
// even on empty, after the first evaluation. warning, destroys
// his heap
static void send_guy(heap h, buffer_handler output, values_diff diff)
{
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"result\", \"insert\":[");
    format_vector(out, diff->insert);
    bprintf(out, "], \"remove\": [");
    format_vector(out, diff->remove);
    bprintf(out, "]}");
    apply(output, out, cont(h, send_destroy, h));
}


static void send_full_parse(heap h, buffer_handler output, string parse)
{
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"full_parse\", \"parse\": ");
    buffer_append(out, bref(parse, 0), buffer_length(parse));
    bprintf(out, "}");
    apply(output, out, cont(h, send_destroy, h));
}

static void dump_display(buffer dest, node source)
{
    boolean multi = false;
    bprintf(dest, "{");
    table_foreach(source->display, k, v) {
        bprintf(dest, "%s%v: %b", multi ? ", " : "", k, v);
        multi = true;
    }
    bprintf(dest, "}");
}

static void send_cnode_graph(heap h, buffer_handler output, node head)
{
    string out = allocate_string(h);

    bprintf(out, "{\"type\":\"node_graph\", \"head\": \"%v\", \"nodes\":{", head->id);
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

        // xxx is in display props now
        if(current->type == intern_cstring("scan")) {
            bprintf(out, ", \"scan_type\": %v", table_find(current->arguments, sym(sig)));
        }
        bprintf(out, ", \"display\":");
        dump_display(out, current);

        bprintf(out, "}");
        nodeComma = 1;
    }

    bprintf(out, "}");
    bprintf(out, "}");
    apply(output, out, ignore);
}

static void send_node_times(heap h, buffer_handler output, node head, table counts)
{
    string out = allocate_string(h);
    u64 time = (u64)table_find(counts, sym(time));
    u64 cycle_time = (u64)table_find(counts, sym(cycle-time));
    u64 iterations = (u64)table_find(counts, sym(iterations));

    bprintf(out, "{\"type\":\"node_times\", \"total_time\": %t, \"cycle_time\": %u, \"iterations\": %d, \"head\": \"%v\", \"nodes\":{", time, cycle_time, iterations, head->id);
    vector to_scan = allocate_vector(h, 10);
    vector_insert(to_scan, head);
    int nodeComma = 0;
    vector_foreach(to_scan, n){
        node current = (node) n;
        vector_foreach(current->arms, arm) {
            vector_insert(to_scan, arm);
        }
        perf p = table_find(counts, current);
        if(p) {
            if(nodeComma) bprintf(out, ",");
            bprintf(out, "\"%v\": {\"count\": %u, \"time\": %l}", current->id, p->count, p->time);
            nodeComma = 1;
        }
    }

    bprintf(out, "}");
    bprintf(out, "}");
    apply(output, out, ignore);
}

// solution should already contain the diffs against persisted...except missing support (diane)
static CONTINUATION_1_3(send_response, json_session, multibag, multibag, table);
static void send_response(json_session session, multibag t_solution, multibag f_solution, table counters)
{
    heap h = allocate_rolling(pages, sstring("response"));
    heap p = allocate_rolling(pages, sstring("response delta"));
    table results = create_value_vector_table(p);
    edb browser;

    if (f_solution && (browser = table_find(f_solution, session->browser_uuid))) {
        edb_foreach(browser, e, a, v, c, _)
            table_set(results, build_vector(p, e, a, v), etrue);
    }


    table_foreach(session->persisted, k, scopeBag) {
        table_foreach(((bag)scopeBag)->implications, impl, _) {
            send_node_times(h, session->write, ((compiled)impl)->head, counters);
        }
    }

    values_diff diff = diff_value_vector_tables(p, session->current_delta, results);
    // destructs h

    if (t_solution && (browser = table_find(t_solution, session->browser_uuid))) {
        edb_foreach(browser, e, a, v, m, u) {
            if (m > 0)
                vector_insert(diff->insert, build_vector(h, e, a, v));
            if (m < 0)
                vector_insert(diff->remove, build_vector(h, e, a, v));
        }
    }


    send_guy(h, session->write, diff);

    destroy(session->current_delta->h);
    session->current_delta = results;
}

void send_parse(json_session session, buffer query)
{
    heap h = allocate_rolling(pages, sstring("parse response"));
    string out = allocate_string(h);
    interpreter lua = get_lua();
    value json = lua_run_module_func(lua, query, "parser", "parseJSON");
    estring json_estring = json;
    buffer_append(out, json_estring->body, json_estring->length);
    free_lua(lua);
    // send the json message
    apply(session->write, out, cont(h, send_destroy, h));
}


CONTINUATION_1_2(handle_json_query, json_session, bag, uuid);
void handle_json_query(json_session session, bag in, uuid root)
{
    if (in == 0) {
        close_evaluation(session->ev);
        destroy(session->h);
        return;
    }

    estring t = lookupv((edb)in, root, sym(type));
    estring q = lookupv((edb)in, root, sym(query));
    buffer desc;
    string x = q?alloca_wrap_buffer(q->body, q->length):0;

    if (t == sym(query)) {
        inject_event(session->ev, x, session->tracing);
    }
    if (t == sym(swap)) {
        close_evaluation(session->ev);
        // xxx - reflection
        session->root->implications =  allocate_table(((edb)session->root)->h, key_from_pointer, compare_pointer);

        vector nodes = compile_eve(init, x, session->tracing, &desc);
        root_graph = desc;
        session->graph = desc;
        heap graph_heap = allocate_rolling(pages, sstring("initial graphs"));
        vector_foreach(nodes, node) {
            // xxx - reflection
            table_set(session->root->implications, node, (void *)1);
            send_cnode_graph(graph_heap, session->write, ((compiled)node)->head);
        }
        // send full parse destroys the heap
        if(session->graph) {
            send_full_parse(graph_heap, session->write, session->graph);
        } else {
            destroy(graph_heap);
        }
        session->ev = build_evaluation(session->scopes, session->persisted, cont(session->h, send_response, session), cont(session->h, handle_error, session));
        run_solver(session->ev);
    }
    if (t == sym(parse)) {
        send_parse(session, alloca_wrap_buffer(q->body, q->length));
    }
    if (t == sym(save)) {
        write_file(exec_path, alloca_wrap_buffer(q->body, q->length));
    }
}


CONTINUATION_2_4(new_json_session,
                 bag, boolean,
                 buffer_handler, bag, uuid, register_read)
void new_json_session(bag root, boolean tracing,
                      buffer_handler write, bag b, uuid u, register_read reg)
{
    heap h = allocate_rolling(pages, sstring("session"));
    uuid su = generate_uuid();

    json_session session = allocate(h, sizeof(struct json_session));
    session->h = h;
    session->root = root;
    session->tracing = tracing;
    session->session = (bag)create_edb(h, su, 0);
    session->current_delta = create_value_vector_table(allocate_rolling(pages, sstring("trash")));
    session->browser_uuid = generate_uuid();
    session->graph = root_graph;
    session->persisted = create_value_table(h);

    table_set(session->persisted, session->root->u, session->root);
    table_set(session->persisted, session->session->u, session->session);

    session->scopes = create_value_table(session->h);
    table_set(session->scopes, intern_cstring("session"), session->session->u);
    table_set(session->scopes, intern_cstring("all"), session->root->u);
    table_set(session->scopes, intern_cstring("browser"), session->browser_uuid);

    // xxx - parameterize file root path
    // we really shouldn't be allowing everyone to mess with the filesystem
    bag fb = filebag_init(sstring(pathroot), generate_uuid());
    table_set(session->scopes, intern_cstring("file"), fb->u);
    table_set(session->persisted, fb->u, fb);

    session->eh = allocate_rolling(pages, sstring("eval"));
    session->ev = build_evaluation(session->scopes, session->persisted, cont(session->h, send_response, session), cont(session->h, handle_error, session));
    session->write = websocket_send_upgrade(session->eh, b, u,
                                      write,
                                      parse_json(session->eh, cont(h, handle_json_query, session)),
                                      reg);

    // send the graphs
    heap graph_heap = allocate_rolling(pages, sstring("initial graphs"));
    table_foreach(session->persisted, k, scopeBag) {
        table_foreach(((bag)scopeBag)->implications, impl, _) {
            send_cnode_graph(graph_heap, session->write, ((compiled)impl)->head);
        }
    }
    // send full parse destroys the heap
    if(session->graph) {
        send_full_parse(graph_heap, session->write, session->graph);
    } else {
        destroy(graph_heap);
    }
    inject_event(session->ev, aprintf(session->h,"init!\n```\nbind\n      [#session-connect]\n```"), session->tracing);
}

void init_json_service(http_server h, bag root, boolean tracing, buffer graph, char *exec_file_path)
{
    root_graph = graph;
    exec_path = exec_file_path;
    http_register_service(h, cont(init, new_json_session, root, tracing), sstring("/ws"));
}
