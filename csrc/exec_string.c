#include <runtime.h>
#include <exec.h>


static CONTINUATION_4_3(do_concat, perf, execf, value, vector, heap, operator, value *);
static void do_concat(perf p, execf n, value dest, vector terms, heap h, operator op, value *r)
{
    // XXX not init
    start_perf(p);
    buffer b = allocate_string(init);

    vector_foreach(terms, i)
        print_value_raw(b, lookup(r, i));

    store(r, dest, intern_string(bref(b, 0), buffer_length(b)));
    apply(n, h, op, r);
    stop_perf(p);
}


static execf build_concat(block bk, node n)
{
    return cont(bk->h, do_concat,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(vector_get(n->arguments, 0), 0),
                (vector)vector_get(n->arguments, 1));
}

static CONTINUATION_5_3(do_split, perf, execf, value, value, value,
                        heap, operator, value *);
static void do_split(perf p, execf n, value dest, value source, value key,
                     heap h, operator op, value *r)
{
    start_perf(p);
    if (op != op_flush) {
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
    stop_perf(p);
}


static execf build_split(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_split,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                vector_get(a, 0),
                vector_get(a, 1),
                vector_get(a, 2));
}


static CONTINUATION_4_3(do_length, perf, execf, value,  value, heap, operator, value *);
static void do_length(perf p, execf n, value dest, value src, heap h, operator op, value *r)
{
    start_perf(p);
    if (op == op_insert) {
        store(r, dest, lookup(r, src));
    }
    apply(n, h, op, r);
    stop_perf(p);
}


static execf build_length(block bk, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(bk->h, do_length,
                register_perf(bk->ev, n),
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
