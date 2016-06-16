#include <runtime.h>
#include <unix/unix.h>

static void string_print(buffer b, void *x, heap h)
{
}

static iu64 estring_length(void *x) {
    return 12;
}

struct type string_methods = {
    string_print,
    estring_length,
    string_hash,    
};

static table interned_string;
static heap estring_heap;

estring intern_string(unsigned char* content, int length) {
    struct estring si = {length, content};
    estring x;
    // racy
    if (!(x = table_find(interned_string, &si))) {
        x = allocate(estring_heap, sizeof(struct estring));
        x->length = length;
        x->body = allocate(estring_heap, length);
        memcpy(x->body, content, length);
        table_set(interned_string, x, x);
    }
    return x;
}

void init_string()
{
    interned_string = allocate_table(init, si_hash, si_compare);
    heap string_region = init_fixed_page_region(init,
                                                estring_space, 
                                                estring_space + region_size,
                                                pages->pagesize);
    estring_heap = allocate_rolling(string_region);
}
