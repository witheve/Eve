import macros from "../macros.sjs";

JSML = require("./jsml");
incrementalUI = require("./incrementalUI");


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

// Find all views dirtied in the `field` diff.
function dirtyViews(diff, views) {

  var rawChangedViews = [];
  foreach(field of contains(diff.removes, FIELD_VIEW, views)) {
    rawChangedViews.push(field[FIELD_VIEW]);
  }
  foreach(field of contains(diff.adds, FIELD_VIEW, views)) {
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

//---------------------------------------------------------
// Card
//---------------------------------------------------------

function Card(id, name, system) {
  this.name = id;
  this.id = name;
  this.system = system;
  this.rows = {};
  this.sortIx = 0;
  this.sortDir = 1;
}

Card.prototype = {
  //-------------------------------------------------------
  // Data Methods
  //-------------------------------------------------------
  getFacts: function() {
    return this.system.getStore(this.id).getFacts();
  },

  getFields: function(fields) {
    fields = fields || this.system.getStore("field").getFacts();
    return select(fields, FIELD_VIEW, this.id);
  },

  // Get a mapping of {[id:String]: name:String}
  getNameMap: function(names, fields) {
    names = names || this.system.getStore("displayName").getFacts();
    fields = this.getFields(fields);
    var fieldIds = pluck(fields, FIELD_FIELD);
    var fieldNames = contains(names, DISPLAY_NAME_ID, fieldIds);
    return fieldNames.reduce(function(memo, nameFact) {
      unpack [id, name] = nameFact;
      memo[id] = name;
      return memo;
    }, {});
  },

  sortBy: function(ix, dir) {
    this.sortIx = ix;
    this.sortDir = dir;
    var facts = this.getFacts();

    foreach(ix, fact of facts) {
      var rowId = factToId(fact);
      this.rows[rowId].eveSortValue = fact[this.sortIx];
    }

    foreach(ix, fact of facts) {
      var rowId = factToId(fact);
      this.appendRow(this.rows[rowId]);
    }
  },

  //-------------------------------------------------------
  // View Methods
  //-------------------------------------------------------
  appendRow: function($child) {
    if(!this.$rows.childNodes.length) {
      console.log("appendFirst", this.name, $child);
      return this.$rows.appendChild($child);
    }

    switch(this.sortDir) {
      case 1:
        console.log("Asc", this.name, $child);
        incrementalUI.appendSortElement(this.$rows, $child);
        break;
      case -1:
        console.log("Desc", this.name, $child);
        incrementalUI.appendSortElementDesc(this.$rows, $child);
        break;
      default:
        console.log("Default", this.name, $child);
        this.$rows.appendChild($child);
    }
  },

  renderCard: function(names, fields) {
    fields = this.getFields(fields).slice();
    fields.sort(function(a, b) {
      return (a[ix] > b[ix]) ? 1 : -1;
    });
    var nameMap = this.getNameMap(names, fields);

    if(this.$container) {
      this.$container.parentNode.removeChild(this.$container);
      this.$container = this.$rows = null;
    }

    // Populate the grid-header with field headers.
    var header = ["div", {class: "grid-header"}];
    foreach(fieldFact of fields) {
      unpack [field, view, ix] = fieldFact;
      var handler = this._sortTableHandler(this, ix);
      header.push(
        ["div", {class: "header", ix: ix},
         nameMap[field],
         ["button", {class: "sort-btn", "sort-dir": 0, click: handler}]
        ]
      );
    }

    this.$rows = JSML.parse(["div"]);
    this.$container = JSML.parse(
      ["div", {class: "card table-card open"},
       ["h2", name],
       ["div", {class: "grid"}, header, this.$rows]
      ]
    );

    return this.$container;
  },

  _sortTableHandler: function(self, ix) {
    return function(evt) {
      var sortDir = +evt.target.getAttribute("sort-dir") + 1;
      if(sortDir > 1) {
        sortDir = -1;
      }

      $(self.$container).find(".sort-btn").attr("sort-dir", 0);
      evt.target.setAttribute("sort-dir", sortDir);
      dispatch(["sortCard", self, ix, sortDir]);
    };
  },

  renderRows: function() {
    var facts = this.getFacts();
    this.addRows(facts);
  },

  clearRows: function() {
    forattr(id, $row of this.$rows) {
      this.$rows.removeChild($row);
      this.rows[id] = undefined;
    }
  },

  removeRows: function(removes) {
    foreach(row of removes) {
      var rowId = factToId(row);
      var $row = this.rows[rowId];
      if($row) {
        this.$rows.removeChild($row);
        this.rows[rowId] = undefined;
      }
    }
  },

  addRows: function(adds) {
    foreach(fact of adds) {
      var row = ["div", {class: "grid-row"}];
      foreach(field of fact) {
        row.push(["div", field]);
      }

      var $row = JSML.parse(row);
      $row.eveSortValue = fact[this.sortIx];
      var rowId = factToId(fact);
      this.rows[rowId] = $row;
      this.appendRow($row);
    }
  }
};


// Watch all eve views in stack for changes, keeping table views in sync.
function render(diffs, system) {
  var workspaceViews = pluck(system.getStore("workspaceView").getFacts(), WORKSPACE_VIEW_VIEW);
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
