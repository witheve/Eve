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
  var fields = [];
  const FIELD_VIEW = 1;
  foreach(row of stack.field) {
    if(row[FIELD_VIEW] == view) {
    }
  }
}

console.log(stackToDiff(data["department heads"]));

// [[viewId]: [rows:Fact]]
var viewUI = {};

// Update view UI in response to added, removed, or updated facts.
function diffRenderer(diffs, stack) {
  forattr(view, diff of diffs) {
    var rowId;
    var rowElem;

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
    }
  }

};
