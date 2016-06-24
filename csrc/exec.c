#include <runtime.h>
#include <unistd.h>
#include <math.h>

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

static int *register_counter(evaluation e, node n)
{
    int *c = allocate(e->h, sizeof(int));
    table_set(e->counters, n, c);
    return c;
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
    bag x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_insert,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                edb_uuid(x),
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
    bag x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_remove,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                edb_uuid(x),
                vector_get(n->arguments, 1),
                vector_get(n->arguments, 2),
                vector_get(n->arguments, 3));
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
    bag x = table_find(e->scopes, vector_get(a, 0));
    return cont(e->h, do_set,  e, register_counter(e, n),
                resolve_cfg(e, n, 0),
                edb_uuid(x),
                vector_get(n->arguments, 1),
                vector_get(n->arguments, 2),
                vector_get(n->arguments, 3));
}

static CONTINUATION_5_2(do_equal, evaluation, int *, execf, value, value,  operator, value *); \
static void do_equal(evaluation e, int *count, execf n, value a, value b, operator op, value *r) 
{
    *count = *count + 1;                        
    if (op != op_flush) {
        value ar = lookup(a, r);                    
        value br = lookup(b, r);                
        if (!value_equals(ar, br)) return;
    }
    apply(n, op, r);
}


#define DO_UNARY_NUMERIC(__name, __op)                                                               \
    static CONTINUATION_5_2(__name, evaluation, int *, execf, value, value, operator, value *);      \
    static void __name (evaluation ex, int *count, execf n, value dest, value a, operator op, value *r) \
    {                                                                                                \
        if (op == op_flush)  {                                                                       \
            apply(n, op, r);                                                                         \
            return;                                                                                  \
        }                                                                                            \
        value ar = lookup(a, r);                                                                     \
        *count = *count + 1;                                                                         \
        if ((type_of(ar) != float_space )) {                                                         \
            exec_error(ex, "attempt to do math on non-number", a);                                   \
        } else {                                                                                     \
            r[reg(dest)] = box_float(__op(*(double *)ar));                                           \
            apply(n, op, r);                                                                         \
        }                                                                                            \
    }

#define DO_UNARY_BOOLEAN(__name, __op)                                                               \
    static CONTINUATION_5_2(__name, evaluation, int *, execf, value, value, operator, value *);      \
    static void __name (evaluation ex, int *count, execf n, value dest, value a, operator op, value *r) \
    {                                                                                                \
        if (op == op_flush)  {                                                                       \
            apply(n, op, r);                                                                         \
            return;                                                                                  \
        }                                                                                            \
        value ar = lookup(a, r);                                                                     \
        *count = *count + 1;                                                                         \
        if ((type_of(ar) != float_space )) {                                                         \
            exec_error(ex, "attempt to do math on non-number", a);                                   \
        } else {                                                                                     \
          r[reg(dest)] = __op(*ar == etrue ? true : false) ? etrue : efalse;                         \
            apply(n, op, r);                                                                         \
        }                                                                                            \
    }

#define BUILD_UNARY(__name, __do_op)   \
    static execf __name (evaluation e, node n)  \
    {                                           \
        return cont(e->h,                       \
                __do_op,                        \
                e,                              \
                register_counter(e, n),         \
                resolve_cfg(e, n, 0),           \
                vector_get(n->arguments, 0),    \
                vector_get(n->arguments, 1));   \
    }


