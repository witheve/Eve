typedef void *value;

#include <core/core.h>
#include <types.h>


typedef enum {
    op_insert = 1,
    op_remove,
    op_flush,
    op_close
} operator;
    

iu64 key_of(value);
boolean equals(value, value);

#include <number.h>
#include <estring.h>

typedef value eboolean;
extern eboolean etrue;
extern eboolean efalse;
extern heap efence;

void print(buffer, value);

static inline table create_value_table(heap h)
{
    return  allocate_table(h, value_as_key, value_equals);
}

static inline table create_value_vector_table(heap h)
{
    return  allocate_table(h, value_vector_as_key, value_vector_equals);
}


typedef struct bag *bag;

bag create_bag(uuid);
void edb_insert(bag b, value e, value a, value v);
void edb_remove(bag b, value e, value a, value v);
void edb_set(bag b, value e, value a, value v);

void init_runtime();

void error(char *);


#define UUID_LENGTH 12

uuid generate_uuid();

typedef closure(three_listener, value, value, value, eboolean);
typedef closure(two_listener, value, value, eboolean);
typedef closure(one_listener, value, eboolean);
typedef closure(zero_listener, eboolean);

void full_scan(bag b, three_listener f);
void ea_scan(bag b, value, value, one_listener f);
void av_scan(bag b, value, value, one_listener f);
void eav_scan(bag b, value e, value a, value v, zero_listener f);
void e_scan(bag b, value e,  two_listener f);

void uuid_base_print(char *, void *);
string aprintf(heap h, char *fmt, ...);
void bbprintf(string b, string fmt, ...);

typedef closure(execf, operator, value *);
typedef closure(insertron, value, value, value, value);

#define def(__s, __v, __i)  table_set(__s, intern_string((unsigned char *)__v, cstring_length((char *)__v)), __i);

static inline iu64 key_from_pointer(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static inline boolean compare_pointer(void *x, void *y) {return(x==y);}


CONTINUATION_1_3(edb_insert, bag, value, value, value);

string bag_dump(heap h, bag b);

void print_value(buffer, value);

void prf(char *, ...);

// turn off all the typesafety, sig, listener, values as matched by the position
typedef closure(scan, int, void *, value, value, value);


typedef struct evaluation  {
    heap h;
    bag b;
    thunk terminal;
    insertron insert;
    insertron remove;
    insertron set;
    table counters;
    table solution;
    table scopes;
    vector handlers;
    boolean pass;
    scan s;
    table nmap;
    ticks t;
    boolean non_empty;
} *evaluation;

typedef struct node *node;

typedef execf (*buildf)(evaluation, node);

struct node {
    value id;
    estring type;
    buildf builder;
    vector arms;
    vector arguments; // always vectors of vectors
} *node;

table builders_table();
void register_implication(node n);
execf build(evaluation e, node n);
table start_fixedpoint(heap, table, table, table);

#define s_eav 0x0
#define s_eAv 0x2
#define s_eAV 0x3
#define s_Eav 0x4
#define s_EAv 0x6
#define s_EAV 0x7

void edb_scan(bag b, int sig, void *f, value e, value a, value v);

table edb_implications();
void edb_register_implication(bag b, node n);
void edb_remove_implication(bag b, node n);
uuid edb_uuid(bag b);
int edb_size(bag b);

<<<<<<< HEAD
node compile_eve(buffer b, boolean tracing);
evaluation build_evaluation(heap h, table scopes, table persisted, table counts, thunk final);
void run_evaluation(evaluation);
void inject_event(evaluation, node);

// months, days, weeks, day or week, year, day of year, etc.
void clocktime(ticks t, unsigned int *hours, unsigned int *minutes, unsigned int *seconds);
=======
vector compile_eve(buffer b, boolean tracing);
evaluation build_evaluation(heap h, table scopes, table persisted, table counts);
void run_solver(evaluation s);
void inject_event(evaluation, vector node);
>>>>>>> origin
