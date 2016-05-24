build the counter
  #counter count parent
  add
    #div class: "counter-container", parent
      children:
        #div #count-button class: "button", text: "-", diff: -1
        #div            class: "count",  text: "{count}"
        #div #count-button class: "button", text: "+", diff: 1

increment the counter
  #click element
  #counter: counter, count
  #count-button element diff
  update forever
    counter
      count: count + diff

go!
  add
    #counter count: 0, parent: "root"
