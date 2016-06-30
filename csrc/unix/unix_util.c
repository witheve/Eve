#ifdef __linux__
#define _GNU_SOURCE
#endif

#include <unix_internal.h>
#include <sys/time.h>

decsriptor standardinput = 0;
decsriptor standardoutput = 1;
decsriptor standarderror = 2;

typedef struct page_heap {
    struct heap h;
    void **freelist;
} *page_heap;
    
void ticks_to_timeval(struct timeval *a, ticks b)
{
    unsigned long long usec = (b*1000000)>>32;
    a->tv_sec  = usec / 1000000;
    a->tv_usec = usec % 1000000;
}

ticks timeval_to_ticks(struct timeval *a)
{
    return (((unsigned long long)a->tv_sec)<<32)|
        ((((unsigned long long)a->tv_usec)<<32)/1000000);
}


ticks now()
{
    struct timeval result;
    
    gettimeofday(&result,0);
    return timeval_to_ticks(&result);
}


buffer read_file(heap h, char *path)
{
    int d;

    // consider where this line should be drawn between the
    // os specific and general parts
    if ((d = open(path, O_RDONLY)) >= 0) {
        struct stat k;
        fstat(d, &k);
        int bytes = k.st_size;
        buffer b = allocate_buffer(h, bytes);
        if (read(d, bref(b,0), bytes) == bytes) {
            b->end = bytes;
            return b;
        }
    }
    return 0;
}

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

void prf(char *format, ...)
{
    string b = allocate_string(init);
    va_list ap;
    string f = string_from_cstring(init, format);
    va_start(ap, format);
    vbprintf(b, f, ap);
    va_end(ap);
    deallocate(init, f);
    write(1, bref(b, 0), buffer_length(b));
}

static void free_pages(heap h, void *x)
{
    page_heap p = (page_heap)h;
    *(void **) x = p->freelist;
    p->freelist = x;
    // xxx - this leaks later pages in a a multipage allocation
    // should have a policy to return pages to the OS
    // for redistribution between threads and defragmentation
    // if we have such a thing
    // munmap(x, h->pagesize);
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

void error(char *x)
{
    write(1, x, cstring_length(x));
}

void unix_wait()
{
    while (1) {
        ticks next = timer_check(0);
        select_timer_block(next);
    }
    
}
