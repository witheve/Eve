#include <runtime.h>


static CONTINUATION_1_4(inserty, solver, uuid, value, value, value);
static void inserty(solver s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    prf("insert %v %v %v\n", e, a, v);
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_insert(b, e, a, v);
}

static CONTINUATION_1_4(removey, solver,uuid, value, value, value);
static void removey(solver s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    prf("remove %v %v %v\n", e, a, v);
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_remove(b, e, a, v);
}

static CONTINUATION_1_4(setty, solver, uuid, value, value, value);
static void setty(solver s, uuid u, value e, value a, value v)
{
    prf("set %v %v %v\n", e, a, v);
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

evaluation solver_build(solver s, node n)
{
    return (build(n, s->scopes,
                  cont(s->h, merge_scan, s->solution),
                  s->insert, s->remove, s->set, s->counters,
                  // missing mail
                  0));
}


void run_solver(solver s)
{
    long iterations = 0;
    s->pass = true;

    ticks start_time = now();
    while (s->pass) {
        iterations++;
        s->pass = false;
        vector_foreach(s->handlers, k) {
            execute(k);
        }
        // do not check in
        prf("complete\n");
        if (iterations > 10)
            exit(-1);
    }
    ticks end_time = now();

    // FIXME: this seems sketch, can something bad happen as a result of this casting?
    // (EAH) - not really, i mean we should probably abstract it, and maybe
    // do something a little more polymorphic with tables...
    table_set(s->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(s->counters, intern_cstring("iterations"), (void *)iterations);
    prf ("fixedpoint in %t seconds, %d rules, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(s->handlers),
         iterations, table_elements(s->scopes), table_elements(s->solution));
}


void inject_event(solver s, node n)
{
    evaluation nb = solver_build(s, n);
    execute(nb);
    vector_foreach(s->handlers, k) {
        execute(k);
    }
}

solver build_solver(heap h, table scopes, table persisted, table counts)
{
    solver s = allocate(h, sizeof(struct solver));
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
            vector_insert(s->handlers, solver_build(s, n));
        }
    }

    return s;
}
