#include <runtime.h>
#include <exec.h>

// we're suposed to have multiple keys and multiple sort orders, ideally
// just generate a comparator over r
static CONTINUATION_7_4(do_sort,
                        execf, perf,
                        table *, value, value, vector,vector,
                        heap, perf, operator, value *);
static void do_sort(execf n, perf p,
                    table *targets, value key, value out, vector proj, vector pk,
                    heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_insert) {

        extract(pk, proj, r);
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
            int count;
            copyout(r, proj, x);
            vector_foreach(q->v, i) {
                // if we dont do the denorm trick, these should at least be findable and resuable
                store(out, out, box_float(count++));
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
    return cont(bk->h,
                do_sort,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                0, 0, 0, 0, 0);
}


static CONTINUATION_7_4(do_sum, execf, perf, table*, vector, value, value, vector, heap, perf, operator, value *);
static void do_sum(execf n, perf p,
                   table *targets, vector grouping, value src, value dst, vector pk,
                   heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_insert) {
        extract(pk, grouping, r);
        double *x;
        if (!(x = table_find(*targets, pk))) {
            x = allocate((*targets)->h, sizeof(double *));
            *x = 0.0;
            vector key = allocate_vector((*targets)->h, vector_length(grouping));
            extract(key, grouping, r);
            table_set(*targets, key, x);
        }
        *x = *x + *(double *)lookup(r, src);
    }

    if (op == op_flush) {
        table_foreach(*targets, pk, x) {
            copyout(r, grouping, pk);
            store(r, dst, box_float(*(double *)x));
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

static execf build_sum(block bk, node n, execf *arms)
{
    vector groupings = table_find(n->arguments, sym(groupings));
    if (!groupings) groupings = allocate_vector(bk->h, 0);
    vector pk = allocate_vector(bk->h, vector_length(groupings));
    table *targets = allocate(bk->h, sizeof(table));
    *targets = create_value_vector_table(bk->h);
    return cont(bk->h,
                do_sum,
                resolve_cfg(bk, n, 0),
                register_perf(bk->ev, n),
                targets,
                groupings,
                table_find(n->arguments, sym(source)),
                table_find(n->arguments, sym(destination)),
                pk);
}



static CONTINUATION_4_4(do_subagg_tail,
                        perf, execf, value, vector,
                        heap, perf, operator, value *);
static void do_subagg_tail(perf p, execf next, value pass,
                           vector produced,
                           heap h, perf pp, operator op, value *r)
{
    vector v;
    start_perf(p, op);
    
    // xxx - unlike the general cross, since we know that the agg will only issue on
    // the flush, we have the whole set
    if (op == op_insert) {
        vector crosses = lookup(r, pass);
        vector_foreach(crosses, i) { 
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


static CONTINUATION_9_4(do_subagg,
                        perf, execf, int, heap *, table *, vector *, value, vector, vector,
                        heap, perf, operator, value *);

static void do_subagg(perf p, execf next,
                      int regs, heap *phase, table *proj, vector *cross, value pass, vector v, vector inputs,
                      heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_flush || op == op_close) {
        apply(next, h, p, op, r);
        destroy(*phase);
        *phase = 0;
        stop_perf(p, pp);
        return;
    }
    
    if (!*phase) {
        *phase = allocate_rolling(pages, sstring("subagg"));
        *cross =  allocate_vector(*phase, 20);
        *proj =  create_value_vector_table(*phase);
    }

    extract(v, inputs, r);
    value *cr = allocate(*phase, regs * sizeof(value));
    memcpy(cr, r,  regs * sizeof(value));
    vector_insert(*cross, cr);

    if (!table_find(*proj, v)){
        vector key = allocate_vector(*phase, vector_length(inputs));
        extract(key, inputs, r);
        table_set(*proj, key, (void*)1);
        apply(next, h, p, op, r);
    }
    stop_perf(p, pp);
}

// subagg and subaggtail are an oddly specific instance of a general cross
// function and a general project function. there a more general compiler
// model which obviates the need for this
static execf build_subagg(block bk, node n)
{
    heap *phase = allocate(bk->h, sizeof(heap));
    table *proj = allocate(bk->h, sizeof(table));
    vector *cross = allocate(bk->h, sizeof(vector));
    *phase = 0;
    vector p = table_find(n->arguments, sym(proj));

    return cont(bk->h,
                do_subagg,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                bk->regs,
                phase,
                proj,
                cross,
                table_find(n->arguments, sym(pass)),
                allocate_vector(bk->h, vector_length(p)),
                p);
}


void register_aggregate_builders(table builders)
{
    table_set(builders, intern_cstring("subagg"), build_subagg);
    table_set(builders, intern_cstring("subaggtail"), build_subagg_tail);
    table_set(builders, intern_cstring("sum"), build_sum);
    table_set(builders, intern_cstring("sort"), build_sort);
}
