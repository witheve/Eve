#include <runtime.h>

#define multibag_foreach(__m, __u, __b)  if(__m) table_foreach(__m, __u, __b)
                         
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

    //    if (table_find(s->persisted, u))
    //        prf("insert: %v %v %v %v %d\n", bagname(s, u), e, a, v, m);
    
    if (!s->block_solution) 
        s->block_solution = create_value_table(s->working);
    
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
    multibag_foreach(m, u, b) {
        prf("%v %d\n--------------\n%b\n", bagname(s, u), edb_size(b), bag_dump(s->h, b));
    }
}
 

static CONTINUATION_1_5(merge_scan, evaluation, int, listener, value, value, value);
static void merge_scan(evaluation ev, int sig, listener result, value e, value a, value v)
{
    listener f_filter = ev->f_solution?cont(ev->working, shadow, ev->f_solution, result):result;
    listener x_filter = ev->t_solution?cont(ev->working, shadow, ev->t_solution, f_filter):f_filter;

    // xxx - currently precluding removes in the event set
    multibag_foreach(ev->ev_solution, u, b) 
        edb_scan(b, sig, result, e, a, v);

    multibag_foreach(ev->persisted, u, b) 
        edb_scan(b, sig, x_filter, e, a, v);

    multibag_foreach(ev->t_solution, u, b) 
        edb_scan(b, sig, f_filter, e, a, v);

    multibag_foreach(ev->f_solution, u, b) 
        edb_scan(b, sig, result, e, a, v);
}

static CONTINUATION_1_0(evaluation_complete, evaluation);
static void evaluation_complete(evaluation s)
{
    if (s->block_solution)
        s->pass = true;
    s->non_empty = true;
}

static long multibag_fact_count(table d)
{
    long count = 0;
    multibag_foreach(d, u, b)
        count += edb_size(b);
    return count;
}

static void merge_multibag_bag(evaluation ev, table *d, uuid u, bag s)
{
    bag bd;
    if (!*d) {
        *d = create_value_table(ev->working);
    }

    if (!(bd = table_find(*d, u))) {
        table_set(*d, u, s); 
    } else {
        bag_foreach(s, e, a, v, c) 
            edb_insert(bd, e, a, v, c);
    }
}

static boolean merge_multibag_set(evaluation ev, table *d, uuid u, bag s)
{
    boolean result = false;
    bag bd;
    if (!*d) {
        *d = create_value_table(ev->working);
    }

    if (!(bd = table_find(*d, u))) {
        table_set(*d, u, s); 
    } else {
        // reconstruct set semantics for t in a very icky way
        bag_foreach(s, e, a, v, count) {
            int old_count = count_of(bd, e, a, v);
            if (old_count != count) {
                prf("merge %v %v %v %d %d\n", e, a, v, old_count, count);
                edb_insert(bd, e, a, v, count + (-old_count));
                result = true;
            }
        }
    }
    return result;
}

static void merge_bags(evaluation ev, table *d, table s)
{
    if (!s) return;
    if (!*d) {
        *d = s;
        return;
    }
    table_foreach(s, u , b)
        merge_multibag_bag(ev, d, u, b);
}

static boolean merge_sets(evaluation ev, table *d, table s)
{
    boolean result = false;
    
    if (s) {
        if (!*d) {
            *d = s;
            result = true;
        } else {
            table_foreach(s, u , b)
                result |= merge_multibag_set(ev, d, u, b);
        }
    }

    return result;
}

static void run_block(evaluation ev, block bk) 
{
    heap bh = allocate_rolling(pages, sstring("block run"));
    bk->ev->block_solution = 0;
    bk->ev->non_empty = false;
    ticks start = rdtsc();
    apply(bk->head, bh, 0, op_insert, 0);
    apply(bk->head, bh, 0, op_flush, 0);
    ev->cycle_time += rdtsc() - start;
    
    if (bk->ev->non_empty) {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, true);
        merge_bags(ev, &bk->ev->next_f_solution, bk->ev->block_solution);
    } else {
        vector_foreach(bk->finish, i) 
            apply((block_completion)i, false);
    }
    destroy(bh);
}

