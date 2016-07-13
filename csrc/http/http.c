#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>
    
static char separators[] = {' ',
                            ' ',
                            '\n',
                            ':',
                            ' ',
                            '\r',
                            '\n'};

typedef enum {
    method =0,
    url =1,
    version =2,
    name,
    skip,
    property,
    skip2,
    total_states
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

static CONTINUATION_1_2(parse_http_header, header_parser, buffer, register_read);
static void parse_http_header(header_parser p, buffer b, register_read reg)
{
    int count = 0;
    // xxx - make a consuming rune variant
    string_foreach(b, c) {
        count++;
        if (c == separators[p->s]) {
            // thats not really the terminator...make a proper state machine
            if ((p->s == name) && (c == '\n')) {
                buffer_consume(b, count);
                apply(p->h, p->b, p->u, b, reg);
                return;
            }
            switch(p->s++) {
            case method:
            case url:
            case version:
                edb_insert(p->b, p->u, p->headers[p->s], intern_buffer(p->term), 1);
                break;
            case name:
                p->name = intern_buffer(p->term);
                break;
            case property:
                p->s = name;
                edb_insert(p->b, p->u, p->name, intern_buffer(p->term), 1);
                break;
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
