#include <runtime.h>
#include <unix.h>

static table symbol_table;

boolean si_compare(void *a, void *b) 
{
    string_intermediate sia = a, sib = b;
    if (sia->length != sib->length) return false;
    return !memcmp(sia->body, sib->body, sia->length);
}


static iu64 shash(unsigned char *content, int length)
{
    unsigned h = 0;
    
    for (int i = 0; i < length; i++) {
        h += content[i];
        h += (h << 10);
        h ^= (h >> 6);
    }
    h += (h << 3);
    h ^= (h >> 11);
    h += (h << 15);
    return h;
}

iu64 si_hash(void *z)
{
    string_intermediate si = z;
    return shash(si->body, si->length);
}

static void string_print(buffer b, void *x, heap h)
{
}

static iu64 estring_length(void *x) {
    return 12;
}


iu64 string_hash(void *x)
{
    buffer b = x;
    return shash(bref(b, 0), buffer_length(b));
}

boolean string_equal(void *a, void *b)
{
    buffer ba = a;
    buffer bb = b;
    if (buffer_length(ba) != buffer_length(bb)) return false;
    return memcmp(bref(ba, 0), bref(bb, 0), buffer_length(ba))?false:true;
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
        table_set(interned_string, x, x);
    }
    return x;
}
    
void init_string()
{
    interned_string = allocate_table(init, si_hash, si_compare);
    estring_heap = init_fixed_page_region(init, interned_space, interned_space + region_size, pages->pagesize);
}
