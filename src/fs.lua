local fs = {}

-- see if the file exists
function fs.exists(file)
  local f = io.open(file, "rb")
  if f then f:close() end
  return f ~= nil
end

function fs.read(path)
    local file = io.open(path, "rb") -- r read mode and b binary mode
    if not file then return nil end
    local content = file:read "*a" -- *a or *all reads the whole file
    file:close()
    return content
end

return fs
