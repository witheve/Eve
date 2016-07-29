#include <runtime.h>
#include <exec.h>

static CONTINUATION_3_4(do_sub_tail, perf, value, vector, heap, perf, operator, value *);
static void do_sub_tail(perf p,
                        value resreg,
                        vector outputs,
                        heap h, perf pp, operator op, value *r)
{
    // just drop flush and remove on the floor
    start_perf(p, op);
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
    return cont(bk->h,
                do_sub_tail,
                register_perf(bk->ev, n),
                table_find(n->arguments, sym(pass)),
                table_find(n->arguments, sym(provides)));
}


typedef struct sub {
    value id;
    vector v;
    vector projection;
    vector outputs;
    vector ids;
    table ids_cache; //these persist for all time
    table results;
    execf leg, next;
    value resreg;
    heap resh;
    heap h;
    boolean id_collapse;
} *sub;


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
    start_perf(p, op);

    if ((op == op_flush) || (op == op_close)){
        if (s->results){
            s->results = 0;
            destroy(s->resh);
        }
        apply(s->next, h, p, op, r);
        stop_perf(p, pp);
        return;
    }

    table res;
    extract(s->v, s->projection, r);
    vector key;

    if (!s->results) {
        s->resh = allocate_rolling(pages, sstring("sub-results"));
        s->results = create_value_vector_table(s->resh);
    }


    if (!(res = table_find(s->results, s->v))){
        res = create_value_vector_table(s->h);
        key = allocate_vector(s->h, vector_length(s->projection));
        extract(key, s->projection, r);
        store(r, s->resreg, res);
        if (s->id_collapse) {
            set_ids(s, key, r);
        } else{
            vector_foreach(s->ids, i)
                store(r, i, generate_uuid());
        }
        apply(s->leg, h, p, op, r);
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
    s->h = bk->h;
    s->results = 0;
    s->ids_cache = create_value_vector_table(s->h);
    s->projection = table_find(n->arguments, sym(projection));
    s->v = allocate_vector(s->h, vector_length(s->projection));
    s->leg = resolve_cfg(bk, n, 1);
    s->outputs = table_find(n->arguments, sym(provides));
    s->resreg =  table_find(n->arguments, sym(pass));
    s->ids = table_find(n->arguments, sym(ids));
    s->next = resolve_cfg(bk, n, 0);
    s->id_collapse = (table_find(n->arguments, sym(id_collapse))==etrue)?true:false;
    return cont(s->h,
                do_sub,
                register_perf(bk->ev, n),
                s);

}

static CONTINUATION_3_4(do_choose_tail, perf, execf, value, heap, perf, operator, value *);
static void do_choose_tail(perf p, execf next, value flag, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    // terminate flush and close along this leg, the head will inject it into the
    // tail
    if ((op != op_flush) && (op != op_close)) {
        boolean *x = lookup(r, flag);
        *x = true;
        stop_perf(p, pp);
        if (next) apply(next, h, p, op, r);
    }
    stop_perf(p, pp);
}

static execf build_choose_tail(block bk, node n)
{
    table results = create_value_vector_table(bk->h);
    return cont(bk->h,
                do_choose_tail,
                register_perf(bk->ev, n),
                (vector_length(n->arms) > 0)? resolve_cfg(bk, n, 0):0,
                table_find(n->arguments, sym(pass)));
}

static CONTINUATION_5_4(do_choose, perf, execf, vector, value, boolean *,
                        heap, perf, operator, value *);
static void do_choose(perf p, execf n, vector legs, value flag, boolean *flagstore,
                      heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if ((op == op_flush) || (op == op_close)) {
        apply(n, h, p, op, r);
    } else {
        *flagstore = false;
        store(r, flag, flagstore);
        vector_foreach (legs, i){
            apply((execf) i, h, p, op, r);
            apply((execf) i, h, p, op_flush, r);
            if (*flagstore) {
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
                table_find(n->arguments, sym(pass)),
                allocate(bk->h, sizeof(boolean)));
}


static CONTINUATION_5_4(do_not,
                        perf, execf, execf, value, boolean *,
                        heap, perf, operator, value *);
static void do_not(perf p, execf next, execf leg, value flag, boolean *flagstore,
                   heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    // should also flush down the leg
    if ((op == op_flush)  || (op == op_close)){
        apply(next, h, p, op, r);
        stop_perf(p, pp);
        return;
    }
    *flagstore = false;
    store(r, flag, flagstore);

    apply(leg, h, p, op, r);

    if (!*flagstore)
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
                table_find(n->arguments, sym(pass)),
                allocate(bk->h, sizeof(boolean)));
}


static CONTINUATION_4_4(do_move, perf, execf, value,  value, heap, perf, operator, value *);
static void do_move(perf p, execf n, value dest, value src, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_insert) {
        store(r, dest, lookup(r, src));
    }
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}


static execf build_move(block bk, node n)
{
    return cont(bk->h, do_move,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                // nicer names would be nice
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(b)));
}


