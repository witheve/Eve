local errors = {}

------------------------------------------------------------
-- Error printing
------------------------------------------------------------

local function formatErrorLine(line, offset, length)
  local lineString = color.dim(line.line .. "|") .. makeWhitespace(line.offset) .. Token:tokensToLine(line.tokens)
  if offset and length then
    lineString = lineString .. "\n" .. makeWhitespace(offset + 2) .. color.error(string.format("^%s", makeWhitespace(length - 1, "-")))
  end
  return lineString
end

-- Print error allows for the following bits of information
-- type = error type
-- line = offending line object (this is used to get the context, line text, etc)
-- offset = offset in the line where the error starts
-- length = length to highlight
-- content = array
--    the content array can contain a placeholder sting of "%LINE%" to embed the offending line
local function printError(errorInfo)
  local type, line, offset, length, content = errorInfo.type, errorInfo.line, errorInfo.offset, errorInfo.length, errorInfo.content
  -- walk up the line tree until you get to the parent node
  local file, context
  local parentNode = line.parent
  while parentNode do
    if parentNode.type == "context" then
      context = parentNode
      file = parentNode.file
    end
    parentNode = parentNode.parent
  end

  local lineString = formatErrorLine(line, offset, length)

  local finalContent = indent(dedent(content):gsub("%%LINE%%", lineString), 0)
  finalContent = finalContent:gsub("(//[^\n]+)", function(match)
    return color.dim(match)
  end)

  print(color.bright("---------------------------------------------------------"))
  print(color.bright(string.format(" %s", type or "parse error")))
  print(color.dim(string.format(" %s", file)))
  print("")
  print(finalContent)
end

------------------------------------------------------------
-- Errors
------------------------------------------------------------

function errors.invalidTag(line, token)
      local len = 0
      if token then len = #token.value - 1 end
      printError({type="Invalid tag", line = line, offset = token.offset + 1, length = len, content = [[
      Expected a name or string after the # symbol.

      %LINE%

      The # symbol denotes that you're looking for or adding a tag.

      Examples:

        // objects in the system tagged "person"
        #person

        // object in the system tagged "cool person"
        #"cool person"
      ]]})
end

return errors
