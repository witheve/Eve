#include <runtime.h>
#include <unix/unix.h>
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>


struct interpreter  {
    heap h;
    bag b;
    lua_State *L;
};

typedef closure(execf, operator, value *);

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
static value value_from_lua(lua_State *L, int index)
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
static CONTINUATION_6_3(scan_listener_3, execf, operator, value *, int, int, int, value, value, value);
static void scan_listener_3(execf n,  operator op, value *r, int a, int b, int c, value av, value bv, value cv)
{
    r[a] = av;
    r[b] = bv;
    r[c] = cv;
    apply(n, 0, r);
}

static CONTINUATION_4_2(scan_listener_2, execf, value *, int, int, value, value);
static void scan_listener_2(execf n, value *r, int a, int b, value av, value bv)
{
    r[a] = av;
    r[b] = bv;
    apply(n, 0, r);
}

static CONTINUATION_4_1(scan_listener_1, execf, int, value *, operator, value);
static void scan_listener_1(execf n, int a, value *r, operator op, value av)
{
    // synchronous
    r[a] = av;
    apply(n, op, r);
}

static CONTINUATION_5_2(do_full_scan, interpreter, execf, int, int, int, operator, value *);
static void do_full_scan(interpreter z, execf n, int a, int b, int c, operator op, value *r)
{
    full_scan(z->b, cont(z->h, scan_listener_3, n, op, r, a, b, c));
}

// this seems broken at the high end..
//int popcount8( unsigned char x)
//{
//    return ( x* 0x8040201ULL & 0x11111111)%0xF;
//}

// value e = lua_toboolean(c->h, L, 1);
static int build_scan(lua_State *L)
{
    interpreter c = lua_context(L);
    execf next = (void *)lua_topointer(L, 1);
    value e = value_from_lua(L, 1);
    char *description = (void *)lua_tostring(L, 2);
    int dlen = lua_strlen(L, 2);
    int outstart = 3;

    // selection
    execf r =cont(c->h, do_full_scan, c, next,
                  lua_toregister(L, outstart),
                  lua_toregister(L, outstart + 1),
                  lua_toregister(L, outstart+2));
    lua_pushlightuserdata(L, r);
    return 1;
}

// dynamic baggy?
static CONTINUATION_5_2(do_insert, bag, value, value, value, execf, operator, value *) ;
static void do_insert(bag bg, value a, value b, value c, execf n, operator op, value *r) 
{
    edb_insert(bg, lookup(a, r), lookup(b, r), lookup(c,r));
    apply(n, op, r);
}
    
static int build_insert(lua_State *L)
{
    interpreter c = lua_context(L);

    execf r = cont(c->h, do_insert, 
                   c->b, 
                   value_from_lua(L, 2),
                   value_from_lua(L, 3),
                   value_from_lua(L, 4),
                   value_from_lua(L, 1));
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
                   value_from_lua(L, 1),
                   lua_toregister(L, 2));
    lua_pushlightuserdata(L, n);
    return 1;
}


static int direct_insert(lua_State *L)
{
    interpreter c = lua_context(L);
    // should really go into the bag heap, dont you think?
    value e = value_from_lua(L, 1);
    value a = value_from_lua(L, 2);
    value v = value_from_lua(L, 3);

    edb_insert(c->b, e, a, v);
    return 0;
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
    lua_pcall(c->L, 1, 0, 0);
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

void lua_run_file(interpreter c, char *filename)
{
    // iterate, flags, etc
    buffer b = read_file(c->h, filename);
    int r;
    lua_pushcfunction(c->L, traceback);
    if ((r= luaL_loadbuffer(c->L, b->contents, buffer_length(b), filename))){
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
 
interpreter build_lua()
{
    heap h = allocate_rolling(pages);
    interpreter c = allocate(h, sizeof(struct interpreter));
    c->L = luaL_newstate();
    c->h = h;
    c->b = create_bag(efalse);
    
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


    return c;
}
