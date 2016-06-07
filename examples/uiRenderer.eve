get all the ui facts
  (entity, attribute, value) =
    if entity = [#html]
       [#eav entity attribute value] then (entity, attribute, value)
    if [#html style]
       [#eav entity: style, attribute value] then (style, attribute, value)
  update session
    [#eav entity attribute value]

mark all the different tag types as html
  entity = if e = [#div] then e
           if e = [#span] then e
           if e = [#ul] then e
           if e = [#ol] then e
           if e = [#li] then e
  update entity := [#html]
