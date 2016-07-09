#include <runtime.h>
#include <unistd.h>
#include <exec.h>
#include <unix.h>

static CONTINUATION_3_2(do_sub_tail, int *, value, vector, operator, value *);
static void do_sub_tail(int *count,
                        value resreg,
                        vector outputs,
                        operator op, value *r)
{
    // just drop flush and remove on the floor
    if ( op == op_insert) {
        *count = *count + 1;
        table results = lookup(r, resreg);
        vector result = allocate_vector(results->h, vector_length(outputs));
        extract(result, outputs, r);
        table_set(results, result, etrue);
    }
}

static execf build_sub_tail(block bk, node n)
{
    value resreg = vector_get(vector_get(n->arguments, 1), 0);
    return cont(bk->h,
                do_sub_tail,
                register_counter(bk->e, n),
                resreg,
                vector_get(n->arguments, 0));
}


typedef struct sub {
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
} *sub;

                 
static void delete_missing(sub s, value *r)
{
    if (s->previous) {
        table_foreach(s->previous, k, v) {
            if (!table_find(s->moved, k)) {
                table_foreach((table)v, n, _) {
                    copyout(r, s->outputs, n);
                    apply(s->next, op_remove, r);
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

static CONTINUATION_2_2(do_sub, int *, sub, operator, value *);
static void do_sub(int *count, sub s, operator op, value *r)
{
    // dont manage deletions across fixed point
    if (s->t != s->e->t) {
        s->previous = 0;
        s->t = s->e->t;
        s->results = create_value_vector_table(s->h);
    }

    if (op == op_flush) {
        delete_missing(s, r);
        apply(s->next, op, r);
        return;
    }


    table res;
    *count = *count + 1;
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
            set_ids(s, key, r);
            apply(s->leg, op, r);
        }
        table_set(s->results, key, res);
    }
    // cross
    table_foreach(res, n, _) {
        copyout(r, s->outputs, n);
        apply(s->next, op, r);
    }
}


static execf build_sub(block bk, node n)
{
    sub s = allocate(bk->h, sizeof(struct sub));
    s->results = create_value_vector_table(bk->h);
    s->moved = create_value_vector_table(bk->h);
    s->ids_cache = create_value_vector_table(bk->h);
    s->v = allocate_vector(bk->h, vector_length(n->arguments)); // @FIXME this should be the size of inputs (not arguments) xxx
    s->leg = resolve_cfg(bk, n, 1);
    s->inputs = vector_get(n->arguments, 0);
    s->outputs = vector_get(n->arguments, 1);
    s->resreg = vector_get(vector_get(n->arguments, 2), 0);
    s->ids = vector_get(n->arguments, 3);
    s->h = bk->h;
    s->next = resolve_cfg(bk, n, 0);
    s->e = bk->e;
    s->t = bk->e->t;
    vector_insert(bk->finish, cont(bk->h, end_o_sub, s)); 
    return cont(bk->h,
                do_sub,
                register_counter(bk->e, n),
                s);

}


static CONTINUATION_8_2(do_subagg, int *, execf, execf, value, table, vector, vector, vector,
                        operator, value *);
static void do_subagg(int *count, execf next, execf leg, value resreg,
                      table results, vector v, vector inputs, vector outputs,
                      operator op, value *r)
{
    if (op == op_flush) {
        apply(leg, op, r);
        table_foreach(results, v, rset) {
            copyout(r, inputs, v);
            table_foreach((table)rset, o, _) {
                copyout(r, outputs, o);
                apply(next, op_insert, r);
            }
        }
        apply(next, op, r);
        return;
    }

    table res;
    *count = *count + 1;
    extract(v, inputs, r);

    if (!(res = table_find(results, v))){
        res = create_value_vector_table(results->h);
        vector key = allocate_vector(results->h, vector_length(inputs));
        extract(key, inputs, r);
        table_set(results, key, res);
        r[toreg(resreg)] = res;
        apply(leg, op, r);
    }
}


static execf build_subagg(block bk, node n)
{
    table results = create_value_vector_table(bk->h);
    vector v = allocate_vector(bk->h, vector_length(n->arguments));
    return cont(bk->h,
                do_subagg,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                resolve_cfg(bk, n, 1),
                vector_get(vector_get(n->arguments, 2), 0),
                results,
                v,
                vector_get(n->arguments, 0),
                vector_get(n->arguments, 1));
}


static CONTINUATION_3_2(do_choose_tail, int *, execf, value, operator, value *);
static void do_choose_tail(int *count, execf next, value flag, operator op, value *r)
{
    if (op != op_flush) {
        *count = *count + 1;
        store(r, flag, etrue);
    }
    if (next)
        apply(next, op, r);
}

static execf build_choose_tail(block bk, node n)
{
    table results = create_value_vector_table(bk->h);
    // gonna share this one today
    vector v = allocate_vector(bk->h, vector_length(n->arguments));
    return cont(bk->h,
                do_choose_tail,
                register_counter(bk->e, n),
                (vector_length(n->arms) > 0)? resolve_cfg(bk, n, 0):0,
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_3_2(do_choose, int *, vector, value, operator, value *);
static void do_choose(int *count, vector legs, value flag, operator op, value *r)
{
    if (op == op_flush) {
        vector_foreach (legs, i){
            apply((execf) i, op, r);
        }
    } else {
        *count = *count + 1;
        r[toreg(flag)] = efalse;
        vector_foreach (legs, i){
            apply((execf) i, op, r);
            if (r[toreg(flag)] == etrue) return;
        }
    }
}


static execf build_choose(block bk, node n)
{
    int arms = vector_length(n->arms);
    vector v = allocate_vector(bk->h, arms);
    for (int i = 0 ; i < arms; i++ )
        vector_set(v, i, resolve_cfg(bk, n, i));

    return cont(bk->h,
                do_choose,
                register_counter(bk->e, n),
                v,
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_4_2(do_not, int *, execf, execf, value, operator, value *);
static void do_not(int *count, execf next, execf leg, value flag, operator op, value *r)
{
    // should also flush down the leg
    if (op == op_flush) {
        apply(next, op, r);
        return;
    }
    *count = *count + 1;
    store(r, flag, efalse);
    
    apply(leg, op, r);

    if (lookup(r, flag) == efalse)
        apply(next, op, r);
}


static execf build_not(block bk, node n)
{
    return cont(bk->h,
                do_not,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                resolve_cfg(bk, n, 1),
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_4_2(do_move, int *, execf, value,  value, operator, value *);
static void do_move(int *count, execf n, value dest, value src, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count+1;
        r[reg(dest)] = lookup(r, src);
    }
    apply(n, op, r);
}


static execf build_move(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_move,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1));
}


static CONTINUATION_3_2(do_merge, execf, int, u32, operator, value *);
static void do_merge(execf n, int count, u32 total, operator op, value *r)
{
    if (op == op_flush) {
        *total = *total +1;
        if (*total == count) {
            *total = 0;
        } else return;
    }
    apply(n, op, r);
}

static execf build_merge(block bk, node n)
{
    u32 c = allocate(bk->h, sizeof(iu32));
    *c = 0;
    return cont(bk->h, do_merge, resolve_cfg(bk, n, 0),
                (int)*(double *)vector_get(vector_get(n->arguments, 0), 0),
                c);
}

static CONTINUATION_1_2(do_terminal, block, operator, value *);
static void do_terminal(block bk, operator op, value *r)
{
    if (op == op_insert) apply(bk->e->terminal);
}

static execf build_terminal(block bk, node n)
{
    return cont(bk->h, do_terminal, bk);
}

static CONTINUATION_6_2(do_time,
                        block, int *, execf, value, value, value,
                        operator, value *);
static void do_time(block bk, int *count, execf n, value s, value m, value h, operator op, value *r)
{
    if (op == op_insert) {
        unsigned int seconds, minutes,  hours;
        *count = *count +1;
        clocktime(bk->e->t, &hours, &minutes, &seconds);
        value sv = box_float((double)seconds);
        value mv = box_float((double)minutes);
        value hv = box_float((double)hours);
        store(r, s, sv);
        store(r, m, mv);
        store(r, h, hv);
    }
    apply(n, op, r);
}

static CONTINUATION_1_0(time_expire, block);
static void time_expire(block bk)
{
    run_solver(bk->e);
}

// xxx  - handle the bound case
static execf build_time(block bk, node n, execf *arms)
{
    vector a = vector_get(n->arguments, 0);
    register_periodic_timer(seconds(1), cont(bk->h, time_expire, bk));
    return cont(bk->h,
                do_time,
                bk,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}


static CONTINUATION_3_2(do_fork, int *, int, execf *, operator, value *) ;
static void do_fork(int *count, int legs, execf *b, operator op, value *r)
{
    if (op != op_flush) *count = *count+1;
    for (int i =0; i<legs ;i ++) apply(b[i], op, r);
}

static execf build_fork(block bk, node n)
{
    int count = vector_length(n->arms);
    execf *a = allocate(bk->h, sizeof(execf) * count);

    for (int i=0; i < count; i++)
        a[i] = resolve_cfg(bk, n, i);
    return cont(bk->h, do_fork, register_counter(bk->e, n), count, a);
}

static CONTINUATION_2_2(do_trace, execf, vector, operator, value *);
static void do_trace(execf n, vector terms, operator op, value *r)
{
    for (int i=0; i<vector_length(terms); i+=2) {
        prf(" %v %v", lookup(r, vector_get(terms, i)), lookup(r, vector_get(terms, i+1)));
    }
    write(1, "\n", 1);
    apply(n, op, r);
}

static execf build_trace(block bk, node n, execf *arms)
{
    return cont(bk->h,
                do_trace,
                resolve_cfg(bk, n, 0),
                vector_get(n->arguments, 0));
}


static CONTINUATION_4_2(do_regfile, heap, execf, int*, int, operator, value *);
static void do_regfile(heap h, execf n, int *count, int size, operator op, value *ignore)
{
    value *r;
    if (op == op_insert) {
        *count = *count +1;
        r = allocate(h, size * sizeof(value));
    }
    apply(n, op, r);
}

static execf build_regfile(block bk, node n, execf *arms)
{
    return cont(bk->h,
                do_regfile,
                bk->h,
                resolve_cfg(bk, n, 0),
                register_counter(bk->e, n),
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

block build(evaluation e, node n)
{
    block bk = allocate(e->h, sizeof(struct block));
    bk->e = e;
    bk->h = e->h;
    // this is only used during building
    bk->nmap = allocate_table(bk->h, key_from_pointer, compare_pointer);

    bk->finish = allocate_vector(bk->h, 10);
    force_node(bk, n);
    bk->head = *(execf *)table_find(bk->nmap, n);
    return bk;
}
