typedef struct heap *heap;
struct heap {
    void *(*alloc)(heap, bytes);
    void (*dealloc)(heap, void *, bytes);
    void (*destroy)(heap);
    void (*drain)(heap);
    bytes pagesize;
    bytes allocated;
};


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
#define deallocate(h, x, s) ((h)->dealloc)(h, x, s)
#define destroy(h) ((h)->destroy)(h)
