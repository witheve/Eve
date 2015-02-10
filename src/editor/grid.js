import macros from "../macros.sjs";

function getSizeAndPosition(grid, size, position) {
  var obj = {};
  unpack [width, height] = size;
  unpack [row, col] = position;
  obj.top = row * grid.unitHeight + row * grid.colMargin;
  obj.left = col * grid.unitWidth + col * grid.rowMargin;
//   obj.transform = "translate3d(" + left + "px, " + top + "px, 0)"
  obj.width = width * grid.unitWidth + ((width - 1) * grid.colMargin);
  obj.height = height * grid.unitHeight + ((height - 1) * grid.rowMargin);
  return obj;
}
module.exports.getSizeAndPosition = getSizeAndPosition;

function wrapPosition(grid, ix, obj) {
  var row = Math.floor(ix / grid.cols);
  var col = ix - (row * grid.cols);
  obj.top = row * grid.unitHeight + row * grid.colMargin;
  obj.left = col * grid.unitWidth + col * grid.rowMargin;
  obj.width = grid.unitWidth;
  obj.height = grid.unitHeight;
  return obj;
}
module.exports.wrapPosition = wrapPosition;

function indexToRowCol(grid, ix) {
  var row = Math.floor(ix / grid.cols);
  var col = ix - (row * grid.cols);
  return [row, col];
}
module.exports.indexToRowCol = indexToRowCol;

function layout(grid) {
  var children = grid.container.children;
  foreach(ix, child of children) {
    var row = Math.floor(ix / grid.cols);
    var col = ix - (row * grid.cols);
    child.style.top = row * grid.unitHeight + row * grid.colMargin;
    child.style.left = col * grid.unitWidth + col * grid.rowMargin;
    child.style.width = grid.unitWidth;
    child.style.height = grid.unitHeight;
  }
}
module.exports.layout = layout;

// options: {
//   dimensions: [1000,1000], // pixel width, height of grid
//   gridSize: [20,20], // number of rows, cols
//   marginSize: [20,20], // margin in pixels
// }
function makeGrid(container, options) {
  var grid = {
    container: container,
    rows: options["gridSize"][0],
    cols: options["gridSize"][1],
    rowMargin: options["marginSize"][0],
    colMargin: options["marginSize"][1],
    width: options["dimensions"][0],
    height: options["dimensions"][1],
    positions: [],
    items: {}
  };

  grid.unitWidth = Math.floor(grid.width / grid.cols) - grid.rowMargin;
  grid.unitHeight = Math.floor(grid.height / grid.rows) - grid.colMargin;

  return grid;
}
module.exports.makeGrid = makeGrid;

function addGridItem(grid, item, position, size) {

}

