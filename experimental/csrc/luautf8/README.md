UTF-8 module for Lua 5.x
========================

This module adds UTF-8 support to Lua.

It use data extracted from
[Unicode Character Database](http://www.unicode.org/reports/tr44/),
and tested on Lua 5.2.3, Lua 5.3.0 and LuaJIT.

parseucd.lua is a pure Lua script generate unidata.h, to support convert
characters and check characters' category.

It mainly used to compatible with Lua's own string module, it passed all
string and pattern matching test in lua test suite[2].

It also add some useful routines against UTF-8 features, some like:
- a convenient interface to escape Unicode sequence in string. 
- string insert/remove, since UTF-8 substring extract may expensive.
- calculate Unicode width, useful when implement e.g. console emulator.
- a useful interface to translate Unicode offset and byte offset.

Note that to avoid conflict with the Lua5.3's buitin library 'utf8',
this library produce a file like lua-utf8.dll or lua-utf8.so. so use
it like this:

```lua
local utf8 = require 'lua-utf8'
```

in your codes :-(

[2]: http://www.lua.org/tests/5.2/


LuaRocks Installation
---------------------
`luarocks install luautf8`

It's now full-compatible with Lua5.3's utf8 library, so replace this
file (and headers) with lua5.3 source's lutf8lib.c is also okay.

Usage
-----

Many routines are same as Lua's string module:
- `utf8.byte`
- `utf8.char`
- `utf8.find`
- `utf8.gmatch`
- `utf8.gsub`
- `utf8.len`
- `utf8.lower`
- `utf8.match`
- `utf8.reverse`
- `utf8.sub`
- `utf8.upper`

The document of these functions can be find in Lua manual[3].

[3]: http://www.lua.org/manual/5.2/manual.html#6.4


Some routines in string module needn't support Unicode:
- `string.dump`
- `string.format`
- `string.rep`

They are NOT in utf8 module.

Some routines are the compatible for Lua 5.3's basic UTF-8 support
library:
- `utf8.offset`
- `utf8.codepoint`
- `utf8.codes`

See Lua5.3's manual to get usage.

Some routines are new, with some Unicode-spec functions:

###utf8.escape(str) -> utf8 string
escape a str to UTF-8 format string. It support several escape format:

%ddd - which ddd is a decimal number at any length:
       change Unicode code point to UTF-8 format.
%{ddd} - same as %nnn but has bracket around.
%uddd - same as %ddd, u stands Unicode
%u{ddd} - same as %{ddd}
%xhhh - hexadigit version of %ddd
%x{hhh} same as %xhhh.
%? - '?' stands for any other character: escape this character.

####Examples:
```
local u = utf8.escape
print(u"%123%u123%{123}%u{123}%xABC%x{ABC}")
print(u"%%123%?%d%%u")
```

###utf8.charpos(s[[, charpos], offset]) -> charpos, code point
convert UTF-8 position to byte offset.
if only offset is given, return byte offset of this UTF-8 char index.
if charpos and offset is given, a new charpos will calculate, by
add/subtract UTF-8 char offset to current charpos.
in all case, it return a new char position, and code point (a number) at
this position.

###utf8.next(s[, charpos[, offset]]) -> charpos, code point
iterate though the UTF-8 string s.
If only s is given, it can used as a iterator:
```lua
for pos, code in utf8.next, "utf8-string" do
   -- ...
end
```
if only charpos is given, return the next byte offset of in string.
if charpos and offset is given, a new charpos will calculate, by
add/subtract UTF-8 char offset to current charpos.
in all case, it return a new char position (in bytes), and code point
(a number) at this position.

###utf8.insert(s[, idx], substring) -> new_string
insert a substring to s. If idx is given, insert substring before char at
this index, otherwise substring will concat to s. idx can be negative.


###utf8.remove(s[, start[, stop]]) -> new_string
delete a substring in s. If neither start nor stop is given, delete the
last UTF-8 char in s, otherwise delete char from start to end of s. if
stop is given, delete char from start to stop (include start and stop).
start and stop can be negative.


###utf8.width(s[, ambi_is_double[, default_width]]) -> width
calculate the width of UTF-8 string s. if ambi_is_double is given, the
ambiguous width character's width is 2, otherwise it's 1.
fullwidth/doublewidth character's width is 2, and other character's width
is 1.
if default_width is given, it will be the width of unprintable character,
used display a non-character mark for these characters.
if s is a code point, return the width of this code point.


###utf8.widthindex(s, location[, ambi_is_double[, default_width]]) -> idx, offset, width
return the character index at given location in string s. this is a
reverse operation of utf8.width().
this function return a index of location, and a offset in in UTF-8
encoding. e.g. if cursor is at the second column (middle) of the wide
char, offset will be 2. the width of character at idx is returned, also.


###utf8.title(s) -> new_string
###utf8.fold(s) -> new_string
convert UTF-8 string s to title-case, or folded case used to compare by
ignore case.
if s is a number, it's treat as a code point and return a convert code
point (number). utf8.lower/utf8.upper has the same extension.


###utf8.ncasecmp(a, b) -> [-1,0,1]
compare a and b without case, -1 means a < b, 0 means a == b and 1 means a > b.


Improvement needed
------------------

- add Lua 5.3 spec test-suite.
- more test case.
- grapheme-compose support, and affect in utf8.reverse and utf8.width
- Unicode normalize algorithm implement.


License
-------
It use same license with Lua: http://www.lua.org/license.html
