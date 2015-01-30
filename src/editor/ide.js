import macros from "../macros.sjs";

var data = require("./data.json");

function stackToDiff(stack) {
  var diff = {};
  forattr(view, facts of stack) {
    diff[view] = {adds: facts};
  }
  return diff;
};

function getFields(view, stack) {
  const FIELD_FIELD = 0;
  const FIELD_VIEW = 1;

  var fields = [];
  foreach(row of stack.field) {
    if(row[FIELD_VIEW] == view) {
      fields.push(row);
    }
  }

  return fields;
}



// [[viewId]: [rows:Fact]]
var viewsContainer = document.createElement("div");
document.body.appendChild(viewsContainer);
var viewUI = {};
// Update view UI in response to added, removed, or updated facts.
function diffRenderer(diffs) {
  document.body.removeChild(viewsContainer);
  forattr(view, diff of diffs) {
    var rowId;
    var rowElem;
    console.log('V', view, 'D', diff);

    if(!viewUI[view]) {
      var viewContainer = document.createElement("div");
      viewContainer.className = "card table-card open";
      var viewGrid = document.createElement("div");
      viewGrid.className = "grid";
      viewContainer.appendChild(viewGrid);
      viewUI[view] = {
        $container: viewContainer,
        $title: null, //@FIXME
        $header: null, //@FIXME
        $grid: viewGrid
      };
      viewsContainer.appendChild(viewContainer);
    }

    // Find removed rows to prune.
    foreach(row of diff.removes) {
      rowId = factToId(row);
      // Ensure that the node exists to remove.
      if(viewUI[view] && viewUI[view][rowId]) {
        rowElem = viewUI[view][rowId];
        rowElem.parentNode.removeChild();
      }
    }

    // Build and insert added rows.
    foreach(row of diff.adds) {
      rowId = factToId(row);
      rowElem = document.createElement("div");

      foreach(field of row) {
        var fieldElem = document.createElement("div");
        fieldElem.className = "grid-row";
        fieldElem.appendChild(document.createTextNode(field));
        rowElem.appendChild(fieldElem);
      }

      viewUI[view].$grid.appendChild(rowElem);
    }
  }
  document.body.appendChild(viewsContainer);
}


var diffs = stackToDiff(data["department heads"]);
console.log(diffs);

diffRenderer(diffs);
