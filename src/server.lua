_G.TURBO_SSL = true -- Always set me when using SSL, before loading framework.
local turbo = require("turbo")
local fs = require("fs")
local color = require("color")
local cjson = require("cjson.safe") -- safe means that in a parse fail, nil will be returned
local runtime = require("runtime")


local clients = {}
local clientId = 0

local function nextId()
  clientId = clientId + 1
  return clientId
end

local function sendClientMessage(client, message)
  client.client:write_message(cjson:encode(message))
end

local SSL_Handler = class("SSL_Handler", turbo.web.RequestHandler)
function SSL_Handler:get()
    self:write(fs.read("index.html"))
end

local JSHandler = class("JSHandler", turbo.web.RequestHandler)
function JSHandler:get()
    self:write(fs.read("jssrc/renderer.js"))
end

local WSExHandler = class("WSExHandler", turbo.websocket.WebSocketHandler)
function WSExHandler:open()
  clients[self] = {
    id = nextId(),
    client = self,
    queries = {},
    bag = nil,
    user = nil,
  }
  print("Got connection")
end
function WSExHandler:on_close()
  clients[self] = nil
  -- @TODO: nuke all the open queries for this client
  print("Dropped connection")
end
function WSExHandler:on_message(msg)
  print("Got message!")
  local data = cjson.decode(msg)
  for k, v in pairs(data) do
    print(k, v)
  end
  if data.type == "query" then
    runtime.open(data, clients[self])
  elseif data.type == "close" then
    runtime.close(data, clients[self])
  end
  -- switch on the message and determine what we need to do
  -- open a query, close a query...?
  self:write_message("Hello World.")
end


local application = turbo.web.Application:new({
    -- {"^/$", turbo.web.StaticFileHandler, "/users/chris/scratch/lua/index.html"},
    -- {"^/static/(.*)$", turbo.web.StaticFileHandler, "static/"},
    {"^/$", SSL_Handler},
    {"^/jssrc/.*$", JSHandler},
    {"^/ws$", WSExHandler}
})

local function start(args)
  local port = args[2] or 8888
  application:listen(port, nil, {
    -- ssl_options = {
    --   key_file = "server.key",
    --   cert_file = "server.crt"
    -- }
  })
  print()
  print(color.dim("---------------------------------------------------------"))
  print()
  print(string.format("Server running at ".. color.bright("http://localhost:%s/"), port))
  print()
  turbo.ioloop.instance():start()
end

return {
  start = start,
  sendClientMessage = sendClientMessage
}
