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

extern int sprintf(char *, const char *, ...);

void print_value(buffer b, value v)
{
    switch(type_of(v)){
    case uuid_space:
        bprintf(b , "⦑%X⦒", wrap_buffer(b->h, v, UUID_LENGTH));
        break;
    case float_space:
        {
            char temp[64];
            int c = sprintf(temp, "%g",  *(double *)v);
            buffer_append(b, temp, c);
        }
        break;
    case estring_space:
        {
            string_intermediate si = v;
            buffer_append(b, "\"", 1);
            buffer_append(b, si->body, si->length);
            buffer_append(b, "\"", 1);
        }
        break;
    case register_space:
        if (v == etrue) {
            bprintf(b, "true");
        }
        if (v == efalse) {
            bprintf(b, "false");
        }
        break;
    default:
<<<<<<< d6699ccb1b353206010aa58dd4524e1487b99716
        printf(1, "wth!@\n", 6);
=======
        prf ("corrupt value %p\n", v);
>>>>>>> plumb tracing as a flag through the compiler, fix register access the tracer, fix up print_value
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

    
