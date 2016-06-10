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
    buffer_handler write; // to weboscket
} *json_session;

extern bag my_awesome_bag;

static CONTINUATION_2_3(chute, heap, vector, value, value, value)
static void chute(heap h, vector out, value e, value a,  value v)
{
    vector_insert(out, build_vector(h, e, a, v));
}

static void print_value_json(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        // leak on init?really?
        bprintf(out , "{\"type\" : \"uuid\", \"value\" : \"%X\"}", wrap_buffer(init, v, UUID_LENGTH));
        break;
        //    case float_space:
        //        break;
    case estring_space:
        {
            string_intermediate si = v;
            bprintf(out , "\"");
            buffer_append(out, si->body, si->length);
            bprintf(out , "\"");
        }
        break;
    default:
        write (1, "wth!@\n", 6);
    }
    
}


extern thunk ignore;

static evaluation start_guy(heap h, buffer b, buffer_handler output)
{
    vector v = allocate_vector(h, 10);
    insertron a = cont(h, chute, h, v);
    insertron z = cont(h, edb_insert, my_awesome_bag);
    table scopes = allocate_table(h, key_from_pointer, compare_pointer);

    def(scopes, "session", a);
    def(scopes, "transient", z);
    def(scopes, "history", z);
    def(scopes, "external", z);
        
    interpreter c = build_lua(my_awesome_bag, scopes);

    execute(lua_compile_eve(c, b, false));
    
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"result\", \"insert\":[");
    int start = 0;
    
    vector_foreach(v, i){
        int count = 0;

        if (start++ != 0){
            bprintf(out, ",");
        }
        
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
    apply(output, out, ignore);
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
                             start_guy(j->h, query, j->write));
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
    // interned? not interned?
    js->h = h;
    js->evaluations = allocate_table(h, string_hash, string_equal);
    return websocket_send_upgrade(h, headers, write, cont(h, handle_json_query, js), &js->write);
}

void init_json_service(http_server h)
{
    http_register_service(h, new_json_session, sstring("/ws"));
}
