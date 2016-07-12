#include <core.h>

typedef struct pageheader *pageheader;

struct pageheader {
    u32 refcnt;
    u32 length;
    pageheader next;
    pageheader *last;
};

typedef struct rolling {
    struct heap h;
    heap   parent;
    bytes  offset;
    pageheader buffer;
} *rolling;

static void rolling_advance_page(rolling l, bytes len)
{
    pageheader old = l->buffer;
    bytes plen = pad(len + sizeof(struct pageheader), l->parent->pagesize);
    pageheader p =  allocate(l->parent, plen);
    (p->next = l->buffer)->last = &p->next;
    *((p->last = &l->buffer)) = p;
    l->offset = sizeof(struct pageheader);
    p->length = plen;
    l->h.allocated += plen;
}

static void *rolling_alloc(heap h, bytes len)
{
    rolling c = (void *)h;

    if ((c->offset + len) > c->buffer->length){
        rolling_advance_page(c, len);
    }
    c->buffer->refcnt++;
    void *r = ((void *)c->buffer) + c->offset;
    c->offset += len;
    // we can't use the last part of a multipage allocation,
    // because we wont be able to find the page header
    if (c->buffer->length > c->parent->pagesize)
        rolling_advance_page(c, c->parent->pagesize);
    return(r);
}

static void rolling_free(heap h, void *x, bytes b)
{
    rolling c = (void *)h;
    pageheader p = (pageheader)page_of(x, c->parent->pagesize);
    if (!--p->refcnt) {
        if ((*p->last = p->next)) p->next->last = p->last;
        h->allocated -= p->length;
        deallocate(c->parent, p, p->length);
    }
}

static void rolling_destroy(heap h)
{
    rolling c = (void *)h;
    *h->last = h->next;
    h->next->last = h->last;
    for (pageheader i = c->buffer, j;
         i && (j = i->next, deallocate(c->parent, i, i->length), 1);
         i = j);

}

// where heap p must be aligned
heap allocate_rolling(heap p, buffer name)
{
    int off = sizeof(struct pageheader) +  sizeof(struct rolling);
    pageheader ph = allocate(p, off);
    rolling l = (rolling)(ph+1);
    l->h.alloc = rolling_alloc;
    l->h.dealloc = rolling_free;
    l->h.allocated = p->pagesize;
    l->h.pagesize = 1;
    l->h.destroy = rolling_destroy;
    l->h.name = name;
    if ((l->h.next = heap_list)) l->h.next->last = &l->h.next;
    *(l->h.last = &heap_list) = &l->h;
    l->buffer = ph;
    l->parent = p;
    l->offset = off;
    ph->length = p->pagesize;
    ph->last = 0;
    ph->refcnt = 1;
    ph->next = 0;
    return(&l->h);
}

