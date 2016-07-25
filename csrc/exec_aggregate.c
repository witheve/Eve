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
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(return)),
                pk);
}


void register_aggregate_builders(table builders)
{
    table_set(builders, intern_cstring("sum"), build_sum);
    table_set(builders, intern_cstring("sort"), build_sort);
}
