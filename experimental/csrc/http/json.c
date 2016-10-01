#include <runtime.h>
#include <http/http.h>
#include <math.h>

typedef struct json_parser *json_parser;
typedef void *(*parser)(json_parser, character);
typedef parser (*completion)(json_parser);

#define numeric(__p, __c, __start, __end, __offset, __base)\
    (((__c <= __end) && (__c >= __start))?                                \
     (__p->number = __p->number * __base + (__c - __start + __offset), true):false)


void escape_json(buffer out, string current)
{
    buffer_write_byte(out , '"');
    string_foreach(current, ch) {
        if(ch == '\\' || ch == '"') {
            bprintf(out , "\\");
        } else if(ch == '\n') {
            bprintf(out , "\\n");
            continue;
        } else if(ch == '\t') {
            bprintf(out , "\\t");
            continue;
        }
        buffer_write_byte(out , ch);
    }
    buffer_write_byte(out , '"');
}

void print_value_json(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        bprintf(out , "{\"type\" : \"uuid\", \"value\" : \"%X\"}", alloca_wrap_buffer(v, UUID_LENGTH));
        break;
    case float_space:
        bprintf(out, "%v", v);
        break;
    case estring_space:
        {
            estring si = v;
            buffer current = alloca_wrap_buffer(si->body, si->length);
            escape_json(out, current);
        }
        break;
    case register_space:
        if (v == etrue) {
            bprintf(out, "true");
            break;
        }
        if (v == efalse) {
            bprintf(out, "false");
            break;
        }

        if (((u64)v & ~0xff) == register_base) {
            bprintf(out, "\"r%d\"", (unsigned long)v - register_base);
            break;
        }
        break;
    default:
        prf ("wth!@ %v\n", v);
    }
}

void print_value_vector_json(buffer out, vector vec) {
  bprintf(out, "[");
  boolean multi = false;
  vector_foreach(vec, current) {
      bprintf(out, multi ? ", " : "");
      print_value_json(out, current);
      multi = true;
  }
  bprintf(out, "]");
}

static void json_encode_internal(buffer dest, bag b, uuid n);

static CONTINUATION_3_5(json_encode_cont, buffer, bag, boolean *, value, value, value, multiplicity, uuid);
static void json_encode_cont(buffer dest, bag b, boolean * start, value e, value a, value v, multiplicity m, uuid bku) {
    bprintf(dest, "%s%v:", (*start ? "" : ","), a);
    *start = false;
    json_encode_internal(dest, b, v);
}

static void json_encode_internal(buffer dest, bag b, uuid n)
{
    boolean start = true;
    if (type_of(n) == uuid_space) {
        if (lookupv((edb)b, n, sym(tag)) == sym(array)){
            bprintf(dest, "[");
            value t;
            // grr, box float small int
            for (int i = 1; (t = lookupv((edb)b, n, box_float(i))); i++){
                bprintf(dest, "%s", start?"":",");
                json_encode_internal(dest, b, t);
                start = false;
            }
            bprintf(dest, "]");
        } else {
            bprintf(dest, "{");
            apply(b->scan_sync, s_Eav, cont(dest->h, json_encode_cont, dest, b, &start), n, 0, 0);
            if(start == true) { // unable to de-ref, so embed directly
                bprintf(dest , "\"type\" : \"uuid\", \"value\" : \"%X\"", alloca_wrap_buffer(n, UUID_LENGTH));
            }
            bprintf(dest, "}");
        }
    } else print_value_json(dest, n);
}

buffer json_encode(heap h, bag b, uuid n)
{
    buffer dest = allocate_buffer(h, 100);
    json_encode_internal(dest, b, n);
    return dest;
}

struct json_parser {
    heap h;
    value v;
    object_handler out;
    bag b;

    parser p;
    buffer string_result;
    buffer check;
    double float_result;
    u64 number;

    // well, we replaced the comparatively expension continuation stack with
    // all these different stacks...they could be unified, but meh
    vector completions;
    vector ids;
    vector indices;
    vector tags;

    closure(error, char *);
    reader self;
};

static void *parse_value(json_parser p, character c);

static inline boolean whitespace(character x)
{
    if ((x == 0x20) ||
        (x == 0x09) ||
        (x == 0x0a) ||
        (x == 0x0d)) return true;
    return false;
}

