#include <runtime.h>
#include <http/http.h>
    
static char separators[] = {' ',
                            ' ',
                            '\r',
                            '\n',
                            ':',
                            ' ',
                            '\r',
                            '\n',
                            '\n'};

typedef enum {
    method =0,
    url =1,
    version =2,
    skipo,
    name,
    skip,
    property,
    skip2,
    header_end
} header_state;

typedef struct header_parser {
   header_handler h;
   bag b;
   uuid u;
   buffer term;
   estring name;
   header_state s;
   value headers[3];
   reader self;
} *header_parser;

extern void *ignore;

void http_send_header(buffer_handler w, bag b, uuid n, value first, value second, value third)
{
    buffer out = allocate_buffer(init, 64);
    bprintf(out, "%v %v %v\r\n", first, second, third);
    bag_foreach_av(b, n, a, v, c) 
        bprintf(out, "%v: %v\r\n", a, v);
    bprintf(out, "\r\n");
    apply(w, out, ignore);
    //    buffer_deallocate(b);
}

void http_send_request_header(buffer_handler w, bag b, uuid n)
{
}

void http_send_response_header(buffer_handler w, bag b, uuid n)
{
}



static CONTINUATION_1_2(parse_http_header, header_parser, buffer, register_read);
static void parse_http_header(header_parser p, buffer b, register_read reg)
{
    int count = 0;
    if (b == 0) {
        apply(p->h, 0, 0, 0, 0);
        return;
    }

    // xxx - make a consuming rune variant
    string_foreach(b, c) {
        count++;

        if ((p->s == name) && (c == '\r')) {
            p->s = header_end;
        }
        
        if (c == separators[p->s]) {
            // thats not really the terminator...make a proper state machine
            switch(p->s) {
            case header_end:
                buffer_consume(b, count);
                apply(p->h, p->b, p->u, b, reg);
                return;

            case method:
            case url:
            case version:
                edb_insert(p->b, p->u, p->headers[p->s], intern_buffer(p->term), 1);
                p->s++;
                break;
            case name:
                p->name = intern_buffer(p->term);
                p->s++;
                break;
            case property:
                p->s = skipo;
                edb_insert(p->b, p->u, p->name, intern_buffer(p->term), 1);
                break;
            default:
                p->s++;
            }
            buffer_clear(p->term);
        } else {
            buffer_write_byte(p->term, c);
        }
    }
    apply(reg, p->self);
}

    
reader new_guy(heap h, header_handler result, value a, value b, value c)
{
    header_parser p = allocate(h, sizeof(struct header_parser));
    p->h = result;
    p->b = create_bag(h, 0); //uuid? - take a bag?
    p->u = generate_uuid();
    p->s = 0;
    p->headers[0] = a;
    p->headers[1] = b;
    p->headers[2] = c;
    p->term = allocate_buffer(h, 20);
    p->self = cont(h, parse_http_header, p);
    return p->self;
}


reader request_header_parser(heap h, header_handler result_handler)
{
    return new_guy(h, result_handler, sym(method), sym(url), sym(version)); 
}

    
reader response_header_parser(heap h, header_handler result_handler)
{  
    return new_guy(h, result_handler, sym(method), sym(url), sym(version)); 
}
