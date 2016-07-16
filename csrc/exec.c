#include <runtime.h>
#include <exec.h>


static CONTINUATION_3_4(do_sub_tail, perf, value, vector, heap, perf, operator, value *);
static void do_sub_tail(perf p,
                        value resreg,
                        vector outputs,
                        heap h, perf pp, operator op, value *r)
{
    // just drop flush and remove on the floor
    start_perf(p);
    if ( op == op_insert) {
        table results = lookup(r, resreg);
        vector result = allocate_vector(results->h, vector_length(outputs));
        extract(result, outputs, r);
        table_set(results, result, etrue);
    }
    stop_perf(p, pp);
}

static execf build_sub_tail(block bk, node n)
{
    value resreg = vector_get(vector_get(n->arguments, 1), 0);
    return cont(bk->h,
                do_sub_tail,
                register_perf(bk->ev, n),
                resreg,
                vector_get(n->arguments, 0));
}


typedef struct sub {
    value id;
    vector v;
    vector inputs;
    vector outputs;
    vector ids;
    table ids_cache; //these persist for all time
    table previous;
    table moved;
    table results;
    execf leg, next;
    value resreg;
    heap h;
    evaluation e;
    ticks t;
    boolean id_collapse;
} *sub;


static void delete_missing(heap h, perf p, sub s, value *r)
{
    if (s->previous) {
        table_foreach(s->previous, k, v) {
            if (!table_find(s->moved, k)) {
                table_foreach((table)v, n, _) {
                    copyout(r, s->outputs, n);
                    apply(s->next, h, p, op_remove, r);
                }
            }
        }
    }
}


static CONTINUATION_1_1(end_o_sub, sub, boolean);
static void end_o_sub(sub s, boolean finished)
{
    if (finished) {
        s->previous = s->results;
    }
    s->results = create_value_vector_table(s->h);
    s->moved = create_value_vector_table(s->h);
}


static void set_ids_each(sub s, vector key, value *r)
{
    vector_foreach(s->ids, i)
        store(r, i, generate_uuid());
}


static void set_ids(sub s, vector key, value *r)
{
    vector k;

    if (!(k = table_find(s->ids_cache, key))) {
        int len = vector_length(s->ids);
        k = allocate_vector(s->h, len);
        for (int i= 0; i < len; i++)
            vector_set(k, i, generate_uuid());
        table_set(s->ids_cache, key, k);
    }
    copyout(r, s->ids, k);
}

static CONTINUATION_2_4(do_sub, perf, sub, heap, perf, operator, value *);
static void do_sub(perf p, sub s, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    // dont manage deletions across fixed point
    if (s->t != s->e->t) {
        s->previous = 0;
        s->t = s->e->t;
        s->results = create_value_vector_table(s->h);
    }

    if (op == op_close) {
        apply(s->next, h, p, op, r);
        stop_perf(p, pp);
        destroy(s->h);
        return;
    }

    if (op == op_flush) {
        delete_missing(h, p, s, r);
        apply(s->next, h, p, op, r);
        stop_perf(p, pp);
        return;
    }

    table res;
    extract(s->v, s->inputs, r);
    vector key;

    if (!(res = table_find(s->results, s->v))){
        // table_find_key only exists because we want to reuse the key allocation
        if (s->previous && (res = table_find_key(s->previous, s->v, (void **)&key))) {
            table_set(s->moved, key, etrue);
        } else {
            res = create_value_vector_table(s->h);
            key = allocate_vector(s->h, vector_length(s->inputs));
            extract(key, s->inputs, r);
            store(r, s->resreg, res);
            if (s->id_collapse) {
                set_ids(s, key, r);
            } else{
                vector_foreach(s->ids, i)
                    store(r, i, generate_uuid());
            }
            apply(s->leg, h, p, op, r);
        }
        table_set(s->results, key, res);
    }

    // cross
    table_foreach(res, n, _) {
        copyout(r, s->outputs, n);
        apply(s->next, h, p, op, r);
    }
    stop_perf(p, pp);
}


static execf build_sub(block bk, node n)
{
    sub s = allocate(bk->h, sizeof(struct sub));
    s->id = n->id;
    s->h = allocate_rolling(pages, sstring("sub"));
    s->results = create_value_vector_table(s->h);
    s->moved = create_value_vector_table(s->h);
    s->ids_cache = create_value_vector_table(s->h);
    s->inputs = vector_get(n->arguments, 0);
    s->v = allocate_vector(s->h, vector_length(s->inputs));
    s->leg = resolve_cfg(bk, n, 1);
    s->outputs = vector_get(n->arguments, 1);
    s->previous = 0;
    s->resreg = vector_get(vector_get(n->arguments, 2), 0);
    s->ids = vector_get(n->arguments, 3);
    s->h = s->h;
    s->next = resolve_cfg(bk, n, 0);
    s->id_collapse = vector_get(vector_get(n->arguments, 4), 0) == etrue?true:false;
    s->e = bk->ev;
    s->t = bk->ev->t;
    vector_insert(bk->finish, cont(s->h, end_o_sub, s));
    return cont(s->h,
                do_sub,
                register_perf(bk->ev, n),
                s);

}

