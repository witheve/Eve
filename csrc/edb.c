#include <runtime.h>

typedef struct level {
    table lookup;
    table listeners;
} *level;


struct bag {
    table listeners;
    level eav;
    level ave;
    value uuid;
    heap h;
};

static iu64 key_from_pointer(void *x) {return((unsigned long) x);}
// uhh, if the key is iu64 then we are prefiltering on this anyways...so...
// but maybe we can mix up key a little bit for better distribution?
static boolean compare_pointer(void *x, void *y) {return(x==y);}


typedef closure(two_listener, value, value);
typedef closure(one_listener, value);


void full_scan(bag b, three_listener f)
{
    // add listener
    foreach_table(b->eav->lookup, e, avl) {
        foreach_table(((level)avl)->lookup, a, vl) {
            foreach_table(((level)vl)->lookup, v, vl) {
                apply(f, e, a, v);
            }
        }
    }
}

static level create_level(heap h)
{
    level x = allocate(h, sizeof(struct level));
    x->lookup = create_value_table(h);
    // should be a pointer comparison and key function
    x->listeners = allocate_table(h, key_from_pointer, compare_pointer);
    return x;
}

// ok, we're going to assume that if there is a miss here we should create the
// next level, since at the very minimum we're going to want to register
// a listener for regularity. sadly, at this moment this means that
// the leaves will end up with a quite useless and empty table
// allocation for the non-existent subsequent level..so it should take creator
level scan(heap h, level lev, value key)
{
    // xxx - thread safety across the read/write - should keep a list of rejected raceos too
    level x = table_find(lev->lookup, key);
    if (!x)  {
        x = create_level(h);
        printf("set level %p %p\n", key, x);

        table_set(lev->lookup, key, x);
    }
    return x;
}

// its probably going to be better to keep a global guy with
// reference counts because of the object sharing, but this is
// ok for today
bag create_bag(value bag_id) 
{
    heap h = allocate_rolling(pages);
    bag b = allocate(h, sizeof(struct level));
    b->h = h ;
    b->eav = create_level(h);
    b->listeners = allocate_table(h, key_from_pointer, compare_pointer);

    return b;
}

void edb_insert(bag b, value e, value a, value v)
{
    level el = scan(b->h, b->eav, e);
    level al = scan(b->h, el, a);
    level tail = scan(b->h, al, v);

    // incremental needs to deal with remove
    foreach_table(b->listeners, k, v) {
        apply((three_listener)k, e, a, v);
    }
    foreach_table(el->listeners, k, v) {
        apply((two_listener)k, a, v);
    }
    foreach_table(al->listeners, k, v) {
        apply((one_listener)k, v);
    }
    foreach_table(tail->listeners, k, v) {
        apply((one_listener)k, etrue);
    }
}

void edb_remove(bag b, value e, value a, value v)
{
    error("but we went to so much trouble!\n");
}


