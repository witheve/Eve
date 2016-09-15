#include <unix_internal.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/ioctl.h>
#include <errno.h>

typedef struct write_buffer *write_buffer;
static heap write_buffers = 0;

typedef struct tcpsock {
    heap h;
    descriptor d;
    reader each;
    connected c;
    write_buffer q;
    write_buffer *last;
    station addr;
    thunk writer;
    thunk read_handler;
    register_read r;
    reader client_reader;
    struct endpoint e;
} *tcpsock;

typedef struct tcp_server {
    heap h;
    thunk connected;
    descriptor d;
    station addr;
} *tcp_server;


struct write_buffer {
    buffer b;
    thunk finished;
    write_buffer next;
};


static CONTINUATION_1_1(regtcp, tcpsock, reader);
static void regtcp(tcpsock t, reader r)
{
    t->client_reader = r;
    register_read_handler(tcontext()->s, t->d, t->read_handler);
}


/*
 * calls to actually_write and tcp_write are assumed serialized
 */
static inline void tcppop(tcpsock t) 
{
    write_buffer w = t->q;
    if (!(t->q = t->q->next)) {
        t->last = &t->q;
    } else {
        deallocate(t->h, w, sizeof(*w));
    }
}

static CONTINUATION_1_0(actually_write, tcpsock);
static void actually_write(tcpsock t)
{
    while(t->q) {
        if (!t->q->b){
            // close causes the any pending read to 
            // send the syscall loop into a spinny death
            shutdown(t->d, SHUT_RD);
            tcppop(t);
        } else {
            buffer b = t->q->b;
            int transfer = buffer_length(t->q->b);
            if (transfer == 0) {
                tcppop(t);
                break;
            }

            int result = write(t->d, 
                               bref(b, 0),
                               transfer);

            if (result > 0){
                if (result < transfer) {
                    buffer_consume(b, result);
                    break;
                } else {
                    apply(t->q->finished, true); 
                    tcppop(t);
                }
            } else {
                if  ((result == -1) && ((errno == EAGAIN) || (errno == EWOULDBLOCK))) {
                    break;
                }
                
                while(t->q) {
                    apply(t->q->finished, false); 
                    tcppop(t);
                }
            }
        }
    }

    if (t->q)
        register_write_handler(tcontext()->s, t->d, t->writer);
}

// thunk needs to be bound up in the buffer
// doesn't handle being called until connect
CONTINUATION_1_2(tcp_write, tcpsock, buffer, thunk);
void tcp_write(tcpsock t, buffer b, thunk n)
{
    // track socket buffer occupancy and fast path this guy
    if (!t->q)
        register_write_handler(tcontext()->s, t->d, t->writer);

    if (!write_buffers) write_buffers  = allocate_rolling(tcontext()->page_heap, sstring("tcp write"));
    write_buffer w = allocate(write_buffers, sizeof(struct write_buffer));
    w->next = 0;
    w->b = b;
    w->finished = n;
    *t->last = w;
    t->last = &w->next;
}


static CONTINUATION_1_0(connect_try, tcpsock);

static CONTINUATION_1_0(connect_finish, tcpsock);
static void connect_finish(tcpsock t)
{
    struct sockaddr_in foo;
    socklen_t size = sizeof(foo);

    // really check to see if we succeeded
    if (getpeername(t->d, (struct sockaddr *)&foo, &size) == -1) {
        register_timer(tcontext()->t, seconds(1), cont(t->h, connect_try, t));
        //        apply(t->c, false, false);
        //        close(t->d);
    } else {
        t->e.w = cont(t->h, tcp_write, t);
        t->e.r = cont(t->h, regtcp, t);
        apply(t->c, &t->e);
    }
}

static void connect_try (tcpsock t)
{
    int temp;
    struct sockaddr_in a;

    t->d = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    nonblocking(t->d);
    // error status
    encode_sockaddrin(&a, t->addr);
    // fill a from t->addr
    int r = connect(t->d, 
                    (struct sockaddr *)&a,
                    sizeof(struct sockaddr_in));
    register_write_handler(tcontext()->s, t->d, cont(t->h, connect_finish, t));
}