static CONTINUATION_5_4(do_subagg,
                        perf, execf, table *, vector, vector,
                        heap, perf, operator, value *);
static void do_subagg(perf p, execf next, table *proj_seen, vector v, vector inputs,
                      heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    if (op == op_flush) {
        apply(next, h, p, op, r);
        *proj_seen = create_value_vector_table((*proj_seen)->h);
        stop_perf(p, pp);
        return;
    }

    extract(v, inputs, r);

    if (! table_find(*proj_seen, v)){
        vector key = allocate_vector((*proj_seen)->h, vector_length(inputs));
        extract(key, inputs, r);
        table_set(*proj_seen, key, (void*)1);
        apply(next, h, p, op, r);
    }
    stop_perf(p, pp);
}


static execf build_subagg(block bk, node n)
{
    table* proj_seen = allocate(bk->h, sizeof(table));
    *proj_seen = create_value_vector_table(bk->h);
    vector v = allocate_vector(bk->h, vector_length(vector_get(n->arguments, 0)));
    return cont(bk->h,
                do_subagg,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                proj_seen,
                v,
                vector_get(n->arguments, 0));
}

static CONTINUATION_3_4(do_choose_tail, perf, execf, value, heap, perf, operator, value *);
static void do_choose_tail(perf p, execf next, value flag, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    if (op != op_flush) {
        store(r, flag, etrue);
        if (next) {
            stop_perf(p, pp);
            apply(next, h, p, op, r);
        }
    }
    stop_perf(p, pp);
}

