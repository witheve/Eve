#include <runtime.h>
#include <unix.h>

static table symbol_table;

boolean si_compare(void *a, void *b) 
{
    string_intermediate sia = a, sib = b;
    if (sia->length != sib->length) return false;
    return !memcmp(sia->body, sib->body, sia->length);
}


iu64 si_hash(void *z)
{
    string_intermediate si = z;
    unsigned h = 0;

    for (int i = 0; i < si->length; i++) {
        h += si->body[i];
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

static table interned_string;
static heap estring_heap;

estring intern_string(unsigned char* content, int length) {
    struct string_intermediate si = {length, content};
    struct string_intermediate *x;
    // racy
    if (!(x = table_find(interned_string, &si))) {
        x = allocate(estring_heap, sizeof(struct string_intermediate));
        x->length = length;
        x->body = allocate(estring_heap, length);
        memcpy(x->body, content, length);
        table_set(interned_string, x, (void *)1);
    }
    return x;
}
    
void init_string()
{
    interned_string = allocate_table(init, si_hash, si_compare);
    estring_heap = init_fixed_page_region(init, interned_space, interned_space + region_size, pages->pagesize);
}
