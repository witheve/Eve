get all the ui facts
  (entity, attribute, value) =
    if entity = [#html]
       [#eavs entity attribute value] then (entity, attribute, value)
    if [#html style]
       [#eavs entity: style, attribute value] then (style, attribute, value)

mark all the different tag types as html
  entity = if [#div] then [#div]
           if [#span] then [#span]
           if [#ul] then [#ul]
           if [#ol] then [#ol]
           if [#li] then [#li]
  update entity := [#html]
