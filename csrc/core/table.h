typedef struct table *table;

table allocate_table(heap h, u64 (*key_function)(void *x), boolean (*equal_function)(void *x, void *y));
int table_elements(table t);

typedef u64 key;

typedef struct entry {
    void *v;
    key k;
    void *c; 
    struct entry *next;
} *entry;

struct table {
    heap h;
    int buckets;
    int count;
    entry *entries;
    u64 (*key_function)(void *x);
    boolean (*equals_function)(void *x, void *y);
};

void *table_find (table t, void *c);
void *table_find_key (table t, void *c, void **kr);
void table_set (table t, void *c, void *v);

#define eZ(x,y) ((entry) x)->y

// much threadsafe...think about start
#define table_foreach(__t, __k, __v)\
    for (int __i = 0 ; __i< (__t)->buckets; __i++) \
        for (void *__k, *__v, *__j = ((__t)->entries[__i]), *__next;    \
             __j && (__next =  eZ((__j), next) , __k = eZ(__j, c), __v = eZ(__j, v)); \
             __j = __next)
                 



