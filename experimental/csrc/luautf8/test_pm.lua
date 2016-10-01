local utf8 = require 'lua-utf8'

print('testing pattern matching')

function f(s, p)
  local i,e = utf8.find(s, p)
  if i then return utf8.sub(s, i, e) end
end

function f1(s, p)
  p = utf8.gsub(p, "%%([0-9])", function (s) return "%" .. (tonumber(s)+1) end)
  p = utf8.gsub(p, "^(^?)", "%1()", 1)
  p = utf8.gsub(p, "($?)$", "()%1", 1)
  local t = {utf8.match(s, p)}
  return utf8.sub(s, t[1], t[#t] - 1)
end

a,b = utf8.find('', '')    -- empty patterns are tricky
assert(a == 1 and b == 0);
a,b = utf8.find('alo', '')
assert(a == 1 and b == 0)
a,b = utf8.find('a\0o a\0o a\0o', 'a', 1)   -- first position
assert(a == 1 and b == 1)
a,b = utf8.find('a\0o a\0o a\0o', 'a\0o', 2)   -- starts in the midle
assert(a == 5 and b == 7)
a,b = utf8.find('a\0o a\0o a\0o', 'a\0o', 9)   -- starts in the midle
assert(a == 9 and b == 11)
a,b = utf8.find('a\0a\0a\0a\0\0ab', '\0ab', 2);  -- finds at the end
assert(a == 9 and b == 11);
a,b = utf8.find('a\0a\0a\0a\0\0ab', 'b')    -- last position
assert(a == 11 and b == 11)
assert(utf8.find('a\0a\0a\0a\0\0ab', 'b\0') == nil)   -- check ending
assert(utf8.find('', '\0') == nil)
assert(utf8.find('alo123alo', '12') == 4)
assert(utf8.find('alo123alo', '^12') == nil)

assert(utf8.match("aaab", ".*b") == "aaab")
assert(utf8.match("aaa", ".*a") == "aaa")
assert(utf8.match("b", ".*b") == "b")

assert(utf8.match("aaab", ".+b") == "aaab")
assert(utf8.match("aaa", ".+a") == "aaa")
assert(not utf8.match("b", ".+b"))

assert(utf8.match("aaab", ".?b") == "ab")
assert(utf8.match("aaa", ".?a") == "aa")
assert(utf8.match("b", ".?b") == "b")

assert(f('aloALO', '%l*') == 'alo')
assert(f('aLo_ALO', '%a*') == 'aLo')

assert(f("  \n\r*&\n\r   xuxu  \n\n", "%g%g%g+") == "xuxu")

assert(f('aaab', 'a*') == 'aaa');
assert(f('aaa', '^.*$') == 'aaa');
assert(f('aaa', 'b*') == '');
assert(f('aaa', 'ab*a') == 'aa')
assert(f('aba', 'ab*a') == 'aba')
assert(f('aaab', 'a+') == 'aaa')
assert(f('aaa', '^.+$') == 'aaa')
assert(f('aaa', 'b+') == nil)
assert(f('aaa', 'ab+a') == nil)
assert(f('aba', 'ab+a') == 'aba')
assert(f('a$a', '.$') == 'a')
assert(f('a$a', '.%$') == 'a$')
assert(f('a$a', '.$.') == 'a$a')
assert(f('a$a', '$$') == nil)
assert(f('a$b', 'a$') == nil)
assert(f('a$a', '$') == '')
assert(f('', 'b*') == '')
assert(f('aaa', 'bb*') == nil)
assert(f('aaab', 'a-') == '')
assert(f('aaa', '^.-$') == 'aaa')
assert(f('aabaaabaaabaaaba', 'b.*b') == 'baaabaaabaaab')
assert(f('aabaaabaaabaaaba', 'b.-b') == 'baaab')
assert(f('alo xo', '.o$') == 'xo')
assert(f(' \n isto é assim', '%S%S*') == 'isto')
assert(f(' \n isto é assim', '%S*$') == 'assim')
assert(f(' \n isto é assim', '[a-z]*$') == 'assim')
assert(f('um caracter ? extra', '[^%sa-z]') == '?')
assert(f('', 'a?') == '')
assert(f('á', 'á?') == 'á')
assert(f('ábl', 'á?b?l?') == 'ábl')
assert(f('  ábl', 'á?b?l?') == '')
assert(f('aa', '^aa?a?a') == 'aa')
assert(f(']]]áb', '[^]]') == 'á')
assert(f("0alo alo", "%x*") == "0a")
assert(f("alo alo", "%C+") == "alo alo")
print('+')

assert(f1('alo alx 123 b\0o b\0o', '(..*) %1') == "b\0o b\0o")
assert(f1('axz123= 4= 4 34', '(.+)=(.*)=%2 %1') == '3= 4= 4 3')
assert(f1('=======', '^(=*)=%1$') == '=======')
assert(utf8.match('==========', '^([=]*)=%1$') == nil)

local function range (i, j)
  if i <= j then
    return i, range(i+1, j)
  end
end

local abc = utf8.char(range(0, 255));

assert(utf8.len(abc) == 256)

function strset (p)
  local res = {s=''}
  utf8.gsub(abc, p, function (c) res.s = res.s .. c end)
  return res.s
end;

assert(utf8.len(strset('[\200-\210]')) == 11)

assert(strset('[a-z]') == "abcdefghijklmnopqrstuvwxyz")
assert(strset('[a-z%d]') == strset('[%da-uu-z]'))
assert(strset('[a-]') == "-a")
assert(strset('[^%W]') == strset('[%w]'))
assert(strset('[]%%]') == '%]')
assert(strset('[a%-z]') == '-az')
assert(strset('[%^%[%-a%]%-b]') == '-[]^ab')
assert(strset('%Z') == strset('[\1-\255]'))
assert(strset('.') == strset('[\1-\255%z]'))
print('+');

assert(utf8.match("alo xyzK", "(%w+)K") == "xyz")
assert(utf8.match("254 K", "(%d*)K") == "")
assert(utf8.match("alo ", "(%w*)$") == "")
assert(utf8.match("alo ", "(%w+)$") == nil)
assert(utf8.find("(álo)", "%(á") == 1)
local a, b, c, d, e = utf8.match("âlo alo", "^(((.).).* (%w*))$")
assert(a == 'âlo alo' and b == 'âl' and c == 'â' and d == 'alo' and e == nil)
a, b, c, d  = utf8.match('0123456789', '(.+(.?)())')
assert(a == '0123456789' and b == '' and c == 11 and d == nil)
print('+')

assert(utf8.gsub('ülo ülo', 'ü', 'x') == 'xlo xlo')
assert(utf8.gsub('alo úlo  ', ' +$', '') == 'alo úlo')  -- trim
assert(utf8.gsub('  alo alo  ', '^%s*(.-)%s*$', '%1') == 'alo alo')  -- double trim
assert(utf8.gsub('alo  alo  \n 123\n ', '%s+', ' ') == 'alo alo 123 ')
t = "abç d"
a, b = utf8.gsub(t, '(.)', '%1@')
assert('@'..a == utf8.gsub(t, '', '@') and b == 5)
a, b = utf8.gsub('abçd', '(.)', '%0@', 2)
assert(a == 'a@b@çd' and b == 2)
assert(utf8.gsub('alo alo', '()[al]', '%1') == '12o 56o')
assert(utf8.gsub("abc=xyz", "(%w*)(%p)(%w+)", "%3%2%1-%0") ==
              "xyz=abc-abc=xyz")
assert(utf8.gsub("abc", "%w", "%1%0") == "aabbcc")
assert(utf8.gsub("abc", "%w+", "%0%1") == "abcabc")
assert(utf8.gsub('áéí', '$', '\0óú') == 'áéí\0óú')
assert(utf8.gsub('', '^', 'r') == 'r')
assert(utf8.gsub('', '$', 'r') == 'r')
print('+')

assert(utf8.gsub("um (dois) tres (quatro)", "(%(%w+%))", utf8.upper) ==
            "um (DOIS) tres (QUATRO)")

do
  local function setglobal (n,v) rawset(_G, n, v) end
  utf8.gsub("a=roberto,roberto=a", "(%w+)=(%w%w*)", setglobal)
  assert(_G.a=="roberto" and _G.roberto=="a")
end

function f(a,b) return utf8.gsub(a,'.',b) end
assert(utf8.gsub("trocar tudo em |teste|b| é |beleza|al|", "|([^|]*)|([^|]*)|", f) ==
            "trocar tudo em bbbbb é alalalalalal")

local function dostring (s) return load(s)() or "" end
assert(utf8.gsub("alo $a=1$ novamente $return a$", "$([^$]*)%$", dostring) ==
            "alo  novamente 1")

x = utf8.gsub("$local utf8=require'lua-utf8' x=utf8.gsub('alo', '.', utf8.upper)$ assim vai para $return x$",
         "$([^$]*)%$", dostring)
assert(x == ' assim vai para ALO')

t = {}
s = 'a alo jose  joao'
r = utf8.gsub(s, '()(%w+)()', function (a,w,b)
      assert(utf8.len(w) == b-a);
      t[a] = b-a;
    end)
assert(s == r and t[1] == 1 and t[3] == 3 and t[7] == 4 and t[13] == 4)


function isbalanced (s)
  return utf8.find(utf8.gsub(s, "%b()", ""), "[()]") == nil
end

assert(isbalanced("(9 ((8))(\0) 7) \0\0 a b ()(c)() a"))
assert(not isbalanced("(9 ((8) 7) a b (\0 c) a"))
assert(utf8.gsub("alo 'oi' alo", "%b''", '"') == 'alo " alo')


local t = {"apple", "orange", "lime"; n=0}
assert(utf8.gsub("x and x and x", "x", function () t.n=t.n+1; return t[t.n] end)
        == "apple and orange and lime")

t = {n=0}
utf8.gsub("first second word", "%w%w*", function (w) t.n=t.n+1; t[t.n] = w end)
assert(t[1] == "first" and t[2] == "second" and t[3] == "word" and t.n == 3)

t = {n=0}
assert(utf8.gsub("first second word", "%w+",
         function (w) t.n=t.n+1; t[t.n] = w end, 2) == "first second word")
assert(t[1] == "first" and t[2] == "second" and t[3] == nil)

assert(not pcall(utf8.gsub, "alo", "(.", print))
assert(not pcall(utf8.gsub, "alo", ".)", print))
assert(not pcall(utf8.gsub, "alo", "(.", {}))
assert(not pcall(utf8.gsub, "alo", "(.)", "%2"))
assert(not pcall(utf8.gsub, "alo", "(%1)", "a"))
assert(not pcall(utf8.gsub, "alo", "(%0)", "a"))

-- bug since 2.5 (C-stack overflow)
do
  local function f (size)
    local s = string.rep("a", size)
    local p = string.rep(".?", size)
    return pcall(utf8.match, s, p)
  end
  local r, m = f(80)
  assert(r and #m == 80)
  r, m = f(200000)
  assert(not r and utf8.find(m, "too complex"))
end

if not _soft then
  -- big strings
  local a = string.rep('a', 300000)
  assert(utf8.find(a, '^a*.?$'))
  assert(not utf8.find(a, '^a*.?b$'))
  assert(utf8.find(a, '^a-.?$'))

  -- bug in 5.1.2
  a = string.rep('a', 10000) .. string.rep('b', 10000)
  assert(not pcall(utf8.gsub, a, 'b'))
end

-- recursive nest of gsubs
function rev (s)
  return utf8.gsub(s, "(.)(.+)", function (c,s1) return rev(s1)..c end)
end

local x = "abcdef"
assert(rev(rev(x)) == x)


-- gsub with tables
assert(utf8.gsub("alo alo", ".", {}) == "alo alo")
assert(utf8.gsub("alo alo", "(.)", {a="AA", l=""}) == "AAo AAo")
assert(utf8.gsub("alo alo", "(.).", {a="AA", l="K"}) == "AAo AAo")
assert(utf8.gsub("alo alo", "((.)(.?))", {al="AA", o=false}) == "AAo AAo")

assert(utf8.gsub("alo alo", "().", {2,5,6}) == "256 alo")

t = {}; setmetatable(t, {__index = function (t,s) return utf8.upper(s) end})
assert(utf8.gsub("a alo b hi", "%w%w+", t) == "a ALO b HI")


-- tests for gmatch
local a = 0
for i in utf8.gmatch('abcde', '()') do assert(i == a+1); a=i end
assert(a==6)

t = {n=0}
for w in utf8.gmatch("first second word", "%w+") do
      t.n=t.n+1; t[t.n] = w
end
assert(t[1] == "first" and t[2] == "second" and t[3] == "word")

t = {3, 6, 9}
for i in utf8.gmatch ("xuxx uu ppar r", "()(.)%2") do
  assert(i == table.remove(t, 1))
end
assert(#t == 0)

t = {}
for i,j in utf8.gmatch("13 14 10 = 11, 15= 16, 22=23", "(%d+)%s*=%s*(%d+)") do
  t[i] = j
end
a = 0
for k,v in pairs(t) do assert(k+1 == v+0); a=a+1 end
assert(a == 3)


-- tests for `%f' (`frontiers')

assert(utf8.gsub("aaa aa a aaa a", "%f[%w]a", "x") == "xaa xa x xaa x")
assert(utf8.gsub("[[]] [][] [[[[", "%f[[].", "x") == "x[]] x]x] x[[[")
assert(utf8.gsub("01abc45de3", "%f[%d]", ".") == ".01abc.45de.3")
assert(utf8.gsub("01abc45 de3x", "%f[%D]%w", ".") == "01.bc45 de3.")
local u = utf8.escape
assert(utf8.gsub("function", u"%%f[%1-%255]%%w", ".") == ".unction")
assert(utf8.gsub("function", u"%%f[^%1-%255]", ".") == "function.")

assert(utf8.find("a", "%f[a]") == 1)
assert(utf8.find("a", "%f[^%z]") == 1)
assert(utf8.find("a", "%f[^%l]") == 2)
assert(utf8.find("aba", "%f[a%z]") == 3)
assert(utf8.find("aba", "%f[%z]") == 4)
assert(not utf8.find("aba", "%f[%l%z]"))
assert(not utf8.find("aba", "%f[^%l%z]"))

local i, e = utf8.find(" alo aalo allo", "%f[%S].-%f[%s].-%f[%S]")
assert(i == 2 and e == 5)
local k = utf8.match(" alo aalo allo", "%f[%S](.-%f[%s].-%f[%S])")
assert(k == 'alo ')

local a = {1, 5, 9, 14, 17,}
for k in utf8.gmatch("alo alo th02 is 1hat", "()%f[%w%d]") do
  assert(table.remove(a, 1) == k)
end
assert(#a == 0)


-- malformed patterns
local function malform (p, m)
  m = m or "malformed"
  local r, msg = pcall(utf8.find, "a", p)
  assert(not r and utf8.find(msg, m))
end

malform("[a")
malform("[]")
malform("[^]")
malform("[a%]")
malform("[a%")
malform("%b")
malform("%ba")
malform("%")
malform("%f", "missing")

-- \0 in patterns
assert(utf8.match("ab\0\1\2c", "[\0-\2]+") == "\0\1\2")
assert(utf8.match("ab\0\1\2c", "[\0-\0]+") == "\0")
assert(utf8.find("b$a", "$\0?") == 2)
assert(utf8.find("abc\0efg", "%\0") == 4)
assert(utf8.match("abc\0efg\0\1e\1g", "%b\0\1") == "\0efg\0\1e\1")
assert(utf8.match("abc\0\0\0", "%\0+") == "\0\0\0")
assert(utf8.match("abc\0\0\0", "%\0%\0?") == "\0\0")

-- magic char after \0
assert(utf8.find("abc\0\0","\0.") == 4)
assert(utf8.find("abcx\0\0abc\0abc","x\0\0abc\0a.") == 4)

print('OK')
