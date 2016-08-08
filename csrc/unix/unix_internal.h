#include <core/core.h>
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
#include <sys/ioctl.h>

void ticks_to_timeval(struct timeval *a, ticks b);
ticks timeval_to_ticks(struct timeval *a);
typedef int decsriptor;

#define MIN(x, y) ((x)<(y)?(x):(y))

static inline buffer system_read(heap h, 
                                 descriptor d,
                                 bytes length)
{
    u64 len = length;
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

static CONTINUATION_3_0(read_nonblocking_desc, heap, descriptor, buffer_handler);
static void read_nonblocking_desc(heap h, 
                                  descriptor d,
                                  buffer_handler bh);

// need to keep this guy around, bleeding out conts here...looks like its time for myself
static CONTINUATION_3_0(rereg, heap, descriptor, buffer_handler);
static void rereg(heap h, descriptor d, buffer_handler bh)
{
    register_read_handler(d, cont(h, read_nonblocking_desc, h, d, bh));
}

static void read_nonblocking_desc(heap h, 
                                  descriptor d,
                                  buffer_handler bh)
{
    buffer b;
    if ((b = system_read(h, d, 1500))) {
        apply(bh, b, cont(h, rereg, h, d, bh));
    } else {
        // consider having a seperate termination closure
        apply(bh, false, false);
    }
}


void select_timer_block(ticks interval);

static station digest_sockaddrin(heap h, struct sockaddr_in *a)
{
    u32 t;
    unsigned char *new = allocate(h, 6);
    memcpy (new, &a->sin_addr, 4);
    memcpy (new + 4, &a->sin_port, 2);
    return(new);
}

static int encode_sockaddrin(struct sockaddr_in *out, station in)
{
    memset (out, 0, sizeof(struct sockaddr_in));  
#ifdef HAVE_SOCKADDR_SA_LEN
    out->sin_len=sizeof(struct sockaddr_in);
#endif
    out->sin_family = AF_INET;
    memcpy (&out->sin_addr, in, 4);
    memcpy (&out->sin_port, in + 4, 2);
    return(sizeof(struct sockaddr_in));
}



static inline void nonblocking(decsriptor d)
{
    unsigned char on = 1;        
    ioctl(d, FIONBIO, &on);
}
