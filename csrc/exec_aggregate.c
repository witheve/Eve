#include <runtime.h>
#include <exec.h>

// we're suposed to have multiple keys and multiple sort orders, ideally
// just generate a comparator over r
static CONTINUATION_8_2(do_sort, heap, execf, int*,
                        table *, value, value, vector,vector,
                        operator, value *);
static void do_sort(heap h, execf n, int *count,
                    table *targets, value key, value out, vector proj, vector pk,
                    operator op, value *r)
{
    if (op == op_insert) {
        *count = *count +1;
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
            pqueue p = x;
            int count;
            copyout(r, proj, x);
            vector_foreach(p->v, i) {
                // if we dont do the denorm trick, these should at least be findable and resuable
                store(out, out, box_float(count++));
                apply(n, op_insert, r);
            }
        }
        apply(n, op_flush, r);
        *targets = allocate_table((*targets)->h, key_from_pointer, compare_pointer);
    }
}

static execf build_sort(evaluation e, node n, execf *arms)
{
    return cont(e->h,
                do_sort,
                e->h,
                resolve_cfg(e, n, 0),
                register_counter(e, n),
                0, 0, 0, 0, 0);
}


static CONTINUATION_8_2(do_sum, heap, execf, int*, table*, vector, value, value, vector, operator, value *);
static void do_sum(heap h, execf n, int *count,
                   table *targets, vector grouping, value src, value dst, vector pk,
                   operator op, value *r)
{
    prf("do sum! %d\n", op);
    if (op == op_insert) {
        *count = *count +1;
        extract(pk, grouping, r);
        prf("%V src %v dest %v pk %V\n", grouping, src, dst, pk);
        double *x;
        if (!(x = table_find(*targets, pk))) {
            x = allocate(h, sizeof(double *));
            *x = 0.0;
            vector key = allocate_vector(h, vector_length(grouping));
            extract(key, grouping, r);
            table_set(*targets, key, x);
        }
        *x = *x + *(double *)lookup(r, src);
    }

    if (op == op_flush) {
        prf("flushing\n");
        table_foreach(*targets, pk, x) {
            prf("hey flush %V %v\n", pk, x);
            copyout(r, grouping, pk);
            store(r, dst, box_float(*(double *)x));
            apply(n, op_insert, r);
        }
        *targets = allocate_table((*targets)->h, key_from_pointer, compare_pointer);
        apply(n, op_flush, r);
    }
}

static execf build_sum(evaluation e, node n, execf *arms)
{
    // vector targets, grouping, value src, value dst, vector pk
    vector args = vector_get(n->arguments, 0);
    vector groupings = vector_get(n->arguments, 1);

    vector pk = allocate_vector(e->h, vector_length(groupings));
    table *targets = allocate(e->h, sizeof(table));
    *targets = create_value_vector_table(e->h);
    return cont(e->h,
                do_sum,
                e->h,
                resolve_cfg(e, n, 0),
                register_counter(e, n),
                targets,
                groupings,
                vector_get(args, 1),
                vector_get(args, 0),
                pk);
}


void register_aggregate_builders(table builders)
{
    table_set(builders, intern_cstring("sum"), build_sum);
    table_set(builders, intern_cstring("sort"), build_sort);
}
