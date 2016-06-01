#include <runtime.h>

typedef struct pageheader *pageheader;

struct pageheader {
    iu32 refcnt;
    pageheader next;
    pageheader *last;
};

typedef struct rolling {
    struct heap h;
    heap   parent;
    bytes    offset;
    bytes    length;
    pageheader buffer;
} *rolling;

static void rolling_advance_page(rolling l, bytes len)
{
    pageheader old = l->buffer;
    bits plen = pad(len, l->parent->pagesize);
    pageheader p =  allocate(l->parent, plen);
    l->buffer = p;
    l->offset = sizeof(pageheader);
    l->length = plen;
    p->last = &old->next;
    p->next = 0;
    *p->last = p;
}

static void *rolling_alloc(rolling c, bytes len)
{
    if ((c->offset + len) > c->length)
        rolling_advance_page(c, len);
    c->buffer->refcnt++;
    void *r = ((void *)c->buffer) + c->offset;
    c->offset += len;
    return(r);
}

static void rolling_free(rolling c, void *x)
{
    pageheader p = (pageheader)page_of(x, c->parent->pagesize);
    if (!--p->refcnt) {
        *p->last = p->next;
        deallocate(c->parent, p);
    }
}

static void rolling_destroy(rolling c)
{

    for (pageheader i = c->buffer;
         deallocate(c->parent, i), ((rolling)i != c);
         i = i->next);
}

// where heap p must be aligned
heap allocate_rolling(heap p)
{
    pageheader ph = allocate(p, sizeof(struct rolling));
    rolling l = (rolling)(p+1);
    l->h.alloc = rolling_alloc;
    l->h.dealloc = rolling_free;
    l->h.pagesize = 1;
    l->h.destroy = rolling_destroy;
    l->buffer = ph;
    l->parent = p;
    l->offset = sizeof(struct rolling);
    l->length = bytesof(p->pagesize);
    ph->last = 0;
    ph->refcnt = 1;
    ph->next = 0;
    return(&l->h);
}

