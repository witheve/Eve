import macros from "../macros.sjs";

//---------------------------------------------------------
// Static Data
//---------------------------------------------------------

const FIELD_FIELD = 0;
const FIELD_VIEW = 1;
const FIELD_IX = 2;

const DISPLAY_NAME_ID = 0;
const DISPLAY_NAME_NAME = 1;

const WORKSPACE_VIEW_VIEW = 0;

//---------------------------------------------------------
// Helper Methods
//---------------------------------------------------------

// Plucks the given index out of the arrays or objects in an array.
function pluck(arr, field) {
  var results = Array(arr.length);
  foreach(ix, item of arr) {
    results[ix] = item[field];
  }
  return results;
}

// Return the facts where the given field index contains value.
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

// Return the facts where the given field index contains a matching value.
function contains(view, ix, values) {
  var results = [];
  foreach(row of view) {
    if(values.indexOf(row[ix]) !== -1) {
      results.push(row);
    }
  }
  return results;
}
module.exports.contains = contains;

// Create a card with the given name and fields.
function createTableCard(name, fields, names) {
  var card = {};

  card.$title = document.createElement("h2");
  card.$title.appendChild(document.createTextNode(name));

  card.$header = document.createElement("div");
  card.$header.className = "grid-header";

  fields = fields.slice();
  fields.sort(function(a, b) {
    return (a[FIELD_IX] < b[FIELD_IX]) ? -1 : 1;
  });
  foreach(field of fields) {
    var fieldNameFacts = select(names, DISPLAY_NAME_ID, field[FIELD_FIELD]);
    var fieldName = fieldNameFacts[0][DISPLAY_NAME_NAME];

    var fieldHeader = document.createElement("div");
    fieldHeader.className = "header";
    fieldHeader.appendChild(document.createTextNode(fieldName));
    fieldHeader.setAttribute("ix", field[FIELD_IX]);
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
$("#cards")[0].appendChild(viewsContainer);
var viewUI = {};

// Update view UI in response to added, removed, or updated facts.
function diffRenderer(diffs, views) {
  foreach(view of views) {
    var diff = diffs[view];
    if(!diff) {
      continue;
    }

    var rowId;
    var rowElem;

    // Find removed rows to prune.
    foreach(row of diff.removes) {
      rowId = factToId(row);
      if(viewUI[view][rowId]) {
        rowElem = viewUI[view][rowId];
        rowElem.parentNode.removeChild(rowElem);
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

      viewUI[view][rowId] = rowElem;
      viewUI[view].$grid.appendChild(rowElem);
    }
  }
}

// Watch all eve views in stack for changes, keeping table views in sync.
function render(diffs, system) {
  var workspaceViews = pluck(system.getStore("workspaceView").getFacts(), WORKSPACE_VIEW_VIEW);

  if(diffs.field) {
    var displayNames = system.getStore("displayName").getFacts();
    var fields = system.getStore("field").getFacts();
    var dirtied = dirtyViews(diffs.field);
    foreach(view of dirtied) {
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
      var fieldNames = contains(displayNames, DISPLAY_NAME_ID, pluck(viewFields, FIELD_FIELD));
      viewUI[view] = createTableCard(view, viewFields, fieldNames);
      viewsContainer.appendChild(viewUI[view].$container);
    }
  }

  diffRenderer(diffs, workspaceViews);
}
module.exports.render = render;
