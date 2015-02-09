import macros from "../macros.sjs";

function setSizeAndPosition(grid, child, size, position) {
  unpack [width, height] = size;
  unpack [row, col] = position;
  child.style.top = row * grid.unitHeight + row * grid.colMargin;
  child.style.left = col * grid.unitWidth + col * grid.rowMargin;
  child.style.width = width * grid.unitWidth + width * grid.colMargin;
  child.style.height = height * grid.unitHeight + height * grid.rowMargin;
}
module.exports.setSizeAndPosition = setSizeAndPosition;

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

