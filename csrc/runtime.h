#include <math.h>
#include <core/core.h>
#include <unix/unix.h>
#include <types.h>

typedef enum {
    op_insert = 1,
    op_flush,
    op_close
} operator;

u64 key_of(value);
boolean equals(value, value);

typedef value eboolean;
extern heap efence;

void print(buffer, value);


typedef struct bag *bag;

void init_runtime();

void error(char *);

typedef long multiplicity;

#define UUID_LENGTH 12

uuid generate_uuid();

void uuid_base_print(char *, void *);
uuid parse_uuid(string c);
string aprintf(heap h, char *fmt, ...);
void bbprintf(string b, string fmt, ...);

#define pages (tcontext()->page_heap)

typedef struct perf {
    int count;
    ticks start;
    ticks time;
    int trig;
} *perf;

typedef closure(execf, heap, perf, operator, value *);

#define def(__s, __v, __i)  table_set(__s, intern_string((unsigned char *)__v, cstring_length((char *)__v)), __i);

void print_value(buffer, value);

typedef struct node *node;
typedef struct evaluation *evaluation;
typedef struct block *block;
typedef execf (*buildf)(block, node);

struct node {
    value id;
    estring type;
    buildf builder;
    vector arms;
    table arguments;
    table display;
};

#include <edb.h>
#include <multibag.h>

typedef closure(evaluation_result, multibag, multibag);

typedef closure(block_completion, boolean);

typedef struct compiled {
    string name;
    node head;
    int regs;
    bag compiler_bag;
} *compiled;

struct block {
    heap h;
    int regs;
    string name;
    execf head;
    evaluation ev;
    table nmap;
    node start;
};

typedef closure(error_handler, char *, bag, uuid);
typedef closure(bag_handler, bag);
typedef closure(bag_block_handler, bag, vector, vector); // source, inserts, removes

struct evaluation  {
    heap h;
    estring name;
    heap working; // lifetime is a whole f-t pass
    error_handler error;

    table scopes;
    multibag t_input;
    multibag block_t_solution;
    multibag block_f_solution;
    multibag f_solution;
    multibag last_f_solution;
    multibag t_solution;
    multibag t_solution_for_f;
    // map from names to uuids

    vector blocks;
    bag event_bag;

    table counters;
    ticks t;
    boolean non_empty;
    evaluation_result complete;

    thunk terminal;
    thunk run;
    ticks cycle_time;

    vector default_scan_scopes;
    vector default_insert_scopes; // really 'session'
    bag bag_bag;

    bag_block_handler inject_blocks;
};


void execute(evaluation);

table builders_table();
block build(evaluation e, compiled c);
table start_fixedpoint(heap, table, table, table);
void close_evaluation(evaluation);

extern char *pathroot;

vector compile_eve(heap h, buffer b, boolean tracing, bag *compiler_bag);

evaluation build_evaluation(heap h, estring name,
                            table scopes, table persisted,
                            evaluation_result e, error_handler error,
                            vector implications);

void run_solver(evaluation s);
void inject_event(evaluation, bag);
void block_close(block);
bag init_request_service();

bag filebag_init(buffer);
extern thunk ignore;

static void get_stack_trace(string *out)
{
    void **stack = 0;
    asm("mov %%rbp, %0": "=rm"(stack)::);
    while (*stack) {
        stack = *stack;
        void * addr = *(void **)(stack - 1);
        if(addr == 0) break;
        bprintf(*out, "0x%016x\n", addr);
    }
}

void merge_scan(evaluation ev, vector scopes, int sig, listener result, value e, value a, value v);


bag init_debug_bag(evaluation ev);
bag init_bag_bag(evaluation ev);

typedef struct process_bag *process_bag;
process_bag process_bag_init();

typedef closure(object_handler, bag, uuid);
object_handler create_json_session(heap h, evaluation ev, endpoint down);
evaluation process_resolve(process_bag, uuid);


static CONTINUATION_3_1(fill_bag, bag, value*, value *, value);
static void fill_bag(bag target, value *e, value *a, value v)
{
    value z = v;
    if (type_of(v) == estring_space) {
        estring s = v;
        if (s->length > 64) z = sym(....);
    }
    prf("deser %v\n", z);
    if (!*e) {*e = v; return;}
    if (!*a) {*a = v; return;}
    apply(target->insert, *e, *a, v, 1, 0);
    *e = *a = 0;
}

buffer_handler allocate_deserialize(heap h, closure(handler, value));

static inline buffer_handler deserialize_into_bag(heap h, bag b)
{
    value *e = allocate(h, sizeof(value));
    value *a = allocate(h, sizeof(value));
    *e = *a = 0;
    return(allocate_deserialize(h, cont(h, fill_bag, b, e, a)));
}

bag connect_postgres(station s, estring user, estring password, estring database);
bag env_init();
bag start_log(bag base, char *filename);
void serialize_edb(buffer dest, edb db);
bag udp_bag_init();
bag timer_bag_init();

station create_station(unsigned int address, unsigned short port);
