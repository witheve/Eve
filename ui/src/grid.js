/**
 * Rect - {left:N, top:N, width:N, height:N}
 * Pos - [x:N, y:N]
 * Size - {w:N, h:N}
 * Grid - {size:Size, bounds:Rect, gutter:N}
 */

var Grid = (function(document, React, Velocity) {
  const ERR = {
    NO_PARAMS: "Must specify parameter object.",
    NO_BOUNDS: "Must specify either explicit bounds or a bounding container.",
    NO_GRID: "Must provide a valid grid to work within.",
    NO_POS: "Must provide a valid grid position.",
    NO_SIZE: "Must provide a valid size in grid cells."
  };

  return {
    makeGrid: function makeGrid(params) { // (Any) -> Grid
      if(!params) { throw new Error(ERR.NO_PARAMS); }
      var bounds = params.bounds || params.container;
      if(typeof bounds === "string") {
        bounds = document.querySelector(bounds);
      }
      if(bounds && bounds.nodeType) {
        bounds = bounds.getBoundingClientRect();
      }
      if(!bounds) { throw new Error(ERR.NO_BOUNDS); }
      return {
        size: params.size || [12, 12],
        bounds: bounds,
        gutter: params.gutter || 0
      }
    },
    updateGrid: function updateGrid(grid, opts) { // (Grid, Any) -> Grid
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!opts) { return; }
      for(var key in opts) {
        if(!opts.hasOwnProperty(key)) { continue; }
        if(key === "container") {
          grid.bounds = opts.container.getBoundingClientRect();
        } else {
          grid[key] = opts[key];
        }
      }
    },
    getRect: function getRect(grid, pos, size) { // (Grid, Pos, Size) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }

      var gapWidth = grid.gutter * (grid.size[0] - 1);
      var gapHeight = grid.gutter * (grid.size[1] - 1);
      var cellWidth = (grid.bounds.width - gapWidth) / grid.size[0];
      var cellHeight = (grid.bounds.height - gapHeight) / grid.size[1];

      var rect = {
        left: grid.bounds.left + pos[0] * cellWidth + (pos[0] === 0 ? 0 : (pos[0] - 1) * grid.gutter),
        top: grid.bounds.top + pos[1] * cellHeight + (pos[1] === 0 ? 0 : (pos[1] - 1) * grid.gutter),
        width: size[0] * cellWidth + (size[0] === 0 ? 0 : (pos[0] - 1) * grid.gutter),
        height: size[1] * cellHeight + (size[1] === 0 ? 0 : (pos[1] - 1) * grid.gutter)
      };
      return rect;
    },
    evacuateRect: function evacuateRect(grid, pos, size, from) { // (Grid, Pos, Size, Pos) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      from = from || [grid.size[0] / 2, grid.size[1] / 2];
    },
    confineRect: function confineRect(grid, pos, size, to) { // (Grid, Pos, Size, Pos) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      to = to || [grid.size[0] / 2, grid.size[1] / 2]; // @NOTE: I'm not sure this default makes sense.
    },
    findGap: function findGap(grid, size) { // (Grid, Size) -> Size?
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
    }
  };
})(window.document, React, Velocity);
window.Grid = Grid;
