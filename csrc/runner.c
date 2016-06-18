#include <runtime.h>

// should be out of the bag
table implications;

void register_implication(node n)
{
    if (!implications)
        implications = allocate_table(init, key_from_pointer, compare_pointer);
    table_set(implications, n, (void *)1);
}

static CONTINUATION_2_4(inserty, table, boolean *, uuid, value, value, value);
static void inserty(table multibag, boolean *flag, uuid u, value e, value a, value v)
{
    *flag = true;
    bag b;
    if (!(b = table_find(multibag, u)))
        table_set(multibag, u, b = create_bag(u));
    edb_insert(b, e, a, v);
}

static CONTINUATION_1_5(merge_scan, table, int, void *, value, value, value);
static void merge_scan(table t, int sig, void *listen, value e, value a, value v)
{
    table_foreach(t, u, b) {
        edb_scan(b, sig, listen, e, a, v);
    }
}



table start_fixedpoint(heap h, table scopes, table persisted)
{
    table t = create_value_table(h);
    table_foreach(persisted, bag_id, bag) {
        table_set(t, bag_id, bag);
    }
    vector handlers = allocate_vector(h,10);
    boolean pass = true;
    int rules = 0;
    int iterations = 0;
    three_listener in = cont(h, inserty, t, &pass);

    table_foreach(scopes, name, b) {
        // last argument is terminal, ignore for a moment since the
        // evaluation is synchronous
        table_foreach(edb_implications(b), n, v) {
            rules++;
            vector_insert(handlers, build(n, scopes, cont(h, merge_scan, t), in, 0));
        }
    }


    ticks start_time = now();
    while (pass) {
        iterations++;
        pass = false;
        vector_foreach(handlers, k) {
            // synch
            execute(k);
        }
    }
    ticks end_time = now();
    prf ("fixedpoint in %t seconds, %d rules, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, rules, iterations, table_elements(scopes), table_elements(t));
    return t;
}
