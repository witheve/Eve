#include <unix/unix_internal.h>
#include <sys/ioctl.h>
#include <netinet/in.h>

/*TODO: put back in multicast support */

struct udp {
    buffer_handler read;
    descriptor send, receive;
    unsigned int current_ttl;
    heap h;
    int mtu;
    udp_receiver r;
};

void udp_write(udp u, station a, buffer b) 
{
    struct sockaddr_in to;
    socklen_t k = sizeof(struct sockaddr_in);
    encode_sockaddrin(&to, a);
    sendto(u->send, bref(b, 0), buffer_length(b), 0, (struct sockaddr *)&to, k);
}

static CONTINUATION_1_0(input, udp);
static void input(udp u)
{
    struct sockaddr_in from;
    bytes count;
    station a;
    // wtf linux?
    socklen_t fromsize;
  
    buffer b = (void *)allocate_buffer(u->h, u->mtu);
    fromsize = sizeof(struct sockaddr);
    if ((count = recvfrom(u->receive, bref(b, 0), u->mtu, 0,
                          (struct sockaddr *)&from, &fromsize)) > 0) {
        //translate a
        apply(u->r, a, b);
    } else return;
    // use self
    register_read_handler(tcontext()->s, u->receive, cont(u->h, input, u));
}

udp create_udp(heap h,
               station local,
               udp_receiver r)
{
    udp u;
    struct ip_mreq mreq;
    unsigned int on=1;
    
    u =(udp)allocate(h, sizeof(struct udp));
    memset(u,0,sizeof(struct udp));
    u->r = r;
    u->h = h;
    
    u->receive = u->send = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    nonblocking(u->receive);

#ifdef SO_REUSEADDR    
    if (setsockopt(u->receive, SOL_SOCKET, SO_REUSEADDR,
                   (char *)&on,sizeof(on)) < 0)
        prf("SO_REUSEADDR");
#endif
    
#ifdef SO_REUSEPORT
    if (setsockopt(u->receive, SOL_SOCKET, SO_REUSEPORT,
                   (char *)&on, sizeof(on)) < 0)
        prf("SO_REUSEPORT");
#endif
    
    on=65535;
    if (setsockopt(u->receive, SOL_SOCKET, SO_RCVBUF,
                   (char *)&on,sizeof(on)) < 0)
        prf("SO_RCVBUF");
    
    if (setsockopt(u->send, SOL_SOCKET, SO_SNDBUF, 
                   (char *)&on, sizeof(on)) < 0)
        prf("SO_SNDBUF");
    
    struct sockaddr s;
    if (bind (u->receive, &s, (socklen_t)sizeof(struct sockaddr_in))) {
        prf("error bind\n");
        return(0);
    }
    register_read_handler(tcontext()->s, u->receive, cont(h, input, u));
    return u;
}
