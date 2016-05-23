#include <runtime.h>
#include <unix/unix.h>
#include <luajit-2.1/lua.h>
#include <luajit-2.1/lauxlib.h>
#include <luajit-2.1/lualib.h>


struct interpreter  {
    heap h;
    bag b;
    lua_State *L;
};

typedef closure(execf, int, value *);

static inline interpreter lua_context(lua_State *L)
{
    return (void *)lua_topointer(L, lua_upvalueindex(1));
}

static value value_from_lua(heap h, lua_State *L, int index)
{
    switch(lua_type(L, index)){
    case LUA_TBOOLEAN:
        return lua_toboolean(L, index)?etrue:efalse;
    case LUA_TNUMBER:
        return box_float(h, lua_tonumber(L, index));
    case LUA_TSTRING:
        return allocate_estring(h, (void *)lua_tostring(L, index),  lua_strlen(L, index));
        int size = lua_strlen(L, index);
    default:
        // figure out how to signal a lua error
        printf("yeah, sorry, i dont eat that kind of stuff");
    }
    return 0;
}

// run an execf from lualand. should take an op
static int run(lua_State *L)
{
    interpreter c = lua_context(L);
    execf f = (void *)lua_topointer(L, 1);
    apply(f, 0, 0);
    return 0;
}

// ok, different plan, each r is really an addressable stack
static CONTINUATION_1_2(do_scan, execf, int, value *);

static void scan_listener(value *r)
{
}

static void do_scan(execf c, int op, value *r)
{
    apply(c, op, r);
}

static int build_scan(lua_State *L)
{
    interpreter c = lua_context(L);
    value e = value_from_lua(c->h, L, 1);
    execf next = (void *)lua_topointer(L, 2);
    execf r =cont(c->h, do_scan, next);
    lua_pushlightuserdata(L, r);
    return 1;
}
    
// eav
static int direct_insert(lua_State *L)
{
    interpreter c = lua_context(L);
    // should really go into the bag heap, dont you think?
    value e = value_from_lua(c->h, L, 1);
    value a = value_from_lua(c->h, L, 2);
    value v = value_from_lua(c->h, L, 3);

    //    printf("inserty %p %p %p %x %x  %x\n", e, a, v, *(unsigned char*)e, *(unsigned char*)a, *(unsigned char*)v);
    edb_insert(c->b, e, a, v);
    return 0;
}

static CONTINUATION_2_2(luaresult, interpreter, int, int, value *);
static void luaresult(interpreter c, int r, int b, value *x)
{
    int num_results=4;
    lua_rawgeti(c->L, LUA_REGISTRYINDEX, r);

    lua_createtable(c->L, num_results, 0);
    for (int i=0; i<num_results; i++) {
        lua_pushinteger(c->L, i);
        lua_rawseti (c->L, -2, i + 1);
    }
    
    // on the close path, we should luall_unref(L, LUA_REGISTRYINDEX, r)
    // translate args back to lua
    if (lua_pcall(c->L, 1, 0, 0)) {
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
    return 0;
}


void define(interpreter c, char *name, int (*f)(lua_State *)) {
    lua_pushlightuserdata(c->L, c); 
    lua_pushcclosure(c->L, f, 1);
    lua_setglobal(c->L, name);
}

void require_luajit(lua_State *L)
{
    lua_getglobal(L, "require");
    lua_pushliteral(L, "main");
    lua_pcall(L, 1, 0, 0);
}

void lua_run_file(interpreter c, char *filename)
{
    // iterate, flags, etc
    buffer b = read_file(c->h, filename);
    int r;
    if ((r= luaL_loadbuffer(c->L, b->contents, buffer_length(b), filename))){
        printf ("lua load error %d\n", r);
    } else {
        if (lua_pcall(c->L, 0, 0, 0)) {
            printf ("lua error\n");
            printf ("%s\n", lua_tostring(c->L, -1));
        }
        lua_close(c->L);
    }
}

interpreter build_lua()
{
    heap h = allocate_rolling(pages);
    interpreter c = allocate(h, sizeof(struct interpreter));
    c->L = luaL_newstate();
    c->h = h;
    c->b = create_bag(efalse);
    
    luaL_openlibs(c->L);     // what run time dependencies do I have?
    require_luajit(c->L);
    define(c, "insert", direct_insert);
    define(c, "run", run);
    define(c, "wrap_tail", wrap_tail);
    define(c, "scan", build_scan);
    define(c, "register", construct_register);
    define(c, "suid", construct_uuid);
    define(c, "snumber", construct_number);
    define(c, "sboolean", construct_boolean);
    define(c, "sstring_boolean", construct_string);
    define(c, "value_to_string", lua_print_value);
    return c;
}
