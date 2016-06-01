build the counter
  [#counter count parent]
  update
    [#div class: "counter-container", parent, children:
      [#div #count-button class: "button", text: "-", diff: -1]
      [#div class: "count", text: "{count}"]
      [#div #count-button class: "button", text: "+", diff: 1]]


increment the counter
  [#click element: [#count-button diff]]
  counter = [#counter count]
  update history
    counter.count := count + diff

go!
  update
    [#counter count: 0, parent: "root"]
