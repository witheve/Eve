#include <runtime.h>
#include <unix/unix.h>
#include <luanne.h>

static void iterate_and_print(lua_State *L, int index)
{
    // Push another reference to the table on top of the stack (so we know
    // where it is, and this function can work for negative, positive and
    // pseudo indices
    lua_pushvalue(L, index);
    // stack now contains: -1 => table
    lua_pushnil(L);
    // stack now contains: -1 => nil; -2 => table
    while (lua_next(L, -2))
        {
            // stack now contains: -1 => value; -2 => key; -3 => table
            // copy the key so that lua_tostring does not modify the original
            lua_pushvalue(L, -2);
            // stack now contains: -1 => key; -2 => value; -3 => key; -4 => table
            const char *key = lua_tostring(L, -1);
            const char *value = lua_tostring(L, -2);
            // pop value + copy of key, leaving original key
            lua_pop(L, 2);
            // stack now contains: -1 => key; -2 => table
        }
    // stack now contains: -1 => table (when lua_next returns 0 it pops the key
    // but does not push anything.)
    // Pop table
    lua_pop(L, 1);
    // Stack is now the same as it was on entry to this function
}


// refcounting
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
    define(c, "suid", construct_uuid);
    define(c, "snumber", construct_number);
    define(c, "sboolean", construct_boolean);
    define(c, "sstring_boolean", construct_string);
    define(c, "value_to_string", lua_print_value);

    register_exec(c);
    require_luajit(c, "compiler");

    return c;
}