static execf build_choose_tail(block bk, node n)
{
    table results = create_value_vector_table(bk->h);
    // gonna share this one today
    vector v = allocate_vector(bk->h, vector_length(n->arguments));
    return cont(bk->h,
                do_choose_tail,
                register_perf(bk->ev, n),
                (vector_length(n->arms) > 0)? resolve_cfg(bk, n, 0):0,
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_4_4(do_choose, perf, execf, vector, value, heap, perf, operator, value *);
static void do_choose(perf p, execf n, vector legs, value flag, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    if ((op == op_flush) || (op == op_close)) {
        apply(n, h, p, op, r);
    } else {
        r[toreg(flag)] = efalse;
        vector_foreach (legs, i){
            apply((execf) i, h, p, op, r);
            apply((execf) i, h, p, op_flush, r);
            if (r[toreg(flag)] == etrue) {
                stop_perf(p, pp);
                return;
            }
        }
    }
    stop_perf(p, pp);
}


static execf build_choose(block bk, node n)
{
    int arms = vector_length(n->arms);
    vector v = allocate_vector(bk->h, arms - 1);
    for (int i = 1 ; i < arms; i++ )
        vector_set(v, i - 1, resolve_cfg(bk, n, i));

    return cont(bk->h,
                do_choose,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                v,
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_4_4(do_not, perf, execf, execf, value, heap, perf, operator, value *);
static void do_not(perf p, execf next, execf leg, value flag, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    // should also flush down the leg
    if (op == op_flush) {
        apply(next, h, p, op, r);
        stop_perf(p, pp);
        return;
    }
    store(r, flag, efalse);

    apply(leg, h, p, op, r);

    if (lookup(r, flag) == efalse)
        apply(next, h, p, op, r);
    stop_perf(p, pp);
}


static execf build_not(block bk, node n)
{
    return cont(bk->h,
                do_not,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                resolve_cfg(bk, n, 1),
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_4_4(do_move, perf, execf, value,  value, heap, perf, operator, value *);
static void do_move(perf p, execf n, value dest, value src, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    if (op == op_insert) {
        store(r, dest, lookup(r, src));
    }
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}


static execf build_move(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_move,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1));
}


static CONTINUATION_3_4(do_merge, execf, int, u32 *, heap, perf, operator, value *);
static void do_merge(execf n, int count, u32 *total, heap h, perf pp, operator op, value *r)
{
    if ((op == op_flush) || (op == op_close)){
        *total = *total +1;
        if (*total == count) {
            *total = 0;
        } else return;
    }
    apply(n, h, pp, op, r);
}

static execf build_merge(block bk, node n)
{
    u32 *c = allocate(bk->h, sizeof(u32));
    *c = 0;
    return cont(bk->h, do_merge, resolve_cfg(bk, n, 0),
                (int)*(double *)vector_get(vector_get(n->arguments, 0), 0),
                c);
}

static CONTINUATION_1_4(do_terminal, block, heap, perf, operator, value *);
static void do_terminal(block bk, heap h, perf pp, operator op, value *r)
{
    if (op == op_insert) apply(bk->ev->terminal);
}

static execf build_terminal(block bk, node n)
{
    return cont(bk->h, do_terminal, bk);
}

static CONTINUATION_7_4(do_time,
                        block, perf, execf, value, value, value, timer,
                        heap, perf, operator, value *);
static void do_time(block bk, perf p, execf n, value s, value m, value hour, timer t, heap h,
                    perf pp, operator op, value *r)
{
    start_perf(p);
    if (op == op_close) {
        remove_timer(t);
    }
    if (op == op_insert) {
        unsigned int seconds, minutes,  hours;
        clocktime(bk->ev->t, &hours, &minutes, &seconds);
        value sv = box_float((double)seconds);
        value mv = box_float((double)minutes);
        value hv = box_float((double)hours);
        store(r, s, sv);
        store(r, m, mv);
        store(r, hour, hv);
    }
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}

static CONTINUATION_1_0(time_expire, block);
static void time_expire(block bk)
{
    run_solver(bk->ev);
}

// xxx  - handle the bound case
static execf build_time(block bk, node n, execf *arms)
{
    vector a = vector_get(n->arguments, 0);
    timer t =register_periodic_timer(seconds(1), cont(bk->h, time_expire, bk));
    return cont(bk->h,
                do_time,
                bk,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3),
                t);
}


static CONTINUATION_3_4(do_fork, perf, int, execf *, heap, perf, operator, value *) ;
static void do_fork(perf p, int legs, execf *b, heap h, perf pp, operator op, value *r)
{
    start_perf(p);
    for (int i =0; i<legs ;i ++) apply(b[i], h, p, op, r);
    stop_perf(p, pp);
}

static execf build_fork(block bk, node n)
{
    int count = vector_length(n->arms);
    execf *a = allocate(bk->h, sizeof(execf) * count);

    for (int i=0; i < count; i++)
        a[i] = resolve_cfg(bk, n, i);
    return cont(bk->h, do_fork, register_perf(bk->ev, n), count, a);
}

static CONTINUATION_2_4(do_trace, execf, vector, heap, perf, operator, value *);
static void do_trace(execf n, vector terms, heap h, perf pp, operator op, value *r)
{
    prf("%s|", (op == op_insert ? "insert" : (op == op_flush) ? "flush " : "close "));
    for (int i=0; i<vector_length(terms); i+=2) {
      prf(" %v %v", lookup(r, vector_get(terms, i)), lookup(r, vector_get(terms, i+1)));
    }
    prf("\n");
    apply(n, h, pp, op, r);
}

static execf build_trace(block bk, node n, execf *arms)
{
    return cont(bk->h,
                do_trace,
                resolve_cfg(bk, n, 0),
                vector_get(n->arguments, 0));
}


static CONTINUATION_3_4(do_regfile, execf, perf, int, heap, perf, operator, value *);
static void do_regfile(execf n, perf p, int size, heap h, perf pp, operator op, value *ignore)
{
    start_perf(p);
    value *r;
    if (op == op_insert) {
        r = allocate(h, size * sizeof(value));
    }
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}

static execf build_regfile(block bk, node n, execf *arms)
{
    return cont(bk->h,
                do_regfile,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                (int)*(double *)vector_get(vector_get(n->arguments, 0), 0));
}

static table builders;

extern void register_exec_expression(table builders);
extern void register_string_builders(table builders);
extern void register_aggregate_builders(table builders);
extern void register_edb_builders(table builders);


table builders_table()
{
    if (!builders) {
        builders = allocate_table(init, key_from_pointer, compare_pointer);
        table_set(builders, intern_cstring("fork"), build_fork);
        table_set(builders, intern_cstring("trace"), build_trace);
        table_set(builders, intern_cstring("sub"), build_sub);
        table_set(builders, intern_cstring("subtail"), build_sub_tail);
        table_set(builders, intern_cstring("subagg"), build_subagg);
        table_set(builders, intern_cstring("subaggtail"), build_sub_tail);

        table_set(builders, intern_cstring("terminal"), build_terminal);
        table_set(builders, intern_cstring("choose"), build_choose);
        table_set(builders, intern_cstring("choosetail"), build_choose_tail);
        table_set(builders, intern_cstring("move"), build_move);
        table_set(builders, intern_cstring("regfile"), build_regfile);
        table_set(builders, intern_cstring("not"), build_not);
        table_set(builders, intern_cstring("time"), build_time);
        table_set(builders, intern_cstring("merge"), build_merge);

        register_exec_expression(builders);
        register_string_builders(builders);
        register_aggregate_builders(builders);
        register_edb_builders(builders);
    }
    return builders;
}

static void force_node(block bk, node n)
{
    if (!table_find(bk->nmap, n)){
        execf *x = allocate(bk->h, sizeof(execf *));
        table_set(bk->nmap, n, x);
        vector_foreach(n->arms, i) force_node(bk, i);
        *x = n->builder(bk, n);
    }
}

void block_close(block bk)
{
    apply(bk->head, 0, 0, op_close, 0);
    destroy(bk->h);
}

block build(evaluation ev, compiled c)
{
    heap h = allocate_rolling(pages, sstring("build"));
    block bk = allocate(h, sizeof(struct block));
    bk->ev = ev;
    bk->h = h;
    bk->name = c->name;
    // this is only used during building
    bk->nmap = allocate_table(bk->h, key_from_pointer, compare_pointer);

    bk->finish = allocate_vector(bk->h, 10);
    force_node(bk, c->head);
    bk->head = *(execf *)table_find(bk->nmap, c->head);
    return bk;
}
