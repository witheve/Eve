#include <runtime.h>


iu32 vector_length(vector v)
{
    return(buffer_length(v)/bitsizeof(void *));
}

void vector_set(vector t, int index, value n)
{
    int b = index * bitsizeof(value);
    int e = b + bitsizeof(value);
    buffer_extend(t, e);
    int z = t->end;

    if (z < e) {
        memset(bref(t, z), 0, (e-z)/8);
        t->end = e;
    }
    *((value *)bref(t, b)) = n;    
}

static void vector_elements(vector v, u32 i)
{
    *i = vector_length(v);
}

static void vector_value_set(vector v, u32 i, value x)
{
    vector_set(v, *i, x);
}

static inline value vector_get(vector v, value i)
{
    /* generalize extraction - this needs to filter out keys with the wrong type!
     */
    u32 u = i;
    return(vector_ref(v, *u));
}

/*
static void print_vector(string b, vector v)
{
    value i;
    boolean a = false;
  
    bprintf(b, "[");
    vector_foreach(i, v) {
        if (a) bprintf (b, " ");
        a = true;
        print(b, i);
    }
    bprintf(b, "]");
}
*/

static void key_from_vector(u64 k, value z)
{
    vector v=z;
    key result = 0;
    value i;

    vector_foreach (i, v)
        result ^= key_of(i);
    
    *k = result;
}

boolean vector_equal(vector x, vector y)
{
    iu32 lx = vector_length(x), ly = vector_length(y);
    iu32 i = 0;

    if (lx == ly){
        for (i=0; i < lx ;i++)
            if (!equals(vector_ref(x, i), vector_ref(y, i)))
                return(false);
        return(true);
    }
    return(false);
}

void vector_insert(vector t, value n)
{
    buffer_append(t, &n, bitsizeof(value)); 
}

vector allocate_vector(heap h)
{
    return(allocate_buffer(h, 4*bitsizeof(value)));
}

value vector_ref(vector v, int element)
{
    if (element >= vector_length(v)) return(false);
    return(*(value *)bref(v, element*bitsizeof(void *)));
}


