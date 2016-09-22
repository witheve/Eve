#ifdef __linux__
#define _GNU_SOURCE
#endif

#include <unix_internal.h>
#include <sys/time.h>
#include <time.h>
#include <signal.h>

decsriptor standardinput = 0;
decsriptor standardoutput = 1;
decsriptor standarderror = 2;

station ip_wildcard_service;

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

int write_file(char *path, buffer b)
{
    descriptor d = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
    if(d >= 0) {
        write(d, bref(b, 0), buffer_length(b));
        close(d);
        return 1;
    }
    return 0;
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

void prf(char *format, ...)
{
    string b = allocate_string(pages);
    va_list ap;
    string f = alloca_string(format);
    va_start(ap, format);
    vbprintf(b, f, ap);
    va_end(ap);
    write(1, bref(b, 0), buffer_length(b));
    deallocate_buffer(b);
}


void error(char *x)
{
    write(1, x, cstring_length(x));
}

void unix_wait()
{
    while (1) {
        ticks next = timer_check(tcontext()->t);
        select_timer_block(tcontext()->s, next);
        // check queues
    }
}

void clocktime(ticks t, unsigned int *hours, unsigned int *minutes, unsigned int *seconds)
{
    struct timeval tv;
    time_t z = t >> 32;
    // not threadsafe
    struct tm *tm = localtime(&z);
    *hours = tm->tm_hour;
    *minutes = tm->tm_min;
    *seconds = tm->tm_sec;
}



station station_from_string(heap h, buffer b)
{
    u32 final = 0;
    unsigned int t = 0;
    character i;
    unsigned char *new = allocate(h, 6);
    // mandatory colons
    
    string_foreach(b, i) {
        switch(i) {
        case '.':
            final = (final << 8) | t;
            t = 0;
            break;
        case ':':
            final = htonl((final << 8) | t);
            memcpy(new, &final, 4);
            t = 0;
            break;
        default:
            t = t * 10 + digit_of(i);
        }
    }
    final = htons(t);
    memcpy(new + 4, &final, 2);
    return new;
}

static u64 tid_count;
// pages now threadsafe
context init_context(heap page_allocator)
{
    heap h = allocate_rolling(page_allocator, sstring("thread_init"));
    context c = allocate(h, sizeof(struct context));

    signal(SIGPIPE, SIG_IGN);
    // put a per thread freelist on top of
    c->tid = fetch_and_add(&tid_count, 1);
    c->page_heap = page_allocator;
    c->s = select_init(h);
    c->t = initialize_timers(allocate_rolling(page_allocator, sstring("timers")));
    // xxx - allocation scheme for these queue sets
    c->input_queues = allocate(h, 10 * sizeof(queue));
    c->output_queues = allocate(h, 10 * sizeof(queue));
    c->h = h;
    memset(c->input_queues, 0, 10 * sizeof(queue));
    memset(c->output_queues, 0, 10 * sizeof(queue));
    pipe(c->wakeup);
    return c;
}
