
// should consider a drain function
typedef struct heap {
    void *(*alloc)();
    void (*dealloc)();
    void (*destroy)();
    bytes pagesize;
    bytes allocated;
} *heap;


static inline void *page_of(void *x, bytes pagesize)
{
    return((void *)((unsigned long)x & (~(pagesize-1))));
}

heap init_memory(bytes pagesize);// unix specific
heap allocate_leaky_heap(heap parent);
heap allocate_pagechunk(heap h, bytes s);
heap allocate_pagecache(heap h);
heap allocate_rolling(heap h);

// really internals

static inline bytes pad(bytes a, bytes to)
{
    return ((((a-1)/to)+1)*to);
}

static inline int subdivide(int quantum, int per, int s, int o)
{
    // this overallocates
    int base = ((s-o)/quantum) * per;
    return (pad(o + base, quantum));
}

#define allocate(h, size) ((h)->alloc)(h, size)
#define deallocate(h, x) ((h)->dealloc)(h, x)
#define destroy(h) ((h)->dealloc)(h)
