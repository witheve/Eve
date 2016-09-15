#include <runtime.h>
#include <serialize.h>

typedef struct deserialize {
    closure(handler, value);
    buffer partial;
    value (*translate)(); // saves some switches, wasted some time
    u64 length;
} *deserialize;


// if we made a macro for write, we could share this with package.c
static inline void encode_integer(buffer dest, int offset, byte base, u64 value)
{
    int len = first_bit_set(value) + 1;
    int space = 7 - offset;
    byte out = base ;
    int total = pad(len + offset, 7);
    total -= offset;

    while (total > 0) {
        buffer_write_byte(dest, out | ((total > space)?(1<<space):0) | extract(value, total, space));
        total -= space;
        space = 7;
        out = 0;
    }
}


static inline boolean decode_integer(buffer source, int offset, u64 *value)
{
    u64 result = 0;
    int index = 0;
    int blen = buffer_length(source);
    int off = 7-offset;
    while (index < blen) {
        byte b = *(byte *)bref(source, index);
        index++;
        result = (result << off) | (b & ((1<<off) - 1));
        if (!(b & (1<<off))) {
            *value = result;
            source->start += index;
            return true;
        }
        off = 7;
    }
    return false;
}

// streaming version too please
void serialize_value(buffer dest, value v)
{

    switch(type_of(v)) {
    case register_space:
        switch((u64) v) {
        case (u64)efalse: buffer_write_byte(dest, false_constant); break;
        case (u64)etrue: buffer_write_byte(dest, true_constant); break;
        case (u64)register_ignore: buffer_write_byte(dest, ignore_constant); break;
        default:
            buffer_write_byte(dest, register_prefix);
            encode_integer(dest, 0, 0, toreg(v));
        }
    case estring_space:
        {
            estring s = (estring)v;
            encode_integer(dest, 2, 0x40, s->length);
            buffer_append(dest, s->body, s->length);
            break;
        }

    case float_space:
        {
            double *x = v;
            buffer_write_byte(dest, float64_prefix);
            buffer_append(dest, x, 8);
            break;
        }

    case uuid_space:
        buffer_append(dest, v, 12);
        break;
    }
}

void serialize_edb(buffer dest, edb db)
{
    edb_foreach(db, e, a, v, m, u) {
        /*
         * seems excessive to frame every triple, but not being able to detect
         * synch loss in a dense encoding is a real weak point, imagine throwing
         * in a synch with a count every once and a while
         *
         * we would also like to compress using runs of E and EA, or i guess A
         */
        serialize_value(dest, e);
        serialize_value(dest, a);
        serialize_value(dest, v);
    }
}

static void move(buffer d, buffer s)
{
    buffer_write_byte(d, *(u8 *)bref(s, 0));
    s->start++;
}

// endian
static value intern_float(void *x) {return box_float(*(double *)x);}

static CONTINUATION_1_2(deserialize_input, deserialize, buffer, thunk);
static void deserialize_input(deserialize d, buffer b, thunk finished)
{
    // find the object and the length
    while (d->partial || b) {
        if (d->partial) {
                // if we dont know the length, we'll try a byte at a time, its sad, but n
                // should be quite small here, and there are ways to shortcut this if
                // there is a really a problem. just trying to avoid expanding partial
                // and copying b just for a lousy length field
            if (b && (d->translate == 0))
                move(d->partial, b);
        } else {
            d->partial = b;
            b = 0;
        }
        
        if (!d->translate) {
            byte z = *(u8 *)bref(d->partial, 0);
            
            // uuid case - since we used a single bit, the tag is included
            if ((z & 0x80) == 0x80) {
                d->length = 12;
                d->translate = intern_uuid;
                continue;
            }
            
            // string case
            if ((z & 0x40) == 0x40) {
                if (!decode_integer(d->partial, 2, &d->length)) return;
                d->translate = (value (*)())intern_string;
                continue;                
            }
            
            // singletons
            switch (z) {
            case float64_prefix:
                d->length = 8;
                d->translate = intern_float;
                continue;
            case true_constant: apply(d->handler, etrue);  break;
            case false_constant: apply(d->handler, efalse); break;
            default:
                prf("serialization error\n");
            }
            d->partial->start++;
        } else {
            if (d->translate) {
                if (buffer_length(d->partial) >= d->length) {
                    apply(d->handler, d->translate(bref(d->partial, 0), d->length));
                    if ((d->partial->start += d->length) ==  d->partial->end) {
                        // free
                        d->partial = 0;
                    }
                    d->translate = 0;
                    d->length = 0;
                }
            } else return;
        }
    }
    apply(finished);
}


buffer_handler allocate_deserialize(heap h, closure(handler, value))
{
    deserialize d = allocate(h, sizeof(struct deserialize));
    d->handler = handler;
    d->partial = 0;
    d->translate = 0;
    d->length = 0;
    return cont(h, deserialize_input, d);
}
