typedef u64 offset;

void initialize_timers(heap);
typedef closure(buffer_handler_handler, buffer_handler);
typedef closure(synchronous_buffer, buffer, thunk);
typedef closure(synchronous_buffer_handler, synchronous_buffer);
thunk init_unix();

string tree_root_path();

extern heap pages; 

typedef closure(status_handler, int);

typedef int descriptor;

extern descriptor standardoutput;
extern descriptor standardinput;
extern descriptor standarderror;

void exit(int);
void standardout(string s);

void register_read_handler(descriptor, thunk);
void register_write_handler(descriptor, thunk);
heap allocate_fence(heap);

buffer read_file(heap, char *);

void register_console_input(heap h, buffer_handler bh);

int spinning_write(descriptor, buffer);
void register_idle_process(thunk n);

extern heap pages;

extern void unix_fail();
extern void unix_shutdown();

#define assert(__x)\
    if (!(__x)) unix_fail()
    

heap init_fixed_page_region(heap meta,
                            iu64 base_address,
                            iu64 max_address,
                            bytes pagesize);
ticks now();

typedef closure(new_client,synchronous_buffer, synchronous_buffer_handler, station);

void tcp_create_server(heap h,
                       table addr,
                       new_client n,
                       thunk bound);

void unix_wait();
void select_init();
void prf(char *, ...);
