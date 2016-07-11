#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>

void print_value_json(buffer out, value v)
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
            prf ("wth!@\n");
    }

}

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


typedef struct json_parser {
    heap h;
    buffer tag, value;
    json_handler out;
    bag b;
    uuid n,pu;
    states s;
    boolean backslash;
} *json_parser;


static CONTINUATION_1_2(json_input, json_parser, buffer, thunk);
static void json_input(json_parser p, buffer b, thunk t)
{
    if (!b) {
        apply(p->out, 0, 0, t);
        return;
    }

    if (!p->b) {
        p->b = create_bag(p->pu);
        p->n = generate_uuid();
    }

    // xxx - use foreach rune
    string_foreach(b, c) {
        if ((p->s == sep) && (buffer_length(p->tag) > 0)){
            estring tes= intern_buffer(p->tag);
            estring ves= intern_buffer(p->value);

            edb_insert(p->b, p->n, tes, ves, 1);
            buffer_clear(p->tag);
            buffer_clear(p->value);
        }

        if ((c == '}')  && (p->s == sep)) {
            apply(p->out, p->b, p->n, t);
            p->b = 0;
        }

        if ((c == separator[p->s]) && !p->backslash) {
            if (p->s == sep) p->s = tag_start;
            else p->s++;
        } else {
            if (p->backslash && (c == 'n')) c = '\n';
            if (c == '\\') {
                p->backslash = true;
            }  else {
                p->backslash = false;
                if (p->s == tag) buffer_write_byte(p->tag, c);
                if (p->s == val) buffer_write_byte(p->value, c);
            }
        }
    }
}

buffer_handler parse_json(heap h, uuid pu, json_handler j) 
{
    json_parser p= allocate(h, sizeof(struct json_parser));
    p->h = h;
    p->tag = allocate_buffer(h, 10);
    p->value = allocate_buffer(h, 10);
    p->pu= pu;
    p->b = 0;
    p->out = j;
    return(cont(h, json_input, p));
}


buffer print_json(heap h, uuid root, bag b)
{
}

