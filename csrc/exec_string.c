#include <runtime.h>
#include <exec.h>


static CONTINUATION_4_4(do_concat, perf, execf, value, vector, heap, perf, operator, value *);
static void do_concat(perf p, execf n, value dest, vector terms, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if(op == op_close) {
        apply(n, h, p, op, r);
        stop_perf(p, pp);
        return;
    }
    buffer b = allocate_string(h);

    vector_foreach(terms, i)
        print_value_raw(b, lookup(r, i));

    store(r, dest, intern_string(bref(b, 0), buffer_length(b)));
    apply(n, h, p, op, r);
    stop_perf(p, pp);
}


static execf build_concat(block bk, node n)
{
    return cont(bk->h, do_concat,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                table_find(n->arguments, sym(return)),
                table_find(n->arguments, sym(variadic)));
}

static CONTINUATION_5_4(do_split, perf, execf, value, value, value,
                        heap, perf, operator, value *);
static void do_split(perf p, execf n, value dest, value source, value key,
                     heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
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
                apply(n, h, p, op, r);
            }
        }
    }
    stop_perf(p, pp);
}


static execf build_split(block bk, node n)
{
    // need an index here
    return cont(bk->h, do_split,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                table_find(n->arguments, sym(destination)),
                table_find(n->arguments, sym(source)),
                table_find(n->arguments, sym(key)));

}


static CONTINUATION_5_4(do_length, block, perf, execf, value,  value, heap, perf, operator, value *);
static void do_length(block bk, perf p, execf n, value dest, value src, heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if (op == op_insert) {
        value str = lookup(r, src);
        if((type_of(str) == estring_space)) {
            store(r, dest, box_float(((estring)str)->length));
            apply(n, h, p, op, r);
        } else {
            exec_error(bk->ev, "Attempt to get length of non-string", str);                                           \
        }
    } else {
        apply(n, h, p, op, r);
    }
    stop_perf(p, pp);
}


static execf build_length(block bk, node n)
{
    return cont(bk->h, do_length,
                bk,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                table_find(n->arguments, sym(return)),
                table_find(n->arguments, sym(string)));
}

void register_string_builders(table builders)
{
    table_set(builders, intern_cstring("concat"), build_concat);
    table_set(builders, intern_cstring("split"), build_split);
    table_set(builders, intern_cstring("length"), build_length);
}
