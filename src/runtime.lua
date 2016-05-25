-- The runtime takes queries from clients, compiles the query, sets the executor
-- moving, and prompts the server to send results off

local parser = require("parser")
local cjson = require("cjson.safe") -- safe means that in a parse fail, nil will be returned

local function makeQueryCallback(queryInfo, client)
  return function(op, tuple)
    local batch = queryInfo.currentBatch
    if op == "insert" then
      batch.insert[#batch.insert + 1] = tuple
    elseif op == "remove" then
      batch.remove[#batch.remove + 1] = tuple
    elseif op == "flush" then
      batch.id = queryInfo.id
      batch.type = "result"
      queryInfo.currentBatch = {insert = {}, remove = {}}
      client.client:write_message(cjson.encode(batch))
    end
  end
end

local function open(queryMessage, client)
  local id = queryMessage.id
  if client.queries[id] then
    print(string.format(color.error("Trying to open a query with an ID that is already in use: %s"), id))
    return
  end
  local queryInfo = {id = id, currentBatch = {insert = {}, remove = {}}}
  client.queries[id] = queryInfo
  local callback = makeQueryCallback(queryInfo, client)
  -- parse and compile
  local parse = parser.parseString(queryMessage.query)
  -- FIXME: just sending random ui as a test for now
  --
  callback("insert", {"foo", "tag", "div"})
  callback("insert", {"foo", "children", "bar"})
  callback("insert", {"foo", "children", "woot"})
  callback("insert", {"bar", "tag", "span"})
  callback("insert", {"bar", "text", "yo, sup? "})
  callback("insert", {"bar", "style", "bar-style"})
  callback("insert", {"bar-style", "color", "red"})
  callback("insert", {"woot", "tag", "span"})
  callback("insert", {"woot", "text", "zomg"})
  callback("flush", nil)
end

local function close(closeMessage, client)
  local id = closeMessage.id
  if not client.queries[id] then
    print(string.format(color.error("Trying to close a query with an unknown ID: %s"), id))
    return
  end
  -- @TODO: is there any other cleanup we need to do here? anything on
  -- the c side?
  client.queries[id] = nil
end

return {
  open = open,
  close = close
}
