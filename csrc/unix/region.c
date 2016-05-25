#include <unix_internal.h>

 
typedef struct region_heap {
    struct heap h;
    iu64 base, max, fill;
} *region_heap;


// ok, this needs to have a fill pointer..this is why we are allocating so many damn pages
static void *allocate_pages(heap h, bytes s)
{
    region_heap r = (void *)h;
    unsigned int length =  pad(s, h->pagesize);
    // check upper bound and fail
    void *p = mmap((void *)r->fill, length,
                   PROT_READ|PROT_WRITE,
                   MAP_PRIVATE|MAP_ANON|MAP_FIXED,
                   -1,0);
    if (p == MAP_FAILED) return 0;
    // atomic increment
    r->fill += length;
    return(p);
}

static void free_pages(heap h, void *x)
{
    // xxx - this doesn't free the whole page if its a multipage allocation
    munmap(x, h->pagesize);
}

boolean in_region(region_heap r, void *p) {
    unsigned long x = (unsigned long)p;
    return ((x >= r->base) && (x <= r->fill));
}

     
heap init_fixed_page_region(heap meta,
                            iu64 base_address,
                            iu64 max_address,
                            bytes pagesize)
{
    region_heap r = allocate(meta, sizeof(struct region_heap));
    r->h.alloc = allocate_pages;
    r->h.dealloc = free_pages;
    r->h.pagesize = pagesize;
    r->base = base_address;
    r->fill = r->base;
    r->max = max_address;
    return (heap)r;
}
