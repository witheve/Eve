#include <runtime.h>
#include <unix.h>
#include <sys/types.h>
#include <stdlib.h>
#include <sys/select.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/errno.h>
#include <sys/stat.h>
#include <netinet/in.h>
#include <unistd.h>

void ticks_to_timeval(struct timeval *a, ticks b);
void timeval_to_ticks(ticks d, struct timeval *a);
typedef int decsriptor;

#define MIN(x, y) ((x)<(y)?(x):(y))
#if 0
// duplicated with read_nonblocking_desc?
static void read_desc(heap h, descriptor d, buffer_handler bh, thunk next)
{

    int available;
    buffer b;
    // fix all these 8s
    if ((available = system_available(d)) > 0){
        if ((b = system_read(h, d, MIN(500*8, available*8)))) {
            apply(bh, b, next);
        }
    } else {
        apply(bh, false, next);
    }
}
#endif


static inline buffer system_read(heap h, 
                                 descriptor d,
                                 bits length)
{
    iu64 len = length/8;
    buffer b = allocate_buffer(h, length);
    void *dest = bref(b, 0);
    // error handling
    int result = read(d, dest, len);
    if (result > 0) { 
        buffer_produce(b, result);
        return(b);
    }
    return(false);
}

static CONTINUATION_3_0(read_nonblocking_desc, heap, descriptor, blocking_reader);
static void read_nonblocking_desc(heap h, 
                                  descriptor d,
                                  blocking_reader bh);

// need to keep this guy around
static CONTINUATION_3_0(rereg, heap, descriptor, blocking_reader);
static void rereg(heap h, descriptor d, blocking_reader bh)
{
    register_read_handler(d, cont(h, read_nonblocking_desc, h, d, bh));
}

static void read_nonblocking_desc(heap h, 
                                  descriptor d,
                                  blocking_reader bh)
{
    buffer b;
    if ((b = system_read(h, d, 500*8))) {
        apply(bh, b, cont(h, rereg, h, d, bh));
    } else {
        // consider having a seperate termination closure
        apply(bh, false, false);
    }
}



//table digest_sockaddrin(heap h, struct sockaddr_in *a);
//int encode_sockaddrin(struct sockaddr_in *out, table in);
void select_timer_block(ticks interval);
