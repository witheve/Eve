import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";

class ShapeWatcher extends Watcher {
  setup() {
    this.program.attach("html");
    this.program.attach("canvas");
    this.hexagon();
    this.hexGrid();

    this.squarePath();
    this.hexagonPath();
  }

  //--------------------------------------------------------------------
  // #shape/hexagon
  //--------------------------------------------------------------------
  hexagonHTML() {
    this.program
      .block("Draw a hexagon", ({find, choose, record, lib: {math}}) => {
        let hex = find("shape/hexagon");
        let {side} = hex;

        let tri_height = math.round(side * 0.5); // sin(30deg)
        let tri_width = math.round(side * 0.86603); // cos(30deg)
        let width = 2 * tri_width;

        let [background] = choose(
          () => {hex.tag == "shape/outline"; return hex.border},
          () =>  hex.background
        );

        let sideBorder = `${tri_width}px`;
        let activeBorder = `${tri_height}px`;

        return [
          hex.add({tag: "html/element", tagname: "div", class: "shape-hexagon", style: record({width}), children: [
            record("shape/hexagon/cap", "html/element", {sort: 1, tagname: "div", class: ["shape-hexagon-cap", "first"], style: record({
              width: 0, height: 0,
              "border": "0 solid transparent",
              "border-left-width": sideBorder, "border-right-width": sideBorder,
              "border-bottom-width": activeBorder, "border-bottom-color": background
            })}),
            record("shape/hexagon/body", "ui/column", {hex, sort: 2, style: record({height: side, width, background}), class: "shape-hexagon-body"}),
            record("shape/hexagon/cap", "html/element", {sort: 3, tagname: "div", class: ["shape-hexagon-cap", "last"], style: record({
              width: 0, height: 0,
              "border": "0 solid transparent",
              "border-left-width": sideBorder, "border-right-width": sideBorder,
              "border-top-width": activeBorder, "border-top-color": background
            })}),
          ]})
        ];
      })

      .block("Hexagons with border and thickness are outlined.", ({find}) => {
        let hex = find("shape/hexagon");
        hex.border;
        hex.thickness;
        return [
          hex.add("tag", "shape/outline")
        ];
      })

      .block("An outlined hexagon contains another hexagon inset by thickness.", ({find, record}) => {
        let hex = find("shape/hexagon", "shape/outline");
        let {thickness} = hex;
        let side = hex.side - thickness;
        let side_thickness = thickness * 0.86603; // cos(30deg)
        return [
          hex.add("children", [
            record("shape/hexagon", "shape/hexagon/inner", {outer: hex, sort: 4, side, background: hex.background, class: "shape-hexagon-inner", style: record({
              position: "absolute", top: 0, left: 0, "margin-top": thickness, "margin-left": side_thickness
            })})
          ])
        ];
      })

      .block("Populate hexagon with content", ({find, not}) => {
        let hex_body = find("shape/hexagon/body");
        not(() => hex_body.hex.tag == "shape/outline")
        let {content} = hex_body.hex;
        return [
          hex_body.add("children", [
            content
          ])
        ];
      })

      .block("Populate an outlined hexagon's inner with content", ({find}) => {
        let hex_inner = find("shape/hexagon/inner");
        return [
          hex_inner.add("content", hex_inner.outer.content)
        ];
      });
  }

  //--------------------------------------------------------------------
  // #shape/hex-grid
  //--------------------------------------------------------------------
  hexGrid() {
    // [#hex-grid cells side gap]
    this.program.block("Decorate all the hex-grid cells as hexagons.", ({find, lib:{math}, record}) => {
      let hex_grid = find("shape/hex-grid");

      let {side, gap} = hex_grid;
      let cell = hex_grid.cell;
      let {x:x_ix, y:y_ix} = cell;

      let top_gap = gap * 0.86603; // sin(60deg)

      let tri_height = math.round(side * 0.5);
      let tri_width = math.round(side * 0.86603);

      let width = 2 * tri_width + gap;
      let x_offset = math.mod(math.abs(y_ix), 2) * width / 2;
      let height = side + tri_height + top_gap;

      let x = math.round(width * x_ix + x_offset);
      let y = math.round(height * y_ix);

      return [
        hex_grid.add({tag: "html/element", tagname: "div", class: "shape-hex-grid"}),
        hex_grid.add("children", [
          cell.add({
            style: record({position: "absolute", left: x, top: y})
          })
        ])
      ];
    });
  }

  hexagon() {
    this.program
      .block("Decorate a shape/hexagon as a canvas.", ({find, choose, lib:{math}, record}) => {
        let hex = find("shape/hexagon");
        let {side} = hex;
        let tri_height = side * 0.5;
        let tri_width = side * 0.86603;
        let [pad] = choose(() => hex.lineWidth, () => 0);
        let dpad = 2 * pad;
        let width = math.ceil(2 * tri_width + dpad);
        let height = math.ceil(2 * side + dpad);


        return [
          hex.add({tag: "html/element", tagname: "div", style: record({width, height})}).add("children", [
            record("canvas/root", {sort: 1, hex, width, height}).add("children", [
              record("shape/hexagon-path", {sort: 1, hex, x: pad, y: pad, side})
            ]),
            record("shape/hexagon/content", "html/element", {sort: 2, hex, tagname: "div", style: record({top: tri_height, bottom: tri_height, left: pad / 2, right: pad})})
          ])
        ];
      })
      .block("Copy hexagon content into it's appropriate container.", ({find, record}) => {
        let hex = find("shape/hexagon");
        let container = find("shape/hexagon/content", {hex});
        return [container.add("children", hex.content)];
      })
      .block("Copy style properties onto hexagon path.", ({find, lookup}) => {
        let hex = find("shape/hexagon");
        let path = find("shape/hexagon-path", {hex});
        let {attribute, value} = lookup(hex);
        attribute != "tag";
        attribute != "class";
        attribute != "tagname";
        attribute != "style";
        attribute != "children";
        attribute != "x";
        attribute != "y";
        return [path.add(attribute, value)];
      })
  }

  squarePath() {
    this.program.block("Decorate a shape/square-path as a canvas/path", ({find, record}) => {
      let square = find("shape/square-path");
      let {x, y, side} = square;
      return [
        square.add({tag: "canvas/path"}).add("children", [
          record({sort: 1, type: "rect", x, y, width: side, height: side}),
        ])
      ];
    });
  }

  hexagonPath() {
    this.program.block("Decorate shape/hexagon-path as a canvas/path", ({find, lib:{math}, record}) => {
      let hex = find("shape/hexagon-path");
      let {x, y, side} = hex;

      let tri_height = side * 0.5;
      let tri_width = side * 0.86603;
      let width = 2 * tri_width;

      let xl = math.round(x + width);
      let xm = math.round(x + tri_width);
      let y14 = math.round(y + tri_height);
      let y34 = math.round(y + 3 * tri_height);
      let yb = math.round(y + 2 * side);
      return [
        hex.add({tag: "canvas/path"}).add("children", [
          record({sort: 1, type: "moveTo", x: xm, y}),
          record({sort: 2, type: "lineTo", x: xl, y: y14}),
          record({sort: 3, type: "lineTo", x: xl, y: y34}),
          record({sort: 4, type: "lineTo", x: xm, y: yb}),
          record({sort: 5, type: "lineTo", x, y: y34}),
          record({sort: 6, type: "lineTo", x, y: y14}),
          record({sort: 7, type: "closePath"}),
        ])
      ];
    })
  }
}

Watcher.register("shape", ShapeWatcher);
