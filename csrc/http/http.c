    
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

typedef header_parser {
   header_handler h;
   bag b;
   uuid u;
   buffer term;
   estring name;
   boolean response;
   header_state s;
   value headers[3];
   reader_handler self;
} *header_parser;

CONTINUATION_2_1(header_parser, buffer, thunk)
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
                apply(p->h, p->bag, p->u, b, reg);
                return;
            }
            switch(p->s++) {
            case method:
            case url:
            case version:
                edb_insert(p->b, p->n, p->headers[p->s], intern_buffer(term), 1);
                break;
            case name:
                p->name = intern_buffer(term);
                break;
            case property:
                p->s = name;
                edb_insert(p->b, p->n, p->name, intern_buffer(term), 1);
                break;
            }
            buffer_clear(term);
        } else {
            buffer_write_byte(s->term, c);
        }
    }
    apply(reg, self);
}

    
read_handler new_guy(heap h, header_handler result_handler, value a, value b, value c)
{
    header_parser p = allocate(h, sizeof(struct header_parser));
    p->h = result;
    p->response = response;
    p->headers[0] = a;
    p->headers[1] = b;
    p->headers[2] = c;
    p->term = allocate_buffer(h);
    p->self = cont(h, parse_http_header);
    return p->self;
}


read_handler request_header_parser(heap h, header_handler result_handler)
{
    return new_guy(h, result_handler, sym(method), sym(url), sym(version)); 
}

    
read_handler response_header_parser(heap h, header_handler result_handler)
{  
    return new_guy(h, result_handler, sym(method), sym(url), sym(version)); 
}
