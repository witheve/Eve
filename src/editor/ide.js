import macros from "../macros.sjs";

//---------------------------------------------------------
// Static Data
//---------------------------------------------------------

const FIELD_FIELD = 0;
const FIELD_VIEW = 1;
const FIELD_IX = 2;

//---------------------------------------------------------
// Helper Methods
//---------------------------------------------------------

// Converts a complete set of stack facts into a diff (useful for initial creation).
function stackToDiff(stack) {
  var diff = {};
  forattr(view, facts of stack) {
    diff[view] = {adds: facts};
  }
  return diff;
};

// Return the facts with the appropriate value at the given index.
function select(view, ix, value) {
  var results = [];
  foreach(row of view) {
    if(row[ix] == value) {
      results.push(row);
    }
  }

  return results;
}
module.exports.select = select;

function createTableCard(name, fields) {
  var card = {};

  card.$title = document.createElement("h2");
  card.$title.appendChild(document.createTextNode(name));

  card.$header = document.createElement("div");
  card.$header.className = "grid-header";

  fields = fields.slice();
  fields.sort(function(field) {
    return field[FIELD_IX];
  });
  foreach(field of fields) {
    var fieldHeader = document.createElement("div");
    fieldHeader.className = "header";
    fieldHeader.appendChild(document.createTextNode(field[FIELD_FIELD]));
    card.$header.appendChild(fieldHeader);
  }

  card.$grid = document.createElement("div");
  card.$grid.className = "grid";

  card.$container = document.createElement("div");
  card.$container.className = "card table-card open";

  card.$container.appendChild(card.$title);
  card.$container.appendChild(card.$grid);
  card.$grid.appendChild(card.$header);

  return card;
}

function dirtyViews(diff) {
  var rawChangedViews = [];
  foreach(field of diff.removes) {
    rawChangedViews.push(field[FIELD_VIEW]);
  }
  foreach(field of diff.adds) {
    rawChangedViews.push(field[FIELD_VIEW]);
  }

  // Unique views only.
  var changedViews = [];
  foreach(ix, view of rawChangedViews) {
    if(rawChangedViews.indexOf(view) === ix) {
      changedViews.push(view);
    }
  }
  return changedViews;
}

// [[viewId]: [rows:Fact]]
var viewsContainer = document.createElement("div");
document.body.appendChild(viewsContainer);
var viewUI = {};
// Update view UI in response to added, removed, or updated facts.
function diffRenderer(diffs, system) {
  forattr(view, diff of diffs) {
    var rowId;
    var rowElem;

    var workspaceViews = system.getStore("workspaceView").getFacts().map(function(row) {
      return row[0];
    });

    if(workspaceViews.indexOf(view) === -1) {
      continue;
    }

    // Find removed rows to prune.
    foreach(row of diff.removes) {
      rowId = factToId(row);
      // Ensure that the node exists to remove.
      if(viewUI[view][rowId]) {
        rowElem = viewUI[view][rowId];
        rowElem.parentNode.removeChild();
        viewUI[view][rowId] = undefined;
      }
    }

    // Build and insert added rows.
    foreach(row of diff.adds) {
      rowId = factToId(row);
      rowElem = document.createElement("div");
      rowElem.className = "grid-row";

      foreach(field of row) {
        var fieldElem = document.createElement("div");
        fieldElem.appendChild(document.createTextNode(field));
        rowElem.appendChild(fieldElem);
      }

      viewUI[view].$grid.appendChild(rowElem);
    }
  }
}

// Watch all eve views in stack for changes, keeping table views in sync.
function render(diffs, system) {
  console.log("HALLO");
  console.log(diffs);

  if(diffs.field) {
    var fields = system.getStore("field").getFacts();
    var dirtied = dirtyViews(diffs.field);
    foreach(view of dirtied) {
      var workspaceViews = system.getStore("workspaceView").getFacts().map(function(row) {
        return row[0];
      });

      if(workspaceViews.indexOf(view) === -1) {
        continue;
      }

      // Drop the whole card if it already exists.
      if(viewUI[view]) {
        viewUI[view].$container.parentNode.removeChild(viewUI[view].$container);
        viewUI[view] = undefined;
      }

      // Create the new card.
      var viewFields = select(fields, FIELD_VIEW, view);
      viewUI[view] = createTableCard(view, viewFields);
      viewsContainer.appendChild(viewUI[view].$container);
    }
  }

  diffRenderer(diffs, system);
}
module.exports.render = render;

//var stack = data["department heads"];
//eveWatcher(stackToDiff(stack));
