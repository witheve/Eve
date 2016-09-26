#include <runtime.h>
#include <exec.h>

// we're suposed to have multiple keys and multiple sort orders, ideally
// just generate a comparator over r
static CONTINUATION_7_4(do_sort,
                        execf, perf,
                        table *, value, value, vector,vector,
                        heap, perf, operator, value *);
static void do_sort(execf n, perf p,
                    table *targets, value key, value out, vector grouping, vector pk,
                    heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    
    if (op == op_insert) {
        extract(pk, grouping, r);
                
        pqueue x;
        if (!(x = table_find(*targets, pk))) {
            x = allocate_pqueue(h, order_values);
            // make a new key idiot
            table_set(*targets,pk, x);
        }
        pqueue_insert(x, lookup(r, key));
    }

    if (op == op_flush) {
        table_foreach(*targets, pk, x) {
            pqueue q = x;
            value v;
            int count = 1;
            copyout(r, grouping, pk);
            // ok, i think there is a faster way here..but
            while (v = pqueue_pop(q)){
                store(r, key, v);                            
                // xxx - small int representation
                store(r, out, box_float(count++));
                apply(n, h, p, op_insert, r);
            }
        }
        apply(n, h, p, op_flush, r);
        *targets = allocate_table((*targets)->h, key_from_pointer, compare_pointer);
    }
    if (op == op_close) {
        apply(n, h, p, op_close, r);
    }
    stop_perf(p, pp);
}

static execf build_sort(block bk, node n, execf *arms)
{
    vector groupings = table_find(n->arguments, sym(groupings));
    if (!groupings) groupings = allocate_vector(bk->h, 0);
    vector pk = allocate_vector(bk->h, vector_length(groupings));
    table *targets = allocate(bk->h, sizeof(table));
    *targets = create_value_vector_table(bk->h);
    
    return cont(bk->h,
                do_sort,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                targets,
                table_find(n->arguments, sym(value)),
                table_find(n->arguments, sym(return)),
                groupings,
                pk);
}


typedef struct join_key{
    value index;
    estring token;
    estring with;
} *join_key;


static boolean order_join_keys(void *a, void *b)
{
    join_key ak = a, bk = b;
    // sort value?
    return *(double*)ak->index < *(double*)bk->index;
}

// we're suposed to have multiple keys and multiple sort orders, ideally
// just generate a comparator over r
static CONTINUATION_9_4(do_join, execf, perf,
                        table *, vector, value, vector, value, value, value,
                        heap, perf, operator, value *);

// we should really cross by with
static void do_join(execf n, perf p, table *groups, vector pk,
                    value out, vector groupings, value token, value index, value with,
                    heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);

    if (op == op_insert) {
        extract(pk, groupings, r);
        pqueue x;

        if (!*groups)
            *groups = create_value_vector_table(h);

        if (!(x = table_find(*groups, pk))) {
            vector new_pk = allocate_vector(h, vector_length(groupings));
            extract(new_pk, groupings, r);
            x = allocate_pqueue(h, order_join_keys);
            table_set(*groups, new_pk, x);
        } 
        join_key jk = allocate(h, sizeof(struct join_key));
        jk->index = lookup(r, index);

        // xxx - coerce everything to a string
        jk->token = lookup(r, token);
        jk->with = lookup(r, with);
        pqueue_insert(x, jk);
    }

    if (op == op_flush) {
        if (*groups){
            table_foreach(*groups, pk, x) {
                pqueue q = x;
                buffer composed = allocate_string(h);
                copyout(r, groupings, pk);
                join_key jk;
                while (jk = (join_key)pqueue_pop(q)){
                    buffer_append(composed, jk->token->body, jk->token->length);
                    buffer_append(composed, jk->with->body, jk->with->length);
                }
                store(r, out, intern_buffer(composed));
                apply(n, h, p, op_insert, r);
            }
        }
        apply(n, h, p, op_flush, r);
        *groups = 0;
    }
    if (op == op_close) {
        apply(n, h, p, op_close, r);
    }
    stop_perf(p, pp);
}

static execf build_join(block bk, node n, execf *arms)
{
    vector groupings = table_find(n->arguments, sym(groupings));
    // correct?
    if (!groupings) groupings = allocate_vector(bk->h, 0);
    vector pk = allocate_vector(bk->h, vector_length(groupings));
    table *groups = allocate(bk->h, sizeof(table));

    prf ("jion %V\n", groupings);
    
    return cont(bk->h,
                do_join,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                groups,
                pk,
                table_find(n->arguments, sym(return)),
                groupings,
                table_find(n->arguments, sym(token)),
                table_find(n->arguments, sym(index)),
                table_find(n->arguments, sym(with)));
}

typedef double (*dubop)(double, double);

static double op_min(double a, double b)
{
    return (a<b)?a:b;
}
static double op_max(double a, double b)
{
    return (a>b)?a:b;
}
static double op_sum(double a, double b)
{
    return a+b;
}



static CONTINUATION_8_4(do_double_agg, execf, perf, dubop, table*, vector, value, value, vector, heap, perf, operator, value *);
static void do_double_agg(execf n, perf p, dubop dop,
                          table *targets, vector grouping, value src, value dst, vector pk,
                          heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    
    if (op == op_insert) {
        extract(pk, grouping, r);
        double *x;
        double *z = lookup(r, src);
        if (!(x = table_find(*targets, pk))) {
            x = allocate((*targets)->h, sizeof(double *));
            *x = *z;
            vector key = allocate_vector((*targets)->h, vector_length(grouping));
            extract(key, grouping, r);
            table_set(*targets, key, x);
        } else *x = dop(*x,*z);
    }

    if (op == op_flush) {
        table_foreach(*targets, pk, x) {
            copyout(r, grouping, pk);
            value out = box_float(*(double *)x);
            store(r, dst, out);
            apply(n, h, p, op_insert, r);
        }
        *targets = create_value_vector_table((*targets)->h);
        apply(n, h, p, op_flush, r);
    }

    if (op == op_close) {
        apply(n, h, p, op_close, r);
    }
    stop_perf(p, pp);
}

