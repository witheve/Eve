#include <runtime.h>
#include <bswap.h>


heap uuid_heap;

// 1 | 37 *time | 10 * node | 16* batch

// serialization length
static u64 uuid_length(void *x) {
    return UUID_LENGTH;
}

static boolean uuid_compare(void *x, void *y)
{
    return memcmp(x, y, UUID_LENGTH) == 0;
}

static u64 uuid_hash(void *x)
{
    return (*(u64 *)x) ^ (*(u32 *)(x+8));
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


static table interned_uuid;

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

uuid parse_uuid(string c)
{
    unsigned char u[UUID_LENGTH];
    int phase = 0;
    int count = 0;
    int result = 0;
    rune_foreach(c, i) {
        result = result<<4 | digit_of(i);
        if (!(phase ^= 1)) {
            u[count++] = result;
            result =0;
        }
    }
    return (intern_uuid(u));
}

uuid generate_uuid()
{
    static int count = 0;
    // top bit has to be clear for serialization
    void *result = allocate(uuid_heap, UUID_LENGTH);
    ticks z = now();
    z = htonl(z);
    memcpy(result, &z, 8);
    *((unsigned short *)result + 4) = count++;
    unsigned char *y = result;
    table_set(interned_uuid, result, (void *)result);
    return result;
}

void init_uuid()
{
    uuid_heap = allocate_rolling(init_fixed_page_region(init, uuid_space, uuid_space + region_size, pages->pagesize),
                                 sstring("uuid"));
    interned_uuid = allocate_table(uuid_heap, uuid_hash, uuid_compare);
}


void uuid_base_print(char *dest, void *source)
{
    unsigned char *x = source;
    for (int i= 0; i <UUID_LENGTH; i++) {
        dest[i*2] = hex_digits[x[i] >>4];
        dest[i*2+1] = hex_digits[x[i] & 0xf];
    }
}
