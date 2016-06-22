typedef struct table *table;

table allocate_table(heap h, iu64 (*key_function)(void *x), boolean (*equal_function)(void *x, void *y));
int table_elements(table t);

typedef iu64 key;

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
    vector entries;
    iu64 (*key_function)(void *x);
    boolean (*equals_function)(void *x, void *y);
};

void *table_find (table t, void *c);
void table_set (table t, void *c, void *v);

#define eZ(x,y) ((entry) *x)->y
#define eK(x,y) ((x)->entries->y)

// much threadsafe...think about start
#define table_foreach(__t, __k, __v)\
    for (void **__i = eK(__t, contents); __i<(void **)(eK(__t,contents) + eK(__t,end)); __i += 1)\
        for (void * __k, *__v, **__cache, **__j = __i; *__j && (__cache = __j, __k = eZ(__j, c), __v = eZ(__j, v), 1); __j = (void **)&eZ((__cache),next))
                 



