#include <runtime.h>

static table symbol_table;

iu64 oat_hash(unsigned char *key, int len)
{
    unsigned h = 0;

    for (int i = 0; i < len; i++) {
        h += key[i];
        h += (h << 10);
        h ^= (h >> 6);
    }
    h += (h << 3);
    h ^= (h >> 11);
    h += (h << 15);
    return h;
}

static void string_print(buffer b, void *x, heap h)
{
}

static iu64 estring_length(void *x) {
    return 12;
}


static iu64 string_hash(void *x)
{
    return 0;
}


struct type string_methods = {
    string_print,
    estring_length,
    string_hash,    
};

string intern_string(unsigned char* content, int length) {
    return 0;
}


    
void init_string()
{
}
