#include <runtime.h>
#include <exec.h>


static CONTINUATION_4_2(do_concat, int *, execf, value, vector, operator, value *);
static void do_concat(int *count, execf n, value dest, vector terms, operator op, value *r)
{
    // XXX not init
    buffer b = allocate_string(init);
    *count = *count+1;

    vector_foreach(terms, i)
        print_value_raw(b, lookup(r, i));

    store(r, dest, intern_string(bref(b, 0), buffer_length(b)));
    apply(n, op, r);
}


static execf build_concat(block bk, node n)
{
    return cont(bk->h, do_concat,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                vector_get(vector_get(n->arguments, 0), 0),
                (vector)vector_get(n->arguments, 1));
}

static CONTINUATION_6_2(do_split, heap, int *, execf, value, value, value,
                        operator, value *);
static void do_split(heap h, int *count, execf n, value dest, value source, value key,
                     operator op, value *r)
{
    if (op == op_flush) {
        *count = *count+1;
        buffer out = allocate_string(h);
        int j;
        estring s = lookup(r, source);
        estring k = lookup(r, key);
        for (int i = 0; i < s->length; i++) {
            for (j = 0; (j < k->length) && ((i+j) < s->length); j++) {
                if (k->body[j] != s->body[i+j]) break;
            }
            if (j == k->length) {
                store(r, dest, intern_buffer(out));
                i+= j-1;
                buffer_clear(out);
                apply(n, op, r);
            }
        }
    }
}


static execf build_split(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_split,
                bk->h,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1),
                vector_get(a, 2));
}


static CONTINUATION_4_2(do_length, int *, execf, value,  value, operator, value *);
static void do_length(int *count, execf n, value dest, value src, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count+1;
        store(r, dest, lookup(r, src));
    }
    apply(n, op, r);
}


static execf build_length(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_length,
                register_counter(bk->e, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1));
}

void register_string_builders(table builders)
{
    table_set(builders, intern_cstring("concat"), build_concat);
    table_set(builders, intern_cstring("split"), build_split);
    table_set(builders, intern_cstring("length"), build_length);
}
