#include <runtime.h>
#include <unix/unix.h>
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


extern bag my_awesome_bag;

static CONTINUATION_2_3(chute, heap, vector, value, value, value)
static void chute(heap h, vector out, value e, value a,  value v)
{
    vector_insert(out, build_vector(h, e, a, v));
}

static void print_value(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        // leak on init?really?
        bprintf(out , "{\"type\" : \"uuid\", \"value\" : \"%X\"}", wrap_buffer(init, v, UUID_LENGTH));
        break;
        //    case float_space:
        //        break;
    case interned_space:
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

static void start_guy(heap h, buffer b, buffer_handler output)
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

    ticks start_time = rdtsc();
    lua_compile_eve(c, b);
    ticks end_time = rdtsc();
    printf ("user query in %ld ticks\n", end_time-start_time);
    
    string out = allocate_string(h);
    bprintf(out, "{\"type\":\"result\", \"insert\":[");
    int start = 0;
    
    vector_foreach(i, v){
        int count = 0;

        if (start++ != 0){
            bprintf(out, ",");
        }
        
        bprintf(out, "["); 
        vector_foreach(j, i){
            
            print_value(out, j);
            if (count ++ < 2) {
                bprintf(out, ",  ");
            }
        }
        bprintf(out, "]");
    }
    bprintf(out, "]}");
    apply(output, out, ignore);
}

void handle_json_query(heap h, buffer in, buffer_handler out)
{
    states s = top;
    buffer bt = allocate_buffer(h, 10);
    buffer bv = allocate_buffer(h, 100);
    boolean backslash = false;
    
    string_foreach(c, in) {
        if (s == sep) {
            if (string_equal(bt, sstring("query"))) {
                start_guy(h, bv, out);
            }
            
            buffer_clear(bt);
            buffer_clear(bv);
        }

        if ((c == '}')  && (s== sep)) {
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
        
