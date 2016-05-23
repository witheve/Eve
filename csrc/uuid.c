#include <runtime.h>

// uuid - mix these around 
// 1 | 37 *time | 10 * node | 16* batch
static void uuid_print(buffer b, void *x, heap h) {
}

// serialization length
static iu64 uuid_length(void *x) {
    return 12;
}

static iu64 uuid_hash(void *x)
{
    return 0;
}


static int uuid_serialize(buffer dest, void *x)
{
    buffer_write(dest, x, 12);
    return 0;
}

static void *uuid_deserialize(buffer source)
{
    return 0;
}

    
struct type uuid_methods = {
    uuid_print,
    uuid_length,
    uuid_hash,
    uuid_serialize,
    uuid_deserialize
};
    

//binary
uuid intern_uuid(unsigned char *x)
{
    return 0;
}
    
                 
uuid generate_uuid() {
        return 0;
}
    
