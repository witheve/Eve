#include <runtime.h>
#include <exec.h>

// break this out...also copy r now that its well-formed how to do that
static CONTINUATION_6_4(scan_listener_3, execf, operator, value *, int, int, int,
                        value, value, value, eboolean);
static void scan_listener_3(execf n,  operator op, value *r, int a, int b, int c,
                            value av, value bv, value cv, eboolean present)
{
    r[a] = av;
    r[b] = bv;
    r[c] = cv;
    apply(n, 0, r);
}

static CONTINUATION_5_3(scan_listener_2, execf, operator, value *, int, int, value, value, eboolean);
static void scan_listener_2(execf n, operator op, value *r, int a, int b,
                            value av, value bv, eboolean present)
{
    r[a] = av;
    r[b] = bv;
    apply(n, 0, r);
}

static CONTINUATION_4_2(scan_listener_1, execf, operator, value *, int, value, eboolean);
static void scan_listener_1(execf n, operator op, value *r, int a, value av, eboolean present)
{
    r[a] = av;
    apply(n, op, r);
}

static CONTINUATION_3_1(scan_listener_0, execf, operator, value *, eboolean);
static void scan_listener_0(execf n, operator op, value *r, eboolean present)
{
    apply(n, op, r);
}


static CONTINUATION_7_2(do_scan, evaluation, int *, execf, int, value, value, value, operator, value *);
static void do_scan(evaluation ex, int *count, execf n, int sig, value e, value a, value v, operator op, value *r)
{
    if (op == op_flush) {
        apply(n, op, r);
        return;
    }

    void *listen;

    *count = *count + 1;
    // generify this too
    switch(sig) {
    case s_eav:
        listen = cont(ex->h, scan_listener_3, n, op, r, reg(e), reg(a), reg(v));
        break;
    case s_eAv:
        listen = cont(ex->h, scan_listener_2, n, op, r, reg(e), reg(v));
        break;
    case s_eAV:
        listen = cont(ex->h, scan_listener_1, n, op, r, reg(e));
        break;
    case s_Eav:
        listen = cont(ex->h, scan_listener_2, n, op, r, reg(a), reg(v));
        break;
    case s_EAv:
        listen = cont(ex->h, scan_listener_1, n, op, r, reg(v));
        break;
    case s_EAV:
        listen = cont(ex->h, scan_listener_0, n, op, r);
        break;
    default:
        exec_error(ex, "unknown scan");
    }

    apply(ex->s, sig, listen, lookup(e, r), lookup(a, r), lookup(v, r));
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

static CONTINUATION_7_2(do_insert, evaluation, int *, execf, value, value, value, value, operator, value *) ;
static void do_insert(evaluation ex, int *count, execf n, value uuid, value e, value a, value v, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count + 1;
        apply(ex->insert, uuid, lookup(e, r), lookup(a, r), lookup(v, r));
    }
    if (op == op_remove) {
        apply(ex->remove, uuid, lookup(e, r), lookup(a, r), lookup(v, r));
    }
    apply(n, op, r);
}

static execf build_insert(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    uuid x = table_find(e->scopes, vector_get(a, 0));
        
    return cont(e->h, do_insert,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                x,
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}

static CONTINUATION_7_2(do_remove, evaluation, int *, execf, value, value, value, value, operator, value *) ;
static void do_remove(evaluation ex, int *count, execf n, value uuid, value e, value a, value v, operator op, value *r)
{
    *count = *count + 1;
    apply(ex->remove, uuid, lookup(e, r), lookup(a, r), lookup(v, r));
    apply(n, op, r);
}

static execf build_remove(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    uuid x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_remove,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                x,
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}

static CONTINUATION_7_2(do_set, evaluation, int *, execf, value, value, value, value, operator, value *) ;
static void do_set(evaluation ex, int *count, execf n, value uuid, value e, value a, value v, operator op, value *r)
{
    *count = *count + 1;
    apply(ex->set, uuid, lookup(e, r), lookup(a, r), lookup(v, r));
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


