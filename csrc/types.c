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

void print_value(buffer b, value v)
{
    switch(type_of(v)){
    case uuid_space:
        uuid_base_print(b, v);
        break;
    case float_space:
        char temp[64];
        int c = sprintf(temp, "%g",  *(double *)v);
        buffer_append(b, temp, c);
        break;
    case estring_space:
        string_intermediate si = x;
        buffer_append(b, "\"", 1);
        buffer_append(b, si->body, si->length);
        buffer_append(b, "\"", 1);
        break;
    case register_space:
        if (x == etrue) {
            bprintf(b, "true");
        }
        if (x == efalse) {
            bprintf(b, "false");
        }
        break;
    default:
        printf ("what the hell! %p %lx %p %p\n", x, t, efalse, etrue);
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

    
