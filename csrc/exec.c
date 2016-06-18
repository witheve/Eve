#include <runtime.h>
#include <unistd.h>

static void exec_error(evaluation e, char *format, ...)
{
    prf ("error %s\n", format);
}

static inline execf resolve_cfg(evaluation e, node n, int index)
{
    return (*(execf *)table_find(e->nmap, vector_get(n->arms, index)));
}

static int toreg(value k)
{
    return((unsigned long) k - register_base);
}

static inline value lookup(value k, value *r)
{
    if (type_of(k) == register_space)  {
        // good look keeping your sanity if this is a non-register value in this space
        return(r[toreg(k)]);
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
    r[a] = av;
    apply(n, op, r);
}

static CONTINUATION_3_1(scan_listener_0, execf, operator, value *, eboolean);
static void scan_listener_0(execf n, operator op, value *r, eboolean present)
{
    apply(n, op, r);
}


// should try to throw an error here for writing into a non-reg
static inline int reg(value n)
{
    return ((unsigned long) n - register_base);
}

static CONTINUATION_6_2(do_scan, evaluation, execf, int, value, value, value, operator, value *);
static void do_scan(evaluation ex, execf n, int sig, value e, value a, value v, operator op, value *r)
{
    if (op == op_flush) {
        apply(n, op, r);
        return;
    }

    void *listen;
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
                resolve_cfg(ex, n, 0), sig,
                vector_get(ar, 1),
                vector_get(ar, 2),
                vector_get(ar, 3));
                
}

static CONTINUATION_6_2(do_insert, evaluation, execf, value, value, value, value, operator, value *) ;
static void do_insert(evaluation ex, execf n, value uuid, value e, value a, value v, operator op, value *r)
{
    apply(ex->insert, uuid, lookup(e, r), lookup(a, r), lookup(v, r));
    apply(n, op, r);
}

static execf build_insert(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    bag x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_insert,  e,
                resolve_cfg(e, n, 0),
                edb_uuid(x),
                vector_get(a, 1),
                vector_get(a, 2),
                vector_get(a, 3));
}


#define DO_BINARY_NUMERIC(__name, __op)                                                              \
    static void __name (evaluation ex, execf n, value dest, value a, value b, operator op, value *r) \
    {                                                                                                \
        if (op == op_insert) {\
             value ar = lookup( a, r);                                       \
             value br = lookup( b, r);                                       \
             if ((type_of(ar) != float_space ) || (type_of(br) != float_space)) { \
                 exec_error(ex, "attempt to add non-numbers", a, b);         \
             } else {                                                        \
                 r[reg(dest)] = box_float(*(double *)ar __op *(double *)br); \
                 apply(n, op, r);                                            \
             }                                                               \
        } else apply(n, op, r);                                             \
    }

#define BUILD_BINARY_NUMERIC(__name, __do_op)   \
    static execf __name (evaluation e, node n)  \
    {                                           \
        vector a = vector_get(n->arguments, 0); \
        return cont(e->h,                       \
                    __do_op,                    \
                    e,                          \
                    resolve_cfg(e, n, 0),       \
                    vector_get(a, 0),           \
                    vector_get(a, 1),           \
                    vector_get(a, 2));          \
    }


static CONTINUATION_5_2(do_plus, evaluation, execf, value, value, value,  operator, value *);
DO_BINARY_NUMERIC(do_plus, +)
BUILD_BINARY_NUMERIC(build_plus, do_plus)

static CONTINUATION_5_2(do_minus, evaluation, execf, value, value, value,  operator, value *);
DO_BINARY_NUMERIC(do_minus, -)
BUILD_BINARY_NUMERIC(build_minus, do_minus)

static CONTINUATION_5_2(do_multiply, evaluation, execf, value, value, value,  operator, value *);
DO_BINARY_NUMERIC(do_multiply, *)
BUILD_BINARY_NUMERIC(build_multiply, do_multiply)

static CONTINUATION_5_2(do_divide, evaluation, execf, value, value, value,  operator, value *);
DO_BINARY_NUMERIC(do_divide, /)
BUILD_BINARY_NUMERIC(build_divide, do_divide)


static inline void extract(vector dest, vector keys, value *r)
{
    for (int i = 0; i< vector_length(keys); i ++) {
        vector_set(dest, i, lookup(vector_get(keys, i), r));
    }
}

static inline void copyout(value *dest, vector keys, vector source)
{
    for (int i = 0; i< vector_length(keys); i ++)
        dest[toreg(vector_get(keys, i))] = vector_get(source, i);
}

static CONTINUATION_2_2(do_sub_tail, value, vector, operator, value *);
static void do_sub_tail(value resreg,
                        vector outputs,
                        operator op, value *r)
{
    table results = lookup(resreg, r);
    vector result = allocate_vector(results->h, vector_length(outputs));
    extract(result, outputs, r);
    table_set(results, result, etrue);
}

                        
static CONTINUATION_7_2(do_sub, execf, execf, table, vector, value, vector, vector, operator, value *);
static void do_sub(execf next, execf leg, table results,
                   vector v, value resreg, vector inputs, vector outputs,
                   operator op, value *r)
{
    table res;

    if (op == op_flush) {
        apply(next, op, r);
        return;
    }
    
    extract(v, inputs, r);
    if (!(res = table_find(results, v))){ 
        res = create_value_vector_table(results->h);
        vector key = allocate_vector(results->h, vector_length(inputs));
        table_set(results, v, res);
        r[toreg(resreg)] = res;
        apply(leg, op, r);
    }
    table_foreach(res, n, _) {
        copyout(r, outputs, n);
        apply(next, op, r);
    }
}

