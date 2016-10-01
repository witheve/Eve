/* vim: set ft=c nu et sw=2 fdc=2 fdm=syntax : */
#define LUA_LIB
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>


#include <assert.h>
#include <string.h>


/* UTF-8 string operations */

#define UTF8_MAX 8
#define iscont(p)	((*(p) & 0xC0) == 0x80)

static size_t utf8_encode(char *s, unsigned ch) {
  if (ch < 0x80) {
    s[0] = (char)ch;
    return 1;
  }
  if (ch <= 0x7FF) {
    s[1] = (char) ((ch | 0x80) & 0xBF);
    s[0] = (char) ((ch >> 6) | 0xC0);
    return 2;
  }
  if (ch <= 0xFFFF) {
    s[2] = (char) ((ch | 0x80) & 0xBF);
    s[1] = (char) (((ch >> 6) | 0x80) & 0xBF);
    s[0] = (char) ((ch >> 12) | 0xE0);
    return 3;
  }
  {
    char buff[UTF8_MAX];
    unsigned mfb = 0x3F; /* maximum that fits in first byte */
    int n = 1;
    do { /* add continuation bytes */
      buff[UTF8_MAX - (n++)] = 0x80 | (ch&0x3F);
      ch >>= 6; /* remove added bits */
      mfb >>= 1; /* now there is one less bit available in first byte */
    } while (ch > mfb);  /* still needs continuation byte? */
    buff[UTF8_MAX - n] = (~mfb << 1) | ch;
    memcpy(s, &buff[UTF8_MAX - n], n);
    return n;
  }
}

static size_t utf8_decode(const char *s, const char *e, unsigned *pch) {
  unsigned ch;

  if (s >= e) {
    *pch = 0;
    return 0;   
  }

  ch = (unsigned char)s[0];
  if (ch < 0xC0) goto fallback;
  if (ch < 0xE0) {
    if (s+1 >= e || (s[1] & 0xC0) != 0x80)
      goto fallback;
    *pch = ((ch   & 0x1F) << 6) |
            (s[1] & 0x3F);
    return 2;
  }
  if (ch < 0xF0) {
    if (s+2 >= e || (s[1] & 0xC0) != 0x80
                 || (s[2] & 0xC0) != 0x80)
      goto fallback;
    *pch = ((ch   & 0x0F) << 12) |
           ((s[1] & 0x3F) <<  6) |
            (s[2] & 0x3F);
    return 3;
  }
  {
    int count = 0; /* to count number of continuation bytes */
    unsigned res = 0;
    while ((ch & 0x40) != 0) { /* still have continuation bytes? */
      int cc = (unsigned char)s[++count];
      if ((cc & 0xC0) != 0x80) /* not a continuation byte? */
        goto fallback; /* invalid byte sequence, fallback */
      res = (res << 6) | (cc & 0x3F); /* add lower 6 bits from cont. byte */
      ch <<= 1; /* to test next bit */
    }
    if (count > 5)
      goto fallback; /* invalid byte sequence */
    res |= ((ch & 0x7F) << (count * 5)); /* add first byte */
    *pch = res;
    return count+1;
  }

fallback:
  *pch = ch;
  return 1;
}

static const char *utf8_next(const char *s, const char *e) {
  unsigned ch;
  return s + utf8_decode(s, e, &ch);
}

static const char *utf8_prev(const char *s, const char *e) {
  const char *look = e - 1;

  while (s <= look) {
    unsigned ch = (unsigned char)*look;
    if (ch < 0x80 || ch >= 0xC0)
      return look;
    --look;
  }

  return s;
}

static size_t utf8_length(const char *s, const char *e) {
  size_t i = 0;
  while (s < e) {
    if ((*s & 0xFF) < 0xC0)
      ++s;
    else
      s = utf8_next(s, e);
    ++i;
  }
  return i;
}

static const char *utf8_index(const char *s, const char *e, int idx) {
  if (idx >= 0) {
    while (s < e && --idx > 0)
      s = utf8_next(s, e);
    return s;
  }
  else {
    while (s < e && idx++ < 0)
      e = utf8_prev(s, e);
    return e;
  }
}


/* Unicode character categories */

#include "unidata.h"

static int find_in_range(range_table *t, size_t size, unsigned ch) {
  size_t begin, end;

  begin = 0;
  end = size;

  while (begin < end) {
    int mid = (begin + end) / 2;
    if (t[mid].last < ch)
      begin = mid + 1;
    else if (t[mid].first > ch)
      end = mid;
    else 
      return (ch - t[mid].first) % t[mid].step == 0;
  }

  return 0;
}

static int convert_char(conv_table *t, size_t size, unsigned ch) {
  size_t begin, end;

  begin = 0;
  end = size;

  while (begin < end) {
    int mid = (begin + end) / 2;
    if (t[mid].last < ch)
      begin = mid + 1;
    else if (t[mid].first > ch)
      end = mid;
    else if ((ch - t[mid].first) % t[mid].step == 0)
      return ch + t[mid].offset;
    else
      return ch;
  }

  return ch;
}

#define table_size(t) (sizeof(t)/sizeof((t)[0]))

