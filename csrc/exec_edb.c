#include <runtime.h>
#include <exec.h>


static CONTINUATION_6_4(scan_listener,
                        execf, operator, value *,
                        value, value, value,
                        value, value, value, multiplicity);
static void scan_listener(execf n,  operator op, value *r,
                          value er, value ar, value vr,
                          value e, value a, value v, multiplicity count)
{
    store(r, er, e);
    store(r, ar, a);
    store(r, vr, v);
    apply(n, op, r);
}

#define sigbit(__sig, __p, __r) ((sig&(1<<__p))? register_ignore: __r)

static CONTINUATION_7_2(do_scan, evaluation, int *, execf, int, value, value, value, operator, value *);
static void do_scan(evaluation ex, int *count, execf n, int sig, value e, value a, value v, operator op, value *r)
{
    if (op == op_flush) {
        apply(n, op, r);
        return;
    }
    *count = *count + 1;
    
    apply(ex->reader, sig,
          cont(ex->h, scan_listener, n, op, r,
               sigbit(sig, 2, e), sigbit(sig, 1, a), sigbit(sig, 0, v)),
          lookup(e, r), lookup(a, r), lookup(v, r));
}

static inline boolean is_cap(unsigned char x) {return (x >= 'A') && (x <= 'Z');}

static execf build_scan(evaluation ex, node n)
{
    vector ar = vector_get(n->arguments, 0);
    estring description = vector_get(ar, 0);
    int sig = 0;
    for (int i=0; i< 3; i++) {
        sig <<= 1;
        sig |= is_cap(description->body[i]);
    }
    return cont(ex->h, do_scan, ex,
                register_counter(ex, n),
                resolve_cfg(ex, n, 0),
                sig,
                vector_get(ar, 1),
                vector_get(ar, 2),
                vector_get(ar, 3));

}

static CONTINUATION_8_2(do_insert, evaluation, int *, execf, int, value, value, value, value, operator, value *) ;
static void do_insert(evaluation ex, int *count, execf n, int deltam,
                      value uuid, value e, value a, value v, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count + 1;
        apply(ex->insert, uuid, lookup(e, r), lookup(a, r), lookup(v, r), 1);
    }
    if (op == op_remove) {
        apply(ex->insert, uuid, lookup(e, r), lookup(a, r), lookup(v, r), -1);
    }
    apply(n, op, r);
}

static execf build_insert(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    uuid x = table_find(e->scopes, vector_get(a, 0));
        
    return cont(e->h, do_insert,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                1,
                x,
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}

static execf build_remove(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    uuid x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_insert,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                -1,
                x,
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}

static CONTINUATION_4_4(each_set_remove, evaluation, value, value, uuid, value, value, value, multiplicity);
static void each_set_remove(evaluation ex, uuid u, value e, value a, value etrash, value atrash, value v, multiplicity m)
{
    apply(ex->insert, u, e, a, v, -1);
}

static CONTINUATION_7_2(do_set, evaluation, int *, execf, value, value, value, value, operator, value *) ;
static void do_set(evaluation ex, int *count, execf n, value u, value e, value a, value v, operator op, value *r)
{
    u = lookup(r, u);
    *count = *count + 1;
    value ev = lookup(e, r);
    value av=  lookup(a, r);
    apply(ex->reader, s_EAv, cont(ex->h, each_set_remove, ex, u, ev, av), ev, av, 0);
    apply(ex->insert, u, e, a, v, 1);
    apply(n, op, r);
}

static execf build_set(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    uuid x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_set,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                x,
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}


static CONTINUATION_4_2(do_genid, evaluation, int *, execf, value,  operator, value *);
static void do_genid(evaluation ex, int *count, execf n, value dest, operator op, value *r)
{
    if (op != op_flush) {
        *count = *count+1;
        value v = generate_uuid();
        r[reg(dest)] = v;
    }
    apply(n, op, r);
}


static execf build_genid(evaluation e, node n)
{
    return cont(e->h, do_genid,
                e,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0));
}

extern void register_edb_builders(table builders)
{
    table_set(builders, intern_cstring("insert"), build_insert);
    table_set(builders, intern_cstring("remove"), build_remove);
    table_set(builders, intern_cstring("set"), build_set);
    table_set(builders, intern_cstring("scan"), build_scan);
    table_set(builders, intern_cstring("generate"), build_genid);
}


