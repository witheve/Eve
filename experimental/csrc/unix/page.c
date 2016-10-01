#include <unix_internal.h>

typedef struct page_heap {
    struct heap h;
    void **freelist;
} *page_heap;

static void *allocate_pages(heap h, bytes s)
{
    page_heap p = (page_heap)h;
    int baselen = pad(s, h->pagesize);
    void *r;
    
    if ((baselen == h->pagesize)  && p->freelist) {
        r = p->freelist;
        p->freelist = *p->freelist;
    } else {
        r = mmap(0, baselen,
                 PROT_READ|PROT_WRITE,
                 MAP_PRIVATE|MAP_ANON,
                 -1,0);
    }
    return(r);
}

static void *allocate_pages_fence(heap h, bytes s)
{
    int baselen = pad(s, h->pagesize);
    void *p = mmap(0,  baselen + h->pagesize,
                   PROT_READ|PROT_WRITE,
                   MAP_PRIVATE|MAP_ANON,
                   -1,0);
    mprotect(p + baselen, h->pagesize, 0);

    return(p);
}

static void free_pages(heap h, void *x, bytes size)
{
    page_heap p = (page_heap)h;
    *(void **) x = p->freelist;
    p->freelist = x;
    // xxx - this leaks later pages in a a multipage allocation
    // should have a policy to return pages to the OS
    // for redistribution between threads and defragmentation
    // if we have such a thing
    // munmap(x, pad(size, h->pagesize));
}


heap efence_heap(bytes pagesize)
{
    heap h = (heap)mmap(0, sizeof(struct heap) + 1,
                           PROT_READ|PROT_WRITE,
                           MAP_PRIVATE|MAP_ANON,-1,0);
    h->alloc = allocate_pages_fence;
    h->dealloc = free_pages;
    h->pagesize = 4096; //dont forget we're promising pagesize alignment
    return(h);
}

heap init_memory(bytes pagesize)
{
    page_heap p = mmap(0, sizeof(struct heap) + 1,
                       PROT_READ|PROT_WRITE,
                       MAP_PRIVATE|MAP_ANON,-1,0);
    p->h.alloc = allocate_pages;
    p->h.dealloc = free_pages;
    p->h.pagesize = 4096; //dont forget we're promising pagesize alignment
    p->freelist = 0;
    return(&p->h);
}
