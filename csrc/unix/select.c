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

    FD_ZERO(&reads);
    FD_ZERO(&writes);

    foreach_table (read_handlers, d, z) 
        FD_SET((unsigned long)d, &reads);

    foreach_table (write_handlers, d, z)
        FD_SET((unsigned long)d, &writes);

    result = select(FD_SETSIZE, &reads, &writes, 0, timeout_pointer);

    if (result > 0) {
        // should be order number of set descriptors looked up in 
        // iodescs, not number of iodescs
        foreach_table (read_handlers, d, t) 
            if (FD_ISSET((unsigned long)d, &reads)) {
                thunk i = table_find(read_handlers, d);
                // for some reason we beleive these deletes are safe
                table_set(read_handlers, d, EMPTY);
                apply(i);
            }
        
        foreach_table (write_handlers, d, t)
            if (FD_ISSET((unsigned long)d, &writes)) {
                thunk t = table_find(write_handlers, d);
                table_set(write_handlers, t, EMPTY);
                apply(t);
            }
        
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








