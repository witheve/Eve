#include <runtime.h>
#include <unix/unix.h>
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>


struct interpreter  {
    heap h;
    bag b;
    table scope_map;
    lua_State *L;
};

static inline interpreter lua_context(lua_State *L)
{
    return (void *)lua_topointer(L, lua_upvalueindex(1));
}

static int lua_toregister(lua_State *L, int index)
{
    void *x = lua_touserdata(L, index);
    return((unsigned long)x - register_base);
}

// refcounting
static value lua_tovalue(lua_State *L, int index)
{
    switch(lua_type(L, index)){
    case LUA_TBOOLEAN:
        return lua_toboolean(L, index)?etrue:efalse;
    case LUA_TNUMBER:
        // our number isn't making it into float space
        // also our heap is getting mixed up with luas
        return box_float(lua_tonumber(L, index));
    case LUA_TSTRING:
        return intern_string((void *)lua_tostring(L, index),  lua_strlen(L, index));
    case LUA_TLIGHTUSERDATA:
        //presumably from us
        return lua_touserdata(L, index);
    default:
        // figure out how to signal a lua error
        printf("yeah, sorry, i dont eat that kind of stuff %d\n", lua_type(L, index));
    }
    return 0;
}

static inline value lookup(value k, value *r)
{
    if (type_of(k) == register_space)  {
        // good look keeping your sanity if this is a non-register value in this space
        return(r[(unsigned long)k-register_base]);
    }
    return k;
}


