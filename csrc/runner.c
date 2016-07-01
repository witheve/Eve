#include <runtime.h>


static CONTINUATION_1_4(inserty, evaluation, uuid, value, value, value);
static void inserty(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    prf ("insert %v %v %v %v\n", u, e, a, v);
    edb_insert(b, e, a, v, 1);
}

static CONTINUATION_1_4(removey, evaluation,uuid, value, value, value);
static void removey(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    prf ("remove %v %v %v %v\n", u, e, a, v);
    if (!(b = table_find(s->solution, u)))
        table_set(s->solution, u, b = create_bag(u));
    edb_insert(b, e, a, v, -1);
}

static CONTINUATION_1_4(setty, evaluation, uuid, value, value, value);
static void setty(evaluation s, uuid u, value e, value a, value v)
{
    s->pass = true;
    bag b;
    prf ("set %v %v %v %v\n", u, e, a, v);
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

static void merge_multibags(heap h, table d, table s)
{
    table_foreach(s, u, bs) {
        bag bd;
        if (!(bd = table_find(d, u))) {
            table_set(d, u, bd = create_bag(u));
        }
        
        prf ("%d %d\n", edb_size(bs), edb_size(bd));
        
        bag_foreach((bag)bs, e, a, v, c) {
            edb_insert(bd, e, a, v, c);
        }
    }
}


static void run_execf(evaluation e, execf f) 
{
    // busted
    table old = e->solution;
    e->solution = create_value_table(e->h);
    e->pass = false;
    apply(f, op_insert, 0);
    apply(f, op_flush, 0);
    if (e->pass) {
        // xxx - transient
        merge_multibags(e->h, old, e->solution);
    }
   e->solution = old;
}

void run_solver(evaluation s)
{
    long iterations = 0;
    s->pass = true;

    ticks start_time = now();
    while (s->pass) {
        iterations++;
        vector_foreach(s->handlers, k) run_execf(s, k);
    }
    
    // merge persists
    table_foreach(s->persisted, u, b) {
        bag z = table_find(s->solution, u);
        if (z) {
            bag_foreach(z, e, a, v, c)
                edb_insert(b, e, a, v, c);
        }
    }
    
    ticks end_time = now();
    table_set(s->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(s->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d rules, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(s->handlers),
         iterations, table_elements(s->scopes), table_elements(s->solution));
}


void inject_event(evaluation s, vector n)
{
    bag event = create_bag(s->event);
    vector_foreach(n, i) run_execf(s, build(s, i));
    vector_foreach(s->handlers, k) run_execf(s, k);
    table_set(s->solution, s->event_uuid, 0);
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
    e->persisted = persisted;

    e->event_uuid = generate_uuid();
    // this is only used during building
    e->nmap = allocate_table(e->h, key_from_pointer, compare_pointer);
    e->s = cont(e->h, merge_scan, e->solution);
    
    table_foreach(persisted, bag_id, bag) {
        table_set(e->solution, bag_id, bag);
    }
    table_set(e->scopes, intern_cstring("event"), e->event_uuid);

    table_foreach(e->persisted, uuid, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(e->handlers, build(e, n));
        }
    }

    return e;
}
