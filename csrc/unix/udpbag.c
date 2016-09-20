#include <unix_internal.h>

typedef struct udp_bag {
    struct bag b;
    heap h;
    // these dont get cleaned up
    table sockets;
    ticks current_time; // sigh, if we had incrementalism this wouldn't be an issue
    buffer current_packet;
} *udp_bag;


static void udp_scan(udpbag u, int sig, listener out, value e, value a, value v)
{
}

static void udp_reception()
{
}

bag udp_bag_init()
{
    // this should be some kind of parameterized listener.
    // we can do the same trick that we tried to do
    // with time, by creating an open read, but it
    // has strange consequences. sidestep by just
    // having an 'eve port'
    create_udp();
}
