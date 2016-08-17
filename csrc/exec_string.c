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

static CONTINUATION_6_4(do_split, perf, execf,
                        value, value, value, value,
                        heap, perf, operator, value *);
static void do_split(perf p, execf n,
                     value token, value text, value index, value by,
                     heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if ((op != op_flush) && (op != op_close)) {
        buffer out = 0;
        int j = 0;
        int ind = 0;
        estring s = lookup(r, text);
        estring k = lookup(r, by);
        // utf8
        for (int i = 0; i < s->length; i++) {
            character si = s->body[i];
            character ki = k->body[j];

            if (!out) out = allocate_string(h);
            if (si == ki) {
                j++;
            } else {
                for (int z = 0; z < j; z++)
                    string_insert(out, k->body[z]);
                j = 0;
                string_insert(out, si);
            }
            if (j == k->length) {
                store(r, token, intern_buffer(out));
                store(r, index, box_float(ind++));
                j = 0;
                out = 0;
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
                table_find(n->arguments, sym(token)),
                table_find(n->arguments, sym(text)),
                table_find(n->arguments, sym(index)),
                table_find(n->arguments, sym(by)));

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
