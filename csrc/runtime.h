typedef void *value;

#include <core/core.h>
#include <types.h>

typedef enum {
    op_insert = 1,
    op_remove,
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
string aprintf(heap h, char *fmt, ...);
void bbprintf(string b, string fmt, ...);

typedef closure(execf, operator, value *);
typedef closure(insertron, value, value, value, value, multiplicity);

#define def(__s, __v, __i)  table_set(__s, intern_string((unsigned char *)__v, cstring_length((char *)__v)), __i);


string bag_dump(heap h, bag b);

void print_value(buffer, value);

void prf(char *, ...);

typedef closure(listener, value, value, value, multiplicity);
typedef closure(scan, int, listener, value, value, value);

typedef struct node *node;
typedef struct evaluation *evaluation;
typedef struct block *block;
typedef execf (*buildf)(block, node);

struct node {
    value id;
    estring type;
    buildf builder;
    vector arms;
    vector arguments; // always vectors of vectors
};


typedef closure(evaluation_result, table, table);

typedef closure(block_completion, boolean);


struct block {
    heap h;
    vector finish;
    execf head;
    evaluation e;
    table nmap;
};
    
struct evaluation  {
    heap h;
    insertron insert;
    table counters;

    // uhh...wow, there are alot of versions
    table block_solution;
    table f_solution;
    table next_f_solution;
    table t_solution;
    table next_t_solution;
    table ev_solution;

    table persisted;
    table scopes;
    vector blocks;
    scan reader;
    ticks t;
    boolean non_empty, pass, inserted;
    evaluation_result complete;
    
    thunk terminal;
};


void execute(evaluation);

table builders_table();
void register_implication(node n);
block build(evaluation e, node n);
table start_fixedpoint(heap, table, table, table);

vector compile_eve(buffer b, boolean tracing);
evaluation build_evaluation(heap h, table scopes, table persisted, evaluation_result e);
void run_solver(evaluation s);
void inject_event(evaluation, vector node);

#include <edb.h>
