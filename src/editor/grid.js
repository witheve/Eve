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
    positions: [],
    items: {}
  };

  var dimensions = container.getBoundingClientRect();
  grid.unitWidth = Math.floor(dimensions.width / grid.cols) - grid.rowMargin;
  grid.unitHeight = Math.floor(dimensions.height / grid.rows) - grid.colMargin;

  var children = container.children;
  foreach(ix, child of children) {
    var row = Math.floor(ix / grid.cols);
    var col = ix - (row * grid.cols);
    child.style.top = row * grid.unitHeight + row * grid.colMargin;
    child.style.left = col * grid.unitWidth + col * grid.rowMargin;
    child.style.width = grid.unitWidth;
    child.style.height = grid.unitHeight;
  }

  return grid;
}
module.exports.makeGrid = makeGrid;

function addGridItem(grid, item, position, size) {

}

