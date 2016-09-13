#include <runtime.h>
#include <http/http.h>
#include <luanne.h>

typedef struct json_session {
    heap h;
    table current_delta;
    uuid u;
    evaluation ev;
    endpoint down;
    table id_mappings;
} *json_session;

buffer format_error_json(heap h, char* message, bag data, uuid data_id);

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
    bag response = (bag)create_edb(h, includes);
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
    apply(session->down->w, out, cont(h, send_destroy, h));
}


// always call this guy independent of commit so that we get an update,
// even on empty, after the first evaluation. warning, destroys
// his heap
static void send_diff(heap h, buffer_handler output, values_diff diff)
{
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"result\", \"insert\":[");
    format_vector(out, diff->insert);
    bprintf(out, "], \"remove\": [");
    format_vector(out, diff->remove);
    bprintf(out, "]}");
    apply(output, out, cont(h, send_destroy, h));
}

static CONTINUATION_1_2(send_response, json_session, multibag, multibag);
static void send_response(json_session session, multibag t_solution, multibag f_solution)
{
    heap h = allocate_rolling(pages, sstring("response"));
    heap p = allocate_rolling(pages, sstring("response delta"));
    table results = create_value_vector_table(p);
    edb browser;

    if (f_solution && (browser = table_find(f_solution, session->u))) {
        edb_foreach(browser, e, a, v, c, _) {
            table_set(results, build_vector(p, e, a, v), etrue);
            table_set(session->id_mappings, e, e);
        }

    }


    values_diff diff = diff_value_vector_tables(p, session->current_delta, results);
    // destructs h

    if (t_solution && (browser = table_find(t_solution, session->u))) {
        edb_foreach(browser, e, a, v, m, u) {
            table_set(session->id_mappings, e, e); // @FIXME: This is gonna leak dead ids.
            vector eav = 0;
            if(m != 0)
                eav = build_vector(h, e, a, v);
            if (m > 0 && !eav_vector_contains(diff->insert, eav))
                vector_insert(diff->insert, eav);
            if (m < 0 && !eav_vector_contains(diff->remove, eav))
                vector_insert(diff->remove, eav);
        }
    }


    send_diff(h, session->down->w, diff);

    destroy(session->current_delta->h);
    session->current_delta = results;
}

// LE is full of sadness and inverts the bytes in integers.
u64 id_bracket_open = 0x91a6e2;
u64 id_bracket_close = 0x92a6e2;
boolean is_stringy_uuid(value v) {
    if(type_of(v) != estring_space) return false;
    estring s = (estring)v;
    if(s->length < 6) return false; // It's too short to contain id brackets at all.
    u64 open_rune = 0;
    memcpy(&open_rune, s->body, 3);
    if(memcmp(&open_rune, &id_bracket_open, 3) != 0) return false;
    u64 close_rune = 0;
    memcpy(&close_rune, s->body + s->length - 3, 3);
    if(memcmp(&close_rune, &id_bracket_close, 3) != 0) return false;
    return true;
}

value map_if_uuid(heap h, value v, table mapping) {
    if(!is_stringy_uuid(v)) return v;

    estring s = (estring)v;
    buffer str = alloca_wrap_buffer(s->body + 3, s->length - 6);

    uuid id = parse_uuid(str);
    value mapped = table_find(mapping, id);
    if(mapped) return mapped; // If we've already been mapped, reuse that value.

    uuid neue = generate_uuid();
    table_set(mapping, id, neue);
    return neue;
}

static CONTINUATION_1_2(json_input, json_session, bag, uuid);
static void json_input(json_session s, bag json_bag, uuid root_id)
{
    if(!json_bag) {
        close_evaluation(s->ev);
        destroy(s->h);
        return;
    }

    edb b = (edb)json_bag;
    value type = lookupv(b, root_id, sym(type));
    if(type == sym(event)) {
        bag event = (bag)create_edb(s->h, 0);
        value eavs_id = lookupv(b, root_id, sym(insert));
        int ix = 1;
        while(true) {
            value eav_id = lookupv(b, eavs_id, box_float(ix));
            if(!eav_id) break;
            value e = map_if_uuid(s->h, lookupv(b, eav_id, box_float(1)), s->id_mappings);
            value a = map_if_uuid(s->h, lookupv(b, eav_id, box_float(2)), s->id_mappings);
            value v = map_if_uuid(s->h, lookupv(b, eav_id, box_float(3)), s->id_mappings);

            apply(event->insert, e, a, v, 1, 0); // @NOTE: It'd be cute to be able to tag this as coming from the json session.
            ix++;
        }
        prf("JSON EVENT\n%b\n", edb_dump(s->h, (edb)event));
        inject_event(s->ev, event);
    }
}

object_handler create_json_session(heap h, evaluation ev, endpoint down, uuid u)
{
    // allocate json parser
    json_session s = allocate(h, sizeof(struct json_session));
    s->h = h;
    s->down = down;
    s->ev = ev;
    s->current_delta = create_value_vector_table(allocate_rolling(pages, sstring("json delta")));
    s->id_mappings = create_value_table(h);
    // xxx - very clumsy way to wire this up
    ev->complete = cont(h, send_response, s);
    ev->error = cont(h, handle_error, s);

    s->u = u;
    return(cont(h, json_input, s));
}