static char escape_map[] = {
    0x22,  0x22, // " quotation mark
    0x5C,  0x5c, // \ reverse solidus
    0x2F,  0x2f, // / solidus
    0x62,  0x08, // b, backspace
    0x66,  0x0c, // f, form feed
    0x6E,  0x0a, // n, line feed
    0x72,  0x0d, // r, carriage retur
    0x74,  0x09, // t, tab
};

 static char real_escape_map_storage[0x80];
 static char *real_escape_map = 0;


#define complete(__p)  ((completion)pop(__p->completions))(__p)
#define error(__text) return ((void *)0);

static void *parse_string(json_parser p, character c);


static void *parse_decimal_number(json_parser p, character c)
{
    if (numeric(p, c, '0', '9', 0, 10)) return parse_decimal_number;
    return complete(p)(p, c);
}

//
// float
//
static void *finish_float(json_parser p)
{
    p->v = box_float(p->float_result);
    return complete(p);
}

static void *negate(json_parser p)
{
    p->v = box_float(-p->float_result);
    return complete(p);
}

static void *exponent_complete(json_parser p)
{
    p->float_result = p->float_result * pow(10.0, (double)(p->number));
    return complete(p);
}

//  xxx presumably the exponent can be negative
static void *check_exp(json_parser p, character c)
{
    if ((c == 'e') || (c == 'E')) {
        push(p->completions, exponent_complete);
        p->number = 0;
        return parse_decimal_number;
    }
    return complete(p)(p, c);
}

static void *parse_fractional(json_parser p, character c)
{
    if ((c >= '0') && (c <= '9')) {
        p->float_result += (c - '0') / (double) p->number;
        p->number *= 10;
        return parse_fractional;
    }
    return check_exp(p, c);
}

static void *parse_float(json_parser p, character c)
{
    if (numeric(p, c, '0', '9', 0, 10)) return parse_float;
    p->float_result = (double)p->number;
    if (c == '.') {
        p->number = 10;
        return parse_fractional;
    }
    return check_exp(p, c);
}

static void *parse_hex_number(json_parser p,  character c)
{
    if (numeric(p, c, '0', '9', 0, 10)) return parse_hex_number;
    if (numeric(p, c, 'a', 'f', 10, 16)) return parse_hex_number;
    if (numeric(p, c, 'A', 'F', 10, 16)) return parse_hex_number;
    return complete(p);
}

//
// strings
//
// some crap about 'surrogate pair' for unicode values greater than 16 bits
static void *unicode_complete(buffer b, void *x)
{
    string_insert_rune(b, *(u64 *)x);
    return parse_string;
}

static void *parse_backslash(json_parser p, character c)
{
    if (c == 'u') {
        push(p->completions, unicode_complete);
        // xxx - really this is supposed to be exactly 4 digits
        return parse_hex_number;
    }
    character trans = c;
    if (c < sizeof(real_escape_map_storage)) {
        if (!(trans = real_escape_map[c]))
            trans = c;
    }
    string_insert_rune(p->string_result, trans);
    return parse_string;
}

static void *parse_string(json_parser p, character c)
{
    if (c == '\\') return parse_backslash;
    if (c == '"')  {
        p->v = intern_buffer(p->string_result);
        return complete(p);
    }
    string_insert_rune(p->string_result, c);
    return parse_string;
}

//
// arrays
//
static void *complete_array(json_parser p)
{
    p->v = pop(p->ids);
    pop(p->indices);
    return complete(p);
}

static parser value_complete_array(json_parser p);
static void *next_array(json_parser p, character c)
{
    switch(c) {
    case ',':
        push(p->completions, value_complete_array);
        return parse_value;
    case ']':
        return complete_array(p);
    default:
        if (whitespace(c)) return next_array;
        error("unexpected character at");
    }
}

static parser value_complete_array(json_parser p)
{
    u64 count = (u64)pop(p->indices);
    // block?
    apply(p->b->insert, peek(p->ids), box_float(count), p->v, 1, 0);
    count++;
    push(p->indices, (void *)count);
    return next_array;
}

// unfortunately zero is a special case
static void *first_array_element(json_parser p, character c)
{
    if(c == ']') return complete_array(p);
    push(p->completions, value_complete_array);
    return(parse_value(p, c));
}

static void *start_array(json_parser p)
{
    push(p->ids, generate_uuid());
    apply(p->b->insert, peek(p->ids), sym(tag), sym(array), 1, 0);
    push(p->indices, (void *)1);
    return first_array_element;
}

//
// objects
//
static void *next_object(json_parser p, character c);

static void *value_complete_object(json_parser p)
{
    // block?
    apply(p->b->insert, peek(p->ids), pop(p->tags), p->v, 1, 0);
    return next_object;
}

