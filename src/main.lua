local parser = require("parser")

local commands = {
  parse = parser.parseFile
}

local function go(args)
  local command = commands[args[1]]
  if command then
    command(args)
  else
    print("Unknown command!")
  end
end

go(arg)
