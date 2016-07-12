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
        table_set(s->block_solution, u, b = create_bag(s->working, u));
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
    listener f_filter = cont(ev->working, shadow, ev->f_solution, result);
    listener x_filter = cont(ev->working, shadow, ev->t_solution, f_filter);

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

static void merge_multibag_bag(heap h, table d, uuid u, bag s)
{
    bag bd;

    if (!(bd = table_find(d, u))) {
        table_set(d, u, bd = create_bag(h, u));
    }
    
    bag_foreach(s, e, a, v, c) 
        edb_insert(bd, e, a, v, c);
}

static void run_block(heap h, block bk) 
{
    heap bh = allocate_rolling(pages, sstring("block run"));
    bk->ev->block_solution = create_value_table(bh);
    bk->ev->non_empty = false;
    bk->ev->inserted = false;
    u64 z = pages->allocated;
    u64 zb = bk->h->allocated;
    apply(bk->head, h, op_insert, 0);
    apply(bk->head, h, op_flush, 0);

    if (bk->ev->non_empty) {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, true);

        table_foreach(bk->ev->block_solution, u, bg) 
            merge_multibag_bag(h, bk->ev->next_f_solution, u, bg);
    } else {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, false);
    }
    destroy(bh);
}

static void fixedpoint(evaluation ev)
{
    long iterations = 0;
    boolean t_continue = true;
    vector counts = allocate_vector(ev->working, 10);

    ticks start_time = now();
    ev->t = start_time;
    ev->t_solution =  create_value_table(ev->working);

    // double iteration
    while (t_continue) {
        ev->pass = true;
        t_continue = false;
        ev->next_t_solution =  create_value_table(ev->working);
        ev->f_solution =  create_value_table(ev->working);
        while (ev->pass) {
            ev->pass = false;
            iterations++;
            ev->next_f_solution =  create_value_table(ev->working);
            vector_foreach(ev->blocks, b) run_block(ev->working, b);
            table_foreach(ev->next_f_solution, u, b) {
                if (table_find(ev->persisted, u)) {
                    t_continue = true;
                    merge_multibag_bag(ev->working, ev->next_t_solution, u, b);
                } else {
                    merge_multibag_bag(ev->working, ev->f_solution, u, b);
                }
            }
        }
        table_foreach(ev->next_t_solution, u, b) 
            merge_multibag_bag(ev->working, ev->t_solution, u, b);
        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        ev->t++;
        ev->ev_solution = 0;
    }
    // merge but ignore bags not in persisted
    table_foreach(ev->t_solution, u, b) {
        bag bd;
        if ((bd = table_find(ev->persisted, u))) {
            bag_foreach((bag)b, e, a, v, c) {
                edb_insert(bd, e, a, v, c);
            }
        }
    }

    // this is a bit strange, we really only care about the
    // non-persisted final state here
    apply(ev->complete, ev->f_solution, ev->counters);

    ticks end_time = now();
    table_set(ev->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(ev->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d blocks, %V iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(ev->blocks),
         counts, table_elements(ev->scopes), table_elements(ev->t_solution));
}

void inject_event(evaluation ev, buffer b, boolean tracing)
{
    heap h = allocate_rolling(pages, sstring("event"));
    buffer desc;
    vector n = compile_eve(h, b, tracing, &desc);
    ev->working = h;
    ev->t++;
    ev->ev_solution = 0;
    ev->next_f_solution = create_value_table(ev->working);
    // close this block
    vector_foreach(n, i) {
        block b = build(ev, i);
        run_block(ev->working, b);
        apply(b->head, ev->h, op_close, 0);
    }
    table k;
    k = ev->ev_solution = ev->next_f_solution;
    fixedpoint(ev);
    destroy(h);
}

void run_solver(evaluation ev)
{
    heap h = allocate_rolling(pages, sstring("working"));
    ev->ev_solution = 0;
    ev->working = h;
    fixedpoint(ev);
    destroy(h);
}

void close_evaluation(evaluation ev) 
{
    vector_foreach(ev->blocks, b)
        apply(((block)b)->head, ev->working, op_close, 0);
    destroy(ev->h);
}
    
evaluation build_evaluation(table scopes, table persisted, evaluation_result r)
{
    heap h = allocate_rolling(pages, sstring("eval"));
    evaluation ev = allocate(h, sizeof(struct evaluation));
    ev->h = h;
    ev->scopes = scopes;
    // ok, now counts just accrete forever
    ev->counters =  allocate_table(h, key_from_pointer, compare_pointer);
    ev->insert = cont(h, insert_f, ev);
    ev->blocks = allocate_vector(h, 10);
    ev->persisted = persisted;

    ev->reader = cont(ev->h, merge_scan, ev);
    ev->complete = r;
    ev->terminal = cont(ev->h, evaluation_complete, ev);

    table_foreach(ev->persisted, uuid, b) {
        table_foreach(edb_implications(b), n, v){
            vector_insert(ev->blocks, build(ev, n));
        }
    }

    return ev;
}
