local PREFIX = string.char(27)
local ANSI_RESET = PREFIX .. "[0m"
local ANSI_BLACK =  PREFIX .. "[30m"
local ANSI_RED = PREFIX .. "[31m"
local ANSI_GREEN = PREFIX .. "[32m"
local ANSI_YELLOW = PREFIX .. "[33m"
local ANSI_BLUE = PREFIX .. "[34m"
local ANSI_PURPLE = PREFIX .. "[35m"
local ANSI_CYAN =  PREFIX .. "[0;36m"
local ANSI_WHITE = PREFIX .. "[37m"
local ANSI_GRAY = PREFIX .. "[1;30m"

local function toPattern(str)
  return str:gsub("%[", "%%[")
end

local ANSI_RESET_PATTERN = toPattern(ANSI_RESET)
local ANSI_BLACK_PATTERN = toPattern(ANSI_BLACK)
local ANSI_RED_PATTERN = toPattern(ANSI_RED)
local ANSI_GREEN_PATTERN = toPattern(ANSI_GREEN)
local ANSI_YELLOW_PATTERN = toPattern(ANSI_YELLOW)
local ANSI_BLUE_PATTERN = toPattern(ANSI_BLUE)
local ANSI_PURPLE_PATTERN = toPattern(ANSI_PURPLE)
local ANSI_CYAN_PATTERN = toPattern(ANSI_CYAN)
local ANSI_WHITE_PATTERN = toPattern(ANSI_WHITE)
local ANSI_GRAY_PATTERN = toPattern(ANSI_GRAY)

local function error(str)
  return ANSI_RED .. str .. ANSI_RESET
end

local function warning(str)
  return ANSI_YELLOW .. str .. ANSI_RESET
end

local function bright(str)
  return ANSI_CYAN .. str .. ANSI_RESET
end

local function info(str)
  return ANSI_BLUE .. str .. ANSI_RESET
end

local function dim(str)
  return ANSI_GRAY .. str .. ANSI_RESET
end

local function toHTML(str)
  return str:gsub(ANSI_RESET_PATTERN, "</span>")
            :gsub(ANSI_BLACK_PATTERN, "<span class='ansi-black'>")
            :gsub(ANSI_RED_PATTERN, "<span class='ansi-red'>")
            :gsub(ANSI_GREEN_PATTERN, "<span class='ansi-green'>")
            :gsub(ANSI_YELLOW_PATTERN, "<span class='ansi-yellow'>")
            :gsub(ANSI_BLUE_PATTERN, "<span class='ansi-blue'>")
            :gsub(ANSI_PURPLE_PATTERN, "<span class='ansi-purple'>")
            :gsub(ANSI_WHITE_PATTERN, "<span class='ansi-white'>")
            :gsub(ANSI_CYAN_PATTERN, "<span class='ansi-cyan'>")
            :gsub(ANSI_GRAY_PATTERN, "<span class='ansi-gray'>")
end

local function remove(str)
  return str:gsub(ANSI_RESET_PATTERN, "")
            :gsub(ANSI_BLACK_PATTERN, "")
            :gsub(ANSI_RED_PATTERN, "")
            :gsub(ANSI_GREEN_PATTERN, "")
            :gsub(ANSI_YELLOW_PATTERN, "")
            :gsub(ANSI_BLUE_PATTERN, "")
            :gsub(ANSI_PURPLE_PATTERN, "")
            :gsub(ANSI_WHITE_PATTERN, "")
            :gsub(ANSI_CYAN_PATTERN, "")
            :gsub(ANSI_GRAY_PATTERN, "")
end

return {
  error = error,
  warning = warning,
  bright = bright,
  info = info,
  dim = dim,
  remove = remove,
  toHTML = toHTML,
}

