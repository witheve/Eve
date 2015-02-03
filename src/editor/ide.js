import macros from "../macros.sjs";

var helpers = require("./helpers");
var Card = require("./card");

//---------------------------------------------------------
// Data
//---------------------------------------------------------

const FIELD_FIELD = 0;
const FIELD_VIEW = 1;
const FIELD_IX = 2;

const DISPLAY_NAME_ID = 0;
const DISPLAY_NAME_NAME = 1;

const WORKSPACE_VIEW_VIEW = 0;

var viewUI = {};
var viewsContainer = document.createElement("div");
$("#cards")[0].appendChild(viewsContainer);


//---------------------------------------------------------
// Helper Methods
//---------------------------------------------------------


// Find all views dirtied in the `field` diff.
function dirtyViews(diff, views) {

  var rawChangedViews = [];
  foreach(field of helpers.contains(diff.removes, FIELD_VIEW, views)) {
    rawChangedViews.push(field[FIELD_VIEW]);
  }
  foreach(field of helpers.contains(diff.adds, FIELD_VIEW, views)) {
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



// Watch all eve views in stack for changes, keeping table views in sync.
function render(diffs, system) {
  var workspaceViews = helpers.pluck(system.getStore("workspaceView").getFacts(), WORKSPACE_VIEW_VIEW);
  // Add/update/remove cards in response to added or removed fields and views.
  if(diffs.field) {
    var dirtied = dirtyViews(diffs.field, workspaceViews);
    var fields = system.getStore("field").getFacts();
    var displayNames = system.getStore("displayName").getFacts();

    foreach(view of dirtied) {
      if(!viewUI[view]) {
        viewUI[view] = new Card(view, view, system);
      }

      var $container = viewUI[view].renderCard(displayNames, fields);
      viewsContainer.appendChild($container);
    }
  }

  // Add/update/remove rows in response to added or removed facts in all views.
  forattr(view, diff of diffs) {
    if(workspaceViews.indexOf(view) === -1) { continue; }
    viewUI[view].removeRows(diff.removes);
    viewUI[view].addRows(diff.adds);
  }
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

    case "sortCard":
      eventInfo[1].sortBy(eventInfo[2], eventInfo[3]);
      break;

    case "updateSearcher":
      updateSearcher(currentSystem, searcher, info);
      break;
  }
}
module.exports.dispatch = dispatch;

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
