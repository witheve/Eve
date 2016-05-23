typedef unsigned long long bits;
typedef void *value;
#define bitsizeof(__x) (sizeof(__x) * 8)

#include <stdarg.h> //env
// change tree
#define false (0)
#define true (1)

#define EMPTY ((void *) 0)

static inline int bytesof(bits x)
{
    // who uses this? it should probably pad up?
    return(x>>3);
}

typedef unsigned char iu8;
typedef unsigned short iu16;
typedef unsigned int iu32;
typedef unsigned long iu64;
typedef iu8 *u8;
typedef iu16 *u16;
typedef iu32 *u32;
typedef iu64 *u64;
typedef u64 ticks;
typedef iu8 boolean;
typedef iu64 bytes;

iu64 key_of(value);
boolean equals(value, value);
void *memcpy(void *s1, const void *s2, iu64 n);
int memcmp(const void *s1, const void *s2, iu64 n);
void *memset(void *b, int c, iu64 len);

#include <heap.h>
#include <continuation.h>
#include <buffer.h>
#include <vector.h>
#include <table.h>
#include <types.h>
#include <alloca.h> // env
#include <string.h>
#include <number.h>

typedef value eboolean;
extern eboolean etrue;
extern eboolean efalse;

extern heap init;
extern heap pages;

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
typedef struct interpreter *interpreter;
interpreter build_lua();
void lua_run_file(interpreter c, char *filename);
