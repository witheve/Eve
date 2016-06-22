local color = require("color")
local util = require("util")
local errors = {}

------------------------------------------------------------
-- Error printing
------------------------------------------------------------

local function formatErrorLine(line, number, offset, length)
  local lineString = color.dim(number .. "|") .. line
  if offset and length then
    lineString = lineString .. "\n" .. util.makeWhitespace(offset + 2) .. color.error(string.format("^%s", util.makeWhitespace(length - 2, "-")))
  end
  return lineString
end

-- Print error allows for the following bits of information
-- type = error type
-- line = offending line object (this is used to get the context, line text, etc)
-- offset = offset in the line where the error starts
-- length = length to highlight
-- content = array
--    the content array can contain a placeholder sting of "<LINE>" to embed the offending line
local function printError(errorInfo)
  local type, context, token, lineNumber, offset, length, content = errorInfo.type, errorInfo.context, errorInfo.token, errorInfo.line, errorInfo.offset, errorInfo.length, errorInfo.content
  if not offset then
    offset = token.offset
  end
  if not length then
    length = token.value and #token.value or 1
  end
  if not lineNumber then
    lineNumber = token.line
  end

  -- walk up the line tree until you get to the parent node
  local file, code = context.file, context.code
  local line = util.split(code, "\n")[lineNumber]

  local lineString = formatErrorLine(line, lineNumber, offset, length)

  local finalContent = util.indent(util.dedent(content):gsub("<LINE>", lineString), 0)
  finalContent = finalContent:gsub("(//[^\n]+)", function(match)
    return color.dim(match)
  end)

  print(color.bright("---------------------------------------------------------"))
  print(color.bright(string.format(" %s", type or "parse error")))
  print(color.dim(string.format(" %s", file or "(passed string)")))
  print("")
  print(finalContent)
end

------------------------------------------------------------
-- Internal errors
------------------------------------------------------------

function errors.string_close(context, token, nodeType)
  error(string.format("The parser has wandered off somewhere horribly wrong. There's a STRING_CLOSE token where stackTop is a %s node instead of a concat node", nodeType or "null"))
end


function errors.notImplemented(context, token, implementedType)
  printError({type = "Not implemented yet", context = context, token = token, content = string.format([[
  Unfortunately, %s isn't implemented yet.

  <LINE>
  ]], implementedType)})
  error("Parse failure")
end

function errors.crazySyntax(context, token)
  printError({type = "Crazy syntax", context = context, token = token, content = string.format([[
  There's some crazy syntax going on here that I don't understand yet

  <LINE>
  ]])})
  error("Parse failure")
end

------------------------------------------------------------
-- Delimiter errors
------------------------------------------------------------

function errors.invalidCloseBracket(context, token, stack)
  -- we can use the stack to determine what might have happened
  -- if there is an object above this node that is waiting to be
  -- closed, chances are we just forgot to close something above us
  -- if there's not, maybe there's a function and this just got mistyped?
  printError({type = "Invalid close bracket", context = context, token = token, content = [[
  Bad Bracket!

  <LINE>
  ]]})
end

function errors.invalidCloseParen(context, token, stack)
  -- we can use the stack to determine what might have happened
  -- if there is a function or block above this node that is waiting to be
  -- closed, chances are we just forgot to close something above us
  -- if there's not, maybe a mistyped object?
  printError({type = "Invalid close paren", context = context, token = token, content = [[
  Bad paren!

  <LINE>
  ]]})
end

------------------------------------------------------------
-- If errors
------------------------------------------------------------

function errors.invalidIfAssignment(context, token, attemptedOutput)
  -- we can use the attempted output to guess what they were trying to do and
  -- how to fix it
  printError({type = "Invalid if assignment", context = context, token = token, content = [[
  You can only assign an if to a block or an identifier

  <LINE>
  ]]})
end

function errors.unassignedIf(context, token)
  printError({type = "Unassigned if", context = context, token = token, content = [[
  If statements must be on the right hand side of an equivalence

  <LINE>
  ]]})
end

function errors.misplacedElse(context, token, stack)
  -- if there is no stack top, then this is a top level else, if there is
  -- check the kind of node to see if there's something reasonable that was
  -- trying to be expressed
  printError({type = "Misplaced else", context = context, token = token, content = [[
  `else` only works inside of an if

  <LINE>
  ]]})
end

function errors.misplacedThen(context, token, stack)
  -- if there is no stack top, then this is a top level "then", if there is
  -- check the kind of node to see if there's something reasonable that was
  -- trying to be expressed
  printError({type = "Misplaced then", context = context, token = token, content = [[
  `then` only works at the end of an if

  <LINE>
  ]]})
end

