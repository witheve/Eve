typedef struct edb *edb;

typedef closure(listener, value, value, value, multiplicity, uuid);
typedef closure(scanner, int, listener, value, value, value);
typedef closure(inserter, value, value, value, multiplicity, uuid);
typedef closure(committer, edb);

struct bag {
    uuid u;
    scanner scan;
    scanner scan_sync;
    inserter insert;
    committer commit;
    table listeners; // who is this again?
    table implications; // goes away with reflection
};

struct edb {
    struct bag b;
    table eav;
    table ave;
    int count;
    heap h;
    vector includes; // an immutable set
};

typedef struct leaf {
    uuid u;
    uuid block_id;
    ticks t;
    multiplicity m;
} *leaf;

#define s_eav 0x0
#define s_eAv 0x2
#define s_eAV 0x3
#define s_Eav 0x4
#define s_EAv 0x6
#define s_EAV 0x7

value lookupv(edb b, uuid e, estring a);

int edb_size(edb b);
void destroy_bag(bag b);

// xxx - these iterators dont account for shadowing
#define edb_foreach(__b, __e, __a, __v, __c, __block_id)   \
    table_foreach((__b)->eav, __e, __avl) \
    table_foreach((table)__avl, __a, __vl)\
    table_foreach((table)__vl, __v, __cv)\
    for(uuid __block_id = ((leaf)__cv)->block_id , __p = 0; !__p; __p++)    \
    for(multiplicity __c = ((leaf)__cv)->m, __z = 0; !__z; __z++)

long count_of(edb b, value e, value a, value v);
edb create_edb(heap, uuid, vector inherits);

#define edb_foreach_av(__b, __e, __a, __v, __c)\
    for(table __av = (table)table_find((__b)->eav, __e); __av; __av = 0)  \
    table_foreach((table)__av, __a, __vl)\
    table_foreach((table)__vl, __v, __cv)\
    for(multiplicity __c = ((leaf)__cv)->m , __z = 0; __z == 0; __z++)

#define edb_foreach_a(__b, __e, __a, __v, __c)\
    for(table __avt = (table)table_find((__b)->ave, __a); __avt; __avt = 0)  \
    table_foreach((table)__avt, __v, __ect)\
    table_foreach((table)__ect, __e, __cv)\
    for(multiplicity __c = ((leaf)__cv)->m , __z = 0; __z == 0; __z++)

#define edb_foreach_e(__b, __e, __a, __v, __c)\
    for(table __avt = (table)table_find((__b)->ave, __a),\
               __et = __avt?(table)table_find(__avt, __v):0; __et; __et = 0)   \
    table_foreach((table)__et, __e, __cv)\
    for(multiplicity __c = ((leaf)__cv)->m , __z = 0; __z == 0; __z++)

buffer edb_dump(heap, edb);
