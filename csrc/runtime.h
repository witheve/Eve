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


typedef closure(evaluation_result, table, table);

typedef closure(block_completion, boolean);


typedef struct compiled {
    string name;
    node head;
    int regs;
} *compiled;

struct block {
    heap h;
    int regs;
    string name;
    execf head;
    evaluation ev;
    table nmap;
};


#include <edb.h>

typedef closure(insertron, value, value, value, value, multiplicity);

struct evaluation  {
    heap h;
    heap working;
    insertron insert;
    scanner reader;

    table counters;

    table block_solution;
    table solution;
    table last_f_solution;
    table t_solution;

    table persisted;
    table scopes;
    vector blocks;
    vector event_blocks;

    ticks t;
    boolean non_empty;
    evaluation_result complete;

    thunk terminal;
    thunk run;
    ticks cycle_time;
    table f_bags;
    block bk; //currently running block
};


void execute(evaluation);

table builders_table();
block build(evaluation e, compiled c);
table start_fixedpoint(heap, table, table, table);
void close_evaluation(evaluation);

vector compile_eve(heap h, buffer b, boolean tracing, buffer *desc);
evaluation build_evaluation(table scopes, table persisted, evaluation_result e);
void run_solver(evaluation s);
void inject_event(evaluation, buffer b, boolean);
void block_close(block);

void init_request_service(bag b);


typedef closure(bag_handler, evaluation, bag);
