typedef void *value;

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

#include <number.h>
#include <estring.h>

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

struct evaluation  {
    heap h;
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
};


void execute(evaluation);

table builders_table();
block build(evaluation e, compiled c);
table start_fixedpoint(heap, table, table, table);
void close_evaluation(evaluation);

extern char *pathroot;


vector compile_eve(heap h, buffer b, boolean tracing, bag *compiler_bag);

evaluation build_evaluation(heap h, table scopes, table persisted,
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
void multibag_insert(multibag *mb, heap h, uuid u, value e, value a, value v, multiplicity m, uuid block_id);


static void build_bag(table scope, table bags, char *name, bag b)
{
    uuid x = generate_uuid();
    table_set(bags, x, b);
    table_set(scope, intern_cstring(name),x);
}

static evaluation build_process(heap h,
                                buffer source,
                                boolean tracing,
                                table inputs,
                                evaluation_result r,
                                error_handler e)
{
    buffer desc;
    bag compiler_bag;
    vector n = compile_eve(h, source, tracing, &compiler_bag);
    table scopes = create_value_table(h);
    return build_evaluation(h, scopes, inputs, r, e, n);
}

typedef struct process_bag *process_bag;
process_bag process_bag_init();

typedef closure(object_handler, bag, uuid);
object_handler create_json_session(heap h, evaluation ev, endpoint down, uuid u);
evaluation process_resolve(process_bag, uuid);