static CONTINUATION_1_0(tcp_read_nonblocking_desc, tcpsock);
static void tcp_read_nonblocking_desc(tcpsock t)
{
    buffer b;
    if ((b = system_read(t->h, t->d, 1500)) > 0) {
        apply(t->client_reader, b, t->r);
    } else {
        // consider having a seperate termination closure
        apply(t->client_reader, false, false);
    }
}

static tcpsock allocate_tcpsock(heap h)
{
    tcpsock t = allocate(h, sizeof(struct tcpsock));
    t->h = h;
    t->q = 0;
    t->last = &t->q;
    t->r = cont(h, regtcp, t);
    t->read_handler = cont(h, tcp_read_nonblocking_desc, t);
    t->writer = cont(t->h, actually_write, t);
    return(t);
}
    
static CONTINUATION_2_0(new_connection, tcp_server, new_client);
static void new_connection(tcp_server t, new_client n)
{
    tcpsock new = allocate_tcpsock(t->h);
    struct sockaddr_in from;
    socklen_t flen = sizeof(struct sockaddr_in);
    unsigned int addrsize = sizeof(struct sockaddr_in);
    int fd;

    if ((fd = accept(t->d, 
                     (struct sockaddr *)&from,
                     &flen)) >= 0) {
        unsigned char x = 1;
        new->d = fd;
        // error handling
        setsockopt(fd, /*SOL_TCP*/0, TCP_NODELAY,
                          (char *)&x, sizeof(x));
        
#ifdef SO_NOSIGPIPE
        int one = 1;
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE,
                   (char *)&one, sizeof(one));
#endif
        
        station peer; // = sockaddr_to_station(t->h, &from);        
        flen = sizeof(struct sockaddr_in);
        // do we really care about this?
        //        getsockname(fd, (struct sockaddr *)&from, &flen);
        //        table myself = digest_sockaddrin(t->h, &from);

        new->e.w = cont(new->h, tcp_write, new);
        new->e.r = cont(new->h, regtcp, new);
        
        apply(n,
              &new->e,
              peer);
    } else {
        close(t->d);
    }

    register_read_handler(tcontext()->s, t->d, cont(t->h, new_connection, t, n));
}


static CONTINUATION_2_0(bind_try, tcp_server, new_client);
static void bind_try(tcp_server t, new_client n)
{
    struct sockaddr_in a;

    encode_sockaddrin(&a, t->addr);
    if (bind(t->d, (struct sockaddr *)&a, sizeof(struct sockaddr_in)) == 0) {
        listen(t->d, 5);

        apply(t->connected);
        register_read_handler(tcontext()->s, t->d, cont(t->h, new_connection, t, n));
    } else {
        register_timer(tcontext()->t, seconds(5),
                       cont(t->h, bind_try, t, n));
    }
}


void tcp_create_client (heap h, station a, connected c)
{
    tcpsock new = allocate_tcpsock(h);
    new->addr = a;
    new->c = c;
    connect_try(new);
}


// a handle to reclaim me? - maybe a nice thunk?
void tcp_create_server(heap h,
                       table addr,
                       new_client n,
                       thunk bound)
{
    tcp_server t = allocate(h, sizeof(struct tcp_server));
    
    t->h = h;
    t->connected = bound;
    t->d = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    t->addr = addr;

    int flags = fcntl(t->d, F_GETFD);
    flags |= FD_CLOEXEC;
    fcntl(t->d, F_SETFD, flags);
    
    
#ifdef SO_REUSEPORT
    {
        int on=1;
        setsockopt(t->d, SOL_SOCKET, SO_REUSEPORT, 
                   (char *)&on, sizeof(on));
    }
#endif
#ifdef SO_REUSEADDR
    {
        int on=1;
        setsockopt(t->d, SOL_SOCKET, SO_REUSEADDR, 
                   (char *)&on, sizeof(on));
    }
#endif

    nonblocking(t->d);
    bind_try(t, n);
}


