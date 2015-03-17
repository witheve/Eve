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

  function make2DArray(width, height, defaultValue) {
    var arr = [];
    while(arr.push([]) < width) {
      var col = arr[arr.length - 1];
      while(col.push(defaultValue) < height) {}
    }
    return arr;
  }

  return {
    DEFAULT_SIZE: [6, 3],
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
      return grid;
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
        left: grid.bounds.left + pos[0] * cellWidth + pos[0] * grid.gutter,
        top: grid.bounds.top + pos[1] * cellHeight + pos[1] * grid.gutter,
        width: size[0] * cellWidth + (size[0] - 1) * grid.gutter,
        height: size[1] * cellHeight + (size[1] - 1) * grid.gutter
      };
      return rect;
    },
    evacuateRect: function evacuateRect(grid, pos, size, from) { // (Grid, Pos, Size, Pos?) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      from = from || [grid.size[0] / 2, grid.size[1] / 2];
    },
    confineRect: function confineRect(grid, pos, size, to) { // (Grid, Pos, Size, Pos?) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      to = to || [grid.size[0] / 2, grid.size[1] / 2]; // @NOTE: I'm not sure this default makes sense.
    },
    tilesToMap: function tilesToMap(grid, tiles) { // (Grid, Tile[]) -> TileMap
      var map = make2DArray(grid.size[0], grid.size[1], 0);
      for(var ix = 0, len = tiles.length; ix < len; ix++) {
        var tile = tiles[ix];
        for(var x = tile.pos[0]; x < tile.pos[0] + tile.size[0]; x++) {
          for(var y = tile.pos[1]; y < tile.pos[1] + tile.size[1]; y++) {
            map[x][y]++;
          }
        }
      }
      return map;
    },
    hasGapAt: function hasGapAt(grid, tiles, pos, size, map) { // (Grid, Tile[], Pos, Size, TileMap?) -> Bool
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!pos) { throw new Error(ERR.NO_POS); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      if(!map) { map = Grid.tilesToMap(grid, tiles); }

      if(pos[0] + size[0] > grid.size[0]) { return false; }
      if(pos[1] + size[1] > grid.size[1]) { return false; }

      for(var x = pos[0]; x < pos[0] + size[0]; x++) {
        for(var y = pos[1]; y < pos[1] + size[1]; y++) {
          if(map[x][y] > 0) {
            return false;
          }
        }
      }
      return true;
    },
    findGap: function findGap(grid, tiles, size) { // (Grid, Tile[], Size) -> Pos?
      if(!grid) { throw new Error(ERR.NO_GRID); }
      if(!size) { throw new Error(ERR.NO_SIZE); }
      var map = Grid.tilesToMap(grid, tiles);
      for(var x = 0; x <= grid.size[0] - size[0]; x++) {
        for(var y = 0; y <= grid.size[1] - size[1]; y++) {
          if(map[x][y] > 0) { continue; }
          if(Grid.hasGapAt(grid, tiles, [x, y], size, map)) {
            return [x, y];
          }
        }
      }
    }
  };
})(window.document, React, Velocity);
window.Grid = Grid;