// run an execf from lualand. should take an op
static int run(lua_State *L)
{
    interpreter c = lua_context(L);
    execf f = (void *)lua_topointer(L, 1);
    // xxx - execution heap...and parameterize this from the run function
    apply(f, 0, allocate(init, sizeof(value) * 20));
    return 0;
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
    lua_pushlightuserdata(L, r);
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


static int construct_register(lua_State *L)
{
    interpreter c = lua_context(L);
    // does this have to be round?
    int offset = (int)lua_tonumber(L, 1);
    lua_pushlightuserdata(L, (void *)(register_base + offset));
    return 1;
}

static int construct_uuid(lua_State *L)
{
    interpreter c = lua_context(L);
    unsigned char *body  = (void *)lua_tostring(L, 1);
    unsigned int length = lua_strlen(L, 1);
    // probably move this out of luanne
    unsigned char id[12];

    if (length > 24) {
        lua_pushnil(L);
        return 1;
    }
    
    for (int i = 0 ; i < length; i++) {
        int loc = (length - i)/2;
        id[loc] = ((i&1)?(id[loc] << 4):0) | digit_of(body[i]);
    }
    
    lua_pushlightuserdata(L, intern_uuid(id));
    return 1;
}

static int construct_number(lua_State *L)
{
    interpreter c = lua_context(L);
    lua_pushnil(L);
    return 1;
}

static int construct_boolean(lua_State *L)
{
    interpreter c = lua_context(L);
    int x = lua_toboolean(L,1);
    lua_pushlightuserdata(L, x?etrue:efalse);
    return 1;
}

static int construct_string(lua_State *L)
{
    lua_pushlightuserdata(L, intern_string((void *)lua_tostring(L, 1), lua_strlen(L, 1)));
    return 1;
}

static int lua_print_value(lua_State *L)
{
    void *x = lua_touserdata(L, 1);
    unsigned long t = type_of(x);
    
    switch (t) {
    case uuid_space:
        {
            // ok, we did a little digging around in lua and apparently the guy keeps
            // his own interned copies..so, we'll do a little construction
            char temp[UUID_LENGTH*2];
            uuid_base_print(temp, x);
            lua_pushlstring(L, temp, sizeof(temp));
        }
        break;
    case float_space:
        {
            char temp[32];
            // sadness - extend the numeric tower
            lua_pushlstring(L, temp, sprintf(temp, "%g", *(double *)x));
        }
        break;
    case interned_space:
        {
            string_intermediate si = x;
            lua_pushlstring(L, (const char *)si->body, si->length);
        }
        break;
    case register_space:
        if (x == etrue) {
            lua_pushstring(L, "true");
            break;
        }
        if (x == efalse) {
            lua_pushstring(L, "false");
            break;
        }
    default:
        printf ("what the hell! %p %lx %p %p\n", x, t, efalse, etrue);
        return 0;
    }
    return 1;
}

static int lua_gen_uuid(lua_State *L)
{
    lua_pushlightuserdata(L, generate_uuid());
    return 1;
}


void define(interpreter c, char *name, int (*f)(lua_State *)) {
    lua_pushlightuserdata(c->L, c);
    lua_pushcclosure(c->L, f, 1);
    lua_setglobal(c->L, name);
}

void require_luajit(interpreter c, char *z)
{
    lua_getglobal(c->L, "require");
    lua_pushlstring(c->L, z, cstring_length(z));;
    lua_pcall(c->L, 1, 1, 0);
    lua_setglobal(c->L, z);
}

void luaL_traceback (lua_State *L, lua_State *L1, const char *msg,
                     int level);

static int traceback(lua_State *L)
{
  if (!lua_isstring(L, 1)) { /* Non-string error object? Try metamethod. */
    if (lua_isnoneornil(L, 1) ||
	!luaL_callmeta(L, 1, "__tostring") ||
	!lua_isstring(L, -1))
      return 1;  /* Return non-string error object. */
    lua_remove(L, 1);  /* Replace object by result of __tostring metamethod. */
  }
  luaL_traceback(L, L, lua_tostring(L, 1), 1);
  return 1;
}

execf lua_compile_eve(interpreter c, buffer b)
{
    lua_pushcfunction(c->L, traceback);
    lua_getglobal(c->L, "compiler");
    lua_getfield(c->L, -1, "compileExec");
    lua_pushlstring(c->L, bref(b, 0), buffer_length(b));
    lua_pushcfunction(c->L, run);
    if (lua_pcall(c->L, 2, 0, lua_gettop(c->L)-4)) {
        printf ("lua error\n");
        printf ("%s\n", lua_tostring(c->L, -1));
    }
    return((void *)lua_topointer(c->L, 1));
}

void lua_run_module_func(interpreter c, buffer b, char *module, char *func)
{
    require_luajit(c, module);
    lua_getglobal(c->L, module);
    lua_getfield(c->L, -1, func);
    lua_pushlstring(c->L, bref(b, 0), buffer_length(b));
    if (lua_pcall(c->L, 1, 0, 0)) {
        printf ("lua error\n");
        printf ("%s\n", lua_tostring(c->L, -1));
    }
}

void lua_run(interpreter c, buffer b)
{
    int r;
    lua_pushcfunction(c->L, traceback);
    if ((r= luaL_loadbuffer(c->L, b->contents, buffer_length(b), ""))){
        printf ("lua load error %d\n", r);
    } else {
        if (lua_pcall(c->L, 0, 0, lua_gettop(c->L)-1)) {
            printf ("lua error\n");
            printf ("%s\n", lua_tostring(c->L, -1));
        }
        lua_close(c->L);
    }
}


extern int luaopen_utf8(lua_State *L);

extern void bundle_add_loaders(lua_State* L);
 
interpreter build_lua(bag b, table scopes)
{
    heap h = allocate_rolling(pages);
    interpreter c = allocate(h, sizeof(struct interpreter));
    c->L = luaL_newstate();
    c->h = h;
    c->b = b;
    c->scope_map = scopes;
    
    
    luaL_openlibs(c->L);
    bundle_add_loaders(c->L);

    // make me a lua package ala utf8
    define(c, "register", construct_register);
    define(c, "suid", construct_uuid);
    define(c, "snumber", construct_number);
    define(c, "sboolean", construct_boolean);
    define(c, "sstring_boolean", construct_string);
    define(c, "value_to_string", lua_print_value);

    
    // exec builder stuff
    define(c, "run", run);
    define(c, "generate_uuid", build_genid);
    define(c, "wrap_tail", wrap_tail);
    define(c, "scan", build_scan);
    define(c, "build_insert", build_insert);
    define(c, "build_fork", build_fork);

    require_luajit(c, "compiler");

    return c;
}