------------------------------------------------------------
-- Not errors
------------------------------------------------------------

function errors.notWithoutParen(context, token, next)
  -- we can check next here to take a guess at what the badness might be
  printError({type = "Misplaced then", context = context, token = token, content = [[
  `not` requires a set of parens after it, e.g. `not(x > 2)`

  <LINE>
  ]]})
end

------------------------------------------------------------
-- Or errors
------------------------------------------------------------

function errors.orOnlyAfterIdentifier(context, token, prev)
  -- check what prev is to see if maybe it's a constant or something? do we let
  -- or be after objects?
  printError({type = "Misplaced or", context = context, token = token, content = [[
  `or` can only come after a name

  <LINE>
  ]]})
end

------------------------------------------------------------
-- Tag / name errors
------------------------------------------------------------

function errors.invalidTag(context, token, next)
      printError({type="Invalid tag", context = context, token = token, content = [[
      Expected a name or string after the # symbol.

      <LINE>

      The # symbol denotes that you're looking for or adding a tag.

      Examples:

        // objects in the system tagged "person"
        [#person]

        // objects in the system tagged "cool person"
        [#"cool person"]
      ]]})
end

------------------------------------------------------------
-- Dot / Attribute lookup errors
------------------------------------------------------------

function errors.invalidAttributeLeft(context, token, prev)
  -- check what prev is to see if maybe it's a constant or bare.. or something else?
  printError({type = "Invalid attribute access", context = context, token = token, content = [[
  `.` can only come after a name, e.g. `person.age`

  <LINE>
  ]]})
end

function errors.invalidAttributeRight(context, token)
  printError({type = "Invalid attribute access", context = context, token = token, content = [[
  `.` can only be followed by the name of an attribute, e.g. `person.age`

  <LINE>
  ]]})
end

------------------------------------------------------------
-- Infix errors
------------------------------------------------------------

function errors.invalidInfixLeft(context, token, prev)
  -- check what prev is to see if maybe it's a constant or bare.. or something else?
  printError({type = "Invalid infix operator", context = context, token = token, content = string.format([[
  `%s` can only come after a name, constant, or function e.g. `5 %s 10`

  <LINE>
  ]], token.value, token.value)})
end

------------------------------------------------------------
-- Function errors
------------------------------------------------------------

function errors.invalidFunctionArgument(context, token, nodeType)
  printError({type = "Invalid function argument", context = context, token = token, content = string.format([[
  Only expressions can be arguments to functions

  <LINE>
  ]], token.value, token.value)})
end

------------------------------------------------------------
-- Equality errors
------------------------------------------------------------

function errors.invalidEqualityLeft(context, token, prev)
  -- check what prev is to see if we're equiving another equiv or nothing
  if not prev then
    printError({type = "Invalid equivalence", context = context, token = token, content = string.format([[
    `%s` should be inbetween two expressions

    <LINE>
    ]], token.value)})
  else
    printError({type = "Invalid equivalence", context = context, token = token, content = string.format([[
    `%s` can only be used between expressions

    <LINE>
    ]], token.value)})
  end
end

------------------------------------------------------------
-- Object errors
------------------------------------------------------------

function errors.bareSubObject(context, token)
  printError({type = "Unbound nested object", context = context, token = token, content = string.format([[
  Nested objects have to be bound to some attribute.

  <LINE>
  ]])})
end

function errors.unboundAttributeInequality(context, token)
  printError({type = "Invalid inline filter", context = context, token = token, content = string.format([[
  Inline filters have to have an attribute name on the left side, e.g. `[age > 10]`

  <LINE>
  ]])})
end

function errors.invalidObjectAttributeBinding(context, token)
  printError({type = "Invalid attribute binding", context = context, token = token, content = string.format([[
  Invalid attribute binding

  <LINE>
  ]])})
end

------------------------------------------------------------
-- aggregate errors
------------------------------------------------------------

function errors.invalidAggregateModifier(context, token, prev)
  -- check what prev is to see if maybe it's a constant or bare.. or something else?
  printError({type = "Invalid aggregate modifier", context = context, token = token, content = string.format([[
  `%s` can only be used inside an aggregate function like `sum()`

  <LINE>
  ]], token.value)})
end

function errors.invalidGrouping(context, token)
  printError({type = "Invalid aggregate grouping", context = context, token = token, content = string.format([[
  Groupings can only be experessions or identifiers

  <LINE>
  ]])})
end

function errors.invalidProjection(context, token)
  printError({type = "Invalid aggregate projection", context = context, token = token, content = string.format([[
  Projections can only be experessions or identifiers

  <LINE>
  ]])})
end

------------------------------------------------------------
-- Package
------------------------------------------------------------

return errors
