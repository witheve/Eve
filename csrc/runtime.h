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

// break this out 
typedef struct interpreter *interpreter;
interpreter build_lua();
void lua_load_bytecode(interpreter, void *, bytes);
void lua_run(interpreter c, buffer b);
void eve_run(interpreter c, buffer b);
void require_luajit(interpreter c, char *z);


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

void uuid_base_print(char *, void *);
string aprintf(heap h, char *fmt, ...);
void bbprintf(string b, string fmt, ...);

typedef closure(execf, operator, value *);

execf lua_compile_eve(interpreter c, buffer b);
void lua_run_module_func(interpreter c, buffer b, char *module, char *func);
