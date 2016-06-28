#include <runtime.h>
#include <exec.h>

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
    vector key;
    if (!(res = table_find(*results, v))){
        if (*previous && (res = table_find_key(*previous, v, (void **)&key))) {
            table_set(*previous, key, 0);
        } else {
            res = create_value_vector_table(h);
            key = allocate_vector(h, vector_length(inputs));
            extract(key, inputs, r);
            r[toreg(resreg)] = res;
            apply(leg, op, r);
        }
        table_set(*results, key, res);
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



static CONTINUATION_4_2(do_move, int *, execf, value,  value, operator, value *);
static void do_move(int *count, execf n, value dest, value src, operator op, value *r)
{
    if (op == op_insert) {
        *count = *count+1;
        r[toreg(dest)] = lookup(src, r);
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

// trace node slated for death
#include <unistd.h>
static CONTINUATION_2_2(do_trace, execf, vector, operator, value *);
static void do_trace(execf n, vector terms, operator op, value *r)
{
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


// does this need to come in as an event?
static CONTINUATION_4_0(handle_time, execf, value, operator, value *);
static void handle_time(execf n, value dest, operator op, value *r)
{
    unsigned int hours;
    unsigned int minutes;
    unsigned int seconds;
    clocktime(&hours, &minutes, &seconds);
    r[toreg(dest)] = box_float((double)seconds);
    apply(n, op, r);
}

// remove removes the registration?...and its consequences?

static CONTINUATION_4_2(do_time, heap, int *, execf, value, operator, value *);
static void do_time(heap h, int *count , execf n, value dest, operator op, value *r)
{
    // shutdown...shutdown
    register_periodic_timer(seconds(1), cont(h, handle_time, n, dest, op, r));
}

// xxx  - handle the bound case
static execf build_time(evaluation e, node n, execf *arms)
{
    return cont(e->h,
                do_time,
                e->h,
                register_counter(e, n),
                resolve_cfg(e, n, 0),
                vector_get(vector_get(n->arguments, 0), 0));
}

static CONTINUATION_4_2(do_regfile, heap, execf, int*, int, operator, value *);
static void do_regfile(heap h, execf n, int *count, int size, operator op, value *ignore)
{
    value *r;
    if (op == op_insert) {
        *count = *count +1;
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

extern  void register_exec_expression(table builders);
extern  void register_string_builders(table builders);
extern  void register_aggregate_builders(table builders);
extern  void register_edb_builders(table builders);

table builders_table()
{
    if (!builders) {
        builders = allocate_table(init, key_from_pointer, compare_pointer);

        table_set(builders, intern_cstring("fork"), build_fork);
        table_set(builders, intern_cstring("trace"), build_trace);
        table_set(builders, intern_cstring("sub"), build_sub);
        table_set(builders, intern_cstring("subtail"), build_sub_tail);
        table_set(builders, intern_cstring("terminal"), build_terminal);
        table_set(builders, intern_cstring("choose"), build_choose);
        table_set(builders, intern_cstring("choosetail"), build_choose_tail);
        table_set(builders, intern_cstring("move"), build_move);
        table_set(builders, intern_cstring("regfile"), build_regfile);
        table_set(builders, intern_cstring("not"), build_not);
        table_set(builders, intern_cstring("time"), build_time);
        register_exec_expression(builders);
        register_string_builders(builders);
        register_aggregate_builders(builders);
        register_edb_builders(builders);
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