static void *check_sep(json_parser p, character c)
{
    if (whitespace(c)) return check_sep;
    if (c == ':') {
        push(p->completions, value_complete_object);
        return parse_value;
    }
    error("expected separator");
}

static void *complete_tag(json_parser p)
{
    push(p->tags, intern_buffer(p->string_result));
    return check_sep;
}

static void *parse_attribute(json_parser p, character c)
{
    switch(c) {
    case '"':
        push(p->completions, complete_tag);
        buffer_clear(p->string_result);
        return parse_string;
    // xxx - this allows ",}"
    case '}':
        p->v = pop(p->ids);
        return complete(p);
    default:
        if (whitespace(c)) return parse_attribute;
        error("i was looking for a tag, what did i find?");
    }
}

static void *next_object(json_parser p, character c)
{
    switch(c) {
    case ',':
        return parse_attribute;
    case '}':
        p->v = pop(p->ids);
        return complete(p);
    default:
        if (whitespace(c)) return next_object;
        error("unexpected character at");
    }
}

static void *start_object(json_parser p)
{
    push(p->ids, generate_uuid());
    return parse_attribute;
}

//
// immediates
//
static void *parse_immediate(json_parser p, character c)
{
    if (c == *(unsigned char *)bref(p->check, p->number)) {
        p->number++;
        if (p->number == buffer_length(p->check))
            return complete(p);
        return parse_immediate;
    }
    error("syntax error");
}

static void *start_immediate(json_parser p, buffer b, value v)
{
    p->check = b;
    p->number = 1;
    p->v = v;
    return  parse_immediate;
}

static void *parse_value(json_parser p, character c)
{
    if (c == '-') {
        p->float_result = 0.0;
        push(p->completions, negate);
        return parse_float;
    }

    if ((c >= '0') && (c <= '9')) {
        p->float_result = 0.0;
        p->number = 0;
        push(p->completions, finish_float);
        return parse_float(p, c);
    }

    switch(c) {
    case '{': return start_object(p);
    case '[': return start_array(p);
    case '"':
        buffer_clear(p->string_result);
        return parse_string;
    case 'f': return start_immediate(p, sstring("false"), efalse);
    case 't': return start_immediate(p, sstring("true"), etrue);
    case 'n': return start_immediate(p, sstring("null"), 0);
    default:
        if (whitespace(c)) return parse_value;
    }
    error("syntax error looking for value at");
}

static void *json_top(json_parser p, character c);
static parser top_complete(json_parser p)
{
    // no flow control
    apply(p->out, p->b, p->v);
    push(p->completions, top_complete);
    return json_top;
}

static void *json_top(json_parser p, character c)
{
    switch(c) {
    case '{':
        p->b = (bag)create_edb(p->h, 0);
        return start_object(p);
    case '[':
        p->b = (bag)create_edb(p->h, 0);
        return start_array(p);
    default:
        if (whitespace(c)) return json_top;
        error("syntax error looking for value at");
    }
}

static CONTINUATION_1_2(json_input, json_parser, buffer, register_read);
static void json_input(json_parser p, buffer b, register_read r)
{
    if (!b) {
        if (vector_length(p->ids))
            apply(p->error, "unterminated json");
        apply(p->out, 0, 0);
        return;
    }
    while(1) {
        int len, blen = buffer_length(b);
        if (!blen) {
            apply(r, p->self);
            return;
        }

        character c = utf8_decode(bref(b, 0), &len);
        if (len <= blen) {
            p->p = p->p(p, c);
            if (!p->p) prf("error: %c\n", c);
            b->start += len;
        } else prf("oh man, framing boundary split a utf8, what am i ever going to do? %d %d\n", len, blen);
    }
}

object_handler parse_json(heap h, endpoint e, object_handler j)
{
    if (!real_escape_map) {
        real_escape_map = real_escape_map_storage;
        for (int i = 0; i < sizeof(escape_map); i+= 2)
            real_escape_map[escape_map[i]] = escape_map[i+1];
    }
    json_parser p= allocate(h, sizeof(struct json_parser));
    p->h = h;
    p->completions = allocate_vector(p->h, 10);
    p->ids = allocate_vector(p->h, 10);
    p->indices = allocate_vector(p->h, 10);
    p->tags = allocate_vector(p->h, 10);
    p->out = j;
    p->string_result = allocate_buffer(p->h, 20);
    push(p->completions, top_complete);
    p->p = json_top;
    p->self = cont(p->h, json_input, p);
    apply(e->r, p->self);
    // for symmetric json
    return 0;
}
