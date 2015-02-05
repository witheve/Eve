import macros from "../macros.sjs";

function layout(grid) {

}

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

