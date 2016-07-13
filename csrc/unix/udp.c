#include <unix/unix_internal.h>
#include <sys/ioctl.h>

/* unix semantics for sockets after bind will cause multicast packets
   sent on the input sockets to have the multicast address as the
   source.....should be able to share output sockets, modulo the ttl
   issue*/

typedef struct udp {
    buffer_handler read;
    descriptor send, receive;
    unsigned int current_ttl;
    heap h;
    int mtu;
    udp_receiver r;

} *udp;

void udp_write(udp u, station a, buffer b) 
{
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
    register_read_handler(u->receive, cont(u->h, input, u));
}

#if 0
void udp_subscribe (udp u, v4addr group)
{
    struct ip_mreq mreq;

    unsigned int loop=1;


    memset(&mreq,0,sizeof(mreq));
    mreq.imr_multiaddr = *((struct in_addr *)&group->address);
    if ((system_setsockopt(u->fd, IPPROTO_IP,IP_ADD_MEMBERSHIP, 
                           (const char *)&mreq,sizeof(mreq))<0)){
        perror("ip subscribe");
    }

    if (system_setsockopt(u->ofd, IPPROTO_IP,IP_MULTICAST_LOOP,
                          &loop,sizeof(loop))<0){
        perror("ip loopback"); 
    } 
}
#endif
// add list of subscriptions
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
#if 0
    memset(&mreq,0,sizeof(mreq));
    mreq.imr_multiaddr = *((struct in_addr *)&local->address);
#endif
    ioctl(u->receive, FIONBIO, &on);
    
    if (setsockopt(u->receive, SOL_SOCKET, SO_REUSEADDR,
                   (char *)&on,sizeof(on)) < 0)
        prf("SO_REUSEADDR");
    
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
    register_read_handler(u->receive, cont(h, input, u));
    return u;
}
