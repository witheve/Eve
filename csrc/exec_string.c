#include <runtime.h>
#include <exec.h>


static CONTINUATION_4_3(do_concat, int *, execf, value, vector, heap, operator, value *);
static void do_concat(int *count, execf n, value dest, vector terms, heap h, operator op, value *r)
{
    // XXX not init
    buffer b = allocate_string(init);
    *count = *count+1;

    vector_foreach(terms, i)
        print_value_raw(b, lookup(r, i));

    store(r, dest, intern_string(bref(b, 0), buffer_length(b)));
    apply(n, h, op, r);
}


static execf build_concat(block bk, node n)
{
    return cont(bk->h, do_concat,
                register_counter(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(vector_get(n->arguments, 0), 0),
                (vector)vector_get(n->arguments, 1));
}

static CONTINUATION_5_3(do_split, int *, execf, value, value, value,
                        heap, operator, value *);
static void do_split(int *count, execf n, value dest, value source, value key,
                     heap h, operator op, value *r)
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
                apply(n, h, op, r);
            }
        }
    }
}


static execf build_split(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_split,
                register_counter(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1),
                vector_get(a, 2));
}


static CONTINUATION_4_3(do_length, int *, execf, value,  value, heap, operator, value *);
static void do_length(int *count, execf n, value dest, value src, heap h, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count+1;
        store(r, dest, lookup(r, src));
    }
    apply(n, h, op, r);
}


static execf build_length(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_length,
                register_counter(bk->ev, n),
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