static CONTINUATION_3_4(do_merge, execf, int, u32 *, heap, perf, operator, value *);
static void do_merge(execf n, int count, u32 *total, heap h, perf pp, operator op, value *r)
{
    if ((op == op_flush) || (op == op_close)) {
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
                (int)*(double *)table_find(n->arguments, sym(arms)),
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

static CONTINUATION_8_4(do_time,
                        block, perf, execf, value, value, value, value, timer,
                        heap, perf, operator, value *);
static void do_time(block bk, perf p, execf n, value hour, value minute, value second, value frame, timer t, heap h,
                    perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_close) {
        remove_timer(t);
    }
    if (op == op_insert) {
        unsigned int seconds, minutes,  hours;
        clocktime(bk->ev->t, &hours, &minutes, &seconds);
        value sv = box_float((double)seconds);
        value mv = box_float((double)minutes);
        value hv = box_float((double)hours);
        u64 ms = ((((u64)bk->ev->t)*1000ull)>>32) % 1000;
        value fv = box_float((double)ms);
        store(r, frame, fv);
        store(r, second, sv);
        store(r, minute, mv);
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
    value hour = table_find(n->arguments, sym(hours));
    value minute = table_find(n->arguments, sym(minutes));
    value second = table_find(n->arguments, sym(seconds));
    value frame = table_find(n->arguments, sym(frames));
    ticks interval = seconds(60 * 60);
    if(frame != 0) interval = milliseconds(1000 / 60);
    else if(second != 0) interval = seconds(1);
    else if(minute != 0) interval = seconds(60);
    timer t = register_periodic_timer(interval, cont(bk->h, time_expire, bk));
    return cont(bk->h,
                do_time,
                bk,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                hour,
                minute,
                second,
                frame,
                t);
}

static CONTINUATION_6_4(do_random,
                        block, perf, execf, value, value, timer,
                        heap, perf, operator, value *);
static void do_random(block bk, perf p, execf n, value dest, value seed, timer t, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_close) {
        remove_timer(t);
    }

    if (op == op_insert) {
        // This is all very scientific.
        u64 ub = value_as_key(lookup(r, seed));
        u32 tb = (u64)bk->ev->t & (0x200000 - 1); // The 21 bottom tick bits are pretty random

        // Fold the tick bits down into a u8
        u8 ts = (tb ^ (tb >> 7)
                    ^ (tb >> 14)) & (0x80 - 1);

        // Fold the user seed bits down into a u8
        u8 us = (ub ^ (ub >> 7)
                    ^ (ub >> 14)
                    ^ (ub >> 21)
                    ^ (ub >> 28)
                    ^ (ub >> 35)
                    ^ (ub >> 42)
                    ^ (ub >> 49)
                    ^ (ub >> 56)
                    ^ (ub >> 63)) & (0x80 - 1);

        // We fold down to 7 bits to gain some semblance of actual entropy. This means the RNG only has 128 outputs for now.
        u8 true_seed = us ^ ts;

        // No actual rng for now.
        store(r, dest, box_float(((double)true_seed)/128.0));
    }
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}

static execf build_random(block bk, node n)
{
    value dest = table_find(n->arguments, sym(return));
    value seed = table_find(n->arguments, sym(a));
    ticks interval = milliseconds(1000 / 60);
    timer t = register_periodic_timer(interval, 0);
    return cont(bk->h,
                do_random,
                bk,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                dest,
                seed,
                t);
}

static CONTINUATION_3_4(do_fork, perf, int, execf *, heap, perf, operator, value *) ;
static void do_fork(perf p, int legs, execf *b, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
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

static CONTINUATION_2_4(do_trace, execf, node, heap, perf, operator, value *);
static void do_trace(execf next, node n, heap h, perf pp, operator op, value *r)
{
    prf("%s|%010r %v",
        (op == op_insert ? "insert" : (op == op_flush) ? "flush " : "close "),
        table_find(n->arguments, sym(name)),
        n->id);
    if (op != op_flush)
        table_foreach(n->arguments, k, v) {
            // xxx - what is name doing in there anyways?
            if ((k != sym(name)) && (k != sym(pass)))
                prf (" %r=%v ", k, lookup(r, v));
    }
    prf("\n");
    apply(next, h, pp, op, r);
}

static execf build_trace(block bk, node n, execf *arms)
{
    return cont(bk->h,
                do_trace,
                resolve_cfg(bk, n, 0),
                n);
}


static CONTINUATION_3_4(do_regfile, execf, perf, int, heap, perf, operator, value *);
static void do_regfile(execf n, perf p, int size, heap h, perf pp, operator op, value *ignore)
{
    start_perf(p, op);
    value *r;
    if (op == op_insert) {

        // xxx - shouldn't be necessary
        memset(r, 0, size * sizeof(value));
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
                (int)*(double *)table_find(n->arguments, sym(count)));
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

        table_set(builders, intern_cstring("terminal"), build_terminal);
        table_set(builders, intern_cstring("choose"), build_choose);
        table_set(builders, intern_cstring("choosetail"), build_choose_tail);
        table_set(builders, intern_cstring("move"), build_move);
        table_set(builders, intern_cstring("not"), build_not);
        table_set(builders, intern_cstring("time"), build_time);
        table_set(builders, intern_cstring("merge"), build_merge);
        table_set(builders, intern_cstring("random"), build_random);

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
    bk->regs = c->regs;
    bk->h = h;
    bk->name = c->name;
    // this is only used during building
    bk->nmap = allocate_table(bk->h, key_from_pointer, compare_pointer);
    force_node(bk, c->head);
    bk->head = *(execf *)table_find(bk->nmap, c->head);
    return bk;
}
