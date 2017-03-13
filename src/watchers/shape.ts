import {Watcher, RawValue, RawEAV, RawEAVC} from "./watcher";

class ShapeWatcher extends Watcher {
  setup() {
    this.program.attach("html");
    this.hexagonBlocks();
    this.hexGridBlocks();
  }

  //--------------------------------------------------------------------
  // #shape/hexagon
  //--------------------------------------------------------------------
  hexagonBlocks() {
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
  hexGridBlocks() {
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
            tag: "shape/hexagon",
            side,
            style: record({position: "absolute", left: x, top: y})
          })
        ])
      ];
    });
  }
}

Watcher.register("shape", ShapeWatcher);
