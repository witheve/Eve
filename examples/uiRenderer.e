get all the ui facts
  union
    #html: entity
    #eavs entity attribute value
  and
    #html style: entity
    #eavs entity attribute value

mark all the different tag types as html
  union #div: entity
  and #span: entity
  and #ul: entity
  and #ol: entity
  and #li: entity
  add
    entity #html
