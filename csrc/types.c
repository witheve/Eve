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

void print(buffer b, value v)
{
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

    
