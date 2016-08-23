#include <runtime.h>

#define multibag_foreach(__m, __u, __b)  if(__m) table_foreach(__m, __u, __b)

// should these guys really reconcile their differences
static inline int multibag_count(table m)
{
    int count = 0;
    multibag_foreach(m, u, b)
        count += edb_size(b);
    return count;
}

static boolean compare_multibags(multibag a, multibag b)
{
    bag d;
    if (!a != !b) return false; // if one is zero and the other not, not equal
    if (!a) return true;        // both are empty

    table_foreach(a, u, ab) {
        bag bb = table_find(b, u);
        if (!bb) return false;
        if (edb_size((edb)ab) != edb_size((edb)bb))
            return false;

        edb_foreach((edb)ab, e, a, v, c, _) {
            if (count_of((edb)bb, e, a, v) != c) {
                return false;
            }
        }
    }
    return true;
}

void multibag_insert(multibag *mb, heap h, uuid u, value e, value a, value v, multiplicity m, uuid block_id)
{
    bag b;

    if (!*mb) (*mb) = create_value_table(h);
    if (!(b = table_find((*mb), u)))
        table_set(*mb, u, b = (bag)create_edb(h, u, 0));

    apply(b->insert, e, a, v, m, block_id);
}

// debuggin
static estring bagname(evaluation e, uuid u)
{

    estring bagname = efalse;
    table_foreach(e->scopes, n, u2) if (u2 ==u) return(n);
    return(intern_cstring("missing bag?"));
}

// @FIXME: This collapses multibag diffs into a single diff.
static bag diff_sets(heap h, multibag neue_bags, multibag old_bags)
{
    uuid diff_id = generate_uuid();
    bag diff = (bag)create_edb(h, diff_id, 0);
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
    bag edata = (bag)create_edb(ev->working, error_data_id, 0);
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
        ev->f_solution =  0;
        vector f_diffs = allocate_vector(ev->working, 2);

        do {
            ev->t_solution_for_f = 0;
            iterations++;
            ev->last_f_solution = ev->f_solution;
            ev->f_solution = 0;

            if (ev->event_blocks)
                vector_foreach(ev->event_blocks, b)
                    run_block(ev, b);
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
            bag diff = (bag)create_edb(ev->working, generate_uuid(), 0);
            multibag_foreach(ev->t_solution, u, b) {
                edb_foreach((edb)b, e, a, v, c, block_id) {
                    apply(diff->insert, e, a, v, c, block_id);
                }
            }
            vector_insert(t_diffs, diff);
        }

        vector_insert(counts, box_float((double)iterations));
        iterations = 0;
        ev->event_blocks = 0;

        multibag_foreach(ev->t_solution_for_f, u, b)
            again |= merge_solution_into_t(&ev->t_solution, ev->working, u, b);

        if(vector_length(counts) > MAX_T_ITERATIONS) {
            fixedpoint_error(ev, t_diffs, "Unable to converge in T");
            return false;
        }
    } while(again);


    // what about multibag commits?
    // new bags really shouldn't be allocated from ev->h
    multibag_foreach(ev->t_solution, u, b) {
        bag bd;
        if (!(bd = table_find(ev->t_input, u)))
            table_set(ev->t_input, u, bd = (bag)create_edb(ev->h, u, 0));
        apply(bd->commit, b);
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
    // ??
    apply(ev->complete, ev->t_solution, ev->f_solution, ev->counters);

    prf ("fixedpoint in %t seconds, %d blocks, %V iterations, %d changes to global, %d maintains, %t seconds handler\n",
         end_time-start_time, vector_length(ev->blocks),
         counts,
         multibag_count(ev->t_solution),
         multibag_count(ev->f_solution),
         now() - end_time);
    destroy(ev->working);
    return true;
}

static void setup_evaluation(evaluation ev)
{
    ev->event_blocks = 0;
    ev->working = allocate_rolling(pages, sstring("working"));
    ev->t = now();
}

void inject_event(evaluation ev, buffer b, boolean tracing)
{
    buffer desc;
    setup_evaluation(ev);
    vector c = compile_eve(ev->working, b, tracing, &desc);

    vector_foreach(c, i) {
        if (!ev->event_blocks)
            ev->event_blocks = allocate_vector(ev->working, vector_length(c));
        vector_insert(ev->event_blocks, build(ev, i));
    }
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

evaluation build_evaluation(table scopes, multibag t_input, evaluation_result r, error_handler error)
{
    heap h = allocate_rolling(pages, sstring("eval"));
    evaluation ev = allocate(h, sizeof(struct evaluation));
    ev->h = h;
    ev->error = error;
    ev->scopes = scopes;
    ev->t_input = t_input;
    ev->counters =  allocate_table(h, key_from_pointer, compare_pointer);
    ev->blocks = allocate_vector(h, 10);
    ev->cycle_time = 0;
    ev->complete = r;
    ev->terminal = cont(ev->h, evaluation_complete, ev);
    ev->run = cont(h, run_solver, ev);

    ev->default_insert_scopes = table_find(scopes, sym(session));
    if (!ev->default_insert_scopes)
        prf("proceeding without a default insert target (usually session)\n");

    ev->default_scan_scopes = allocate_vector(h, table_elements(scopes));
    table_foreach(scopes, n, u)
        vector_insert(ev->default_scan_scopes, u);


    table_foreach(ev->t_input, uuid, z) {
        bag b = z;

        table_set(b->listeners, ev->run, (void *)1);
        // xxx - reflecton
        table_foreach(b->implications, n, v){
            vector_insert(ev->blocks, build(ev, n));
        }
    }

    return ev;
}
