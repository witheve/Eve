#include <runtime.h>
#include <unistd.h>

static void exec_error(evaluation e, char *format, ...)
{
    prf ("error %s\n", format);
}

static inline value lookup(value k, value *r)
{
    if (type_of(k) == register_space)  {
        // good look keeping your sanity if this is a non-register value in this space
        return(r[(unsigned long)k-register_base]);
    }
    return k;
}

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
    // synchronous
    r[a] = av;
    apply(n, op, r);
}

static CONTINUATION_3_1(scan_listener_0, execf, value *, operator, eboolean);
static void scan_listener_0(execf n, value *r, operator op, eboolean present)
{
    apply(n, op, r);
}


// should try to throw an error here for writing into a non-reg
static inline int reg(value n)
{
    return ((unsigned long) n - register_base);
}

static CONTINUATION_5_2(do_full_scan, evaluation, execf, value, value, value, operator, value *);
static void do_full_scan(evaluation ex, execf n, value e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_3, n, op, r, reg(e), reg(a), reg(v));
    full_scan(ex->b, listen);
}

static CONTINUATION_5_2(do_ea_scan, evaluation, execf, value, value, value, operator, value *);
static void do_ea_scan(evaluation ex, execf n, value e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_1, n, op, r, reg(v));
    ea_scan(ex->b, lookup(e, r), lookup(a, r), listen);
}

static CONTINUATION_5_2(do_e_scan, evaluation, execf, value, value, value, operator, value *);
static void do_e_scan(evaluation ex, execf n, value e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h,scan_listener_2, n, op, r, reg(a), reg(v));
    e_scan(ex->b, lookup(e, r), listen);
}

static CONTINUATION_5_2(do_av_scan, evaluation, execf, value, value, value, operator, value *);
static void do_av_scan(evaluation ex, execf n, value e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_1, n, op, r, reg(e));
    av_scan(ex->b, lookup(a, r), lookup(v, r), listen);
}

static CONTINUATION_5_2(do_eav_scan, evaluation, execf, value, value, value, operator, value *);
static void do_eav_scan(evaluation ex, execf n, value e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_0, n, r, op);
    eav_scan(ex->b, lookup(e, r), lookup(a,r), lookup(v,r), listen);
}

static inline boolean match(char *x, char *key)
{
    return (x[0] == key[0]) && (x[1] == key[1]) && (x[2] == key[2]);
}

static execf build_scan(evaluation ex, node n)
{
    execf next = vector_get(n->arms, 0);
    char *description =  vector_get(n->arguments, 0);
    execf r = 0;
    value e = vector_get(n->arguments, 1);
    value a = vector_get(n->arguments, 2);
    value v = vector_get(n->arguments, 3);

    // can pass vec here
    if (match(description, "eav")) 
        r =cont(ex->h, do_full_scan, ex, next, e, a, v);
    
    if (match(description, "EAv"))
        r =cont(ex->h, do_ea_scan, ex, next, e, a, v);
    
    if (match(description, "Eav")) 
        r =cont(ex->h, do_e_scan, ex, next, e, a, v);

    
    if (match(description, "eAV"))
        r =cont(ex->h, do_av_scan, ex, next, e, a, v);

    
    if (match(description,"EAV")) 
        r =cont(ex->h, do_eav_scan, ex, next, e, a, v);

    if (!r) {
        prf ("couldn't find scan for %v\n", description);
    }
    return r;
}

static CONTINUATION_6_2(do_insert, evaluation, execf, value, value, value, value, operator, value *) ;
static void do_insert(evaluation ex, execf n, uuid u, value e, value a, value v, operator op, value *r) 
{
    multibag_insert(ex->mb, u, lookup(e, r), lookup(a, r), lookup(v, r));
    apply(n, op, r);
}

static execf build_insert(evaluation e, node n)
{
    return cont(e->h, do_insert,  e,
                vector_get(n->arms, 0),
                vector_get(n->arguments, 0),
                vector_get(n->arguments, 1),
                vector_get(n->arguments, 2),
                vector_get(n->arguments, 3));
}


static CONTINUATION_5_2(do_plus, evaluation, execf, value, value, value,  operator, value *);
static void do_plus(evaluation ex, execf n, value dest, value a, value b, operator op, value *r)
{
    value ar = lookup( r, a);
    value br = lookup( r, b);
    if ((type_of(ar) != float_space ) || (type_of(br) != float_space)) {
        exec_error(ex, "attempt to add non-numbers", a, b);
    } else {
        r[reg(dest)] = box_float(*(double *)lookup( r, a) + *(double *)lookup( r, b));
        apply(n, op, r);
    }
}

static execf build_plus(evaluation e, node n)
{
    return cont(e->h,
                do_plus,
                e,
                vector_get(n->arms, 0),
                vector_get(n->arguments, 0),
                vector_get(n->arguments, 1),
                vector_get(n->arguments, 2));
}

    
static CONTINUATION_2_2(do_genid, execf, value,  operator, value *);
static void do_genid(execf n, value dest, operator op, value *r) 
{
    r[reg(dest)] = generate_uuid();
    apply(n, op, r);
}
    
static execf build_genid(evaluation e, node n)
{
    return cont(e->h, do_genid,
                vector_get(n->arms, 0),
                vector_get(n->arguments, 1));
}

static CONTINUATION_2_2(do_fork, execf, execf, operator, value *) ;
static void do_fork(execf a, execf b, operator op, value *r)
{
    apply(a, op, r);
    apply(b, op, r);
}

static execf build_fork(evaluation e, node n)
{
    // should handle all the arms
    return cont(e->h, do_fork,
                vector_get(n->arms, 0),
                vector_get(n->arms, 1));
}

static CONTINUATION_2_2(do_trace, execf, vector, operator, value *);
static void do_trace(execf n, vector terms, operator op, value *r)
{
    // term 1 is 
    string_intermediate si = vector_get(terms, 0);
    write(1, si->body, si->length);
            //    table_foreach(regmap, k, v) {
            //        prf(" %b %v", k, lookup(v, r));
            //    }
    write(1, "\n", 1);
    apply(n, op, r);
}

static execf build_trace(evaluation ex, node n)
{
    table regnames = allocate_table(ex->h, string_hash, string_equal);
    
    return cont(ex->h, 
                do_trace,
                vector_get(n->arms, 0),
                n->arguments);
}



evaluation allocate_evaluation(bag b, table scopes)
{
    heap h = allocate_rolling(pages);
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h =h;
    //    e->scope_map = scopes;
    e->b =b;
    return e;
}

void close_evaluation(evaluation ex)
{
    // close
    apply(ex->head, 1, 0);
    ex->h->destroy();
}


void execute(evaluation e)
{
    ticks start_time = rdtsc();
    value *r = allocate(init, sizeof(value) * e->registerfile);
    memset(r, 0xaa, sizeof(value) * e->registerfile);
    apply(e->head, 0, r);
    ticks end_time = rdtsc();
    prf ("exec in %ld ticks\n", end_time-start_time);
}