static execf build_sub(evaluation e, node n, void **dest)
{
    table results = create_value_vector_table(e->h);
    // gonna share this one today
    vector v = allocate_vector(e->h, vector_length(n->arguments));
    return cont(e->h,
                do_sub,
                resolve_cfg(e, n, 0), 
                resolve_cfg(e, n, 1), 
                results,
                v,
                0, // results
                vector_get(n->arguments, 0),
                vector_get(n->arguments, 1));
}



static CONTINUATION_2_2(do_choose_tail, execf, value, operator, value *);
static void do_choose_tail(execf next, value flag, operator op, value *r)
{
    r[toreg(flag)] = etrue;
    apply(next, op, r);
}

static execf build_choose_tail(evaluation e, node n)
{
    table results = create_value_vector_table(e->h);
    // gonna share this one today
    vector v = allocate_vector(e->h, vector_length(n->arguments));
    return cont(e->h,
                do_choose_tail,
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_3_2(do_choose, execf, vector, value, operator, value *);
static void do_choose(execf next, vector legs, value flag, operator op, value *r)
{
    r[toreg(flag)] = efalse;
    vector_foreach (legs, i){
        apply((execf) i, op, r);
        if (r[toreg(flag)] == etrue) return;
    }
}


static execf build_choose(evaluation e, node n)
{
    int arms = vector_length(n->arms);
    vector v = allocate_vector(e->h, arms);
    for (int i = 0 ; i < arms; i++ )
        vector_set(v, i, resolve_cfg(e, n, i));
    
    return cont(e->h,
                do_choose,
                resolve_cfg(e, n, 0),
                v,
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_2_2(do_genid, execf, value,  operator, value *);
static void do_genid(execf n, value dest, operator op, value *r)
{
    value v = generate_uuid();
    r[reg(dest)] = v;
    apply(n, op, r);
}


static execf build_genid(evaluation e, node n)
{
    return cont(e->h, do_genid,
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_3_2(do_join, execf, int, u32, operator, value *);
static void do_join(execf n, int count, u32 total, operator op, value *r)
{
    apply(n, op, r);
}

static execf build_join(evaluation e, node n)
{
    u32 c = allocate(e->h, sizeof(iu32));
    return cont(e->h, do_join,resolve_cfg(e, n, 0), 0, c);
}

static CONTINUATION_0_2(do_terminal, operator, value *);
static void do_terminal(operator op, value *r)
{
}

static execf build_terminal(evaluation e, node n)
{
    return cont(e->h, do_terminal);
}

static CONTINUATION_2_2(do_fork, int, execf *, operator, value *) ;
static void do_fork(int count, execf *b, operator op, value *r)
{
    for (int i =0; i<count ;i ++) apply(b[i], op, r);
}

static execf build_fork(evaluation e, node n)
{
    int count = vector_length(n->arms);
    execf *a = allocate(e->h, sizeof(execf) * count);

    for (int i=0; i < count; i++)
        a[i] = resolve_cfg(e, n, i);
    return cont(e->h, do_fork, count, a);
}

static CONTINUATION_2_2(do_trace, execf, vector, operator, value *);
static void do_trace(execf n, vector terms, operator op, value *r)
{
    prf ("trace");
    for (int i=0; i<vector_length(terms); i+=2) {
        prf(" %v %v", lookup(vector_get(terms, i), r), lookup(vector_get(terms, i+1), r));
    }
    write(1, "\n", 1);
    apply(n, op, r);
}

static execf build_trace(evaluation ex, node n, execf *arms)
{
    return cont(ex->h,
                do_trace,
                resolve_cfg(ex, n, 0),
                vector_ref(n->arguments, 0));
}

void close_evaluation(evaluation ex)
{
    // close
    apply(ex->head, 1, 0);
    ex->h->destroy(ex->h);
}

static table builders;

table builders_table()
{
    if (!builders) {
        builders = allocate_table(init, key_from_pointer, compare_pointer);
        table_set(builders, intern_cstring("plus"), build_plus);
        table_set(builders, intern_cstring("minus"), build_minus);
        table_set(builders, intern_cstring("multiply"), build_multiply);
        table_set(builders, intern_cstring("divide"), build_divide);
        table_set(builders, intern_cstring("insert"), build_insert);
        table_set(builders, intern_cstring("scan"), build_scan);
        table_set(builders, intern_cstring("generate"), build_genid);
        table_set(builders, intern_cstring("fork"), build_fork);
        table_set(builders, intern_cstring("trace"), build_trace);
        table_set(builders, intern_cstring("sub"), build_sub);
        table_set(builders, intern_cstring("terminal"), build_terminal);
        table_set(builders, intern_cstring("choose"), build_choose);
    }
    return builders;
}

static void force_node(evaluation e, node n)
{
    if (!table_find(e->nmap, n)){
        void **x = allocate(e->h, 2*sizeof(void *));
        table_set(e->nmap, n, x);
        vector_foreach(n->arms, i) force_node(e, i);
        n->builder(e, n, x);
    }
}

void execute(evaluation e)
{
    value *r = allocate(init, sizeof(value) * e->registerfile);
    apply(e->head, op_insert, r);
    apply(e->head, op_flush, r);
}

evaluation build(node n, table scopes, scan s, insertron insert, thunk terminal)
{
    heap h = allocate_rolling(pages);
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->registerfile = 30;
    e->h =h;
    e->scopes = scopes;
    e->s = s;
    e->registerfile = 50;
    e->insert = insert;
    e->terminal = terminal;
    e->nmap = allocate_table(e->h, key_from_pointer, compare_pointer);
    force_node(e, n);
    e->head = *(execf *)table_find(e->nmap, n);
    return e;
}
