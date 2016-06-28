#include <runtime.h>
#include <exec.h>

// we're suposed to have multiple keys and multiple sort orders, ideally
// just generate a comparator over r
static CONTINUATION_8_2(do_sort, heap, execf, int*, 
                        table, value, value, vector,vector,
                        operator, value *);
static void do_sort(heap h, execf n, int *count,
                        table dest, value key, value out, vector proj, vector pk,
                    operator op, value *ignore)
{
    value *r;
    if (op == op_insert) {
        *count = *count +1;
        extract(pk, proj, r);
    }
    apply(n, op, r);
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


static CONTINUATION_8_2(do_sum, heap, execf, int*, table, vector, value, value, vector, operator, value *);
static void do_sum(heap h, execf n, int *count,
                   table targets, vector proj, value src, value dst, vector pk,
                   operator op, value *ignore)
{
    value *r;
    if (op == op_insert) {
        *count = *count +1;
        extract(pk, proj, r);
        double *x;
        if (!(x = table_find(targets, pk))) {
            x = allocate(h, sizeof(double *));
            
        }
    }
    if (op == op_flush) {
        foreach(targets, pk, x) {
            copyout(r, proj, x);
            store(r, dst, box_float(*x));
            apply(n, op_insert, r);        
        }
        apply(n, op_flush, r);        
    }
}

static execf build_sum(evaluation e, node n, execf *arms)
{
    return cont(e->h,
                do_sum,
                e->h,
                resolve_cfg(e, n, 0),
                register_counter(e, n),
                0, 0, 0, 0, 0);
}


void register_aggregate_builders(table builders)
{
    table_set(builders, intern_cstring("sum"), build_sum);
    table_set(builders, intern_cstring("sort"), build_sort);
}
