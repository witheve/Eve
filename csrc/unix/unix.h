typedef void *station;

typedef closure(buffer_handler, buffer, thunk);

// xxx - recursive type declaration...maybe cheat and use compatible types
typedef closure(register_read, void (**)(void *,buffer, void (**)()));
typedef closure(reader, buffer, register_read);

void init_unix();

string tree_root_path();

extern heap pages;

typedef closure(status_handler, int);

typedef struct timers *timers;
typedef int descriptor;

extern descriptor standardoutput;
extern descriptor standardinput;
extern descriptor standarderror;

void exit(int);
void standardout(string s);
typedef struct selector *selector;

void register_read_handler(selector, descriptor, thunk);
void register_write_handler(selector, descriptor, thunk);
heap efence_heap(bytes);

buffer read_file(heap, char *);
int write_file(char *, buffer);

void register_console_input(heap h, buffer_handler bh);

int spinning_write(descriptor, buffer);
void register_idle_process(thunk n);

extern heap pages;

extern void unix_fail();
extern void unix_shutdown();

#define assert(__x)\
    if (!(__x)) unix_fail()


heap init_fixed_page_region(heap meta,
                            u64 base_address,
                            u64 max_address,
                            bytes pagesize);
ticks now();


typedef struct endpoint {
    buffer_handler w;
    register_read r;
} *endpoint;
    

typedef closure(new_client, endpoint, station);
typedef closure(connected, endpoint);

void tcp_create_client (heap, station, connected);

void tcp_create_server(heap h,
                       table addr,
                       new_client n,
                       thunk bound);

void unix_wait();
selector select_init(heap);
void init_processes();

void clocktime(ticks t, unsigned int *hours, unsigned int *minutes, unsigned int *seconds);

typedef closure(udp_receiver, station, buffer);
typedef struct udp *udp;
udp create_udp(heap h, station local, udp_receiver);
void udp_write(udp, station, buffer);

void prf(char *, ...);

extern station ip_wildcard_service;
// not really unix
station station_from_string(heap h, buffer b);


// put a letover buffer fragment in sequence before a stream
static CONTINUATION_2_1(regbounce, register_read, buffer, reader)
static void regbounce(register_read reg, buffer b, reader r)
{
    apply(r, b, reg);
}

static register_read requeue(heap h, buffer b, register_read reg)
{
    if (buffer_length(b) == 0) return reg;
    return cont(h, regbounce, reg, b);
}

typedef struct context *context;

extern struct context *primary;

#define tcontext() primary

typedef struct context {
    timers t;
    heap page_heap;
    selector s;
} *context;
