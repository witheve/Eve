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

return {
  error = error,
  warning = warning,
  bright = bright,
  info = info,
  dim = dim
}

