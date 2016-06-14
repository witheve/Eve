#include <runtime.h>
#include <unix/unix.h>


static heap uuid_heap;

// uuid - mix these around 
// 1 | 37 *time | 10 * node | 16* batch
static void uuid_print(buffer b, void *x, heap h) {
}

// serialization length
static iu64 uuid_length(void *x) {
    return UUID_LENGTH;
}

static boolean uuid_compare(void *x, void *y)
{
    return memcmp(x, y, UUID_LENGTH) == 0;
}

static iu64 uuid_hash(void *x)
{
    return (*(iu64 *)x) ^ (*(iu32 *)(x+8));
}


static int uuid_serialize(buffer dest, void *x)
{
    buffer_write(dest, x, UUID_LENGTH);
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


static table interned_uuid;

//binary
uuid intern_uuid(unsigned char *x)
{
    void *result;
    // atomicity;
    if (!(result = table_find(interned_uuid, x))) {
        result = allocate(uuid_heap, UUID_LENGTH);

        memcpy(result, x, UUID_LENGTH);
        table_set(interned_uuid, result, result);
    }
    return result;
}


uuid generate_uuid()
{
    static int count = 0;
    // top bit has to be clear for serialization
    void *result = allocate(uuid_heap, UUID_LENGTH);
    ticks z = now();
    memcpy(result, &z, 8);
    *((unsigned short *)result + 4) = count++;
    unsigned char *y = result;
    table_set(interned_uuid, result, (void *)1);
    return result;
}

void init_uuid()
{
    uuid_heap = init_fixed_page_region(init, uuid_space, uuid_space + region_size, pages->pagesize);
    interned_uuid = allocate_table(efence, uuid_hash, uuid_compare);
}


void uuid_base_print(char *dest, void *source)
{
    unsigned char *x = source;
    for (int i= 0; i <UUID_LENGTH; i++) {
        dest[i*2] = hex_digits[x[i] >>4];
        dest[i*2+1] = hex_digits[x[i] & 0xf];
    }
}

