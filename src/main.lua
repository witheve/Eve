local parser = require("parser")
local color = require("color")

local commands = {
  parse = {
    command = parser.parseFile,
    args = "<file>"
  }
}

local function go(args)
  local info = commands[args[1]]
  if info then
    info.command(args)
  else
    print(color.dim("---------------------------------------------------------"))
    print("")
    print(string.format("Welcome to %s", color.bright("Eve!")))
    print("")
    print("Available commands: ")
    for command, info in pairs(commands) do
      print(string.format(" - %s %s", color.bright(command), color.info(info.args)))
    end
    print("")
    print(color.dim("---------------------------------------------------------"))
  end
end

go(arg)
