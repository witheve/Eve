import macros from "../macros.sjs";

JSML = require("./jsml");

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
  var header = ["div", {class: "grid-header"}];

  fields = fields.slice();
  fields.sort(function(a, b) {
    return (a[FIELD_IX] < b[FIELD_IX]) ? -1 : 1;
  });
  foreach(field of fields) {
    var fieldName = select(names, DISPLAY_NAME_ID, field[FIELD_FIELD])[0][DISPLAY_NAME_NAME];
    header.push(["div", {class: "header", ix: field[FIELD_IX]}, fieldName]);
  }

  var card = {};
  card.$grid = JSML.parse(["div", {class: "grid"}, header]);
  card.$container = JSML.parse(
    ["div", {class: "card table-card open"},
     ["h2", name],
     card.$grid
    ]
  );

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
      rowContent = ["div", {class: "grid-row"}];

      foreach(field of row) {
        rowContent.push(["div", field]);
      }

      rowElem = JSML.parse(rowContent);
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

//var stack = data["department heads"];
//eveWatcher(stackToDiff(stack));

//---------------------------------------------------------
// Dispatcher
//---------------------------------------------------------

var currentSystem = null;

function dispatch(eventInfo) {
  unpack [event, info] = eventInfo;
  switch(event) {
    case "openView":
      // open that card?
      console.log("open: ", info);
      break;

    case "updateSearcher":
      updateSearcher(currentSystem, searcher, info);
      break;
  }
}

//---------------------------------------------------------
// Searcher
//---------------------------------------------------------

function searchForView(system, needle) {
  var results = [];
  foreach(view of system.getStore("view").getFacts()) {
    unpack [uuid] = view;
    //if(displayNames[uuid].indexOf(needle) > -1) {
    if(uuid.indexOf(needle) > -1) {
       //results.push([uuid, displayNames[uuid]]);
       results.push([uuid, uuid]);
    }
  }
  return results;
}

function updateSearcherItems(searcher, results) {
  if(results.length < searcher.maxResults) {
    for(var ix = results.length, len = searcher.maxResults; ix < len; ix++) {
      searcher.lis[ix].style.display = "none";
    }
  }
  foreach(ix, result of results) {
    if(ix >= searcher.maxResults) break;
    unpack [uuid, displayName] = result;
    searcher.lis[ix].textContent = displayName;
    searcher.lis[ix].style.display = "";
  }
  searcher.results = results;
}

function updateSearcher(system, searcher, needle) {
  var results = searchForView(system, needle);
  updateSearcherItems(searcher, results);
  return searcher;
}

function createSearcher() {
  var final = {};
  var lis = [];
  var list = document.createElement("ul");

  final.maxResults = 20;
  final.results = [];
  final.event = "openView"; //you may use the searcher for other things, like lookup?
  var itemCallback = function(e) {
    var ix = e.target.ix;
    dispatch([final.event, final.results[ix]]);
  }

  for(var ix = 0, len = final.maxResults; ix < len; ix++) {
    var elem = document.createElement("li");
    elem.style.display = "none";
    elem.ix = ix;
    elem.addEventListener("click", itemCallback);
    list.appendChild(elem);
    lis[ix] = elem;
  }

  final.lis = lis;

  final.elem = document.createElement("div");
  final.elem.className = "searcher";

  var inputCallback = function(e) {
    var value = e.target.value;
    dispatch(["updateSearcher", value]);
  }
  var input = document.createElement("input");
  input.type = "text";
  input.addEventListener("input", inputCallback);

  final.elem.appendChild(input);
  final.elem.appendChild(list);
  return final;
}

//---------------------------------------------------------
// Init
//---------------------------------------------------------

var searcher;
var currentSystem;

function init(system) {
  currentSystem = system;
  searcher = createSearcher();
  document.body.appendChild(searcher.elem);
}

module.exports.init = init;
