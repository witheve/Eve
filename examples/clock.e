draw a clock hand
  #clock-hand: hand
    angle
  add
    hand
      #line
      x1: 50, y1: 50, stroke: "#023963"
      x2: 50 + 40 * cos(angle)
      y2: 50 + 40 * sin(angle)

draw a clock
  #time hours minutes seconds
  add
    #svg
      viewBox: "0 0 100 100" width: "300px{zomg}"
      children:
        #circle cx: 50, cy: 50, r: 45, fill: "#0B79CE"
          children:
            #clock-hand angle: 30 * hours
            #clock-hand angle: 6 * minutes
            #clock-hand angle: 6 * seconds
