#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>
#include <luanne.h>
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
    uuid session;
    table scopes;
} *json_session;

extern bag my_awesome_bag;
extern thunk ignore;

static CONTINUATION_2_4(chute, heap, table, value, value, value, eboolean)
static void chute(heap h, table out, value e, value a,  value v, eboolean nothing)
{
    table_set(out, build_vector(h, e, a, v), etrue);
}

static void print_value_json(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        bprintf(out , "{\"type\" : \"uuid\", \"value\" : \"%X\"}", wrap_buffer(init, v, UUID_LENGTH));
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
        write (1, "wth!@\n", 6);
    }
    
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
            if (count ++ < 2) {
                bprintf(out, ",  ");
            }
        }
        bprintf(out, "]");
    }

    bprintf(out, "]}");
    // reclaim
    apply(output, out, ignore);
}


static void json_commit()
{
}


static evaluation start_guy(json_session js, buffer b, buffer_handler output)
{
    prf("SCOPES: \n");
    table_foreach(js->scopes, scope, scope_id) {
        prf("   %v: %v", scope, scope_id);
    }
    prf("\n");

    // take this from the lua pool
    interpreter c = build_lua(my_awesome_bag, js->scopes);
    node n = lua_compile_eve(c, b, enable_tracing);
    register_implication(n);
    // needs to be scoped
    table result_bags = start_fixedpoint(js->scopes);
    bag session_bag = table_find(result_bags, js->session);
    prf("PRINTING SESSION\n");
    prf("%b\n", bag_dump(js->h, session_bag));

    table results = create_value_vector_table(js->h);
    insertron scanner = cont(js->h, chute, js->h, results);
    edb_scan(session_bag, 0, scanner, 0, 0, 0);
    values_diff diff = diff_value_vector_tables(js->h, js->current_delta, results);
    send_guy(js->h, output, diff);
    // FIXME: we need to clean up the old delta, we're currently just leaking it
    js->current_delta = results;
    return 0;
}

CONTINUATION_1_2(handle_json_query, json_session, buffer, thunk);
void handle_json_query(json_session j, buffer in, thunk c)
{
    states s = top;
    buffer bt = allocate_buffer(j->h, 10);
    buffer bv = allocate_buffer(j->h, 100);
    buffer id, type, query;
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
            if (string_equal(bt, sstring("type"))) {
                type = bv;
                bv = allocate_buffer(j->h, 100);
            }
            buffer_clear(bt);
            buffer_clear(bv);
        }

        if ((c == '}')  && (s== sep)) {
            if (string_equal(type, sstring("query"))) {
                // xxx - this id is currently meaningless
                table_set(j->evaluations, id,
                             start_guy(j, query, j->write));
            }
                
            // do the thing
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


buffer_handler new_json_session(buffer_handler write, table headers)
{
    heap h = allocate_rolling(pages);
    
    json_session js = allocate(h, sizeof(struct json_session));
    js->h = h;
    js->evaluations = allocate_table(h, string_hash, string_equal);
    js->scopes = create_value_table(js->h);
    js->session = generate_uuid();
    js->current_delta = create_value_vector_table(js->h);
    table_set(js->scopes, intern_cstring("transient"), generate_uuid());
    table_set(js->scopes, intern_cstring("session"), js->session);
    return websocket_send_upgrade(h, headers, write, cont(h, handle_json_query, js), &js->write);
}

void init_json_service(http_server h)
{
    http_register_service(h, new_json_session, sstring("/ws"));
}
