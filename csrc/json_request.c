#include <runtime.h>
#include <unix/unix.h>

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

static void start_guy(heap h, buffer b, buffer_handler out)
{
    interpreter c = build_lua();
    lua_compile_eve(c, b);
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
            
            prf("%b %d %b\n", bt, buffer_length(bt), bv);
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
        