#define DO_BINARY_NUMERIC(__name, __op)                                                              \
    static CONTINUATION_6_2(__name, evaluation, int *, execf, value, value, value,  operator, value *);\
    static void __name (evaluation ex, int *count, execf n, value dest, value a, value b, operator op, value *r) \
    {                                                                                                \
        if (op == op_flush)  {                                                                       \
            apply(n, op, r);                                                                         \
            return;                                                                                  \
        }       \
        value ar = lookup(a, r);                                                                     \
        value br = lookup(b, r);                                                                     \
        *count = *count + 1;                                                                         \
        if ((type_of(ar) != float_space ) || (type_of(br) != float_space)) {                         \
            exec_error(ex, "attempt to " #__name" non-numbers", a, b);                               \
            prf("UHOH %v, %v\n", ar, br);                                                            \
        } else {                                                                                     \
            r[reg(dest)] = box_float(*(double *)ar __op *(double *)br);                              \
            apply(n, op, r);                                                                         \
        }                                                                                            \
    }

#define DO_BINARY_BOOLEAN(__name, __op)                                                                \
    static CONTINUATION_6_2(__name, evaluation, int *, execf, value, value, value,  operator, value *);\
    static void __name (evaluation ex, int *count, execf n, value dest, value a, value b, operator op, value *r) \
    {                                                                                                  \
        if (op == op_flush)  {                                                                       \
            apply(n, op, r);                                                                         \
            return;                                                                                  \
        }                                                                                            \
        value ar = lookup(a, r);                                                                       \
        value br = lookup(b, r);                                                                       \
        *count = *count + 1;                                                                           \
        if ((type_of(ar) != float_space ) || (type_of(br) != float_space)) {                           \
            exec_error(ex, "attempt to __op non-numbers", a, b);                                       \
        } else {                                                                                       \
          r[reg(dest)] = (*(double *)ar __op *(double *)br) ? etrue : efalse;                          \
            apply(n, op, r);                                                                           \
        }                                                                                              \
    }


#define BUILD_BINARY(__name, __do_op)   \
    static execf __name (evaluation e, node n)  \
    {                                           \
        vector a = vector_get(n->arguments, 0); \
        return cont(e->h,                       \
                __do_op,                        \
                e,                              \
                register_counter(e, n),         \
                resolve_cfg(e, n, 0),           \
                vector_get(a, 0),    \
                vector_get(a, 1),    \
                vector_get(a, 2));   \
    }


#define DO_BINARY_FILTER(__name, __op)                                                               \
    static CONTINUATION_5_2(__name, evaluation, int *, execf, value, value,  operator, value *);     \
    static void __name (evaluation ex, int *count, execf n, value a, value b, operator op, value *r) \
    {                                                                                                \
        if (op == op_flush)  {                                                                       \
            apply(n, op, r);                                                                         \
        }                                                                                            \
        value ar = lookup(a, r);                                                                     \
        value br = lookup(b, r);                                                                     \
        *count = *count + 1;                                                                         \
        if ((type_of(ar) == float_space ) && (type_of(br) == float_space)) {                         \
            if (*(double *)ar __op *(double *)br)                                                    \
            {                                                                                        \
                apply(n, op, r);                                                                     \
            }                                                                                        \
        }                                                                                            \
        else                                                                                         \
          {                                                                                          \
            exec_error(ex, "@FIXME filter non-numbers", a, b);                                       \
          }                                                                                          \
    }


#define BUILD_BINARY_FILTER(__name, __do_op)   \
    static execf __name (evaluation e, node n)  \
    {                                           \
        vector a = vector_get(n->arguments, 0); \
        return cont(e->h,                       \
                __do_op,                        \
                e,                              \
                register_counter(e, n),         \
                resolve_cfg(e, n, 0),           \
                vector_get(a, 0),    \
                vector_get(a, 1));   \
    }


DO_UNARY_NUMERIC(do_sin, sin)
BUILD_UNARY(build_sin, do_sin)

DO_UNARY_NUMERIC(do_cos, cos)
BUILD_UNARY(build_cos, do_cos)

DO_UNARY_NUMERIC(do_tan, tan)
BUILD_UNARY(build_tan, do_tan)

DO_BINARY_NUMERIC(do_plus, +)
BUILD_BINARY(build_plus, do_plus)

DO_BINARY_NUMERIC(do_minus, -)
BUILD_BINARY(build_minus, do_minus)

DO_BINARY_NUMERIC(do_multiply, *)
BUILD_BINARY(build_multiply, do_multiply)

DO_BINARY_NUMERIC(do_divide, /)
BUILD_BINARY(build_divide, do_divide)

DO_BINARY_FILTER(do_less_than, <)
BUILD_BINARY_FILTER(build_less_than, do_less_than)
DO_BINARY_BOOLEAN(do_is_less_than, <)
BUILD_BINARY(build_is_less_than, do_is_less_than)

DO_BINARY_FILTER(do_less_than_or_equal, <=)
BUILD_BINARY_FILTER(build_less_than_or_equal, do_less_than_or_equal)
DO_BINARY_BOOLEAN(do_is_less_than_or_equal, <=)
BUILD_BINARY(build_is_less_than_or_equal, do_is_less_than_or_equal)

DO_BINARY_FILTER(do_greater_than, >)
BUILD_BINARY_FILTER(build_greater_than, do_greater_than)
DO_BINARY_BOOLEAN(do_is_greater_than, >)
BUILD_BINARY(build_is_greater_than, do_is_greater_than)

DO_BINARY_FILTER(do_greater_than_or_equal, >=)
BUILD_BINARY_FILTER(build_greater_than_or_equal, do_greater_than_or_equal)
DO_BINARY_BOOLEAN(do_is_greater_than_or_equal, >=)
BUILD_BINARY(build_is_greater_than_or_equal, do_is_greater_than_or_equal)

// @TODO: make assign do its job instead of just filtering
//DO_BINARY_FILTER(do_equal, ==)
BUILD_BINARY_FILTER(build_equal, do_equal)
DO_BINARY_BOOLEAN(do_is_equal, ==)
BUILD_BINARY(build_is_equal, do_is_equal)

DO_BINARY_FILTER(do_not_equal, !=)
BUILD_BINARY_FILTER(build_not_equal, do_not_equal)
DO_BINARY_BOOLEAN(do_is_not_equal, !=)
BUILD_BINARY(build_is_not_equal, do_is_not_equal)

static CONTINUATION_5_2(do_is, evaluation, int *, execf, value, value, operator, value *);
static void do_is (evaluation ex, int *count, execf n, value dest, value a, operator op, value *r)
{
  *count = *count + 1;
  r[reg(dest)] = lookup(a, r);
  apply(n, op, r);
}

BUILD_UNARY(build_is, do_is)


static inline void extract(vector dest, vector keys, value *r)
{
    for (int i = 0; i< vector_length(keys); i ++) {
        vector_set(dest, i, lookup(vector_get(keys, i), r));
    }
}

static inline void copyout(value *dest, vector keys, vector source)
{
    for (int i = 0; i< vector_length(keys); i ++) {
        dest[toreg(vector_get(keys, i))] = vector_get(source, i);
    }
}

static CONTINUATION_3_2(do_sub_tail, int *, value, vector, operator, value *);
static void do_sub_tail(int *count,
                        value resreg,
                        vector outputs,
                        operator op, value *r)
{
    // just drop flush and remove on the floor
    if ( op == op_insert) {
        *count = *count + 1;
        table results = lookup(resreg, r);
        vector result = allocate_vector(results->h, vector_length(outputs));
        extract(result, outputs, r);
        table_set(results, result, etrue);
    }
}

static execf build_sub_tail(evaluation e, node n)
{
    value resreg = vector_get(vector_get(n->arguments, 1), 0);
    return cont(e->h,
                do_sub_tail,
                register_counter(e, n),
                resreg,
                vector_get(n->arguments, 0));
}

static CONTINUATION_9_2(do_sub,
                        int *, execf, execf, value, table *, table *, vector, vector, vector,
                        operator, value *);
static void do_sub(int *count, execf next, execf leg, value resreg,
                   table *previous, table *results, vector v, vector inputs, vector outputs,
                   operator op, value *r)
{
    heap h = (*results)->h;
    if (op == op_flush) {
        if (*previous) {
            table_foreach(*previous, k, v) {
                table_foreach((table)v, n, _) {
                    copyout(r, outputs, n);
                    apply(next, op_remove, r);
                }
            }
        }
        // we could conceivably double buffer these
        *previous = *results;
        *results = create_value_vector_table(h);
        apply(next, op, r);
        return;
    }

    table res;
    *count = *count + 1;
    extract(v, inputs, r);
    if (!(res = table_find(*results, v))){
        res = create_value_vector_table(h);
        vector key = allocate_vector(h, vector_length(inputs));
        if (*previous) 
            table_set(*previous, v, NULL);
        extract(key, inputs, r);
        table_set(*results, key, res);
        r[toreg(resreg)] = res;
        apply(leg, op, r);
    }
    table_foreach(res, n, _) {
        copyout(r, outputs, n);
        apply(next, op, r);
    }
}


static execf build_sub(evaluation e, node n)
{
    table results = create_value_vector_table(e->h);
    table *rp = allocate(e->h, sizeof(table));
    table *pp = allocate(e->h, sizeof(table));
    vector v = allocate_vector(e->h, vector_length(n->arguments));
    *rp = results;
    return cont(e->h,
                do_sub,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                resolve_cfg(e, n, 1),
                vector_get(vector_get(n->arguments, 2), 0),
                pp,
                rp,
                v,
                vector_get(n->arguments, 0),
                vector_get(n->arguments, 1));
}


static CONTINUATION_3_2(do_choose_tail, int *, execf, value, operator, value *);
static void do_choose_tail(int * count, execf next, value flag, operator op, value *r)
{
    *count = *count + 1;
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
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_3_2(do_choose, int *, vector, value, operator, value *);
static void do_choose(int *count, vector legs, value flag, operator op, value *r)
{
    *count = *count + 1;
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
                register_counter(e, n),
                v,
                vector_get(vector_get(n->arguments, 0), 0));
}


static CONTINUATION_4_2(do_not, int *, execf, execf, value, operator, value *);
static void do_not(int *count, execf leg, execf next, value flag, operator op, value *r)
{
    *count = *count + 1;
    r[toreg(flag)] = efalse;
    apply(leg, op, r);
    if (lookup(flag, r) == efalse)
        apply(next, op, r);
}


static execf build_not(evaluation e, node n)
{
    return cont(e->h,
                do_not,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                resolve_cfg(e, n, 1),
                vector_get(vector_get(n->arguments, 0), 0));
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


static CONTINUATION_4_2(do_move, int *, execf, value,  value, operator, value *);
static void do_move(int *count, execf n, value dest, value src, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count+1;
        r[reg(dest)] = lookup(src, r);
    }
    apply(n, op, r);
}


static execf build_move(evaluation e, node n)
{
    vector a = vector_get(n->arguments, 0);
    return cont(e->h, do_move,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                vector_get(a, 0),
                vector_get(a, 1));
}

static CONTINUATION_4_2(do_concat, int *, execf, value, vector,  operator, value *);
static void do_concat(int *count, execf n, value dest, vector terms, operator op, value *r)
{
    buffer b = allocate_string(init);
    *count = *count+1;

    vector_foreach(terms, i) {
        bprintf(b, "%v", lookup(i, r));
    }

    r[reg(dest)] = intern_string(bref(b, 0), buffer_length(b));
    apply(n, op, r);
}


static execf build_concat(evaluation e, node n)
{
    return cont(e->h, do_concat,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0),
                (vector)vector_get(n->arguments, 1));
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

static CONTINUATION_3_2(do_fork, int *, int, execf *, operator, value *) ;
static void do_fork(int *count, int legs, execf *b, operator op, value *r)
{
    if (op != op_flush) *count = *count+1;
    for (int i =0; i<legs ;i ++) apply(b[i], op, r);
}

static execf build_fork(evaluation e, node n)
{
    int count = vector_length(n->arms);
    execf *a = allocate(e->h, sizeof(execf) * count);

    for (int i=0; i < count; i++)
        a[i] = resolve_cfg(e, n, i);
    return cont(e->h, do_fork, register_counter(e, n), count, a);
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
                vector_get(n->arguments, 0));
}


