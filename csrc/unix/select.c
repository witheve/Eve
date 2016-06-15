#include <unix_internal.h>

#define FDSIZE 256

static table read_handlers;
static table write_handlers;
static fd_set reads;
static fd_set writes;

void register_read_handler(descriptor d, thunk t)
{
    table_set(read_handlers, (void *)(unsigned long)d, t);
}

void register_write_handler(descriptor d, thunk t)
{
    table_set(write_handlers, (void *)(unsigned long)d, t);
}

extern int ffsll(long long value);

static void scan_table(fd_set *t, table f)
{
    u64 b = (void *)t;
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

void select_timer_block(ticks interval)
{
    struct timeval timeout;
    struct timeval *timeout_pointer = 0;
    int result;
    descriptor d;

    if (interval){
        ticks_to_timeval(&timeout, interval);
        timeout_pointer = &timeout;
    }

    table_foreach (read_handlers, d, z)
        FD_SET((unsigned long)d, &reads);

    table_foreach (write_handlers, d, z)
        FD_SET((unsigned long)d, &writes);

    result = select(FD_SETSIZE, &reads, &writes, 0, timeout_pointer);

    if (result > 0) {
        scan_table(&reads, read_handlers);
        scan_table(&writes, write_handlers);
    }
}

static iu64 key_from_fd(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static boolean compare_fd(void *x, void *y) {return((unsigned long)x==(unsigned long)y);}

void select_init()
{
    read_handlers = allocate_table(init, key_from_fd, compare_fd);
    write_handlers = allocate_table(init, key_from_fd, compare_fd);
}