#define define_category(name) static int utf8_is##name(unsigned ch) \
{ return find_in_range(name##_table, table_size(name##_table), ch); }

#define define_converter(name) static unsigned utf8_##name(unsigned ch) \
{ return convert_char(name##_table, table_size(name##_table), ch); }

define_category(alpha)
define_category(lower)
define_category(upper)
define_category(cntrl)
define_category(digit)
define_category(xdigit)
define_category(punct)
define_category(space)
define_converter(tolower)
define_converter(toupper)
define_converter(totitle)
define_converter(tofold)

#undef define_category
#undef define_converter

static int utf8_isgraph(unsigned ch) {
  if (find_in_range(space_table, table_size(space_table), ch))
    return 0;
  if (find_in_range(graph_table, table_size(graph_table), ch))
    return 1;
  if (find_in_range(compose_table, table_size(compose_table), ch))
    return 1;
  return 0;
}

static int utf8_isalnum(unsigned ch) {
  if (find_in_range(alpha_table, table_size(alpha_table), ch))
    return 1;
  if (find_in_range(alnum_extend_table, table_size(alnum_extend_table), ch))
    return 1;
  return 0;
}

static int utf8_width(unsigned ch, int ambi_is_single) {
  if (find_in_range(doublewidth_table, table_size(doublewidth_table), ch))
    return 2;
  if (find_in_range(ambiwidth_table, table_size(ambiwidth_table), ch))
    return ambi_is_single ? 1 : 2;
  if (find_in_range(compose_table, table_size(compose_table), ch))
    return 0;
  if (find_in_range(unprintable_table, table_size(unprintable_table), ch))
    return 0;
  return 1;
}


/* string module compatible interface */

static const char *check_utf8(lua_State *L, int idx, const char **end) {
  size_t len;
  const char *s = luaL_checklstring(L, idx, &len);
  if (end) *end = s+len;
  return s;
}

static const char *to_utf8(lua_State *L, int idx, const char **end) {
  size_t len;
  const char *s = lua_tolstring(L, idx, &len);
  if (end) *end = s+len;
  return s;
}

static void add_utf8char(luaL_Buffer *b, unsigned ch) {
  char buff[UTF8_MAX];
  size_t n = utf8_encode(buff, ch);
  luaL_addlstring(b, buff, n);
}

static lua_Integer byterelat(lua_Integer pos, size_t len) {
  if (pos >= 0) return pos;
  else if (0u - (size_t)pos > len) return 0;
  else return (lua_Integer)len + pos + 1;
}

static int u_posrange(const char **ps, const char **pe,
    lua_Integer posi, lua_Integer posj) {
  const char *s = *ps, *e = *pe;
  *ps = utf8_index(s, e, posi);
  if (posj >= 0) {
    while (s < e && posj-- > 0)
      s = utf8_next(s, e);
    *pe = s;
  }
  else {
    while (s < e && ++posj < 0)
      e = utf8_prev(s, e);
    *pe = e;
  }
  return *ps < *pe;
}

static int Lutf8_len(lua_State *L) {
  size_t len;
  const char *s = luaL_checklstring(L, 1, &len);
  lua_Integer posi = byterelat(luaL_optinteger(L, 2, 1), len);
  lua_Integer posj = byterelat(luaL_optinteger(L, 3, -1), len);
  if (posi < 1 || --posi > (lua_Integer)len
      || --posj > (lua_Integer)len)
    return 0;
  lua_pushinteger(L, (lua_Integer)utf8_length(s+posi, s+posj+1));
  return 1;
}

static int Lutf8_sub(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  if (u_posrange(&s, &e,
        luaL_checkinteger(L, 2), luaL_optinteger(L, 3, -1)))
    lua_pushlstring(L, s, e-s);
  else
    lua_pushliteral(L, "");
  return 1;
}

static int Lutf8_reverse(lua_State *L) {
  luaL_Buffer b;
  /* XXX should handle compose unicode? */
  const char *e, *s = check_utf8(L, 1, &e);
  luaL_buffinit(L, &b);
  while (s < e) {
    const char *prev = utf8_prev(s, e);
    luaL_addlstring(&b, prev, e-prev);
    e = prev;
  }
  luaL_pushresult(&b);
  return 1;
}

static int convert(lua_State *L, unsigned (*conv)(unsigned)) {
  int t = lua_type(L, 1);
  if (t == LUA_TNUMBER)
    lua_pushinteger(L, conv(lua_tointeger(L, 1)));
  else if (t != LUA_TSTRING)
    return luaL_error(L, "number/string expected, got %s", luaL_typename(L, 1));
  else {
    luaL_Buffer b;
    const char *e, *s = to_utf8(L, 1, &e);
    luaL_buffinit(L, &b);
    while (s < e) {
      unsigned ch;
      s += utf8_decode(s, e, &ch);
      ch = conv(ch);
      add_utf8char(&b, ch);
    }
    luaL_pushresult(&b);
  }
  return 1;
}

static int Lutf8_lower(lua_State *L)
{ return convert(L, utf8_tolower); }

static int Lutf8_upper(lua_State *L)
{ return convert(L, utf8_toupper); }

static int Lutf8_title(lua_State *L)
{ return convert(L, utf8_totitle); }

static int Lutf8_fold(lua_State *L)
{ return convert(L, utf8_tofold); }

static int Lutf8_byte(lua_State *L) {
  size_t n = 0;
  const char *e, *s = check_utf8(L, 1, &e);
  lua_Integer posi = luaL_optinteger(L, 2, 1);
  lua_Integer posj = luaL_optinteger(L, 3, posi);
  if (u_posrange(&s, &e, posi, posj)) {
    luaL_checkstack(L, e-s, "string slice too long");
    while (s < e) {
      unsigned ch;
      s += utf8_decode(s, e, &ch);
      lua_pushinteger(L, ch);
      ++n;
    }
  }
  return n;
}

static int Lutf8_codepoint(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  size_t len = e-s;
  lua_Integer posi = byterelat(luaL_optinteger(L, 2, 1), len);
  lua_Integer pose = byterelat(luaL_optinteger(L, 3, posi), len);
  int n;
  const char *se;
  luaL_argcheck(L, posi >= 1, 2, "out of range");
  luaL_argcheck(L, pose <= (lua_Integer)len, 3, "out of range");
  if (posi > pose) return 0;  /* empty interval; return no values */
  n = (int)(pose -  posi + 1);
  if (posi + n <= pose)  /* (lua_Integer -> int) overflow? */
    return luaL_error(L, "string slice too long");
  luaL_checkstack(L, n, "string slice too long");
  n = 0;
  se = s + pose;
  for (s += posi - 1; s < se;) {
    unsigned code;
    s += utf8_decode(s, e, &code);
    lua_pushinteger(L, code);
    n++;
  }
  return n;
}

static int Lutf8_char(lua_State *L) {
  int i, n = lua_gettop(L); /* number of arguments */
  luaL_Buffer b;
  luaL_buffinit(L, &b);
  for (i = 1; i <= n; ++i) {
    unsigned ch = (unsigned)luaL_checkinteger(L, i);
    add_utf8char(&b, ch);
  }
  luaL_pushresult(&b);
  return 1;
}


/* unicode extra interface */

static const char *parse_escape(lua_State *L,
    const char *s, const char *e,
    int is_hex, unsigned *pch) {
  unsigned escape = 0, ch;
  int in_bracket = 0;
  if (*s == '{') ++s, in_bracket = 1;
  while (s < e) {
    ch = (unsigned char)*s;
    if (in_bracket && ch == '}') {
      ++s;
      break;
    }
    if (ch >= '0' && ch <= '9')
        ch = ch - '0';
    else if (is_hex && ch >= 'A' && ch <= 'F')
        ch = 10 + (ch - 'A');
    else if (is_hex && ch >= 'a' && ch <= 'f')
        ch = 10 + (ch - 'a');
    else {
      if (in_bracket)
        luaL_error(L, "invalid escape '%c'", ch);
      break;
    }
    escape *= is_hex ? 16 : 10;
    escape += ch;
    ++s;
  }
  *pch = escape;
  return s;
}

static int Lutf8_escape(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  luaL_Buffer b;
  luaL_buffinit(L, &b);
  while (s < e) {
    unsigned ch;
    s += utf8_decode(s, e, &ch);
    if (ch == '%') {
      int is_hex = 0;
      switch (*s) {
      case '0': case '1': case '2': case '3':
      case '4': case '5': case '6': case '7':
      case '8': case '9': case '{':
        break;
      case 'u': case 'U': ++s; break;
      case 'x': case 'X': ++s; is_hex = 1; break;
      default:
        s += utf8_decode(s, e, &ch);
        goto next;
      }
      if (s >= e)
        luaL_error(L, "invalid escape sequence");
      s = parse_escape(L, s, e, is_hex, &ch);
    }
next:
    add_utf8char(&b, ch);
  }
  luaL_pushresult(&b);
  return 1;
}

static int Lutf8_insert(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  size_t sublen;
  const char *subs;
  luaL_Buffer b;
  int nargs = 2;
  const char *first = e;
  if (lua_type(L, 2) == LUA_TNUMBER) {
    int idx = (int)lua_tointeger(L, 2);
    if (idx != 0) first = utf8_index(s, e, idx);
    ++nargs;
  }
  subs = luaL_checklstring(L, nargs, &sublen);
  luaL_buffinit(L, &b);
  luaL_addlstring(&b, s, first-s);
  luaL_addlstring(&b, subs, sublen);
  luaL_addlstring(&b, first, e-first);
  luaL_pushresult(&b);
  return 1;
}

static int Lutf8_remove(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  const char *start = s, *end = e;
  if (!u_posrange(&start, &end,
        luaL_checkinteger(L, 2), luaL_optinteger(L, 3, -1)))
    lua_settop(L, 1);
  else {
    luaL_Buffer b;
    luaL_buffinit(L, &b);
    luaL_addlstring(&b, s, start-s);
    luaL_addlstring(&b, end, e-end);
    luaL_pushresult(&b);
  }
  return 1;
}

static int push_offset(lua_State *L, const char *s, const char *e,
    const char *cur, lua_Integer offset) {
  unsigned ch;
  if (offset >= 0) {
    while (cur < e && offset-- > 0)
      cur = utf8_next(cur, e);
    if (offset >= 0) return 0;
  }
  else {
    while (s < cur && offset++ < 0)
      cur = utf8_prev(s, cur);
    if (offset < 0) return 0;
  }
  utf8_decode(cur, e, &ch);
  lua_pushinteger(L, cur-s+1);
  lua_pushinteger(L, ch);
  return 2;
}

static int Lutf8_charpos(lua_State *L) {
  size_t len;
  const char *s = luaL_checklstring(L, 1, &len);
  const char *cur = s;
  lua_Integer pos;
  if (lua_isnoneornil(L, 3)) {
      lua_Integer offset = luaL_optinteger(L, 2, 1);
      if (offset > 0) --offset;
      else if (offset < 0) cur = s+len;
      return push_offset(L, s, s+len, cur, offset);
  }
  pos = byterelat(luaL_optinteger(L, 2, 1), len);
  if (pos != 0) cur += pos-1;
  return push_offset(L, s, s+len, cur, luaL_checkinteger(L, 3));
}

static int Lutf8_offset(lua_State *L) {
  lua_settop(L, 3);
  lua_insert(L, -2);
  return Lutf8_charpos(L);
}

static int Lutf8_next(lua_State *L) {
  size_t len;
  const char *s = luaL_checklstring(L, 1, &len);
  const char *cur = s;
  lua_Integer offset = 0;
  lua_Integer pos = byterelat(luaL_optinteger(L, 2, 0), len);
  if (pos != 0) {
    cur += pos-1;
    offset = 1;
  }
  offset = luaL_optinteger(L, 3, offset);
  return push_offset(L, s, s+len, cur, offset);
}

static int Lutf8_codes(lua_State *L) {
  luaL_checkstring(L, 1);
  lua_pushcfunction(L, Lutf8_next);
  lua_pushvalue(L, 1);
  lua_pushinteger(L, 0);
  return 3;
}

static int Lutf8_width(lua_State *L) {
  int t = lua_type(L, 1);
  int ambi_is_single = !lua_toboolean(L, 2);
  int default_width = luaL_optinteger(L, 3, 0);
  if (t == LUA_TNUMBER) {
    size_t chwidth = utf8_width(lua_tointeger(L, 1), ambi_is_single);
    if (chwidth == 0) chwidth = default_width;
    lua_pushinteger(L, (lua_Integer)chwidth);
  }
  else if (t != LUA_TSTRING)
    return luaL_error(L, "number/string expected, got %s", luaL_typename(L, 1));
  else {
    const char *e, *s = to_utf8(L, 1, &e);
    int width = 0;
    while (s < e) {
      unsigned ch;
      int chwidth;
      s += utf8_decode(s, e, &ch);
      chwidth = utf8_width(ch, ambi_is_single);
      width += chwidth == 0 ? default_width : chwidth;
    }
    lua_pushinteger(L, (lua_Integer)width);
  }
  return 1;
}

static int Lutf8_widthindex(lua_State *L) {
  const char *e, *s = check_utf8(L, 1, &e);
  int width = luaL_checkinteger(L, 2);
  int ambi_is_single = !lua_toboolean(L, 3);
  int default_width = luaL_optinteger(L, 4, 0);
  size_t idx = 1;
  while (s < e) {
    unsigned ch;
    size_t chwidth;
    s += utf8_decode(s, e, &ch);
    chwidth = utf8_width(ch, ambi_is_single);
    if (chwidth == 0) chwidth = default_width;
    width -= chwidth;
    if (width <= 0) {
      lua_pushinteger(L, idx);
      lua_pushinteger(L, width + chwidth);
      lua_pushinteger(L, chwidth);
      return 3;
    }
    ++idx;
  }
  lua_pushinteger(L, (lua_Integer)idx);
  return 1;
}

static int Lutf8_ncasecmp(lua_State *L) {
  const char *e1, *s1 = check_utf8(L, 1, &e1);
  const char *e2, *s2 = check_utf8(L, 2, &e2);
  while (s1 < e1 || s2 < e2) {
    unsigned ch1 = 0, ch2 = 0;
    if (s1 == e1)
      ch2 = 1;
    else if (s2 == e2)
      ch1 = 1;
    else {
      s1 += utf8_decode(s1, e1, &ch1);
      s2 += utf8_decode(s2, e2, &ch2);
      ch1 = utf8_tofold(ch1);
      ch2 = utf8_tofold(ch2);
    }
    if (ch1 != ch2) {
      lua_pushinteger(L, ch1 > ch2 ? 1 : -1);
      return 1;
    }
  }
  lua_pushinteger(L, 0);
  return 1;
}


/* utf8 pattern matching implement */

#ifndef   LUA_MAXCAPTURES
# define  LUA_MAXCAPTURES  32
#endif /* LUA_MAXCAPTURES */

#define CAP_UNFINISHED (-1)
#define CAP_POSITION   (-2)


typedef struct MatchState {
  int matchdepth;  /* control for recursive depth (to avoid C stack overflow) */
  const char *src_init;  /* init of source string */
  const char *src_end;  /* end ('\0') of source string */
  const char *p_end;  /* end ('\0') of pattern */
  lua_State *L;
  int level;  /* total number of captures (finished or unfinished) */
  struct {
    const char *init;
    ptrdiff_t len;
  } capture[LUA_MAXCAPTURES];
} MatchState;

/* recursive function */
static const char *match (MatchState *ms, const char *s, const char *p);

/* maximum recursion depth for 'match' */
#if !defined(MAXCCALLS)
#define MAXCCALLS	200
#endif

#define L_ESC		'%'
#define SPECIALS	"^$*+?.([%-"

static int check_capture (MatchState *ms, int l) {
  l -= '1';
  if (l < 0 || l >= ms->level || ms->capture[l].len == CAP_UNFINISHED)
    return luaL_error(ms->L, "invalid capture index %%%d", l + 1);
  return l;
}

static int capture_to_close (MatchState *ms) {
  int level = ms->level;
  for (level--; level>=0; level--)
    if (ms->capture[level].len == CAP_UNFINISHED) return level;
  return luaL_error(ms->L, "invalid pattern capture");
}

static const char *classend (MatchState *ms, const char *p) {
  unsigned ch;
  p += utf8_decode(p, ms->p_end, &ch);
  switch (ch) {
    case L_ESC: {
      if (p == ms->p_end)
        luaL_error(ms->L, "malformed pattern (ends with " LUA_QL("%%") ")");
      return utf8_next(p, ms->p_end);
    }
    case '[': {
      if (*p == '^') p++;
      do {  /* look for a `]' */
        if (p == ms->p_end)
          luaL_error(ms->L, "malformed pattern (missing " LUA_QL("]") ")");
        if (*(p++) == L_ESC && p < ms->p_end)
          p++;  /* skip escapes (e.g. `%]') */
      } while (*p != ']');
      return p+1;
    }
    default: {
      return p;
    }
  }
}

static int match_class (unsigned c, unsigned cl) {
  int res;
  switch (utf8_tolower(cl)) {
    case 'a' : res = utf8_isalpha(c); break;
    case 'c' : res = utf8_iscntrl(c); break;
    case 'd' : res = utf8_isdigit(c); break;
    case 'g' : res = utf8_isgraph(c); break;
    case 'l' : res = utf8_islower(c); break;
    case 'p' : res = utf8_ispunct(c); break;
    case 's' : res = utf8_isspace(c); break;
    case 'u' : res = utf8_isupper(c); break;
    case 'w' : res = utf8_isalnum(c); break;
    case 'x' : res = utf8_isxdigit(c); break;
    case 'z' : res = (c == 0); break;  /* deprecated option */
    default: return (cl == c);
  }
  return (utf8_islower(cl) ? res : !res);
}

static int matchbracketclass (unsigned c, const char *p, const char *ec) {
  int sig = 1;
  assert(*p == '[');
  if (*++p == '^') {
    sig = 0;
    p++;  /* skip the `^' */
  }
  while (p < ec) {
    unsigned ch;
    p += utf8_decode(p, ec, &ch);
    if (ch == L_ESC) {
      p += utf8_decode(p, ec, &ch);
      if (match_class(c, ch))
        return sig;
    }
    else {
      unsigned next;
      const char *np = p + utf8_decode(p, ec, &next);
      if (next == '-' && np < ec) {
        p = np + utf8_decode(np, ec, &next);
        if (ch <= c && c <= next)
          return sig;
      }
      else if (ch == c) return sig;
    }
  }
  return !sig;
}

static int singlematch (MatchState *ms, const char *s, const char *p,
                        const char *ep) {
  if (s >= ms->src_end)
    return 0;
  else {
    unsigned ch, pch;
    utf8_decode(s, ms->src_end, &ch);
    p += utf8_decode(p, ms->p_end, &pch);
    switch (pch) {
      case '.': return 1;  /* matches any char */
      case L_ESC: utf8_decode(p, ms->p_end, &pch);
                  return match_class(ch, pch);
      case '[': return matchbracketclass(ch, p-1, ep-1);
      default:  return pch == ch;
    }
  }
}

static const char *matchbalance (MatchState *ms, const char *s,
                                   const char **p) {
  unsigned ch, begin, end;
  *p += utf8_decode(*p, ms->p_end, &begin);
  if (*p >= ms->p_end)
    luaL_error(ms->L, "malformed pattern "
                      "(missing arguments to " LUA_QL("%%b") ")");
  *p += utf8_decode(*p, ms->p_end, &end);
  s += utf8_decode(s, ms->src_end, &ch);
  if (ch != begin) return NULL;
  else {
    int cont = 1;
    while (s < ms->src_end) {
      s += utf8_decode(s, ms->src_end, &ch);
      if (ch == end) {
        if (--cont == 0) return s;
      }
      else if (ch == begin) cont++;
    }
  }
  return NULL;  /* string ends out of balance */
}

static const char *max_expand (MatchState *ms, const char *s,
                                 const char *p, const char *ep) {
  const char *m = s; /* matched end of single match p */
  while (singlematch(ms, m, p, ep))
    m = utf8_next(m, ms->src_end);
  /* keeps trying to match with the maximum repetitions */
  while (s <= m) {
    const char *res = match(ms, m, ep+1);
    if (res) return res;
    /* else didn't match; reduce 1 repetition to try again */
    if (s == m) break;
    m = utf8_prev(s, m);
  }
  return NULL;
}

static const char *min_expand (MatchState *ms, const char *s,
                                 const char *p, const char *ep) {
  for (;;) {
    const char *res = match(ms, s, ep+1);
    if (res != NULL)
      return res;
    else if (singlematch(ms, s, p, ep))
      s = utf8_next(s, ms->src_end);  /* try with one more repetition */
    else return NULL;
  }
}

static const char *start_capture (MatchState *ms, const char *s,
                                    const char *p, int what) {
  const char *res;
  int level = ms->level;
  if (level >= LUA_MAXCAPTURES) luaL_error(ms->L, "too many captures");
  ms->capture[level].init = s;
  ms->capture[level].len = what;
  ms->level = level+1;
  if ((res=match(ms, s, p)) == NULL)  /* match failed? */
    ms->level--;  /* undo capture */
  return res;
}

static const char *end_capture (MatchState *ms, const char *s,
                                  const char *p) {
  int l = capture_to_close(ms);
  const char *res;
  ms->capture[l].len = s - ms->capture[l].init;  /* close capture */
  if ((res = match(ms, s, p)) == NULL)  /* match failed? */
    ms->capture[l].len = CAP_UNFINISHED;  /* undo capture */
  return res;
}

static const char *match_capture (MatchState *ms, const char *s, int l) {
  size_t len;
  l = check_capture(ms, l);
  len = ms->capture[l].len;
  if ((size_t)(ms->src_end-s) >= len &&
      memcmp(ms->capture[l].init, s, len) == 0)
    return s+len;
  else return NULL;
}

static const char *match (MatchState *ms, const char *s, const char *p) {
  if (ms->matchdepth-- == 0)
    luaL_error(ms->L, "pattern too complex");
  init: /* using goto's to optimize tail recursion */
  if (p != ms->p_end) {  /* end of pattern? */
    unsigned ch;
    utf8_decode(p, ms->p_end, &ch);
    switch (ch) {
      case '(': {  /* start capture */
        if (*(p + 1) == ')')  /* position capture? */
          s = start_capture(ms, s, p + 2, CAP_POSITION);
        else
          s = start_capture(ms, s, p + 1, CAP_UNFINISHED);
        break;
      }
      case ')': {  /* end capture */
        s = end_capture(ms, s, p + 1);
        break;
      }
      case '$': {
        if ((p + 1) != ms->p_end)  /* is the `$' the last char in pattern? */
          goto dflt;  /* no; go to default */
        s = (s == ms->src_end) ? s : NULL;  /* check end of string */
        break;
      }
      case L_ESC: {  /* escaped sequence not in the format class[*+?-]? */
        const char *prev_p = p;
        p += utf8_decode(p+1, ms->p_end, &ch) + 1;
        switch (ch) {
          case 'b': {  /* balanced string? */
            s = matchbalance(ms, s, &p);
            if (s != NULL)
              goto init;  /* return match(ms, s, p + 4); */
            /* else fail (s == NULL) */
            break;
          }
          case 'f': {  /* frontier? */
            const char *ep; unsigned previous = 0, current = 0;
            if (*p != '[')
              luaL_error(ms->L, "missing " LUA_QL("[") " after "
                                 LUA_QL("%%f") " in pattern");
            ep = classend(ms, p);  /* points to what is next */
            if (s != ms->src_init)
              utf8_decode(utf8_prev(ms->src_init, s), ms->src_end, &previous);
            if (s != ms->src_end)
              utf8_decode(s, ms->src_end, &current);
            if (!matchbracketclass(previous, p, ep - 1) &&
                 matchbracketclass(current, p, ep - 1)) {
              p = ep; goto init;  /* return match(ms, s, ep); */
            }
            s = NULL;  /* match failed */
            break;
          }
          case '0': case '1': case '2': case '3':
          case '4': case '5': case '6': case '7':
          case '8': case '9': {  /* capture results (%0-%9)? */
            s = match_capture(ms, s, ch);
            if (s != NULL) goto init;  /* return match(ms, s, p + 2) */
            break;
          }
          default: p = prev_p; goto dflt;
        }
        break;
      }
      default: dflt: {  /* pattern class plus optional suffix */
        const char *ep = classend(ms, p);  /* points to optional suffix */
        /* does not match at least once? */
        if (!singlematch(ms, s, p, ep)) {
          if (*ep == '*' || *ep == '?' || *ep == '-') {  /* accept empty? */
            p = ep + 1; goto init;  /* return match(ms, s, ep + 1); */
          }
          else  /* '+' or no suffix */
            s = NULL;  /* fail */
        }
        else {  /* matched once */
          const char *next_s = utf8_next(s, ms->src_end);
          switch (*ep) {  /* handle optional suffix */
            case '?': {  /* optional */
              const char *res;
              const char *next_ep = utf8_next(ep, ms->p_end);
              if ((res = match(ms, next_s, next_ep)) != NULL)
                s = res;
              else {
                p = next_ep; goto init;  /* else return match(ms, s, ep + 1); */
              }
              break;
            }
            case '+':  /* 1 or more repetitions */
              s = next_s;  /* 1 match already done */
              /* go through */
            case '*':  /* 0 or more repetitions */
              s = max_expand(ms, s, p, ep);
              break;
            case '-':  /* 0 or more repetitions (minimum) */
              s = min_expand(ms, s, p, ep);
              break;
            default:  /* no suffix */
              s = next_s; p = ep; goto init;  /* return match(ms, s + 1, ep); */
          }
        }
        break;
      }
    }
  }
  ms->matchdepth++;
  return s;
}

static const char *lmemfind (const char *s1, size_t l1,
                               const char *s2, size_t l2) {
  if (l2 == 0) return s1;  /* empty strings are everywhere */
  else if (l2 > l1) return NULL;  /* avoids a negative `l1' */
  else {
    const char *init;  /* to search for a `*s2' inside `s1' */
    l2--;  /* 1st char will be checked by `memchr' */
    l1 = l1-l2;  /* `s2' cannot be found after that */
    while (l1 > 0 && (init = (const char *)memchr(s1, *s2, l1)) != NULL) {
      init++;   /* 1st char is already checked */
      if (memcmp(init, s2+1, l2) == 0)
        return init-1;
      else {  /* correct `l1' and `s1' to try again */
        l1 -= init-s1;
        s1 = init;
      }
    }
    return NULL;  /* not found */
  }
}

static const char *get_index(const char *p, const char *s, const char *e, int *pidx) {
    int idx = 0;
    while (s < e) {
        if (s == p)
            break;
        else if (s > p) {
            --idx;
            break;
        }
        s = utf8_next(s, e);
        ++idx;
    }
    if (pidx) *pidx = idx;
    return s;
}

static void push_onecapture (MatchState *ms, int i, const char *s,
                                                    const char *e) {
  if (i >= ms->level) {
    if (i == 0)  /* ms->level == 0, too */
      lua_pushlstring(ms->L, s, e - s);  /* add whole match */
    else
      luaL_error(ms->L, "invalid capture index");
  }
  else {
    ptrdiff_t l = ms->capture[i].len;
    if (l == CAP_UNFINISHED) luaL_error(ms->L, "unfinished capture");
    if (l == CAP_POSITION) {
      int idx;
      get_index(ms->capture[i].init, ms->src_init, ms->src_end, &idx);
      lua_pushinteger(ms->L, idx+1);
    } else
      lua_pushlstring(ms->L, ms->capture[i].init, l);
  }
}

static int push_captures (MatchState *ms, const char *s, const char *e) {
  int i;
  int nlevels = (ms->level == 0 && s) ? 1 : ms->level;
  luaL_checkstack(ms->L, nlevels, "too many captures");
  for (i = 0; i < nlevels; i++)
    push_onecapture(ms, i, s, e);
  return nlevels;  /* number of strings pushed */
}

/* check whether pattern has no special characters */
static int nospecials (const char *p, const char * ep) {
  while (p < ep) {
    if (strpbrk(p, SPECIALS))
      return 0;  /* pattern has a special character */
    p += strlen(p) + 1;  /* may have more after \0 */
  }
  return 1;  /* no special chars found */
}


/* utf8 pattern matching interface */

static int find_aux (lua_State *L, int find) {
  const char *es, *s = check_utf8(L, 1, &es);
  const char *ep, *p = check_utf8(L, 2, &ep);
  lua_Integer idx = luaL_optinteger(L, 3, 1);
  const char *init;
  size_t slen = utf8_length(s, es);
  if (idx > 0 && idx > (lua_Integer)slen + 1) { /* start after string's end? */
    lua_pushnil(L);  /* cannot find anything */
    return 1;
  }
  if (idx < 0) idx += utf8_length(s, es) + 1;
  init = utf8_index(s, es, idx);
  /* explicit request or no special characters? */
  if (find && (lua_toboolean(L, 4) || nospecials(p, ep))) {
    /* do a plain search */
    do {
      const char *s2 = lmemfind(init, es-init, p, ep-p);
      if (!s2) break;
      else {
        int relidx;
        const char *pch = get_index(s2, init, es, &relidx);
        if (pch == s2) {
          lua_pushinteger(L, idx + relidx);
          lua_pushinteger(L, idx + relidx + utf8_length(p, ep) - 1);
          return 2;
        }
        idx += relidx + 1;
        init = utf8_next(pch, es);
      }
    } while (init < es);
  }
  else {
    MatchState ms;
    int anchor = (*p == '^');
    if (anchor) p++;  /* skip anchor character */
    ms.L = L;
    ms.matchdepth = MAXCCALLS;
    ms.src_init = s;
    ms.src_end = es;
    ms.p_end = ep;
    do {
      const char *res;
      ms.level = 0;
      assert(ms.matchdepth == MAXCCALLS);
      if ((res=match(&ms, init, p)) != NULL) {
        if (find) {
          lua_pushinteger(L, idx);  /* start */
          lua_pushinteger(L, idx + utf8_length(init, res) - 1);   /* end */
          return push_captures(&ms, NULL, 0) + 2;
        }
        else
          return push_captures(&ms, init, res);
      }
      if (init == es) break;
      idx += 1;
      init = utf8_next(init, es);
    } while (init <= es && !anchor);
  }
  lua_pushnil(L);  /* not found */
  return 1;
}

static int Lutf8_find(lua_State *L)
{ return find_aux(L, 1); }

static int Lutf8_match(lua_State *L)
{ return find_aux(L, 0); }

static int gmatch_aux (lua_State *L) {
  MatchState ms;
  const char *es, *s = check_utf8(L, lua_upvalueindex(1), &es);
  const char *ep, *p = check_utf8(L, lua_upvalueindex(2), &ep);
  const char *src;
  ms.L = L;
  ms.matchdepth = MAXCCALLS;
  ms.src_init = s;
  ms.src_end = es;
  ms.p_end = ep;
  for (src = s + (size_t)lua_tointeger(L, lua_upvalueindex(3));
       src <= ms.src_end;
       src = utf8_next(src, ms.src_end)) {
    const char *e;
    ms.level = 0;
    assert(ms.matchdepth == MAXCCALLS);
    if ((e = match(&ms, src, p)) != NULL) {
      lua_Integer newstart = e-s;
      if (e == src) newstart++;  /* empty match? go at least one position */
      lua_pushinteger(L, newstart);
      lua_replace(L, lua_upvalueindex(3));
      return push_captures(&ms, src, e);
    }
    if (src == ms.src_end) break;
  }
  return 0;  /* not found */
}

static int Lutf8_gmatch(lua_State *L) {
  luaL_checkstring(L, 1);
  luaL_checkstring(L, 2);
  lua_settop(L, 2);
  lua_pushinteger(L, 0);
  lua_pushcclosure(L, gmatch_aux, 3);
  return 1;
}

static void add_s (MatchState *ms, luaL_Buffer *b, const char *s,
                                                   const char *e) {
  const char *new_end, *news = to_utf8(ms->L, 3, &new_end);
  while (news < new_end) {
    unsigned ch;
    news += utf8_decode(news, new_end, &ch);
    if (ch != L_ESC)
      add_utf8char(b, ch);
    else {
      news += utf8_decode(news, new_end, &ch); /* skip ESC */
      if (!utf8_isdigit(ch)) {
        if (ch != L_ESC)
          luaL_error(ms->L, "invalid use of " LUA_QL("%c")
              " in replacement string", L_ESC);
        add_utf8char(b, ch);
      }
      else if (ch == '0')
        luaL_addlstring(b, s, e-s);
      else {
        push_onecapture(ms, ch-'1', s, e);
        luaL_addvalue(b);  /* add capture to accumulated result */
      }
    }
  }
}

static void add_value (MatchState *ms, luaL_Buffer *b, const char *s,
                                       const char *e, int tr) {
  lua_State *L = ms->L;
  switch (tr) {
    case LUA_TFUNCTION: {
      int n;
      lua_pushvalue(L, 3);
      n = push_captures(ms, s, e);
      lua_call(L, n, 1);
      break;
    }
    case LUA_TTABLE: {
      push_onecapture(ms, 0, s, e);
      lua_gettable(L, 3);
      break;
    }
    default: {  /* LUA_TNUMBER or LUA_TSTRING */
      add_s(ms, b, s, e);
      return;
    }
  }
  if (!lua_toboolean(L, -1)) {  /* nil or false? */
    lua_pop(L, 1);
    lua_pushlstring(L, s, e - s);  /* keep original text */
  }
  else if (!lua_isstring(L, -1))
    luaL_error(L, "invalid replacement value (a %s)", luaL_typename(L, -1));
  luaL_addvalue(b);  /* add result to accumulator */
}

static int Lutf8_gsub(lua_State *L) {
  const char *es, *s = check_utf8(L, 1, &es);
  const char *ep, *p = check_utf8(L, 2, &ep);
  int tr = lua_type(L, 3);
  lua_Integer max_s = luaL_optinteger(L, 4, (es-s)+1);
  int anchor = (*p == '^');
  lua_Integer n = 0;
  MatchState ms;
  luaL_Buffer b;
  luaL_argcheck(L, tr == LUA_TNUMBER || tr == LUA_TSTRING ||
                   tr == LUA_TFUNCTION || tr == LUA_TTABLE, 3,
                      "string/function/table expected");
  luaL_buffinit(L, &b);
  if (anchor) p++;  /* skip anchor character */
  ms.L = L;
  ms.matchdepth = MAXCCALLS;
  ms.src_init = s;
  ms.src_end = es;
  ms.p_end = ep;
  while (n < max_s) {
    const char *e;
    ms.level = 0;
    assert(ms.matchdepth == MAXCCALLS);
    e = match(&ms, s, p);
    if (e) {
      n++;
      add_value(&ms, &b, s, e, tr);
    }
    if (e && e > s) /* non empty match? */
      s = e;  /* skip it */
    else if (s < es) {
      unsigned ch;
      s += utf8_decode(s, es, &ch);
      add_utf8char(&b, ch);
    }
    else break;
    if (anchor) break;
  }
  luaL_addlstring(&b, s, es-s);
  luaL_pushresult(&b);
  lua_pushinteger(L, n);  /* number of substitutions */
  return 2;
}


/* lua module import interface */

#define UTF8PATT	"[\0-\x7F\xC2-\xF4][\x80-\xBF]*"

LUALIB_API int luaopen_utf8(lua_State *L) {
  luaL_Reg libs[] = {
#define ENTRY(name) { #name, Lutf8_##name }
    ENTRY(offset),
    ENTRY(codes),
    ENTRY(codepoint),

    ENTRY(len),
    ENTRY(sub),
    ENTRY(reverse),
    ENTRY(lower),
    ENTRY(upper),
    ENTRY(title),
    ENTRY(fold),
    ENTRY(byte),
    ENTRY(char),
    ENTRY(escape),
    ENTRY(insert),
    ENTRY(remove),
    ENTRY(charpos),
    ENTRY(next),
    ENTRY(width),
    ENTRY(widthindex),
    ENTRY(ncasecmp),
    ENTRY(find),
    ENTRY(gmatch),
    ENTRY(gsub),
    ENTRY(match),
#undef  ENTRY
    { NULL, NULL }
  };

#if LUA_VERSION_NUM >= 502
  luaL_newlib(L, libs);
#else
  lua_createtable(L, 0, sizeof(libs)/sizeof(libs[0]));
  luaL_register(L, NULL, libs);
#endif

  lua_pushliteral(L, UTF8PATT);
  lua_setfield(L, -2, "charpattern");

  return 1;
}
/* cc: flags+='-Wall -Wextra -s -O2 -mdll -DLUA_BUILD_AS_DLL'
 * cc: libs+='-llua53.dll' output='lua-utf8.dll'
 * cc: run='lua.exe test.lua' */
