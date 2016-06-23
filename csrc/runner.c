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

static CONTINUATION_2_4(removey, table, boolean *, uuid, value, value, value);
static void removey(table multibag, boolean *flag, uuid u, value e, value a, value v)
{
    *flag = true;
    bag b;
    if (!(b = table_find(multibag, u)))
        table_set(multibag, u, b = create_bag(u));
    edb_remove(b, e, a, v);
}

static CONTINUATION_2_4(setty, table, boolean *, uuid, value, value, value);
static void setty(table multibag, boolean *flag, uuid u, value e, value a, value v)
{
    *flag = true;
    bag b;
    if (!(b = table_find(multibag, u)))
        table_set(multibag, u, b = create_bag(u));
    edb_set(b, e, a, v);
}

static CONTINUATION_1_5(merge_scan, table, int, void *, value, value, value);
static void merge_scan(table t, int sig, void *listen, value e, value a, value v)
{
    table_foreach(t, u, b) {
        edb_scan(b, sig, listen, e, a, v);
    }
}

void run_solver(solver s, node augmentation)
{

    boolean pass = true;
    int rules = 0;
    int iterations = 0;
    three_listener inserter = cont(h, inserty, t, &pass);
    three_listener remover = cont(h, removey, t, &pass);
    three_listener setter = cont(h, setty, t, &pass);

    table_foreach(scopes, name, b) {
        // last argument is terminal, ignore for a moment since the
        // evaluation is synchronous
        table_foreach(edb_implications(b), n, v) {
            rules++;
            vector_insert(handlers, build(n, scopes, cont(h, merge_scan, t), inserter, remover, setter, counts, 0));
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

    // FIXME: this seems sketch, can something bad happen as a result of this casting?
    table_set(counts, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(counts, intern_cstring("iterations"), (void *)(long)iterations);
    prf ("fixedpoint in %t seconds, %d rules, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, rules, iterations, table_elements(scopes), table_elements(t));
    return t;
}


void build_solver(heap h, table scopes, table persisted, table counts)
{
    solver s = allocate(sizof(struct solver));
    s->h = h;
    s->scopes = scopes;
    table_foreach(s->persisted, bag_id, bag) {
        table_set(t, bag_id, bag);
    }
    s->handlers = allocate_vector(h,10);
}
