#include <runtime.h>

// debuggin
static estring bagname(evaluation e, uuid u)
{

    estring bagname = efalse;
    table_foreach(e->scopes, n, u2) if (u2 ==u) return(n);
    return(intern_cstring("missing bag?"));
}

static uuid bag_bag_id;

// @FIXME: This collapses multibag diffs into a single diff.
static bag diff_sets(heap h, multibag neue_bags, multibag old_bags)
{
    uuid diff_id = generate_uuid();
    bag diff = (bag)create_edb(h, 0);
    bag old;

    table_foreach(neue_bags, u, neue) {
        if(old_bags) {
            old = table_find(old_bags, u);
        }

        if (!neue || !old) {
            continue;
        } else if (neue && !old) {
            edb_foreach((edb)neue, e, a, v, c, block_id) {
                apply(diff->insert, e, a, v, c, block_id);
            }
        } else if(!neue && old) {
            edb_foreach((edb)old, e, a, v, c, block_id) {
                apply(diff->insert, e, a, v, 0, block_id);
            }
        } else {
            edb_foreach((edb)neue, e, a, v, c, block_id) {
                if (count_of((edb)old, e, a, v) != c) {
                    apply(diff->insert, e, a, v, c, block_id);
                }
            }
            edb_foreach((edb)old, e, a, v, c, block_id) {
                multiplicity neue_c = count_of((edb)neue, e, a, v);
                if (neue_c != c && neue_c == 0) {
                    apply(diff->insert, e, a, v, 0, block_id);
                }
            }
        }
    }
    return diff;
}

static CONTINUATION_2_5(shadow_f_by_p_and_t, evaluation, listener, value, value, value, multiplicity, uuid);
static void shadow_f_by_p_and_t(evaluation ev, listener result, value e, value a, value v, multiplicity m, uuid bku)
{
    int total = 0;

    if (m > 0) {
        bag b;
        multibag_foreach(ev->t_solution, u, b) {
            total += count_of(b, e, a, v);
        }
        if (total <= 0) {
            apply(result, e, a, v, m, bku);
        }
    }
}

static CONTINUATION_2_5( shadow_t_by_f, evaluation, listener, value, value, value, multiplicity, uuid);
static void shadow_t_by_f(evaluation ev, listener result, value e, value a, value v, multiplicity m, uuid bku)
{
    int total = 0;

    if (m > 0) {
        bag b;
        multibag_foreach(ev->f_solution, u, b)
            total += count_of((edb)b, e, a, v);
        if (total >= 0)
            apply(result, e, a, v, m, bku);
    }
}


static CONTINUATION_2_5(shadow_p_by_t_and_f, evaluation, listener,
                        value, value, value, multiplicity, uuid);
static void shadow_p_by_t_and_f(evaluation ev, listener result,
                                value e, value a, value v, multiplicity m, uuid bku)
{
    int total = 0;

    if (m > 0) {
        bag b;
        multibag_foreach(ev->t_solution, u, b)
            total += count_of(b, e, a, v);

        if (total >= 0) {
            total = 0;
            multibag_foreach(ev->last_f_solution, u, b)
                total += count_of((edb)b, e, a, v);
            if (total >= 0)
                apply(result, e, a, v, m, bku);
        }
    }
}

void merge_scan(evaluation ev, vector scopes, int sig, listener result, value e, value a, value v)
{
    /* xxx - since we went to all the trouble - we should only be looking at bags in scopes */
    multibag_foreach(ev->t_input, u, b)
        apply(((bag)b)->scan, sig,
              cont(ev->working, shadow_p_by_t_and_f, ev, result),
              e, a, v);

    multibag_foreach(ev->t_solution, u, b)
        apply(((bag)b)->scan, sig,
              cont(ev->working, shadow_t_by_f, ev, result),
              e, a, v);

    multibag_foreach(ev->last_f_solution, u, b)
        apply(((bag)b)->scan, sig,
              cont(ev->working, shadow_f_by_p_and_t, ev, result),
              e, a, v);

    if (ev->event_bag)
        apply(ev->event_bag->scan, sig,
              cont(ev->working, shadow_f_by_p_and_t, ev, result),
              e, a, v);
}

static CONTINUATION_1_0(evaluation_complete, evaluation);
static void evaluation_complete(evaluation s)
{
    s->non_empty = true;
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
        edb_foreach((edb)s, e, a, v, m, bku) {
            apply(bd->insert, e, a, v, m, bku);
        }
    }
}


