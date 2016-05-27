-- generate useful data from Unicode Character Database.
-- you should have these files in ucd folder in current path:
--   - ucd\CaseFolding.txt
--   - ucd\DerivedCoreProperties.txt
--   - ucd\EastAsianWidth.txt
--   - ucd\PropList.txt
--   - ucd\UnicodeData.txt
--  
--  files can be downloaded at: http://unicode.org/Public/UCD/latest/ucd/


local function parse_UnicodeData()
    -- UnicodeData.txt structions:
    -- 0. codepoint
    -- 1. name
    -- 2. general category
    -- 3. canonical combining class
    -- 4. bidi class 
    -- 5. decomposition type/mapping
    -- 6. numberic type/value
    -- 7. numberic type/value
    -- 8. numberic type/value
    -- 9. bidi mirrored [YN]
    -- 10. old unicode name
    -- 11. iso comment
    -- 12. uppercase mapping
    -- 13. lowercase mapping
    -- 14. titlecase mapping
    local ucd = {}

    local patt = "^(%x+)"..(";([^;]-)"):rep(14).."$"

    local last_data

    for line in io.lines() do
        local cp, name, gc, _, bidi_class, _, _,_,_, _, _,_, um, lm, tm = line:match(patt)
        assert(cp, line)
        cp = tonumber(cp, 16)
        lm = lm ~= "" and tonumber(lm, 16)
        um = um ~= "" and tonumber(um, 16)
        tm = tm ~= "" and tonumber(tm, 16)
        if last_data and last_data.name:match"First%>$" then
            assert(name:match"Last%>$", line)
            for i = last_data.cp, cp-1 do
                ucd[#ucd+1] = {
                    cp = i,
                    name = name,
                    gc = gc,
                    bidi_class = bidi_class,
                    lm = lm, um = um, tm = tm,
                }
            end
        end
        local data = {
            cp = cp,
            name = name,
            gc = gc,
            bidi_class = bidi_class,
            lm = lm, um = um, tm = tm,
        }
        ucd[#ucd+1] = data
        last_data = data
    end
    table.sort(ucd, function(a, b) return a.cp < b.cp end)

    return ucd
end

local function parse_EastAsianWidth()
    local wide, ambi = {}, {}

    for line in io.lines() do
        line = line:gsub("%s*%#.*$", "")
        if line == "" then goto next end

        local first, last, mark
        first, mark = line:match "^(%x+)%;(%w+)$"
        if first then
            last = first
        else
            first, last, mark = line:match "^(%x+)%.%.(%x+)%;(%w+)$"
            assert(first, line)
        end

        local first = tonumber(first, 16)
        local last = tonumber(last, 16)

        if mark == 'W' or mark == 'F' then
            for i = first, last do
                wide[#wide+1] = i
            end
        elseif mark == 'A' then
            for i = first, last do
                ambi[#ambi+1] = i
            end
        end

        ::next::
    end

    return wide, ambi
end

local function parse_CaseFolding()
    local mapping = {}
    for line in io.lines() do
        line = line:gsub("%s*%#.*$", "")
        if line == "" then goto next end

        local cp, class, mcp = line:match "^%s*(%x+)%s*;%s*(%w+)%s*;%s*(%x+)"
        assert(cp, line)
        if class == 'C' or class == 'S' then
            cp = tonumber(cp, 16)
            mcp = tonumber(mcp, 16)
            mapping[#mapping+1] = { cp = cp, mapping = mcp }
        end

        ::next::
    end
    return mapping
end

local function parse_PropList(f)
    local ranges = {}
    local lookup = {}

    local arg = f
    if type(f) == 'table' then
        f = function(cp) return arg[cp] end
    elseif type(f) == 'string' then
        f = function(cp) return arg == cp end
    end

    for line in io.lines() do
        line = line:gsub("%s*%#.*$", "")
        if line == "" then goto next end

        local first, last, mark
        first, mark = line:match "^(%x+)%s*%;%s*([%w_]+)%s*$"
        if first then
            last = first
        else
            first, last, mark = line:match "^(%x+)%.%.(%x+)%s*%;%s*([%w_]+)%s*$"
            assert(first, line)
        end

        local first = tonumber(first, 16)
        local last = tonumber(last, 16)

        if f(mark) then
            for i = first, last do
                if not lookup[i] then
                    lookup[i] = true
                    ranges[#ranges+1] = i
                end
            end
        end

        ::next::
    end

    table.sort(ranges)
    return ranges, lookup
end

local function get_ranges(list, func, proc)
    local first, last, step, offset
    local ranges = {}
    for i = 1, #list do
        local v_cp, v_offset
        local v = list[i]
        local res = not func or func(v)
        if type(v) == 'number' then
            v_cp, v_offset = v
        elseif v.cp then
            v_cp, v_offset = v.cp, v.offset
        end
        if not res then goto next end
        if first and
                (not offset or offset == v_offset) and
                (not step or step == v_cp - last) then
            step = v_cp - last
            last = v_cp
        else
            if first then
                local r = { first = first, last = last, step = step, offset = offset }
                ranges[#ranges+1] = r
            end
            first, last, step = v_cp, v_cp
            offset = v_offset
        end

        ::next::
    end
    if first then
        local r = { first = first, last = last, step = step, offset = offset }
        ranges[#ranges+1] = r
    end
    return ranges
end

local function merge_ranges(...)
    local ranges = {}
    local lookup = {}
    for i = 1, select('#', ...) do
        for _,v in ipairs(select(i, ...)) do
            if not lookup[v] then
                lookup[v] = true
                ranges[#ranges+1] = v
            end
        end
    end
    table.sort(ranges)
    return ranges
end

local function diff_ranges(base, sub, force)
    local ranges = {}
    local lookup = {}
    local missing = {}
    for _, v in ipairs(sub) do
        for i = v.first, v.last, v.step or 1 do
            lookup[i] = true
            missing[i] = true
        end
    end
    for _, v in ipairs(base) do
        for i = v.first, v.last, v.step or 1 do
            if not lookup[i] then
                ranges[#ranges+1] = i
            end
            missing[i] = nil
        end
    end
    if force and next(missing) then
        local m = {}
        for i in pairs(missing) do
            m[#m+1] = i
        end
        table.sort(m)
        for i, v in ipairs(m) do
            m[i] = ("%X"):format(v)
        end
        error(table.concat(m, "\n"))
    end
    return get_ranges(ranges)
end

local function write_ranges(name, ranges)
    io.write("static struct range_table "..name.."_table[] = {\n")
    for _, r in ipairs(ranges) do
        io.write(("    { 0x%X, 0x%X, %d },\n"):format(r.first, r.last, r.step or 1))
    end
    io.write "};\n\n"
end

local function write_convtable(name, conv)
    io.write("static struct conv_table "..name.."_table[] = {\n")
    for _, c in ipairs(conv) do
        io.write(("    { 0x%X, 0x%X, %d, %d },\n"):format(
            c.first, c.last, c.step or 1, c.offset))
    end
    io.write "};\n\n"
end

io.output "unidata.h"

io.write [[
/*
 * unidata.h - generated by parseucd.lua
 */
#ifndef unidata_h
#define unidata_h

typedef struct range_table {
    unsigned int first;
    unsigned int last;
    int step;
} range_table;

typedef struct conv_table {
    unsigned int first;
    unsigned int last;
    int step;
    int offset;
} conv_table;

]]

do
    local function ranges(name, f)
        local r = get_ranges((parse_PropList(f)))
        write_ranges(name, r)
    end

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("alpha", "Alphabetic")

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("lower", "Lowercase")

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("upper", "Uppercase")

    io.input "ucd/PropList.txt"
    ranges("xdigit", "Hex_Digit")

    io.input "ucd/PropList.txt"
    ranges("space", "White_Space")

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("unprintable", "Default_Ignorable_Code_Point")

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("graph", "Grapheme_Base")

    io.input "ucd/DerivedCoreProperties.txt"
    ranges("compose", "Grapheme_Extend")
end

do
    io.input  "ucd/UnicodeData.txt"
    local ucd = parse_UnicodeData()
    local function set(s)
        local hasht = {}
        for word in s:gmatch "%w%w" do
            hasht[word] = true
        end
        return function(data)
            return hasht[data.gc]
        end
    end
    local function mapping(field)
        return function(data)
            data.offset = nil
            if data[field] then
                data.offset = data[field] - data.cp
                return true
            end
        end
    end
    local cntrl = "Cc Cf Co"
    local digit = "Nd"
    local alnum_extend = "Nd Nl No Pc"
    local punct = "Sk Sc Sm Pc Pd Ps Pe Pi Pf Po"
    write_ranges("cntrl", get_ranges(ucd, set(cntrl)))
    write_ranges("digit", get_ranges(ucd, set(digit)))
    write_ranges("alnum_extend", get_ranges(ucd, set(alnum_extend)))
    write_ranges("punct", get_ranges(ucd, set(punct)))
    write_convtable("tolower", get_ranges(ucd, mapping "lm"))
    write_convtable("toupper", get_ranges(ucd, mapping "um"))
    write_convtable("totitle", get_ranges(ucd, mapping "tm"))
end

do
    io.input "ucd/CaseFolding.txt"
    local mapping = parse_CaseFolding()
    write_convtable("tofold", get_ranges(mapping, function(data)
        data.offset = data.mapping - data.cp
        return true
    end))
end

do
    io.input  "ucd/EastAsianWidth.txt"
    local wide, ambi = parse_EastAsianWidth()
    write_ranges("doublewidth", get_ranges(wide))
    write_ranges("ambiwidth", get_ranges(ambi))
end

io.write "#endif /* unidata_h */\n"
