_G.TURBO_SSL = true -- Always set me when using SSL, before loading framework.
local turbo = require("turbo")
local fs = require("fs")
local color = require("color")

local SSL_Handler = class("SSL_Handler", turbo.web.RequestHandler)
function SSL_Handler:get()
    self:write(fs.read("index.html"))
end

local WSExHandler = class("WSExHandler", turbo.websocket.WebSocketHandler)
function WSExHandler:on_message(msg)
    self:write_message("Hello World.")
end


local application = turbo.web.Application:new({
    -- {"^/$", turbo.web.StaticFileHandler, "/users/chris/scratch/lua/index.html"},
    -- {"^/static/(.*)$", turbo.web.StaticFileHandler, "static/"},
    {"^/$", SSL_Handler},
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
  start = start
}
