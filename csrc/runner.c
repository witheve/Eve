#include <runtime.h>


static CONTINUATION_1_4(inserty, evaluation, uuid, value, value, value);
static void inserty(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_insert(b, e, a, v);
}

static CONTINUATION_1_4(removey, evaluation, uuid, value, value, value);
static void removey(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_remove(b, e, a, v);
}

static CONTINUATION_1_4(setty, evaluation, uuid, value, value, value);
static void setty(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_set(b, e, a, v);
}

static CONTINUATION_1_5(merge_scan, table, int, void *, value, value, value);
static void merge_scan(table t, int sig, void *listen, value e, value a, value v)
{
    table_foreach(t, u, b) {
        edb_scan(b, sig, listen, e, a, v);
    }
}

void run_evaluation(evaluation e)
{
    long iterations = 0;
    e->pass = true;

    ticks start_time = now();
    while (e->pass) {
        iterations++;
        e->pass = false;
        // fork?
        vector_foreach(e->handlers, k) {
            execf x = k;
            // is insert meaninful here?
            apply(x, op_insert, 0);
            apply(x, op_flush, 0);
        }
    }
    ticks end_time = now();
    table_set(e->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(e->counters, intern_cstring("iterations"), (void *)iterations);
    prf ("fixedpoint in %t seconds, %d rules, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(e->handlers),
         iterations, table_elements(e->scopes), table_elements(e->solution));
}


void inject_event(evaluation s, node n)
{
    execf nb = build(s, n);
    apply(nb, op_insert, 0);
    apply(nb, op_flush, 0);
    // isn't this the fixed point from the augmented solution
    vector_foreach(s->handlers, k) {
        execf nb = k;
        apply(nb, op_insert, 0);
        apply(nb, op_flush, 0);
    }
}

evaluation build_evaluation(heap h, table scopes, table persisted, table counts, execf final)
{
    evaluation s = allocate(h, sizeof(struct evaluation));
    s->h = h;
    s->scopes = scopes;
    s->solution =  create_value_table(h);
    s->counters = counts;
    s->insert = cont(h, inserty, s);
    s->remove = cont(h, removey, s);
    s->set = cont(h, setty, s);
    s->handlers = allocate_vector(h,10);
    
    table_foreach(persisted, bag_id, bag) {
        table_set(s->solution, bag_id, bag);
    }
        
    table_foreach(s->scopes, name, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(s->handlers, build(s, n));
        }
    }

    return s;
}