static CONTINUATION_4_2(do_regfile, heap, execf, int*, int, operator, value *);
static void do_regfile(heap h, execf n, int *count, int size, operator op, value *ignore)
{
    value *r;
    if (op == op_insert) {
        *count = *count +1;
        prf("regfile: %d\n", size);
        r = allocate(h, size * sizeof(value));
    }
    apply(n, op, r);
}

static execf build_regfile(evaluation e, node n, execf *arms)
{
    return cont(e->h,
                do_regfile,
                e->h,
                resolve_cfg(e, n, 0),
                register_counter(e, n),
                (int)*(double *)vector_get(vector_get(n->arguments, 0), 0));
}


void close_evaluation(evaluation ex)
{
    // close
    apply(ex->head, 1, 0);
    destroy(ex->h);
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
        table_set(builders, intern_cstring("remove"), build_remove);
        table_set(builders, intern_cstring("set"), build_set);
        table_set(builders, intern_cstring("less_than"), build_less_than);
        table_set(builders, intern_cstring("less_than_or_equal"), build_less_than_or_equal);
        table_set(builders, intern_cstring("greater_than"), build_greater_than);
        table_set(builders, intern_cstring("greater_than_or_equal"), build_greater_than_or_equal);
        table_set(builders, intern_cstring("equal"), build_equal);
        table_set(builders, intern_cstring("not_equal"), build_not_equal);
        table_set(builders, intern_cstring("is"), build_is);
        table_set(builders, intern_cstring("is_less_than"), build_is_less_than);
        table_set(builders, intern_cstring("is_less_than_or_equal"), build_is_less_than_or_equal);
        table_set(builders, intern_cstring("is_greater_than"), build_is_greater_than);
        table_set(builders, intern_cstring("is_greater_than_or_equal"), build_is_greater_than_or_equal);
        table_set(builders, intern_cstring("is_equal"), build_is_equal);
        table_set(builders, intern_cstring("is_not_equal"), build_is_not_equal);
        table_set(builders, intern_cstring("sin"), build_sin);
        table_set(builders, intern_cstring("cos"), build_cos);
        table_set(builders, intern_cstring("tan"), build_tan);
        table_set(builders, intern_cstring("scan"), build_scan);
        table_set(builders, intern_cstring("generate"), build_genid);
        table_set(builders, intern_cstring("fork"), build_fork);
        table_set(builders, intern_cstring("trace"), build_trace);
        table_set(builders, intern_cstring("sub"), build_sub);
        table_set(builders, intern_cstring("subtail"), build_sub_tail);
        table_set(builders, intern_cstring("terminal"), build_terminal);
        table_set(builders, intern_cstring("choose"), build_choose);
        table_set(builders, intern_cstring("choosetail"), build_choose_tail);
        table_set(builders, intern_cstring("concat"), build_concat);
        table_set(builders, intern_cstring("move"), build_move);
        table_set(builders, intern_cstring("regfile"), build_regfile);
        table_set(builders, intern_cstring("not"), build_not);
    }
    return builders;
}

static void force_node(evaluation e, node n)
{
    if (!table_find(e->nmap, n)){
        execf *x = allocate(e->h, sizeof(execf *));
        table_set(e->nmap, n, x);
        vector_foreach(n->arms, i) force_node(e, i);
        *x = n->builder(e, n);
    }
}

void execute(evaluation e)
{
    apply(e->head, op_insert, 0);
    apply(e->head, op_flush, 0);
}

evaluation build(node n, table scopes, scan s, insertron insert, insertron remove, insertron set, table counts, thunk terminal)
{
    heap h = allocate_rolling(pages);
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h =h;
    e->scopes = scopes;
    e->counters = counts;
    e->s = s;
    e->insert = insert;
    e->remove = remove;
    e->set = set;
    e->terminal = terminal;
    e->nmap = allocate_table(e->h, key_from_pointer, compare_pointer);
    force_node(e, n);
    e->head = *(execf *)table_find(e->nmap, n);
    return e;
}
