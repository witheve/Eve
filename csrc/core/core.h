#include <stdarg.h> //env
// change tree
#define false (0)
#define true (1)

#define EMPTY ((void *) 0)


typedef unsigned char iu8;
typedef unsigned short iu16;
typedef unsigned int iu32;
typedef unsigned long iu64;
typedef iu8 *u8;
typedef iu16 *u16;
typedef iu32 *u32;
typedef iu64 *u64;
typedef iu64 ticks;
typedef iu8 boolean;
typedef iu64 bytes;

// sad but useful intrinsics tied up with libc
void *memcpy(void *s1, const void *s2, iu64 n);
int memcmp(const void *s1, const void *s2, iu64 n);
void *memset(void *b, int c, iu64 len);

static inline iu64 key_from_pointer(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static inline boolean compare_pointer(void *x, void *y) {return(x==y);}


typedef void *station;

#include <heap.h>
#include <continuation.h>
#include <buffer.h>
#include <vector.h>
#include <table.h>
#include <alloca.h> // env
#include <string.h>
#include <timer.h>
#include <pqueue.h>

extern heap init;
extern heap pages;

