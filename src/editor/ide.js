import macros from "../macros.sjs";

var JSML = require("./jsml");
var helpers = require("./helpers");
var Card = require("./card");
var grid = require("./grid");

//---------------------------------------------------------
// Data
//---------------------------------------------------------

const FIELD_FIELD = 0;
const FIELD_VIEW = 1;
const FIELD_IX = 2;

const DISPLAY_NAME_ID = 0;
const DISPLAY_NAME_NAME = 1;

const WORKSPACE_VIEW_VIEW = 0;

//---------------------------------------------------------
// Rendering
//---------------------------------------------------------

var viewUI = {};
var viewsContainer = $("#cards")[0];

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

function ensureCard(view, system) {
  if(!viewUI[view]) {
    var fields = system.getStore("field").getFacts();
    var displayNames = system.getStore("displayName").getFacts();
    viewUI[view] = new Card(view, view, system);
    var $container = viewUI[view].renderCard(displayNames, fields);
    viewsContainer.appendChild($container);
  }
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
    ensureCard(view, system);
    viewUI[view].removeRows(diff.removes);
    viewUI[view].addRows(diff.adds);
  }
  grid.makeGrid(document.querySelector("#cards"), {gridSize: [5,2],
                                                   marginSize: [10,10]});
}
module.exports.render = render;

//---------------------------------------------------------
// Input
//---------------------------------------------------------
var input = {
  elem: JSML.parse(["input", {style: {width: 0, height: 0, opacity: 0}}]),
  selection: null,
  handlers: {},
  handle: function(handlers) {
    input.elem.blur();
    forattr(event, handler of handlers) {
      input.elem.addEventListener(event, handler);
    }
    input.handlers = handlers;
  }
};

input.elem.addEventListener("blur", function blurHandler(evt) {
  // Handle blur events, which would otherwise be deleted before firing.
  if(input.handlers["blur"]) {
    input.handlers["blur"](evt);
  }

  forattr(event, handler of input.handlers) {
    input.elem.removeEventListener(event, handler);
  }

  input.elem.value = "";
  input.handlers = {};
});

function selectField(card, rowId, ix) {
  var programWorker = global.programWorker;

  if(input.selection) {
    input.elem.blur();
  }
  card.selectField(rowId, ix);
  input.selection = {
    card: card,
    field: [rowId, ix]
  };
  if(card.type === "input-card") {
    input.handle({
      input: function(evt) {
        var $field = card.getField(rowId, ix);
        $field.textContent = evt.target.value;
      },
      keypress: function(evt) {
        var key = evt.key || evt.keyIdentifier;
        if(key === "Enter") {
          input.elem.blur();
        }
      },
      blur: function(evt) {
        card.selectField();
        var data = evt.target.value;
        if(!data) { return; }

        var oldFact = idToFact(rowId);
        var fact = oldFact.slice();
        fact[ix] = (isNaN(data)) ? data : +data;
        var diffs = {};
        diffs[card.id] = {adds: [fact], removes: [oldFact]};
        dispatch(["diffs", diffs]);
      }
    });

    input.elem.focus();
  }
}

//---------------------------------------------------------
// Dispatcher
//---------------------------------------------------------

var currentSystem = null;

function dispatch(eventInfo) {
  unpack [event, info] = eventInfo;
  switch(event) {
    case "openView":
      // open that card?
      unpack [uuid, name] = info;
      var diff = {"workspaceView": {adds: [[uuid]], removes: []}};
      applySystemDiff({system: currentSystem}, diff);
      dispatch(["diffs", diff]);
      console.log("open: ", info);
      break;

    case "diffs":
      programWorker.postMessage({type: "diffs", diffs: info});
      break;

    case "sortCard":
      eventInfo[1].sortBy(eventInfo[2], eventInfo[3]);
      break;

    case "selectField":
      selectField(eventInfo[1], eventInfo[2], eventInfo[3]);
      break;

    case "updateSearcher":
      updateSearcher(currentSystem, searcher, info);
      break;

    case "blurSearcher":
    case "focusSearcher":
      activateSearcher(searcher, event);
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

function activateSearcher(searcher, focusOrBlur) {
  if(focusOrBlur === "focusSearcher") {
    searcher.elem.classList.add("active");
  } else {
    setTimeout(function() {
      searcher.elem.classList.remove("active");
    }, 200);
  }
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

  var input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search";
  input.addEventListener("input", function(e) {
    var value = e.target.value;
    dispatch(["updateSearcher", value]);
  });
  input.addEventListener("focus", function(e) {
    dispatch(["focusSearcher", null]);
  });
  input.addEventListener("blur", function(e) {
    dispatch(["blurSearcher", null]);
  });

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
  document.body.appendChild(input.elem);
}

module.exports.init = init;
