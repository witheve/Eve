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

static CONTINUATION_1_4(removey, evaluation,uuid, value, value, value);
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

static CONTINUATION_1_2(evaluation_complete, evaluation, operator, value *);
static void evaluation_complete(evaluation s, operator op, value *r)
{
    s->non_empty = true;
}


void run_solver(evaluation s)
{
    long iterations = 0;
    s->pass = true;

    ticks start_time = now();
    while (s->pass) {
        iterations++;
        s->pass = false;
        vector_foreach(s->handlers, k) {
            execf f = k;
            apply(f, op_insert, 0);
            apply(f, op_flush, 0);
        }
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


void inject_event(evaluation s, vector n)
{
    bag event = create_bag(generate_uuid());
    table_set(s->scopes, intern_cstring("event"), event);
    
    vector_foreach(n, i) {
        execf f = build(s, i);
        apply(f, op_insert, 0);
        apply(f, op_flush, 0);
    }
    
    vector_foreach(s->handlers, k) {
        execf f = k;
        apply(f, op_insert, 0);
        apply(f, op_flush, 0);
    }
}

evaluation build_evaluation(heap h, table scopes, table persisted, table counts)
{
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h = h;
    e->scopes = scopes;
    e->solution =  create_value_table(h);
    e->counters = counts;
    e->insert = cont(h, inserty, e);
    e->remove = cont(h, removey, e);
    e->set = cont(h, setty, e);
    e->handlers = allocate_vector(h,10);
    
    table_foreach(persisted, bag_id, bag) {
        table_set(e->solution, bag_id, bag);
    }
        
    table_foreach(e->scopes, name, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(e->handlers, build(e, n));
        }
    }

    return e;
}
