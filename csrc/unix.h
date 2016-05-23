typedef u64 offset;

void initialize_timers(heap);
typedef closure(buffer_handler_handler, buffer_handler);
thunk init_unix();

string tree_root_path();

extern heap pages; 

typedef closure(status_handler, int);

typedef struct descriptor *descriptor;

extern descriptor standardoutput;
extern descriptor standardinput;
extern descriptor standarderror;

void exit(int);
void standardout(string s);

void register_read_handler(descriptor, thunk);
void register_write_handler(descriptor, thunk);
heap allocate_fence(heap);

void now(ticks);
buffer read_file(heap, char *);

void register_console_input(heap h, buffer_handler bh);

int spinning_write(descriptor, buffer);
void register_idle_process(thunk n);


void pr(value);
void prf(value);
void pf(char *, ...);

extern heap pages;

descriptor wrap_descriptor(heap h, int fd);
extern void unix_fail();
extern void unix_shutdown();

#define assert(__x)\
    if (!(__x)) unix_fail()
    

