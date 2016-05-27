/*
** Module loaders for bundled Lua and Lua/C modules.
** By Cosmin Apreutesei, no (c) claimed.
**
** Major portions taken verbatim or adapted from LuaJIT's lib_package.c.
** Copyright (C) 2005-2014 Mike Pall. See Copyright Notice in luajit.h
**
** Major portions taken verbatim or adapted from the Lua interpreter.
** Copyright (C) 1994-2012 Lua.org, PUC-Rio. See Copyright Notice in lua.h
*/

#include <string.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

#include "bundle.h"

/* ------------------------------------------------------------------------ */

/* Symbol name prefixes. */
#define SYMPREFIX_CF		"luaopen_%s"
/* we use a separate prefix for bundled modules */
#define SYMPREFIX_BC		"Blua_%s"

#ifdef _WIN32

	#define WIN32_LEAN_AND_MEAN
	#include <windows.h>

	static void *ll_sym(const char *sym)
	{
		HINSTANCE h = GetModuleHandleA(NULL);
		return GetProcAddress(h, sym);
	}

#else

	#include <dlfcn.h>
	static void *ll_sym(const char *sym)
	{
		void *lib = 0;
		#ifdef __APPLE__
			lib = RTLD_SELF;
		#endif
		return dlsym(lib, sym);
	}

#endif

/* ------------------------------------------------------------------------ */

static void **ll_register(lua_State *L, const char *name)
{
	void **plib;
	lua_pushfstring(L, "LOADLIB: %s", name);
	lua_gettable(L, LUA_REGISTRYINDEX);  /* check library in registry? */
	if (!lua_isnil(L, -1)) {  /* is there an entry? */
		plib = (void **)lua_touserdata(L, -1);
	} else {  /* no entry yet; create one */
		lua_pop(L, 1);
		plib = (void **)lua_newuserdata(L, sizeof(void *));
		*plib = NULL;
		luaL_getmetatable(L, "_LOADLIB");
		lua_setmetatable(L, -2);
		lua_pushfstring(L, "LOADLIB: %s", name);
		lua_pushvalue(L, -2);
		lua_settable(L, LUA_REGISTRYINDEX);
	}
	return plib;
}

static const char *mksymname(lua_State *L, const char *modname,
	const char *prefix)
{
	const char *funcname;
	const char *mark = strchr(modname, *LUA_IGMARK);
	if (mark) modname = mark + 1;
	funcname = luaL_gsub(L, modname, ".", "_");
	funcname = lua_pushfstring(L, prefix, funcname);
	lua_remove(L, -2);  /* remove 'gsub' result */
	return funcname;
}

/* ------------------------------------------------------------------------ */

static void loaderror(lua_State *L)
{
	luaL_error(L, "error loading module " LUA_QS ":\n\t%s",
			lua_tostring(L, 1), lua_tostring(L, -1));
}

// xxx - EAH - i dont konw why we have to use dlopen on myself, i know the
// symbol name
/* load a C module bundled in the running executable */
/* C modules are bundled as lua_CFunction in `luaopen_<name>` globals */
static int bundle_loader_c(lua_State *L)
{
	const char *name = luaL_checkstring(L, 1);
	void **reg = ll_register(L, name);
	const char *sym = mksymname(L, name, SYMPREFIX_CF);
	lua_CFunction f = (lua_CFunction)ll_sym(sym);
	if (!f) {
		lua_pushfstring(L, "\n\tno symbol "LUA_QS, sym);
		lua_remove(L, -2); /* remove bcname */
		return 1;
	}
	lua_pop(L, 1);
	lua_pushcfunction(L, f);
	return 1;
}

/* load a Lua module bundled in the running executable */
/* Lua modules are bundled as bytecode in `<SYMPREFIX_BC><name>` globals */
static int bundle_loader_lua(lua_State *L)
{
	const char *name = luaL_checkstring(L, 1);
	const char *bcname = mksymname(L, name, SYMPREFIX_BC);
	const char *bcdata = (const char *)ll_sym(bcname);
	if (bcdata == NULL) {
		lua_pushfstring(L, "\n\tno symbol "LUA_QS, bcname);
		lua_remove(L, -2); /* remove bcname */
		return 1;
	}
	lua_pop(L, 1); /* remove bcname */
	if (luaL_loadbuffer(L, bcdata+4, *((unsigned int*)bcdata), bcname) != 0) {
		lua_pushfstring(L, "error loading chunk");
		loaderror(L);
	}
	return 1;
}

/* ------------------------------------------------------------------------ */

/* add our two bundle loaders at the end of package.loaders */
extern void bundle_add_loaders(lua_State* L)
{
	int top = lua_gettop(L);

	/* push package.loaders table into the stack */
	lua_getglobal(L, LUA_LOADLIBNAME);          /* get _G.package */
	lua_getfield(L, -1, "loaders");             /* get _G.package.loaders */

	lua_pushcfunction(L, bundle_loader_lua);    /* push as lua_CFunction */
	lua_rawseti(L, -2, lua_objlen(L, -2)+1);    /* append to loaders table */

	lua_pushcfunction(L, bundle_loader_c);      /* push as lua_CFunction */
	lua_rawseti(L, -2, lua_objlen(L, -2)+1);    /* append to loaders table */

	lua_settop(L, top);
}

