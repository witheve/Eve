#include <core.h>

static void allocate_buckets(table t)
{
    t->entries = allocate_vector(t->h, t->buckets);
    memset(t->entries->contents, 0, t->entries->end = t->buckets * sizeof(void *));
}

table allocate_table(heap h, u64 (*key_function)(void *x), boolean (*equals_function)(void *x, void *y))
{
    table new = allocate(h, sizeof(struct table));
    new->h = h;
    new->count = 0;
    new->buckets = 4;
    allocate_buckets(new);
    new->key_function = key_function;
    new->equals_function = equals_function;
    return(new);
}

static inline key position(table t, key x)
{
    return(x%t->buckets);
}

// need an atomic find and create
void *table_find (table t, void *c)
{
    key k = t->key_function(c);

    for (entry i = vector_get(t->entries, position(t, k));
         i; i = i->next)
        if ((i->k == k) && t->equals_function(i->c, c))
            return(i->v);

    return(EMPTY);
}

void *table_find_key (table t, void *c, void **kr)
{
    key k = t->key_function(c);

    for (entry i = vector_get(t->entries, position(t, k));
         i; i = i->next)
        if ((i->k == k) && t->equals_function(i->c, c)){
            *kr = i->c;
            return(i->v);
        }

    return(EMPTY);
}


static void resize_table(table t, int buckets)
{
    vector old_entries = t->entries;
    key km;

    t->buckets = buckets;
    allocate_buckets(t);

    vector_foreach (old_entries, k){
        entry j = k;

        while(j) {
            entry n = j->next;
            km = j->k % t->buckets;
            j->next = vector_get(t->entries, km);
            vector_set(t->entries, km, j);
            j = n;
        }
    }
}


void table_set (table t, void *c, void *v)
{
    key k = t->key_function(c);
    key p = position(t, k);
    // xxx - opacity
    entry *e = bref(t->entries, p * sizeof(void *));

    for (; *e; e = &(*e)->next)
        if (((*e)->k == k) && t->equals_function((*e)->c, c)) {
            if (v == EMPTY) {
                t->count--;
                *e = (*e)->next;
            } else (*e)->v = v;
            return;
        }

    if (v != EMPTY) {
        entry n = allocate(t->h, sizeof(struct entry));
        n->k = k;
        n->c = c; 
        n->v = v;
        n->next = 0;
        *e = n;
        
        if (t->count++ > t->buckets) 
            resize_table(t, t->buckets*2);
    }
}

int table_elements(table t)
{
    return(t->count);
}

void print_table(string b,table t)
{
    int i;
  
    bprintf (b, "{");
    vector_foreach(t->entries, k) {
        entry j = k; 
        for (;j;j = j->next)
            // xxx  - use the input syntax for fucks sake
            bprintf (b,"(%v %v)", j->c, j->v);
    }
    bprintf (b,"}");
}