static execf build_double_agg(block bk, node n, execf *arms)
{
    vector groupings = table_find(n->arguments, sym(groupings));
    if (!groupings) groupings = allocate_vector(bk->h, 0);
    vector pk = allocate_vector(bk->h, vector_length(groupings));
    table *targets = allocate(bk->h, sizeof(table));
    *targets = create_value_vector_table(bk->h);
    dubop op;

    if (n->type == sym(max)) op = op_max;
    if (n->type == sym(min)) op = op_min;
    if (n->type == sym(sum)) op = op_sum;
    return cont(bk->h,
                do_double_agg,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                op,
                targets,
                groupings,
                table_find(n->arguments, sym(value)),
                table_find(n->arguments, sym(return)),
                pk);
}

typedef struct subagg {
    heap phase;
    vector projection;
    vector groupings;
    table proj;
    table group;
    vector key;
    vector gkey;
    value pass;
    int regs;
} *subagg;


static CONTINUATION_4_4(do_subagg_tail,
                        perf, execf, value, vector,
                        heap, perf, operator, value *);
static void do_subagg_tail(perf p, execf next, value pass,
                           vector produced,
                           heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);

    if (op == op_insert) {
        subagg sag =  lookup(r, pass);
        extract(sag->gkey, sag->groupings, r);
        vector cross = table_find(sag->group, sag->gkey);
        // cannot be empty
        vector_foreach(cross, i) {
            copyto(i, r, produced);
            apply(next, h, p, op, i);
        }
    } else {
        apply(next, h, p, op, r);
    }
    stop_perf(p, pp);
}

static execf build_subagg_tail(block bk, node n)
{
    vector groupings = table_find(n->arguments, sym(groupings));
    // apparently this is allowed to be empty?
    if (!groupings) groupings = allocate_vector(bk->h,0);
    table* group_inputs = allocate(bk->h, sizeof(table));
    *group_inputs = create_value_vector_table(bk->h);

    vector v = allocate_vector(bk->h, groupings?vector_length(groupings):0);
    return cont(bk->h,
                do_subagg_tail,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                table_find(n->arguments, sym(pass)),
                table_find(n->arguments, sym(provides)));
}

static CONTINUATION_3_4(do_subagg,
                        perf, execf, subagg,
                        heap, perf, operator, value *);

static void do_subagg(perf p, execf next, subagg sag,
                      heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);

    if ((op == op_flush) || (op == op_close)) {
        if (op == op_flush) store(r, sag->pass, sag);
        apply(next, h, p, op, r);
        if (sag->phase) destroy(sag->phase);
        sag->phase = 0;
        stop_perf(p, pp);
        return;
    }

    if (!sag->phase) {
        sag->phase = allocate_rolling(pages, sstring("subagg"));
        sag->proj =  create_value_vector_table(sag->phase);
        sag->group =  create_value_vector_table(sag->phase);
    }

    extract(sag->key, sag->projection, r);
    if (!table_find(sag->proj, sag->key)) {
        vector key = allocate_vector(sag->phase, vector_length(sag->projection));
        extract(key, sag->projection, r);
        table_set(sag->proj, key, (void *)1);
        store(r, sag->pass, sag);
        apply(next, h, p, op, r);
    }

    vector cross;
    extract(sag->gkey, sag->groupings, r);
    if (!(cross = table_find(sag->group, sag->gkey))) {
        cross = allocate_vector(sag->phase, 5);
        vector key = allocate_vector(sag->phase, vector_length(sag->groupings));
        extract(key, sag->groupings, r);
        table_set(sag->group, sag->gkey, cross);
    }

    value *cr = allocate(sag->phase, sag->regs * sizeof(value));
    memcpy(cr, r,  sag->regs * sizeof(value));
    vector_insert(cross, cr);

    stop_perf(p, pp);
}

// subagg and subaggtail are an oddly specific instance of a general cross
// function and a general project function. there a more general compiler
// model which obviates the need for this
static execf build_subagg(block bk, node n)
{
    subagg sag = allocate(bk->h, sizeof(struct subagg));
    sag->phase = 0;
    sag->proj = 0;
    sag->group = 0;
    sag->projection = table_find(n->arguments, sym(projection));
    sag->groupings = table_find(n->arguments, sym(groupings));
    sag->key = allocate_vector(bk->h, vector_length(sag->projection));
    sag->gkey = allocate_vector(bk->h, vector_length(sag->groupings));
    sag->pass = table_find(n->arguments, sym(pass));
    sag->regs = bk->regs;

    return cont(bk->h,
                do_subagg,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                sag);
}


void register_aggregate_builders(table builders)
{
    table_set(builders, intern_cstring("subagg"), build_subagg);
    table_set(builders, intern_cstring("subaggtail"), build_subagg_tail);
    table_set(builders, intern_cstring("sum"), build_double_agg);
    table_set(builders, intern_cstring("max"), build_double_agg);
    table_set(builders, intern_cstring("min"), build_double_agg);    
    table_set(builders, intern_cstring("join"), build_join);
    table_set(builders, intern_cstring("sort"), build_sort);
}
