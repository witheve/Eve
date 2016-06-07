#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>

typedef struct evaluation  {
    heap h;
    bag b;
    table scope_map;
    vector listeners; // should probably be a vector of vectors
    execf head;
} *evaluation;
    
typedef struct interpreter  {
    heap h;
    bag b;
    table scope_map;
    lua_State *L;
} *interpreter;



interpreter build_lua(bag, table);
void lua_load_bytecode(interpreter, void *, bytes);
void lua_run(interpreter c, buffer b);
void eve_run(interpreter c, buffer b);
void require_luajit(interpreter c, char *z);
execf lua_compile_eve(interpreter c, buffer b);
void lua_run_module_func(interpreter c, buffer b, char *module, char *func);


static inline interpreter lua_context(lua_State *L)
{
    return (void *)lua_topointer(L, lua_upvalueindex(1));
}

// run an execf from lualand. should take an op
static inline int run(lua_State *L)
{
    interpreter c = lua_context(L);
    execf f = (void *)lua_topointer(L, 1);
    // xxx - execution heap...and parameterize this from the run function
    ticks start_time = rdtsc();
    apply(f, 0, allocate(init, sizeof(value) * 20));
    ticks end_time = rdtsc();
    printf ("exec in %ld ticks\n", end_time-start_time);
    return 0;
}

void register_exec(interpreter c);


value lua_tovalue(lua_State *L, int index);


static inline int lua_toregister(lua_State *L, int index)
{
    void *x = lua_touserdata(L, index);
    return((unsigned long)x - register_base);
}


static inline void define(interpreter c, char *name, int (*f)(lua_State *)) {
    lua_pushlightuserdata(c->L, c);
    lua_pushcclosure(c->L, f, 1);
    lua_setglobal(c->L, name);
}


