#include <runtime.h>
#include <exec.h>


static CONTINUATION_9_5(scan_listener,
                        value,
                        execf, heap, operator, value *, perf,
                        value, value, value,
                        value, value, value, multiplicity, uuid);

static void scan_listener(value id, execf n, heap h, operator op, value *r, perf p,
                          value er, value ar, value vr,
                          value e, value a, value v, multiplicity m, uuid bku)
{
    //    prf("scan: %v %v %v %v %d\n", bku, e, a, v, m);
    if (m > 0) {
        store(r, er, e);
        store(r, ar, a);
        store(r, vr, v);
        apply(n, h, p, op, r);
    }
}

#define sigbit(__sig, __p, __r) ((sig&(1<<__p))? register_ignore: __r)

static CONTINUATION_8_4(do_scan, value, block, perf, execf, int, value, value, value, heap, perf, operator, value *);
static void do_scan(value id, block bk, perf p, execf n, int sig, value e, value a, value v,
                    heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    if ((op == op_flush) || (op == op_close)) {
        apply(n, h, p, op, r);
        stop_perf(p, pp);
        return;
    }

    apply(bk->ev->reader, sig,
          cont(h, scan_listener, id, n, h, op, r, p,
               sigbit(sig, 2, e), sigbit(sig, 1, a), sigbit(sig, 0, v)),
          lookup(r, e), lookup(r, a), lookup(r, v));
    stop_perf(p, pp);
}

static inline boolean is_cap(unsigned char x) {return (x >= 'A') && (x <= 'Z');}

static execf build_scan(block bk, node n)
{
    estring description = table_find(n->arguments, sym(sig));
    int sig = 0;
    for (int i=0; i< 3; i++) {
        sig <<= 1;
        sig |= is_cap(description->body[i]);
    }
    return cont(bk->h, do_scan, n->id, bk,
                register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                sig,
                table_find(n->arguments, sym(e)),
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(v)));

}

static CONTINUATION_8_4(do_insert, block, perf, execf, int, value, value, value, value, heap, perf, operator, value *) ;
static void do_insert(block bk, perf p, execf n, int deltam,
                      value uuid, value e, value a, value v,
                      heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);

    if (op == op_insert) {
        apply(bk->ev->insert, uuid, lookup(r, e), lookup(r, a), lookup(r, v), deltam);
    }

    apply(n, h, p, op, r);
    stop_perf(p, pp);
}

static execf build_insert(block bk, node n)
{
    uuid x = table_find(bk->ev->scopes, table_find(n->arguments, sym(scope)));
    return cont(bk->h, do_insert, bk, register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                1,
                x,
                table_find(n->arguments, sym(e)),
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(v)));

}

static execf build_remove(block bk, node n)
{
    uuid x = table_find(bk->ev->scopes, table_find(n->arguments, sym(scope)));
    return cont(bk->h, do_insert,  bk, register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                -1,
                x,
                table_find(n->arguments, sym(e)),
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(v)));
}


static CONTINUATION_6_5(each_set_remove,
                        block, uuid, value, value, value, boolean *,
                        value, value, value, multiplicity, uuid);
static void each_set_remove(block bk, uuid u, value e, value a, value newv, boolean *existing,
                            value etrash, value atrash, value v, multiplicity m, uuid bku)
{
    prf("set remove %v %v %v %v %d\n", e, a, v, newv, m);
     if (m > 0) {
        if (value_equals(newv, v)) {
            *existing = true;
        } else {
            apply(bk->ev->insert, u, e, a, v, -1);
        }
    }
}

// kill me, i dont exist
static CONTINUATION_7_4(do_set, block, perf, execf, value, value, value, value, heap, perf, operator, value *) ;
static void do_set(block bk, perf p, execf n, value u, value e, value a, value v,
                   heap h, perf pp, operator op, value *r)
{
    start_perf(p, op);
    u = lookup(r, u);
    value ev = lookup(r, e);
    value av=  lookup(r, a);
    value vv=  lookup(r, v);

    boolean existing = false;
    apply(bk->ev->reader, s_EAv,
          cont(h, each_set_remove, bk, u, ev, av, vv, &existing),
          ev, av, 0);

    apply(bk->ev->insert, u, ev, av, vv, 1);

    apply(n, h, p, op, r);
    stop_perf(p, pp);
}

static execf build_set(block bk, node n)
{
    uuid x = table_find(bk->ev->scopes, table_find(n->arguments, sym(scope)));
    return cont(bk->h, do_set,  bk, register_perf(bk->ev, n),
                resolve_cfg(bk, n, 0),
                x,
                table_find(n->arguments, sym(e)),
                table_find(n->arguments, sym(a)),
                table_find(n->arguments, sym(v)));
}

extern void register_edb_builders(table builders)
{
    table_set(builders, intern_cstring("insert"), build_insert);
    table_set(builders, intern_cstring("remove"), build_remove);
    table_set(builders, intern_cstring("set"), build_set);
    table_set(builders, intern_cstring("scan"), build_scan);
}
