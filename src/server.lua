_G.TURBO_SSL = true -- Always set me when using SSL, before loading framework.
local turbo = require("turbo")
-- local t = require("test")
local fs = require("fs")

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

application:listen(8888, nil, {
  ssl_options = {
    key_file = "server.key",
    cert_file = "server.crt"
  }
})
turbo.ioloop.instance():start()
