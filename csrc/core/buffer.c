#include <core.h>

static char *hex_digit="0123456789abcdef";
void print_byte(buffer s, iu8 f)
{
    string_insert(s, hex_digit[f >> 4]);
    string_insert(s, hex_digit[f & 15]);
}

void print_hex_buffer(buffer s, buffer b)
{
    int len = buffer_length(b);
    int wlen = 32;
    int rowlen = wlen * 4;
    boolean first = true;

    for (int i = 0 ; i<len ; i+= 8) {
        if (!(i % rowlen)) {
            if (!first) bprintf(s, "\n");
            first = false;
            print_byte(s, i>>24);
            print_byte(s, i>>16);
            print_byte(s, i>>8);
            print_byte(s, i);
            bprintf(s, ":");
        }
        if (!(i % wlen)) bprintf (s, " ");
        print_byte(s, *(u8)bref(b, i));
    }
    // better handling of empty buffer
    bprintf(s, "\n");
}

void buffer_write(buffer b, void *source, bytes length)
{
    memcpy(bref(b, b->end-b->start), source, length);
    buffer_produce(b, length);
}

boolean buffer_read(buffer b, void *dest, bytes length)
{
    if (buffer_length(b) < length) return(false);
    memcpy(dest, bref(b, 0), length);
    buffer_consume(b, length);
    return(true);
}

void buffer_copy(buffer dest, bytes doff,
                 buffer source, bytes soff,
                 bytes length)
{ 
    memcpy((void *)dest->contents+((dest->start + doff)),
           (void *)source->contents+((soff+source->start)),
           length);
}

buffer buffer_concat(heap h, buffer a, buffer b)
{
    bytes la = buffer_length(a);
    bytes lb = buffer_length(b);
    buffer c = allocate_buffer(h, la + lb);
    memcpy(c->contents, a->contents, la);
    memcpy(c->contents + la, b->contents, lb);
    c->end = la + lb;
    return(c);
}

void buffer_zero(buffer b)
{
    memset(b->contents+b->start, 0, pad(b->end-b->start, 8));
}

buffer allocate_buffer(heap h, bytes s)
{
    int len = sizeof(struct buffer) + s;
    buffer b = allocate(h, len);
    b->length = s;
    b->start = 0;
    b->end = 0;
    b->length = s;
    b->h = h;
    b->contents = (void *)(b+1);
    // optional?
    buffer_zero(b);
    return(b);
}


void buffer_prepend(buffer b,
                      void *body,
                      bytes length)
{
    if (b->start < length) {
        buffer new = allocate_buffer(b->h, buffer_length(b) + length);
        buffer_write(new, body, length);
        buffer_write(new, bref(b, 0), buffer_length(b));
    } else {
        b->start -= length;
        memcpy(bref(b, b->start), body, length);
    }
}


void buffer_append(buffer b,
                     void *body,
                     bytes length)
{
    buffer_extend(b, length);
    buffer_write(b, body, length);
}
