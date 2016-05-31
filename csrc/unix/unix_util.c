#ifdef __linux__
#define _GNU_SOURCE
#endif

#include <unix_internal.h>
#include <sys/time.h>

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

static void *allocate_pages(heap h, bits s)
{
    void *p = mmap(0, pad(s, h->pagesize),
                   PROT_READ|PROT_WRITE,
                   MAP_PRIVATE|MAP_ANON,
                   -1,0);

    return(p);
}

static void *allocate_pages_fence(heap h, bits s)
{
    int baselen = pad(bytesof(s), h->pagesize);
    void *p = mmap(0,  baselen + h->pagesize,
                   PROT_READ|PROT_WRITE,
                   MAP_PRIVATE|MAP_ANON,
                   -1,0);
    mprotect(p + baselen, h->pagesize, 0);

    return(p);
}

static void free_pages(heap h, void *x)
{
    // xxx - this doesn't free the whole page if its a multipage allocation
    munmap(x, h->pagesize);
}
    
heap init_memory(bytes pagesize)
{
    heap h = (heap)mmap(0, sizeof(struct heap) + 1,
                           PROT_READ|PROT_WRITE,
                           MAP_PRIVATE|MAP_ANON,-1,0);
    h->alloc = allocate_pages;
    h->dealloc = free_pages;
    h->pagesize = pagesize;
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
