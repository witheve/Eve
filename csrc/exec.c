#include <runtime.h>
#include <luanne.h>
#include <unistd.h>

static void exec_error(evaluation e, char *format, ...)
{
    printf ("error %s\n", format);
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

static CONTINUATION_5_2(do_full_scan, evaluation, execf, int, int, int, operator, value *);
static void do_full_scan(evaluation ex, execf n, int e, int a, int v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_3, n, op, r, e, a, v);
    full_scan(ex->b, listen);
}

static CONTINUATION_5_2(do_ea_scan, evaluation, execf, value, value, int, operator, value *);
static void do_ea_scan(evaluation ex, execf n, value e, value a, int v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_1, n, op, r, v);
    ea_scan(ex->b, lookup(e, r), lookup(a, r), listen);
}

static CONTINUATION_5_2(do_e_scan, evaluation, execf, value, int, int, operator, value *);
static void do_e_scan(evaluation ex, execf n, value e, int a, int v, operator op, value *r)
{
    void *listen = cont(ex->h,scan_listener_2, n, op, r, a, v);
    e_scan(ex->b, lookup(e, r), listen);
}

static CONTINUATION_5_2(do_av_scan, evaluation, execf, int, value, value, operator, value *);
static void do_av_scan(evaluation ex, execf n, int e, value a, value v, operator op, value *r)
{
    void *listen = cont(ex->h, scan_listener_1, n, op, r, e);
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

static int build_scan(lua_State *L)
{
    evaluation ex = (void *)lua_topointer(L, 1);
    execf next = (void *)lua_topointer(L, 2);
    char *description =  (char *)lua_tostring(L, 3);
    value e = lua_tovalue(L, 1);
    int outstart = 4;
    execf r = 0;

    if (lua_strlen(L, 3) != 3) return false;
    
    if (match(description, "eav")) {
        r =cont(ex->h, do_full_scan, ex, next,
                lua_toregister(L, outstart),
                lua_toregister(L, outstart + 1),
                lua_toregister(L, outstart+2));
    }
    if (match(description, "EAv")){
         r =cont(ex->h, do_ea_scan, ex, next,
                 lua_tovalue(L, outstart),
                 lua_tovalue(L, outstart + 1),
                 lua_toregister(L, outstart+2));
    }
    
    if (match(description, "Eav")) {
         r =cont(ex->h, do_e_scan, ex, next,
                 lua_tovalue(L, outstart),
                 lua_toregister(L, outstart+1),
                 lua_toregister(L, outstart+2));
    }
    
    if (match(description, "eAV")) {
        r =cont(ex->h, do_av_scan, ex, next,
                lua_toregister(L, outstart),
                lua_tovalue(L, outstart + 1),
                lua_tovalue(L, outstart+2));
    }
    
    if (match(description,"EAV")) {
        r =cont(ex->h, do_eav_scan, ex, next,
                lua_tovalue(L, outstart),
                lua_tovalue(L, outstart + 1),
                lua_tovalue(L, outstart + 2));
    }

    if (!r) {
        printf ("couldn't find scan for %s\n", description);
    }

    lua_pushlightuserdata(L, r);
    return 1;
}

static CONTINUATION_6_2(do_insert, evaluation, execf, value, value, value, value, operator, value *) ;
static void do_insert(evaluation ex, execf n, value scope, value e, value a, value v, operator op, value *r) 
{
    insertron i = table_find(ex->scope_map, scope);
    if (!i) {
        exec_error(e, "no destination for scope %s", scope); 
    }
    
    apply(i, lookup(e, r), lookup(a, r), lookup(v, r));
    apply(n, op, r);
}

static int build_insert(lua_State *L)
{
    evaluation e = (void *)lua_topointer(L, 1);
    
    execf r = cont(e->h, do_insert,
                   e,
                   lua_tovalue(L, 2),
                   lua_tovalue(L, 3),
                   lua_tovalue(L, 4),
                   lua_tovalue(L, 5),
                   lua_tovalue(L, 6));

    lua_pushlightuserdata(L, r);
    return 1;
}


static CONTINUATION_5_2(do_plus, evaluation, execf, int, value, value,  operator, value *);
static void do_plus(evaluation ex, execf n, int dest, value a, value b, operator op, value *r)
{
    value ar = lookup( r, a);
    value br = lookup( r, b);
    if ((type_of(ar) != float_space ) || (type_of(br) != float_space)) {
        exec_error(ex, "attempt to add non-numbers", a, b);
    } else {
        r[dest] = box_float(*(double *)lookup( r, a) + *(double *)lookup( r, b));
        apply(n, op, r);
    }
}

static int build_plus(lua_State *L)
{
    evaluation e = (void *)lua_topointer(L, 1);
    execf n = cont(e->h,
                   do_plus,
                   e,
                   lua_tovalue(L, 1),
                   lua_toregister(L, 2),
                   lua_tovalue(L, 3),
                   lua_tovalue(L, 4));
    
    lua_pushlightuserdata(L, n);
    return 1;
}

    
static CONTINUATION_2_2(do_genid, execf, int,  operator, value *);
static void do_genid(execf n, int dest, operator op, value *r) 
{
    r[dest] = generate_uuid();
    apply(n, op, r);
}
    
static int build_genid(lua_State *L)
{
    evaluation e = (void *)lua_topointer(L, 1);
    execf n = cont(e->h, do_genid,
                   lua_tovalue(L, 2),
                   lua_toregister(L, 3));
    lua_pushlightuserdata(L, n);
    return 1;
}


static CONTINUATION_2_2(do_fork, execf, execf, operator, value *) ;
static void do_fork(execf a, execf b, operator op, value *r)
{
    apply(a, op, r);
    apply(b, op, r);
}

static int build_fork(lua_State *L)
{
    evaluation c = (void *)lua_topointer(L, 1);
    lua_pushlightuserdata(L, cont(c->h, do_fork,
                                  (void *)lua_topointer(L, 2),
                                  (void *)lua_topointer(L, 3)));
    return 1;
}

static CONTINUATION_4_2(do_trace, bag, execf, estring, table, operator, value *) ;
static void do_trace(bag b, execf n, estring name, table regmap, operator op, value *r)
{
    string_intermediate si = name;
    write(1, si->body, si->length);

    table_foreach(regmap, k, v) {
        prf(" %b %v", k, lookup(v, r));
    }
    write(1, "\n", 1);

    apply(n, op, r);
}

static int build_trace(lua_State *L)
{
    evaluation c = (void *)lua_topointer(L, 1);
    table regnames = allocate_table(c->h, string_hash, string_equal);
    lua_pushnil(L);  /* first key */
    while (lua_next(L, 4) != 0) {
        string x = allocate_string(c->h);
        buffer_append(x, (void *)lua_tostring(L, -2), lua_strlen(L, -2));
        table_set(regnames, x, (void *)(lua_tovalue(L, -1)));
        lua_pop(L, 1);
    }
    lua_pop(L, 1);
            
    lua_pushlightuserdata(L, cont(c->h, 
                                  do_trace,
                                  c->b,
                                  (void *)lua_topointer(L, 2),
                                  (void *)lua_tovalue(L, 3),
                                  regnames));
    return 1;
}

static int construct_register(lua_State *L)
{
    evaluation c = (void *)lua_context(L);
    int offset = (int)lua_tonumber(L, 1);
    lua_pushlightuserdata(L, (void *)(register_base + offset));
    return 1;
}



static CONTINUATION_0_2(nothing, operator, value *);
static void nothing(operator op, value *r) {
}

static execf nothing_handler;

static int build_ignore(lua_State *l)
{
    if (nothing_handler == 0)
        nothing_handler = cont(init, nothing);
    
    evaluation c = (void *)lua_context(l);
    lua_pushlightuserdata(l, nothing_handler);
    return 1;
}

static CONTINUATION_2_2(luaresult, interpreter, int, int, value *);
static void luaresult(interpreter c, int r, operator op, value *x)
{
    // extract from x
    int num_results=3;
    lua_rawgeti(c->L, LUA_REGISTRYINDEX, r);

    lua_pushstring(c->L, "op");
    lua_createtable(c->L, num_results, 0);
    for (int i=0; i<num_results; i++) {
        lua_pushlightuserdata(c->L, x[i]);
        lua_rawseti (c->L, -2, i + 1);
    }

    // on the close path, we should luall_unref(L, LUA_REGISTRYINDEX, r)
    // translate args back to lua
    if (lua_pcall(c->L, 2, 0, 0)) {
        printf ("calback error");
        printf ("%s\n", lua_tostring(c->L, -1));
    }
}


static int wrap_tail(lua_State *L)
{
    interpreter c = lua_context(L);
    void *a = (void *)lua_topointer(L, 1);
    // this is kinda shitty, we have to stash this pointer in the
    // registry, and thus we need a copy on the top of the stack
    int r = luaL_ref(L, LUA_REGISTRYINDEX);
    lua_pushlightuserdata(L, cont(c->h, luaresult, c, r));
    return 1;
}

evaluation allocate_evaluation(bag b, table scopes)
{
    heap h = allocate_rolling(pages);
    evaluation e = allocate(h, sizeof(struct evaluation));
    e->h =h;
    e->scope_map = scopes;
    e->b =b;
    return e;
}

void close_evaluation(evaluation ex)
{
    // close
    apply(ex->head, 1, 0);
    ex->h->destroy();
}


int lua_allocate_evaluation(lua_State *L)
{
    interpreter c = lua_context(L);
    lua_pushlightuserdata(L, allocate_evaluation(c->b, c->scope_map));
    return 1;
}

static int lua_set_head(lua_State *L)
{
    evaluation e = (void *)lua_topointer(L, 1);
    e->head = lua_tovalue(L, 2);
    e->registerfile = lua_tointeger(L, 3);
    return 0;
}

void register_exec(interpreter c)
{
    define(c, "run", run);
    define(c, "register", construct_register);
    define(c, "generate_uuid", build_genid);
    define(c, "wrap_tail", wrap_tail);
    define(c, "scan", build_scan);
    define(c, "build_insert", build_insert);
    define(c, "build_fork", build_fork);
    define(c, "build_trace", build_trace);
    define(c, "ignore", build_ignore);
    define(c, "new_evaluation", lua_allocate_evaluation);
    define(c, "set_head", lua_set_head);
}

void execute(evaluation e)
{
    ticks start_time = rdtsc();
    value *r = allocate(init, sizeof(value) * e->registerfile);
    memset(r, 0xaa, sizeof(value) * e->registerfile);
    apply(e->head, 0, r);
    ticks end_time = rdtsc();
    printf ("exec in %ld ticks\n", end_time-start_time);
}

