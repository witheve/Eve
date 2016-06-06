#include <runtime.h>
#include <luanne.h>
#include <unistd.h>

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

    
static CONTINUATION_5_2(do_full_scan, interpreter, execf, int, int, int, operator, value *);
static void do_full_scan(interpreter z, execf n, int e, int a, int v, operator op, value *r)
{
    full_scan(z->b, cont(z->h, scan_listener_3, n, op, r, e, a, v));
}

static CONTINUATION_5_2(do_ea_scan, interpreter, execf, value, value, int, operator, value *);
static void do_ea_scan(interpreter z, execf n, value e, value a, int v, operator op, value *r)
{
    ea_scan(z->b, lookup(e, r), lookup(a, r), cont(z->h, scan_listener_1, n, op, r, v));
}

static CONTINUATION_5_2(do_e_scan, interpreter, execf, value, int, int, operator, value *);
static void do_e_scan(interpreter z, execf n, value e, int a, int v, operator op, value *r)
{
    e_scan(z->b, lookup(e, r), cont(z->h, scan_listener_2, n, op, r, a, v));
}

static CONTINUATION_5_2(do_av_scan, interpreter, execf, int, value, value, operator, value *);
static void do_av_scan(interpreter z, execf n, int e, value a, value v, operator op, value *r)
{
    av_scan(z->b, lookup(a, r), lookup(v, r), cont(z->h, scan_listener_1, n, op, r, e));
}

static CONTINUATION_5_2(do_eav_scan, interpreter, execf, value, value, value, operator, value *);
static void do_eav_scan(interpreter z, execf n, value e, value a, value v, operator op, value *r)
{
    eav_scan(z->b, lookup(e, r), lookup(a,r), lookup(v,r), cont(z->h, scan_listener_0, n, r, op));
}

// this seems broken at the high end..
//int popcount8( unsigned char x)
//{
//    return ( x* 0x8040201ULL & 0x11111111)%0xF;
//}

// value e = lua_toboolean(c->h, L, 1);

// xxx - intrinsic
extern int strcmp(const char *x, const char *y);

static int build_scan(lua_State *L)
{
    interpreter c = lua_context(L);
    execf next = (void *)lua_topointer(L, 1);
    value e = lua_tovalue(L, 1);
    char *description = (void *)lua_tostring(L, 2);
    int outstart = 3;
    execf r = 0;

    // so unhappy
    if (!strcmp(description, "eav")) {
        r =cont(c->h, do_full_scan, c, next,
                lua_toregister(L, outstart),
                lua_toregister(L, outstart + 1),
                lua_toregister(L, outstart+2));
    }
    if (!strcmp(description, "EAv")) {
         r =cont(c->h, do_ea_scan, c, next,
                 lua_tovalue(L, outstart),
                 lua_tovalue(L, outstart + 1),
                 lua_toregister(L, outstart+2));
    }
    
    if (!strcmp(description, "Eav")) {
         r =cont(c->h, do_e_scan, c, next,
                 lua_tovalue(L, outstart),
                 lua_toregister(L, outstart+1),
                 lua_toregister(L, outstart+2));
    }
    
    if (!strcmp(description, "eAV")) {
        r =cont(c->h, do_av_scan, c, next,
                lua_toregister(L, outstart),
                lua_tovalue(L, outstart + 1),
                lua_tovalue(L, outstart+2));
    }
    
    if (!strcmp(description, "EAV")) {
        r =cont(c->h, do_eav_scan, c, next,
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

static CONTINUATION_6_2(do_insert, table, execf, value, value, value, value, operator, value *) ;
static void do_insert(table scope_map, execf n, value scope, value e, value a, value v, operator op, value *r) 
{
    insertron i = table_find(scope_map, scope);
    apply(i, lookup(e, r), lookup(a, r), lookup(v, r));
    apply(n, op, r);
}

static int build_insert(lua_State *L)
{
    interpreter c = lua_context(L);
    execf r = cont(c->h, do_insert,
                   c->scope_map,
                   lua_tovalue(L, 1),
                   lua_tovalue(L, 2),
                   lua_tovalue(L, 3),
                   lua_tovalue(L, 4),
                   lua_tovalue(L, 5));

    lua_pushlightuserdata(L, r);
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
    interpreter c = lua_context(L);
    execf n = cont(c->h, do_genid,
                   lua_tovalue(L, 1),
                   lua_toregister(L, 2));
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
    interpreter c = lua_context(L);
    lua_pushlightuserdata(L, cont(c->h, do_fork,
                                  (void *)lua_topointer(L, 1),
                                  (void *)lua_topointer(L, 2)));
    return 1;
}

static CONTINUATION_4_2(do_trace, bag, execf, estring, void*, operator, value *) ;
static void do_trace(bag b, execf n, estring name, void *regmap, operator op, value *r)
{
    string_intermediate si = name;
    write(1, si->body, si->length);
    write(1, "\n", 1);
    apply(n, op, r);
}

static int build_trace(lua_State *L)
{
    interpreter c = lua_context(L);
    lua_pushlightuserdata(L, cont(c->h, 
                                  do_trace,
                                  c->b,
                                  (void *)lua_topointer(L, 1),
                                  (void *)lua_tovalue(L, 2),
                                  (void *)lua_topointer(L, 3)));
    return 1;
}

static int construct_register(lua_State *L)
{
    interpreter c = lua_context(L);
    // does this have to be round?
    int offset = (int)lua_tonumber(L, 1);
    lua_pushlightuserdata(L, (void *)(register_base + offset));
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

}
