#include <runtime.h>
#include <unix/unix.h>
#include <luanne.h>

value lua_tovalue(lua_State *L, int index)
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
    interpreter c = lua_context(L);
    string out = allocate_string(c->h);
    print_value(out, x);
    lua_pushlstring(L, bref(out->contents, 0), buffer_length(out));
    return 1;
}

static int lua_gen_uuid(lua_State *L)
{
    lua_pushlightuserdata(L, generate_uuid());
    return 1;
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

evaluation lua_compile_eve(interpreter c, buffer b)
{
    lua_pushcfunction(c->L, traceback);
    lua_getglobal(c->L, "compiler");
    lua_getfield(c->L, -1, "compileExec");
    lua_pushlstring(c->L, bref(b, 0), buffer_length(b));
    if (lua_pcall(c->L, 1, 1, lua_gettop(c->L)-3)) {
        printf ("lua error\n");
        printf ("%s\n", lua_tostring(c->L, -1));
    }
    void *z = (void *)lua_topointer(c->L, -1);
    lua_pop(c->L, 1);
    return((evaluation)z);
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
    define(c, "suid", construct_uuid);
    define(c, "snumber", construct_number);
    define(c, "sboolean", construct_boolean);
    define(c, "sstring_boolean", construct_string);
    define(c, "value_to_string", lua_print_value);

    register_exec(c);
    require_luajit(c, "compiler");

    return c;
}
