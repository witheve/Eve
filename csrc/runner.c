#include <runtime.h>

#define multibag_foreach(__m, __u, __b)  if(__m) table_foreach(__m, __u, __b)
                         
// debuggin
static estring bagname(evaluation e, uuid u)
{
    
    estring bagname = efalse;
    table_foreach(e->scopes, n, u2) if (u2 ==u) return(n);
    return(intern_cstring("missing bag?")); 
}

static inline int multibag_count(table m)
{
    int count = 0;
    multibag_foreach(m, u, b)
        count += edb_size(b);
    return count;
}

static boolean destructive_compare_sets(table retain, table destroy)
{
    bag d;
    if (!retain != !destroy) return false;

    multibag_foreach(retain, u, b) {
        if (!(d = table_find(destroy, u))) return false;
        // xxx - should have a bag and table hash, maybe even special multibag
        bag_foreach((bag)b, e, a, v, c) {
            // xxx- should have a find and destroy
            if (count_of(d, e, a, v) != c) return false;
            edb_insert(d, e, a, v, 0);
        }
        if (edb_size(d)) return false;
        table_set(destory, u, 0);
    }
    return !table_elements(destroy);
}

static CONTINUATION_1_5(insert_f, evaluation, uuid, value, value, value, multiplicity);
static void insert_f(evaluation s, uuid u, value e, value a, value v, multiplicity m)
{
    bag b;

    if (!s->block_solution) 
        s->block_solution = create_value_table(s->working);
    
    if (!(b = table_find(s->block_solution, u))) {
        table_set(s->block_solution, u, b = create_bag(s->working, u));
    }
    edb_insert(b, e, a, v, m);
}

static CONTINUATION_3_4(merge_scan_out, heap, vector, table, value, value, value, multiplicity);
static void merge_scan_out(heap h, vector k, table f, value e, value a, value v, multiplicity m)
{
    u64 z;
    vector_set(k, 0, e);
    vector_set(k, 1, a);
    vector_set(k, 2, v);
    if ((z = (u64)table_find_key(f, k, (void **)&k))) {
        table_set(f, k, (void *)z + m);
    } else {
        vector n = allocate_vector(h, 3);
        vector_set(n, 0, e);
        vector_set(n, 1, a);
        vector_set(n, 2, v);
        table_set(f, n, (void *)m);
    }
}

static CONTINUATION_1_5(merge_scan, evaluation, int, listener, value, value, value);
static void merge_scan(evaluation ev, int sig, listener result, value e, value a, value v)
{
    // creating this view really seems like wasted work
    table f = create_value_vector_table(ev->working);
    vector k = allocate_vector(ev->working, 3);
    listener s = cont(ev->working, merge_scan_out, ev->working, k, f);

    multibag_foreach(ev->persisted, u, b) 
        edb_scan(b, sig, s, e, a, v);

    multibag_foreach(ev->t_solution, u, b) 
        edb_scan(b, sig, s, e, a, v);

    multibag_foreach(ev->f_solution, u, b) 
        edb_scan(b, sig, s, e, a, v);
    
    table_foreach(f, k, v) {
        apply(result,
              vector_get(k, 0),
              vector_get(k, 1),
              vector_get(k, 2),
              (multiplicity)v);
    }
    
}

static CONTINUATION_1_0(evaluation_complete, evaluation);
static void evaluation_complete(evaluation s)
{
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
        bag_foreach(s, e, a, v, c) {
            edb_insert(bd, e, a, v, c);
        }
    }
}

static boolean merge_multibag_set(evaluation ev, table *d, uuid u, bag s)
{
    static int runcount = 0;
    runcount++;
    boolean result = false;
    bag bd;
    if (!*d) {
        *d = create_value_table(ev->working);
    }

    if (!(bd = table_find(*d, u))) {
        table_set(*d, u, s);
        result = true;
    } else {
        // reconstruct set semantics for t in a very icky way
        bag_foreach(s, e, a, v, count) {
            int old_count = count_of(bd, e, a, v);
            if (old_count != count) {
                edb_insert(bd, e, a, v, count==1?1:0);
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

static void run_block(evaluation ev, block bk) 
{
    heap bh = allocate_rolling(pages, sstring("block run"));
    bk->ev->block_solution = 0;
    bk->ev->non_empty = false;
    ticks start = rdtsc();
    apply(bk->head, bh, 0, op_insert, 0);
    apply(bk->head, bh, 0, op_flush, 0);
    ev->cycle_time += rdtsc() - start;
    
    if (bk->ev->non_empty) 
        bag_fork(ev, &bk->ev->next_f_solution);

    destroy(bh);
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
    ev->t_solution = 0;
    do {
        ev->f_solution =  0;
        do {
            iterations++;
            ev->next_t_solution =  0;
            ev->next_f_solution =  f_solution;
            
            if (ev->event_blocks)
                vector_foreach(ev->event_blocks, b)
                    run_block(ev, b);
            vector_foreach(ev->blocks, b)
                run_block(ev, b);
        } while(destructive_compare_sets(f_next_solution, f_solution));
        ev->t_solution = ev->next_t_solution;
        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        ev->event_blocks = 0;
    } while(destructive_compare_sets(t_next_solution, t_solution));


    boolean changed_persistent = false;
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
    
    apply(ev->complete, ev->f_solution, ev->counters);

    ticks end_time = now();
    table_set(ev->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(ev->counters, intern_cstring("iterations"), (void *)iterations);

    prf ("fixedpoint in %t seconds, %d blocks, %V iterations, %d input bags, %d output bags\n", 
         end_time-start_time, vector_length(ev->blocks),
         counts, table_elements(ev->scopes),
         ev->t_solution?table_elements(ev->t_solution):0);
    destroy(ev->working);
    table_set(ev->counters, intern_cstring("cycle-time"), (void *)ev->cycle_time);
}

static void clear_evaluation(evaluation ev)
{
    ev->working = allocate_rolling(pages, sstring("working"));
    ev->t++;
    ev->t_solution = 0;
    ev->f_solution = 0;
    ev->next_t_solution = 0;
}

void inject_event(evaluation ev, buffer b, boolean tracing)
{
    buffer desc;
    clear_evaluation(ev);
    ev->event_blocks = compile_eve(ev->working, b, tracing, &desc);
    fixedpoint(ev);
}

CONTINUATION_1_0(run_solver, evaluation);
void run_solver(evaluation ev)
{
    clear_evaluation(ev);
    fixedpoint(ev);
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
