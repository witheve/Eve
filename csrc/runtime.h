typedef void *value;

#include <core/core.h>

iu64 key_of(value);
boolean equals(value, value);
#include <number.h>
#include <estring.h>

typedef value eboolean;
extern eboolean etrue;
extern eboolean efalse;


void print(buffer, value);
static inline table create_value_table(heap h)
{
    return  allocate_table(h, key_of, equals);
}


typedef struct bag *bag;

bag create_bag(value); 
void edb_insert(bag b, value e, value a, value v);

void init_runtime();

void error(char *);


#define UUID_LENGTH 12

uuid generate_uuid();

typedef int operator;


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
typedef closure(insertron, value, value, value);

#define def(__s, __v, __i)  table_set(__s, intern_string((unsigned char *)__v, cstring_length((char *)__v)), __i);

static inline iu64 key_from_pointer(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static inline boolean compare_pointer(void *x, void *y) {return(x==y);}


CONTINUATION_1_3(edb_insert, bag, value, value, value);

string bag_dump(heap h, bag b);
