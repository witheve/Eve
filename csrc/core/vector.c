#include <core.h>


static inline vector va_construct_vector(heap h, va_list a)
{
    vector v = allocate_vector(h, 10);
    void *n;

    while ((n = va_arg(a, void *)) != END_OF_ARGUMENTS)
        vector_insert(v, n);

    return(v);
}


vector build_vector_internal(heap h, ...)
{
    va_list a;
    va_start(a, h);
    return(va_construct_vector(h, a));
}


void vector_set(vector t, int index, void *n)
{
    int b = index * sizeof(void *);
    int e = b + sizeof(void *);
    buffer_extend(t, e);
    int z = t->end;

    if (z < e) {
        memset(bref(t, z), 0, (e-z)/8);
        t->end = e;
    }
    *((void **)bref(t, b)) = n;    
}

static void vector_elements(vector v, u32 i)
{
    *i = vector_length(v);
}

void vector_insert(vector t, void *n)
{
    buffer_append(t, &n, sizeof(void *)); 
}

vector allocate_vector(heap h, int elements)
{
    return(allocate_buffer(h, elements*sizeof(void *)));
}

void *vector_get(vector v, int element)
{
    if (element >= vector_length(v)) return(false);
    return(*(void **)bref(v, element*sizeof(void *)));
}


