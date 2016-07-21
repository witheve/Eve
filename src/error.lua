local color = require("color")
local util = require("util")
local fixPad = util.fixPad
local Set = require("set").Set
local errors = {}

------------------------------------------------------------
-- Error printing
------------------------------------------------------------

local function formatErrorLine(line, number, offset, length)
  local lineString = color.dim(number .. "|") .. line
  if offset and length then
    lineString = lineString .. "\n" .. util.makeWhitespace(offset + 1) .. color.error(string.format("^%s", util.makeWhitespace(length - 2, "-")))
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
  local type, context, token, lineNumber, offset, length, content, fixes = errorInfo.type, errorInfo.context, errorInfo.token, errorInfo.line, errorInfo.offset, errorInfo.length, errorInfo.content, errorInfo.fixes
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

  local storedError = {type = type, pos = {offest = offset, line = lineNumber, length = length, file = file},
                       rawContent = color.toHTML(util.dedent(content)), final = color.toHTML(finalContent), fixes = fixes}
  context.errors[#context.errors + 1] = storedError
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

function errors.invalidTopLevel(context, token)
  printError({type = "Invalid top level node", context = context, token = token, content = string.format([[
  There's a program level node that I don't understand here

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

function errors.curlyOutsideOfString(context, token, stack)
  -- we can use the stack to determine what might have happened
  local square = token.value == "{" and "[" or "]"
  printError({type = "Curly brace outside of string", context = context, token = token, content = string.format([[
  Double curly braces are used for embedding values in strings, but don't
  apply anywhere else.

  <LINE>

  Did you mean to use `%s`?
  ]], square)})
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
  printError({type = "Not without parens", context = context, token = token, content = [[
  `not` requires a set of parens after it, e.g. `not(x > 2)`

  <LINE>
  ]]})
end

function errors.invalidInlineNotChild(context, token, child)
  -- we can give a more direct message by looking at child
  printError({type = "Invalid inline not", context = context, token = token, content = [[
  Inline `not` only supports an attribute name or a tag name, e.g. [not(#person)]

  <LINE>
  ]]})
end

function errors.invalidNotChild(context, token)
  printError({type = "Invalid not child", context = context, token = token, content = string.format([[
  INTERNAL: Not can only be followed by a query, we somehow got something else.

  <LINE>
  ]])})
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

function errors.bareTagOrName(context, node)
  local type = node.children[1].type == "TAG" and "Tag" or "Name"
  local valueNode = node.children[2]
  local value;
  if valueNode.type == "IDENTIFIER" then
    value = string.format("%s%s", node.children[1].value, valueNode.value)
  elseif valueNode.type == "STRING" then
    value = string.format("%s\"%s\"", node.children[1].value, valueNode.value)
  end

  local content = string.format([[
  %s is only valid in an object

  <LINE>

  This line says I should search for a %s with the value "%s",
  but since it's not in an object, I don't know what it applies to.

  If you wrap it in square brackets, that tells me you're looking
  for an object with that %s:

    // search for objects with %s = "%s"
    [%s]

  ]], value, type:lower(), valueNode.value, type:lower(), type:lower(), valueNode.value, value)

  local fixes = {changes = {
    {from = {line = node.line, offset = node.offset}, to = {line = valueNode.line, offset = valueNode.offset + #valueNode.value}, value = string.format("[%s]", value)},
  }}
  printError({type = string.format("%s outside of an object", type), context = context, token = node, content = content, length = 1 + #valueNode.value, fixes = fixes})
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
    ]], token.value or token.type)})
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

function errors.invalidObjectChild(context, token)
  printError({type = "Invalid object attribute", context = context, token = token, content = string.format([[
  Objects only support attributes, inequalities, and nots as children. Not sure what to do with this:

  <LINE>
  ]])})
end

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
-- Union errors
------------------------------------------------------------

function errors.invalidUnionChild(context, token)
  printError({type = "Invalid if child", context = context, token = token, content = string.format([[
  INTERNAL: If can only be followed by a query, we somehow got something else.

  <LINE>
  ]])})
end

function errors.invalidUnionOutputsType(context, token)
  printError({type = "Invalid if equivalence", context = context, token = token, content = string.format([[
  The left hand side of an equivalence with an if can only be a name or a block of names, e.g. (foo, bar)

  <LINE>
  ]])})
end

function errors.outputNumberMismatch(context, block, outputs)
  printError({type = "If ... then return mismatch", context = context, token = block, content = string.format([[
  The number of values returned after a then has to match the left hand side of the equivalence.

  <LINE>
  ]])})
end

function errors.outputTypeMismatch(context, node, outputs)
  printError({type = "If ... then return mismatch", context = context, token = node, content = string.format([[
  There's a mismatch between the type being returned and the expected outputs.

  <LINE>
  ]])})
end

------------------------------------------------------------
-- Update errors
------------------------------------------------------------

function errors.invalidUpdateChild(context, token)
  printError({type = "Invalid expression in update", context = context, token = token, content = string.format([[
  Update only allows for equalities, objects, and setters as top level expressions.

  <LINE>
  ]])})
end

function errors.invalidUpdateEquality(context, token, left, right)
  printError({type = "Invalid equality in update", context = context, token = token, content = string.format([[
  Update only allows equalities of `name = [ ... ]`

  <LINE>

  Did you mean to use `:=`, `+=`, or `-=`?
  ]])})
end

function errors.updatingNonMutate(context, token)
  printError({type = "Invalid mutate node", context = context, token = token, content = string.format([[
  INTERNAL: somehow we got an object in an update that didn't result in a mutate node.

  <LINE>
    ]])})
end

------------------------------------------------------------
-- Query errors
------------------------------------------------------------

function errors.invalidQueryChild(context, token)
  printError({type = "Invalid query child", context = context, token = token, content = string.format([[
  There's a node at the top level that I don't know how to deal with here:

  <LINE>
  ]])})
end

------------------------------------------------------------
-- Dependency Graph Errors
------------------------------------------------------------

function formatVariable(variable)
  if variable.type ~= "variable" then return "????" end
  if  variable.cardinal then
    return string.sub(variable.name, 2, -2)
  else
    return variable.name
  end
end

function filterGenerated(variables)
  local filtered = Set:new()
  for variable in pairs(variables) do
    if not variable.generated then
      filtered:add(variable)
    elseif variable.cardinal and not variable.cardinal.generated then
      filtered:add(variable.cardinal)
    end
  end
  return filtered
end

function identity(x)
  return x
end

function chooseNearest(needle, haystack, stringify, threshold)
  stringify = stringify or identity
  local name = stringify(needle)
  threshold = threshold or (#stringify(needle) / 3 + 1)
  local best
  local bestDist = threshold
  for term in pairs(haystack) do
    local dist = util.levenshtein(name, stringify(term))
    if dist < bestDist then
      best = term
      bestDist = dist
    end
  end
  return best, bestDist
end

function formatUnsatisfied(unsatisfied)
  local reason = color.dim("Unable to provide: ")
  local multi = false
  for term in pairs(unsatisfied) do
    if multi then reason = reason .. ", " end
    if term.type == "variable" then
      reason = reason .. formatVariable(term)
    else
      local anyList = ""
      for term in pairs(term) do
        anyList = anyList .. (#anyList > 0 and ", " or "") .. formatVariable(term)
      end
      reason = string.format("%s %s%s%s",reason, color.dim("any of {"), anyList, color.dim("}"))
    end
    multi = true
  end
  return reason
end

function errors.unorderableGraph(context, query)
  local dg = query.deps.graph
  local file, code = context.file, context.code

  local unsorted = ""
  local multi = false
  for node in pairs(dg.unsorted) do
    local offset = node.offset
    local length = node.value and #node.value or 1
    local lineNumber = node.line
    local line = util.split(code, "\n")[lineNumber]
    local errorLine = util.indentString(3, formatErrorLine(line, lineNumber, offset, length))

    unsorted = string.format(fixPad [[
      %s
      %s
        %s
    ]], unsorted, errorLine, formatUnsatisfied(filterGenerated(dg:unsatisfied(node))))
    multi = true
  end
  printError{type = "Unorderable query", context = context, token = query, content = string.format([[
  No valid execution order found for query

  <LINE>

  The following nodes could not be ordered:
  %s
  ]], unsorted)}
end

function errors.unknownGeneratedVariable(context, variable, terms)
  printError{type = "Unknown generated variable", context = context, token = variable, content = string.format([[
    Generated variable "%s" was never provided in query

    <LINE>

    This is almost certainly an implementation issue. Please send your full query and this error to Eve's maintainers for assistance.
  ]], formatVariable(variable))}
end

function errors.unknownVariable(context, variable, terms)
  if variable.generated then return errors.unknownGeneratedVariable(context, variable, terms) end
  local best = chooseNearest(variable, filterGenerated(terms), formatVariable)
  local recommendation = ""
  if best then
    recommendation = "\n  Did you mean: \"" .. formatVariable(best) .. "\"?"
  end
  printError{type = "Unknown variable", context = context, token = variable, content = string.format([[
  Variable "%s" was never defined in query

  <LINE>%s
  ]], formatVariable(variable), recommendation)}
end

function errors.unknownExpression(context, expression, expressions)
  local best = chooseNearest(expression.operator, expressions)
  local recommendation = ""
  if best then
    recommendation = "\n  Did you mean: \"" .. best .. "\"?"
  end
  printError{type = "Unknown expression", context = context, token = expression, content = string.format([[
  Unknown expression "%s"

  <LINE>%s
  ]], expression.operator, recommendation)}
end


------------------------------------------------------------
-- Package
------------------------------------------------------------

return errors