static boolean merge_solution_into_t(multibag *m, heap h, uuid u, bag s)
{
    static int runcount = 0;
    runcount++;
    bag bd;
    boolean result = false;

    if (!*m)
        *m = create_value_table(h);

    if (!(bd = table_find(*m, u))) {
        table_set(*m, u, s);
        return true;
    } else {
        edb_foreach((edb)s, e, a, v, count, bk) {
            int old_count = count_of((edb)bd, e, a, v);
            if ((count > 0) && (old_count == 0)) {
                result = true;
                apply(bd->insert, e, a, v, 1, bk);
            }
            if (count < 0) {
                result = true;
                apply(bd->insert, e, a, v, -1, bk);
            }
        }
    }
    return result;
}

static void run_block(evaluation ev, block bk)
{
    heap bh = allocate_rolling(pages, sstring("block run"));
    bk->ev->block_t_solution = 0;
    bk->ev->block_f_solution = 0;
    bk->ev->non_empty = false;
    ticks start = rdtsc();
    value *r = allocate(ev->working, (bk->regs + 1)* sizeof(value));

    apply(bk->head, bh, 0, op_insert, r);
    // flush shouldn't need r
    apply(bk->head, bh, 0, op_flush, r);

    ev->cycle_time += rdtsc() - start;

    if (bk->ev->non_empty) {
        multibag_foreach(ev->block_f_solution, u, b)
            merge_multibag_bag(ev, &ev->f_solution, u, b);
        // is this really merge_multibag_bag?
        multibag_foreach(ev->block_t_solution, u, b)
            merge_multibag_bag(ev, &ev->t_solution_for_f, u, b);
    }

    destroy(bh);
}

const int MAX_F_ITERATIONS = 250;
const int MAX_T_ITERATIONS = 50;

static void fixedpoint_error(evaluation ev, vector diffs, char * message) {
    uuid error_data_id = generate_uuid();
    bag edata = (bag)create_edb(ev->working, 0);
    uuid error_diffs_id = generate_uuid();
    apply(edata->insert, error_diffs_id, sym(tag), sym(array), 1, 0);

    table eavs = create_value_table(ev->working);
    int diff_ix = 1;
    vector_foreach(diffs, diff) {
        uuid diff_id = generate_uuid();
        apply(edata->insert, error_diffs_id, box_float((float)(diff_ix++)), diff_id, 1, 0);

        edb_foreach((edb)diff, e, a, v, c, bku) {
            value key = box_float(value_as_key(e) ^ value_as_key(a) ^ value_as_key(v));
            uuid eav_id = table_find(eavs, key);
            if(!eav_id) {
                eav_id = generate_uuid();
                apply(edata->insert, eav_id, sym(entity), e, 1, bku);
                apply(edata->insert, eav_id, sym(attribute), a, 1, bku);
                apply(edata->insert, eav_id, sym(value), v, 1, bku);
                table_set(eavs, key, eav_id);
            }

            if(c > 0) {
                apply(edata->insert, diff_id, sym(insert), eav_id, 1, bku);
            } else {
                apply(edata->insert, diff_id, sym(remove), eav_id, 1, bku);
            }
        }
    }

    apply(ev->error, message, edata, error_diffs_id);
    destroy(ev->working);
}

extern string print_dot(heap h, block bk, table counters);

