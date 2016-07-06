#include <runtime.h>

// debuggin
static estring bagname(evaluation e, uuid u)
{
    
    estring bagname = efalse;
    table_foreach(e->scopes, n, u2) if (u2 ==u) return(n);
    return(intern_cstring("missing bag?")); 
}


static CONTINUATION_1_5(insert_f, evaluation, uuid, value, value, value, multiplicity);
static void insert_f(evaluation s, uuid u, value e, value a, value v, multiplicity m)
{
    bag b;
    s->pass = true;

    if (!(b = table_find(s->next_f_solution, u)))
        table_set(s->next_f_solution, u, b = create_bag(u));

    edb_insert(b, e, a, v, m);
}

static CONTINUATION_2_4(shadow, table, listener, value, value, value, multiplicity);
static void shadow(table multibag, listener result, value e, value a, value v, multiplicity m)
{
    boolean s = false;
    table_foreach(multibag, u, b) 
        if (count_of(b, e, a, v) <0) s = true;
    if (!s) apply(result, e, a, v, m);
}


static void print_multibag(evaluation s, table m)
{ 
    table_foreach(m, u, b) {
        prf("%v %d %v %p\n%b\n", bagname(s, u), edb_size(b), u, b, bag_dump(s->h, b));
    }
}
 

static CONTINUATION_1_5(merge_scan, evaluation, int, listener, value, value, value);
static void merge_scan(evaluation ev, int sig, listener result, value e, value a, value v)
{
    listener f_filter = cont(ev->h, shadow, ev->f_solution, result);
    listener x_filter = cont(ev->h, shadow, ev->x_solution, f_filter);

    table_foreach(ev->persisted, u, b) 
        edb_scan(b, sig, x_filter, e, a, v);

    table_foreach(ev->x_solution, u, b) 
        edb_scan(b, sig, f_filter, e, a, v);

    table_foreach(ev->f_solution, u, b) 
        edb_scan(b, sig, result, e, a, v);
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

static void merge_persists(table d, table s)
{
    table_foreach(d, u, b) {
        bag z = table_find(s, u);
        if (z) {
            bag_foreach(z, e, a, v, c) {
                edb_insert(b, e, a, v, c);
            }
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
        merge_multibags(e->h, e->f_solution, e->block_solution);
    }
}

static void fixedpoint(evaluation s)
{
    long iterations = 0;
    boolean x_continue = true;
    s->pass = true;

    ticks start_time = now();
    // double iteration
    while (x_continue) {
        x_continue = false;
        while (s->pass) {
            s->pass = false;
            iterations++;
            s->next_f_solution =  create_value_table(s->h);
            vector_foreach(s->blocks, k) run_execf(s, k);

            merge_multibags(s->h, s->f_solution, s->next_f_solution);
            x_continue |= s->pass;
        }
        merge_multibags(s->h, s->x_solution, s->f_solution);
    }
    merge_persists(s->persisted, s->x_solution);
    apply(s->complete, s->x_solution, s->counters);

    ticks end_time = now();
    table_set(s->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(s->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d blocks, %d iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(s->blocks),
         iterations, table_elements(s->scopes), table_elements(s->x_solution));
}


void inject_event(evaluation s, vector n)
{
    s->t++;
    s->x_solution = create_value_table(s->h);
    s->f_solution = create_value_table(s->h);
    s->next_f_solution = create_value_table(s->h);
    vector_foreach(n, i) run_execf(s, build(s, i));
    s->f_solution = s->next_f_solution;
    s->next_f_solution = create_value_table(s->h);
    fixedpoint(s);
}

void run_solver(evaluation s)
{
    s->f_solution =  create_value_table(s->h);
    s->x_solution =  create_value_table(s->h);
    fixedpoint(s);
}
    
evaluation build_evaluation(heap h, table scopes, table persisted, evaluation_result r)
{
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h = h;
    e->scopes = scopes;
    // ok, now counts just accrete forever
    e->counters =  allocate_table(h, key_from_pointer, compare_pointer);
    e->insert = cont(h, insert_f, e);
    e->blocks = allocate_vector(h, 10);
    e->persisted = persisted;

    // this is only used during building
    e->nmap = allocate_table(e->h, key_from_pointer, compare_pointer);
    e->reader = cont(e->h, merge_scan, e);
    e->complete = r;

    table_foreach(e->persisted, uuid, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(e->blocks, build(e, n));
        }
    }

    return e;
}
