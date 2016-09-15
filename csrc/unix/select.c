#include <unix_internal.h>

#define FDSIZE 256

struct selector {
    table read_handlers;
    table write_handlers;
};
    

void register_read_handler(selector s, descriptor d, thunk t)
{
    table_set(s->read_handlers, (void *)(unsigned long)d, t);
}

void register_write_handler(selector s, descriptor d, thunk t)
{
    table_set(s->write_handlers, (void *)(unsigned long)d, t);
}

extern int ffsll(long long value);

static void scan_table(fd_set *t, table f)
{
    u64 *b = (void *)t;
    unsigned int i;
    for (i = 0 ; i <(FDSIZE/64); i++) {
        descriptor d;
        while ((d = ffsll(b[i]))) {
            d = (d-1) + (64*i);
            FD_CLR(d, t);
            thunk handler =(thunk)table_find(f, (void *)(unsigned long)d);
            table_set(f, (void *)(unsigned long)d, 0);
            apply(handler);
        }
    }
}

void select_timer_block(selector s, ticks interval)
{
    struct timeval timeout;
    struct timeval *timeout_pointer = 0;
    int result;
    descriptor d;
    fd_set reads;
    fd_set writes;

    if (interval){
        ticks_to_timeval(&timeout, interval);
        timeout_pointer = &timeout;
    }

    table_foreach (s->read_handlers, d, z)
        FD_SET((unsigned long)d, &reads);

    table_foreach (s->write_handlers, d, z)
        FD_SET((unsigned long)d, &writes);

    result = select(FD_SETSIZE, &reads, &writes, 0, timeout_pointer);

    if (result > 0) {
        scan_table(&reads, s->read_handlers);
        scan_table(&writes, s->write_handlers);
    }
}

static u64 key_from_fd(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static boolean compare_fd(void *x, void *y) {return((unsigned long)x==(unsigned long)y);}

selector select_init(heap h)
{
    selector s = allocate(h, sizeof(struct selector));
    s->read_handlers = allocate_table(init, key_from_fd, compare_fd);
    s->write_handlers = allocate_table(init, key_from_fd, compare_fd);
    return s;
}





