#include <stdarg.h> //env
// change tree
#define false (0)
#define true (1)

#define EMPTY ((void *) 0)


typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef u64 ticks;
typedef u8 boolean;
typedef u64 bytes;

typedef unsigned long size_t;

// sad but useful intrinsics tied up with libc
void *memcpy(void *s1, const void *s2, size_t n);
int memcmp(const void *s1, const void *s2, size_t n);
void *memset(void *b, int c, size_t len);

static inline u64 key_from_pointer(void *x) {return((unsigned long) x);}
// uhh, if the key is u64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static inline boolean compare_pointer(void *x, void *y) {return(x==y);}

typedef struct buffer *buffer;

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

