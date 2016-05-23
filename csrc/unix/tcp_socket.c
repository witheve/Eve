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
    buffer_handler each;
    thunk connect;
    write_buffer q;
    write_buffer *last;
    table addr;
} *tcpsock;


struct write_buffer {
    buffer b;
    thunk finished;
    write_buffer next;
};

static tcpsock allocate_tcpsock(heap h)
{
    tcpsock t = allocate(h, sizeof(struct tcpsock));
    t->h = h;
    t->last = &t->q;
    return(t);
}

/*
 * calls to actually_write and tcp_write are assumed serialized
 */
static inline void tcppop(tcpsock t) 
{
    write_buffer w = t->q;
    if (!(t->q = t->q->next)) t->last = &t->q;
    deallocate(t->h, w);
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
            int transfer = buffer_length(t->q->b)/8;
            
            // this should handle EWOULDBLOCK 
            int result = write(t->d, 
                               bref(b, 0),
                               transfer) * 8;
            
            if (result > 0){
                if (result < transfer) {
                    buffer_consume(b, result);
                    return;
                } else {
                    apply(t->q->finished, true); 
                    tcppop(t);
                }
            } else {
                while(t->q) {
                    apply(t->q->finished, false); 
                    tcppop(t);
                }
            }
        }
    }
}

// thunk needs to be bound up in the buffer
// doesn't handle being called until connect
void tcp_write(tcpsock t, buffer b, thunk n)
{
    if (!t->q)
        register_write_handler(t->d, cont(t->h, actually_write, t));

    if (!write_buffers) write_buffers  = allocate_rolling(pages);
    write_buffer w = allocate(write_buffers, sizeof(struct write_buffer));
    w->next = 0;
    w->b = b;
    w->finished = n;
    *t->last = w;
    t->last = &w->next;
}

static int connect_finish(tcpsock t)
{
    struct sockaddr_in foo;
    unsigned int size=sizeof(foo);

    if (getpeername(t->d, (struct sockaddr *)&foo, &size) == -1) {
        // error 
        apply(t->connect, false);
        close(t->d);
    } else {
        register_read_handler(t->d, cont(t->h, read_nonblocking_desc, t));
        apply(t->connect, t);
    }
    //actually_write(t, ignore);
    return(0);
}

static void connect_try (tcpsock t)
{
    int temp;
    struct sockaddr_in a;

    t->d = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);

    //system_nonblocking(t->d);
    register_write_handler(t->d, cont(t->h, connect_finish, t));
    // error status
    // fill a from t->addr
    connect(t->d, 
            (struct sockaddr *)&a,
            sizeof(struct sockaddr_in));
}

static void new_connection(tcpsock t)
{
    tcpsock new = allocate_tcpsock(t->h);
    struct sockaddr_in from;
    socklen_t flen = sizeof(struct sockaddr_in);
    unsigned int addrsize = sizeof(struct sockaddr_in);
    int fd;

    if ((fd = accept(desc(t->d), 
                     (struct sockaddr *)&from,
                     &flen)) >= 0) {
        unsigned char x = 1;
        new->d = wrap_descriptor(t->h, fd);
        // error handling
        setsockopt(fd, /*SOL_TCP*/0, TCP_NODELAY,
                          (char *)&x, sizeof(x));

        int one = 1;
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE,
                   (char *)&one, sizeof(one));

        table peer = digest_sockaddrin(t->h, &from);        
        flen = sizeof(struct sockaddr_in);
        getsockname(fd, (struct sockaddr *)&from, &flen);
        table myself = digest_sockaddrin(t->h, &from);
        
        buffer_handler r = apply(t->each, 
                                 cont(t->h, tcp_write, new),
                                 myself, peer);

        if (r) {
            new->each = r;
            register_read_handler(new->d, 
                                  cont(t->h, read_nonblocking_desc, 
                                          t->h, new->d, r));
        } else {
            close(t->d);
        }
    }
    register_read_handler(t->d, 
                          cont(t->h, new_connection, t));

}


static void bind_try(tcpsock t)
{
    struct sockaddr_in a;
    
    encode_sockaddrin(&a, t->addr);
    // fill
    if (bind(t->d, (struct sockaddr *)&a, sizeof(struct sockaddr_in))) {
        listen(t->d, 5);

        apply(t->connect, true);
        register_read_handler(t->d, cont(t->h, new_connection, t));
    } else {
        register_timer(seconds(t->h, 5),
                       cont(t->h, bind_try, t));
    }
}


void tcp_create_client (heap h,
                        table addr,
                        buffer_handler each,
                        thunk connected)
{
    tcpsock new = allocate_tcpsock(h);
    new->addr = addr;
    new->each = each;
    new->connect = connected;
    connect_try(new);
    /*fix this someday*/
    /*  register_timer(CONNECT_RETRY_INTERVAL,connect_try,new);*/
}


// a handle to reclaim me? - maybe a nice thunk?
void tcp_create_server(heap h,
                       table addr,
                       closure new_client,
                       thunk bound)
{
    tcpsock new = allocate_tcpsock(h);
    
    new->h = h;
    new->each = new_client;
    new->connect = bound;
    new->d = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    new->addr = addr;

    int flags = fcntl(*(int *)new->d, F_GETFD);
    flags |= FD_CLOEXEC;
    fcntl(*(int *)new->d, F_SETFD, flags);
    
    
#ifdef SO_REUSEPORT
    {
        int on=1;
        setsockopt(new->d, SOL_SOCKET, SO_REUSEPORT, 
                   (char *)&on, sizeof(on));
    }
#endif
#ifdef SO_REUSEADDR
    {
        int on=1;
        setsockopt(new->d, SOL_SOCKET, SO_REUSEADDR, 
                   (char *)&on, sizeof(on));
    }
#endif

    unsigned char on = 1;        
    ioctl(new->d, FIONBIO, &on);
    bind_try(new);
}