static void bag_fork(evaluation ev, table *f_target)
{
    multibag_foreach(ev->next_f_solution, u, b) {
        if (table_find(ev->persisted, u)) {
            merge_multibag_bag(ev, &ev->next_t_solution, u, b);
        } else {
            merge_multibag_bag(ev, f_target, u, b);
        }
    }
}

static void fixedpoint(evaluation ev)
{
    long iterations = 0;
    vector counts = allocate_vector(ev->working, 10);
    boolean was_a_next_t = true;

    ticks start_time = now();
    ev->t = start_time;
    ev->t_solution =  0;

    // double iteration
    while (was_a_next_t) {
        ev->pass = true;
        ev->f_solution =  0;
        while (ev->pass) {
            ev->pass = false;
            iterations++;
            ev->next_f_solution =  0;
            vector_foreach(ev->blocks, b) run_block(ev, b);
            bag_fork(ev, &ev->f_solution);
        }
        was_a_next_t = merge_sets(ev, &ev->t_solution, ev->next_t_solution);
        ev->next_t_solution =  0;
        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        ev->t++;
        ev->ev_solution = 0;
    }

    boolean changed_persistent = false;
    // merge but ignore bags not in persisted
    multibag_foreach(ev->t_solution, u, b) {
        bag bd;
        if ((bd = table_find(ev->persisted, u))) {
            bag_foreach((bag)b, e, a, v, c) {
                changed_persistent = true;
                edb_insert(bd, e, a, v, c);
            }
        }
    }

    if (changed_persistent) {
        table_foreach(ev->persisted, _, b)  {
             table_foreach(((bag)b)->listeners, t, _)
                 if (t != ev->run)
                     apply((thunk)t);
        }
    }

    // allow the deltas to also see the updated base by applying
    // them after
    multibag_foreach(ev->t_solution, u, b) {
        bag bd;
        if ((bd = table_find(ev->persisted, u))) {
            table_foreach(bd->delta_listeners, t, _)
                apply((bag_handler)t, b);
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
         counts, table_elements(ev->scopes),
         ev->t_solution?table_elements(ev->t_solution):0);
    destroy(ev->working);
}

static void clear_evaluation(evaluation ev)
{
    ev->working = allocate_rolling(pages, sstring("working"));
    ev->t++;
    ev->ev_solution = 0;
    ev->t_solution = 0;
    ev->f_solution = 0;
    ev->next_t_solution = 0;
}

void inject_event(evaluation ev, buffer b, boolean tracing)
{
    buffer desc;
    clear_evaluation(ev);
    vector n = compile_eve(ev->working, b, tracing, &desc);

    // close this block
    vector_foreach(n, i) {
        block b = build(ev, i);
        run_block(ev, b);
        block_close(b);
    }
    bag_fork(ev, &ev->ev_solution);
    fixedpoint(ev);
    table_set(ev->counters, intern_cstring("cycle-time"), (void *)ev->cycle_time);
}

CONTINUATION_1_0(run_solver, evaluation);
void run_solver(evaluation ev)
{
    clear_evaluation(ev);
    fixedpoint(ev);
    table_set(ev->counters, intern_cstring("cycle-time"), (void *)ev->cycle_time);
}

void close_evaluation(evaluation ev) 
{
    table_foreach(ev->persisted, uuid, b) 
        deregister_listener(b, ev->run);

    vector_foreach(ev->blocks, b)
        block_close(b);
    
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
    ev->cycle_time = 0;
    ev->reader = cont(ev->h, merge_scan, ev);
    ev->complete = r;
    ev->terminal = cont(ev->h, evaluation_complete, ev);

    ev->run = cont(h, run_solver, ev);
    table_foreach(ev->persisted, uuid, b) {
        register_listener(b, ev->run);
        table_foreach(edb_implications(b), n, v){
            vector_insert(ev->blocks, build(ev, n));
        }
    }

    return ev;
}
