#include <runtime.h>


static CONTINUATION_1_5(insert, evaluation, uuid, value, value, value, multiplicity);
static void insert(evaluation s, uuid u, value e, value a, value v, multiplicity m)
{
    bag b;
    if (!(b = table_find(s->working_solution, u)))
        table_set(s->working_solution, u, b = create_bag(u));
    edb_insert(b, e, a, v, m);
}

static CONTINUATION_2_4(shadow, table, listener, value, value, value, int);
static void shadow(table compare, listener result, value e, value a, value v, int m)
{
    boolean s = false;
    table_foreach(compare, u, b) {
        if (count_of(b, e, a, v) < 0) s = true;
    }
    if (!s) apply(result, e, a, v, m);
}



static CONTINUATION_1_5(merge_scan, evaluation, int, listener, value, value, value);
static void merge_scan(evaluation ev, int sig, listener result, value e, value a, value v)
{
    listener s = cont(ev->h, shadow, ev->working_solution, result);
                       
    table_foreach(ev->persisted, u, b) {
        edb_scan(b, sig, s, e, a, v);
    }
    table_foreach(ev->working_solution, u, b) {
        edb_scan(b, sig, result, e, a, v);
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
        
        bag_foreach((bag)bs, e, a, v, c) {
            edb_insert(bd, e, a, v, c);
        }
    }
}


static void run_execf(evaluation e, execf f) 
{
    e->block_solution = create_value_table(e->h);
    e->non_empty = false;
    apply(f, op_insert, 0);
    apply(f, op_flush, 0);
    if (e->non_empty) {
        merge_multibags(e->h, e->working_solution, e->block_solution);
    }
}

static void fixedpoint(evaluation s)
{
    long iterations = 0;
    s->pass = true;

    ticks start_time = now();
    // double iteration
    while (s->pass) {
        iterations++;
        vector_foreach(s->blocks, k) run_execf(s, k);
    }

    apply(s->complete, s->counters, s->working_solution);
          
    // merge persists
    table_foreach(s->persisted, u, b) {
        bag z = table_find(s->working_solution, u);
        if (z) {
            bag_foreach(z, e, a, v, c) {
                edb_insert(b, e, a, v, c);
            }
        }
    }
    
    ticks end_time = now();
    table_set(s->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(s->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d blocks, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(s->blocks),
         iterations, table_elements(s->scopes), table_elements(s->working_solution));
}


void inject_event(evaluation s, vector n)
{
    s->t++;
    s->working_solution =  create_value_table(s->h);
    vector_foreach(n, i) run_execf(s, build(s, i));
    fixedpoint(s);
}

void run_solver(evaluation s)
{
    s->working_solution =  create_value_table(s->h);
    fixedpoint(s);
}
    
evaluation build_evaluation(heap h, table scopes, table persisted, evaluation_result r)
{
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h = h;
    e->scopes = scopes;
    // ok, now counts just accrete forever
    e->counters =  allocate_table(h, key_from_pointer, compare_pointer);
    e->insert = cont(h, insert, e);
    e->blocks = allocate_vector(h, 10);
    e->persisted = persisted;

    // this is only used during building
    e->nmap = allocate_table(e->h, key_from_pointer, compare_pointer);
    e->s = cont(e->h, merge_scan, e);

    table_foreach(e->persisted, uuid, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(e->blocks, build(e, n));
        }
    }

    return e;
}
