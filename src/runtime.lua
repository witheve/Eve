-- The runtime takes queries from clients, compiles the query, sets the executor
-- moving, and prompts the server to send results off

local server = require("server")

local function makeQueryCallback(queryInfo, client)
  return function(op, tuple)
    local batch = queryInfo.currentBatch
    if op == "insert" then
      batch.insert[#batch.insert + 1] = tuple
    elseif op == "remove" then
      batch.remove[#batch.remove + 1] = tuple
    elseif op == "flush" then
      batch.id = query.id
      batch.type = "result"
      queryInfo.currentBatch = {}
      server.sendClientMessage(client, batch)
    end
  end
end

local function open(queryMessage, client)
  local id = queryMessage.id
  if client.queries[id] then
    print(string.format(color.error("Trying to open a query with an ID that is already in use: %s"), id))
    return
  end
  local queryInfo = {id = id, currentBatch = {}}
  client.queries[id] = queryInfo
  local callback = makeQueryCallback(queryInfo, client)
  -- parse and compile
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

