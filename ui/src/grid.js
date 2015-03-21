/**
 * Pos - [x:N, y:N]
 * Size - {w:N, h:N}
 * Tile - {pos:Pos, size:Size}
 * Rect - {left:N, top:N, width:N, height:N}
 * Grid - {size:Size, bounds:Rect, gutter:N}
 */

var Grid = (function(document, React, Velocity) {
  const ERR = {
    NO_PARAMS: "Must specify parameter object.",
    NO_BOUNDS: "Must specify either explicit bounds or a bounding container.",
    NO_GRID: "Must provide a valid grid to work within.",
    NO_TILE: "Must provide a valid tile.",
    NO_POS: "Must provide a valid grid position.",
    NO_SIZE: "Must provide a valid size in grid cells."
  };

  function make2DArray(width, height, defaultValue) {
    var arr = new Array(width);
    for(var x = 0; x < width; x++) {
      arr[x] = [];
      for(var y = 0; y < height; y++) {
        arr[x][y] = defaultValue;
      }
    }
    return arr;
  }

  function assertTile(tile) {
    if(!tile) { throw new Error(ERR.NO_TILE); }
    if(!tile.pos) { throw new Error(ERR.NO_POS); }
    if(!tile.size) { throw new Error(ERR.NO_SIZE); }
    return true;
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

      var grid = {
        size: params.size || [12, 12],
        bounds: {top: bounds.top, left: bounds.left, bottom: bounds.bottom, right: bounds.right, width: bounds.width, height: bounds.height},
        gutter: params.gutter || 0,
      };

      var gapWidth = grid.gutter * (grid.size[0] - 1);
      var gapHeight = grid.gutter * (grid.size[1] - 1);
      grid.calculated = {
        cellWidth: (grid.bounds.width - gapWidth) / grid.size[0],
        cellHeight: (grid.bounds.height - gapHeight) / grid.size[1],
        snapWidth: grid.bounds.width / grid.size[0],
        snapHeight: grid.bounds.height / grid.size[1]
      };
      return grid;
    },
    getRect: function getRect(grid, tile) { // (Grid, Tile) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      assertTile(tile);

      var rect = {
        left: grid.bounds.left + tile.pos[0] * grid.calculated.cellWidth + tile.pos[0] * grid.gutter,
        top: grid.bounds.top + tile.pos[1] * grid.calculated.cellHeight + tile.pos[1] * grid.gutter,
        width: tile.size[0] * grid.calculated.cellWidth + (tile.size[0] - 1) * grid.gutter,
        height: tile.size[1] * grid.calculated.cellHeight + (tile.size[1] - 1) * grid.gutter
      };
      // rect.right = grid.bounds.right - (rect.left + rect.width);
      // rect.bottom = grid.bounds.bottom - (rect.top + rect.height);
      return rect;
    },
    evacuateRect: function evacuateRect(grid, tile, from) { // (Grid, Tile, Pos?) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      assertTile(tile);
      from = from || [grid.size[0] / 2, grid.size[1] / 2];
      console.warn("@TODO: Implement me");
    },
    confineRect: function confineRect(grid, tile, to) { // (Grid, Tile, Pos?) -> Rect
      if(!grid) { throw new Error(ERR.NO_GRID); }
      assertTile(tile);
      to = to || [grid.size[0] / 2, grid.size[1] / 2]; // @NOTE: I'm not sure this default makes sense.
      console.warn("@TODO: Implement me");
    },
    coordsToPos: function coordsToPos(grid, x, y, round) { // (Grid, N, N, Bool?) -> Pos
      if(!grid) { throw new Error(ERR.NO_GRID); }
      x = (x - grid.bounds.left) / grid.calculated.snapWidth;
      y = (y - grid.bounds.top) / grid.calculated.snapHeight;
      if(round) { return [Math.round(x), Math.round(y)]; }
      else { return [Math.floor(x), Math.floor(y)]; }
    },
    coordsToSize: function coordsToSize(grid, w, h, round) { // (Grid, N, N, Bool?) -> Size
      if(!grid) { throw new Error(ERR.NO_GRID); }
      w = w / grid.calculated.snapWidth;
      h = h / grid.calculated.snapHeight;
      if(round) { return [Math.round(w), Math.round(h)]; }
      else { return [Math.floor(w), Math.floor(h)]; }
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
    hasGapAt: function hasGapAt(grid, tiles, tile, map) { // (Grid, Tile[], Pos, Size, TileMap?) -> Bool
      if(!grid) { throw new Error(ERR.NO_GRID); }
      assertTile(tile);
      if(!map) { map = Grid.tilesToMap(grid, tiles); }

      if(tile.pos[0] < 0) { return false; }
      if(tile.pos[1] < 0) { return false; }
      if(tile.pos[0] + tile.size[0] > grid.size[0]) { return false; }
      if(tile.pos[1] + tile.size[1] > grid.size[1]) { return false; }

      for(var x = tile.pos[0]; x < tile.pos[0] + tile.size[0]; x++) {
        for(var y = tile.pos[1]; y < tile.pos[1] + tile.size[1]; y++) {
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
      var tile = {pos: undefined, size: size};
      for(var x = 0; x <= grid.size[0] - size[0]; x++) {
        for(var y = 0; y <= grid.size[1] - size[1]; y++) {
          if(map[x][y] > 0) { continue; }
          tile.pos = [x, y];
          if(Grid.hasGapAt(grid, tiles, tile, map)) {
            return [x, y];
          }
        }
      }
    },
    tilesToText: function(grid, tiles) {
      var map = Grid.tilesToMap(grid, tiles);
      var result = [];
      for(var x = 0; x < map.length; x++) {
        for(var y = 0; y < map[x].length; y++) {
          result[y] = result[y] || [];
          result[y][x] = map[x][y];
        }
      }
      return result.map(function(row) { return row.join(" | "); }).join("\n");
    }
  };
})(window.document, React, Velocity);
window.Grid = Grid;