static boolean fixedpoint(evaluation ev)
{
    long iterations = 0;
    vector counts = allocate_vector(ev->working, 10);
    ticks start_time = now();
    ev->t = start_time;
    boolean again;
    vector t_diffs = allocate_vector(ev->working, 2);
    ev->t_solution = 0;

    do {
        again = false;
        vector f_diffs = allocate_vector(ev->working, 2);

        do {
            ev->t_solution_for_f = 0;
            iterations++;
            ev->last_f_solution = ev->f_solution;
            ev->f_solution = 0;

            vector_foreach(ev->blocks, b)
                run_block(ev, b);


            if(iterations > (MAX_F_ITERATIONS - 1)) { // super naive 2-cycle diff capturing
                vector_insert(f_diffs, diff_sets(ev->working, ev->last_f_solution, ev->f_solution));
            }
            if(iterations > MAX_F_ITERATIONS) {
                fixedpoint_error(ev, f_diffs, "Unable to converge in F");
                return false;
            }
        } while(!compare_multibags(ev->f_solution, ev->last_f_solution));

        if(vector_length(counts) > (MAX_T_ITERATIONS - 1)) {
            bag diff = (bag)create_edb(ev->working, 0);
            multibag_foreach(ev->t_solution, u, b) {
                edb_foreach((edb)b, e, a, v, c, block_id) {
                    apply(diff->insert, e, a, v, c, block_id);
                }
            }
            vector_insert(t_diffs, diff);
        }

        ev->event_bag = 0;
        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        ev->f_solution =  0;

        multibag_foreach(ev->t_solution_for_f, u, b)
            again |= merge_solution_into_t(&ev->t_solution, ev->working, u, b);

        if(vector_length(counts) > MAX_T_ITERATIONS) {
            fixedpoint_error(ev, t_diffs, "Unable to converge in T");
            return false;
        }
    } while(again);



    // xxx - clear out the new bags before anything else
    if (ev->t_solution) {
        edb bdelta = table_find(ev->t_solution, bag_bag_id);
        if (bdelta)
            apply(ev->bag_bag->commit, bdelta);
    }

    multibag_foreach(ev->t_solution, u, b) {
        bag bd;
        if (u != bag_bag_id) {
            if (!(bd = table_find(ev->t_input, u)))
                table_set(ev->t_input, u, bd = (bag)create_edb(ev->h, 0));
            apply(bd->commit, b);
        }
    }

    multibag_foreach(ev->t_solution, u, b){
        table_foreach(((bag)b)->listeners, t, _) {
            apply((bag_handler)t, b);
        }
    }

    ticks end_time = now();

    ticks handler_time = end_time;
    table_set(ev->counters, intern_cstring("time"), (void *)(end_time - start_time));
    table_set(ev->counters, intern_cstring("iterations"), (void *)iterations);
    table_set(ev->counters, intern_cstring("cycle-time"), (void *)ev->cycle_time);
    // counters? reflection? enable them
    apply(ev->complete, ev->t_solution, ev->last_f_solution);

    prf ("fixedpoint in %t seconds, %d blocks, %V iterations, %d changes to global, %d maintains, %t seconds handler\n",
         end_time-start_time, vector_length(ev->blocks),
         counts,
         multibag_count(ev->t_solution),
         multibag_count(ev->last_f_solution),
         now() - end_time);

    // ticks max_ticks = 0;
    // perf max_p = 0;
    // node max_node = 0;
    // table_foreach(ev->counters, n, pv) {
    //     perf p = (perf) pv;
    //     if(max_ticks < p->time) {
    //         max_ticks = p->time;
    //         max_p = p;
    //         max_node = n;
    //     }
    // }

    // vector_foreach(ev->blocks, bk)
    //  prf("%b\n", print_dot(ev->working, bk, ev->counters));

    // prf("Max node");
    // prf(" - node: %p, kind: %v, id: %v, time: %t, count: %d\n", max_node, max_node->type, max_node->id, max_p->time, max_p->count);
    // prf("\n\n\n");

    destroy(ev->working);
    return true;
}

static void setup_evaluation(evaluation ev)
{
    ev->working = allocate_rolling(pages, sstring("working"));
    ev->f_solution = 0;
    ev->event_bag = 0;
    ev->t = now();
}

void inject_event(evaluation ev, bag event)
{
    // event bag just shows up and isn't addressable, think about changing that
    setup_evaluation(ev);
    ev->event_bag = event;
    fixedpoint(ev);
}

CONTINUATION_1_0(run_solver, evaluation);
void run_solver(evaluation ev)
{
    setup_evaluation(ev);
    fixedpoint(ev);
}

void close_evaluation(evaluation ev)
{
    table_foreach(ev->t_input, uuid, b)
        table_set(((bag)b)->listeners, ev->run, 0);

    vector_foreach(ev->blocks, b)
        block_close(b);

    destroy(ev->h);
}


evaluation build_evaluation(heap h,
                            table scopes,
                            multibag t_input,
                            evaluation_result r,
                            error_handler error,
                            vector implications)
{
    evaluation ev = allocate(h, sizeof(struct evaluation));
    ev->h = h;
    ev->error = error;
    // consider adding "event" to the running namespace
    ev->scopes = scopes;
    ev->t_input = t_input;
    ev->counters =  allocate_table(h, key_from_pointer, compare_pointer);
    ev->blocks = allocate_vector(h, 10);
    ev->cycle_time = 0;
    ev->complete = r;
    ev->terminal = cont(ev->h, evaluation_complete, ev);
    ev->run = cont(h, run_solver, ev);
    ev->default_scan_scopes = allocate_vector(h, 5);
    ev->default_insert_scopes = allocate_vector(h, 5);
    table_foreach(ev->t_input, uuid, z) {
        bag b = z;
        table_set(b->listeners, ev->run, (void *)1);
    }

    ev->bag_bag = init_bag_bag(ev);

    if (!bag_bag_id)
        bag_bag_id = generate_uuid();

    table_set(ev->scopes, sym(bag), bag_bag_id);

    // xxx - compiler output reflecton
    vector_foreach(implications, i) {
        // xxx - shouldn't build take the termination?
        vector_insert(ev->blocks, build(ev, i));
    }

    return ev;
}
