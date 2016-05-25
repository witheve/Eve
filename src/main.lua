local parser = require("parser")
local color = require("color")
local server = require("server")
local compiler = require("compiler")

local commands = {
  analyze = {
    command = compiler.analyze,
    args = "<file>"
  },
  parse = {
    command = parser.printFileParse,
    args = "<file>"
  },
  server = {
    command = server.start,
    args = "<port>"
  }
}

local function go(args)
  local info = commands[args[1]]
  if info then
    info.command(args)
  else
    print(color.dim("---------------------------------------------------------"))
    print("")
    print(color.bright([[
    _______
    |  ____|
    | |____   _____
    |  __\ \ / / _ \
    | |___\ V /  __/
    |______\_/ \___|
    ]]))
    print("")
    print("    Available commands: ")
    for command, info in pairs(commands) do
      print(string.format("       %s %s", color.bright(command), color.info(info.args)))
    end
    print("")
    print(color.dim("---------------------------------------------------------"))
  end
end

go(arg)
