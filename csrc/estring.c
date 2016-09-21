#include <runtime.h>

static u64 estring_length(void *x) {
    return 12;
}

static table interned_string;
heap estring_heap;

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

void init_estring()
{
    heap string_region = init_fixed_page_region(init,
                                                estring_space, 
                                                estring_space + region_size,
                                                pages->pagesize,
                                                false);
    estring_heap = allocate_rolling(string_region, sstring("estring"));
    interned_string = allocate_table(estring_heap, si_hash, si_compare);
}
