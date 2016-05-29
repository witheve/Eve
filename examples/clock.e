draw a clock hand
  hand = [#clock-hand angle stroke]
  update
    hand := [#line stroke, x1: 50, y1: 50
              x2: 50 + 40 * cos(angle)
              y2: 50 + 40 * sin(angle)]

draw a clock
  [#time hours minutes seconds]
  update
    [#svg viewBox: "0 0 100 100", width: "300px", children:
      [#circle cx: 50, cy: 50, r: 45, fill: "#0B79CE", children:
        [#clock-hand angle: 30 * hours, stroke: "#023963"]
        [#clock-hand angle: 6 * minutes, stroke: "#023963"]
        [#clock-hand angle: 6 * seconds, stroke: "#ce0b46"]]]
