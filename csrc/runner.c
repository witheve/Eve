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

    s->inserted = true;
    if (!(b = table_find(s->block_solution, u))) {
        table_set(s->block_solution, u, b = create_bag(u));
    }
    edb_insert(b, e, a, v, m);
}

static CONTINUATION_2_4(shadow, table, listener, value, value, value, multiplicity);
static void shadow(table multibag, listener result, value e, value a, value v, multiplicity m)
{
    boolean s = false;
    if (m > 0) {
        table_foreach(multibag, u, b) 
            if (count_of(b, e, a, v) <0) s = true;
        if (!s) apply(result, e, a, v, m);
    }
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
    listener x_filter = cont(ev->h, shadow, ev->t_solution, f_filter);

    // xxx - currently precluding removes in the event set
    if (ev->ev_solution) {
        table_foreach(ev->ev_solution, u, b) 
            edb_scan(b, sig, result, e, a, v);
    }

    table_foreach(ev->persisted, u, b) 
        edb_scan(b, sig, x_filter, e, a, v);

    table_foreach(ev->t_solution, u, b) 
        edb_scan(b, sig, f_filter, e, a, v);

    table_foreach(ev->f_solution, u, b) 
        edb_scan(b, sig, result, e, a, v);
}

static CONTINUATION_1_0(evaluation_complete, evaluation);
static void evaluation_complete(evaluation s)
{
    if (s->inserted)
        s->pass = true;
    s->non_empty = true;
}

static void merge_multibag_bag(table d, uuid u, bag s)
{
    bag bd;

    if (!(bd = table_find(d, u))) {
        // what heap?
        table_set(d, u, bd = create_bag(u));
    }
    
    bag_foreach(s, e, a, v, c) 
        edb_insert(bd, e, a, v, c);
}

static void run_block(block bk) 
{
    bk->e->block_solution = create_value_table(bk->e->h);
    bk->e->non_empty = false;
    bk->e->inserted = false;
                
    apply(bk->head, op_insert, 0);
    apply(bk->head, op_flush, 0);
             
    if (bk->e->non_empty) {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, true);

        table_foreach(bk->e->block_solution, u, bg) 
            merge_multibag_bag(bk->e->next_f_solution, u, bg);
    } else {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, false);
    }
}

static void fixedpoint(evaluation s)
{
    long iterations = 0;
    boolean t_continue = true;
    vector counts = allocate_vector(s->h, 10);

    ticks start_time = now();
    s->t = start_time;
    s->t_solution =  create_value_table(s->h);


    // double iteration
    while (t_continue) {
        s->pass = true;
        t_continue = false;
        s->next_t_solution =  create_value_table(s->h);
        s->f_solution =  create_value_table(s->h);
        while (s->pass) {
            s->pass = false;
            iterations++;
            s->next_f_solution =  create_value_table(s->h);
            vector_foreach(s->blocks, b) run_block(b);
            table_foreach(s->next_f_solution, u, b) {
                if (table_find(s->persisted, u)) {
                    t_continue = true;
                    merge_multibag_bag(s->next_t_solution, u, b);
                } else {
                    merge_multibag_bag(s->f_solution, u, b);
                }
            }
        }
        table_foreach(s->next_t_solution, u, b) {
            merge_multibag_bag(s->t_solution, u, b);
        }
        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        s->t++;
        s->ev_solution = 0;
    }
    // merge but ignore bags not in persisted
    table_foreach(s->t_solution, u, b) {
        bag bd;
        if ((bd = table_find(s->persisted, u))) {
            bag_foreach((bag)b, e, a, v, c) {
                edb_insert(bd, e, a, v, c);
            }
        }
    }

    // this is a bit strange, we really only care about the
    // non-persisted final state here
    apply(s->complete, s->f_solution, s->counters);

    ticks end_time = now();
    table_set(s->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(s->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d blocks, %V iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(s->blocks),
         counts, table_elements(s->scopes), table_elements(s->t_solution));
}

void inject_event(evaluation s, vector n)
{
    s->t++;
    s->ev_solution = 0;
    s->next_f_solution = create_value_table(s->h);
    // close this block
    vector_foreach(n, i)
        run_block(build(s, i));
    s->ev_solution = s->next_f_solution;
    fixedpoint(s);
}

void run_solver(evaluation s)
{
    s->ev_solution = 0;
    fixedpoint(s);
}

void close_evaluation(evaluation e) 
{
    vector_foreach(e->blocks, b)
        apply(((block)b)->head, op_close, 0);
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

    e->reader = cont(e->h, merge_scan, e);
    e->complete = r;
    e->terminal = cont(e->h, evaluation_complete, e);

    table_foreach(e->persisted, uuid, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(e->blocks, build(e, n));
        }
    }

    return e;
}
