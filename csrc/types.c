#include <runtime.h>


extern type estring_methods;
extern type bignum_methods;
extern type smallnum_methods;
extern type efloat_methods;
extern type uuid_methods;


iu64 key_of(value v)
{
    return (0);
}

void print_value(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        // FIXME: is it sketchy to write this on the buffer's heap?
        bprintf(out , "⦑%X⦒", wrap_buffer(out->h, v, UUID_LENGTH));
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
        printf(1, "wth!@\n", 6);
    }
}

// assumes bibop and interned strings and uuids
boolean equals(value a, value b)
{
    if (a == b) return true;
    if ((type_of(a) == float_space) && (type_of(b) == float_space)) {
        return *(double *)a == *(double *)b;
    }
    return false;
}

void init_types()
{
}

    
