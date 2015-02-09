import macros from "../macros.sjs";

var React = require("react/addons");
var JSML = require("./jsml");
var helpers = require("./helpers");
var Card = require("./card");
var grid = require("./grid");

//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var currentSystem;
var indexer;

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
// Indexer
//---------------------------------------------------------

var indexers = {
  makeLookup: function(keyIx, valueIx) {
    return function(cur, diffs) {
      var final = cur || {};
      foreach(add of diffs.adds) {
        final[add[keyIx]] = add[valueIx];
      }
      foreach(remove of diffs.removes) {
        final[remove[keyIx]] = null;
      }
      return final;
    }
  },
  makeCollector: function(keyIx) {
    return function(cur, diffs) {
      var final = cur || {};
      foreach(add of diffs.adds) {
        if(!final[add[keyIx]]) {
          final[add[keyIx]] = [];
        }
        final[add[keyIx]].push(add);
      }
      foreach(remove of diffs.removes) {
        final[remove[keyIx]] = final[remove[keyIx]].filter(function(cur) {
          return !arrayEqual(cur, remove)
        });
      }
      return final;
    }
  }
};

function Indexer(system) {
  this.system = system;
  this.tableToIndexes = {};
  this.indexes = {};
  this.tablesToForward = [];
};

Indexer.prototype = {
  handleDiffs: function(diffs, fromProgram) {
    var tableToIndexes = this.tableToIndexes;
    var indexes = this.indexes;
    var system = this.system;
    var cur;
    forattr(table, diff of diffs) {
      if(tableToIndexes[table]) {
        foreach(index of tableToIndexes[table]) {
          cur = this.indexes[index];
          cur.index = cur.indexer(cur.index, diff);
        }
      }
      applyDiff(system, table, diff);
    }

    //we should only forward diffs to the program if they weren't
    //from the program to bgin with.
    if(!fromProgram) {
      var toSend = {};
      foreach(table of this.tablesToForward) {
        if(!diffs[table]) continue;
        toSend[table] = diffs[table];
      }
      programWorker.postMessage({type: "diffs", diffs: toSend});
    }

    dispatch(["diffsHandled", diffs]);
  },
  facts: function(table) {
    return this.system.getStore(table).getFacts();
  },
  index: function(index) {
    return this.indexes[index].index;
  },
  addIndex: function(table, name, indexer) {
    if(!this.tableToIndexes[table]) {
      this.tableToIndexes[table] = [];
    }
    this.tableToIndexes[table].push(name);
    //initialize the index by sending an add of all the facts we have now.
    this.indexes[name] = {index: indexer(null, {adds: this.facts(table), removes: []}),
                          indexer: indexer};
  },
  forward: function(table) {
    this.tablesToForward.push(table);
  },
  unforward: function(table) {
    this.tablesToForward.remove(table);
  }
};

//---------------------------------------------------------
// React helpers
//---------------------------------------------------------

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
};

//---------------------------------------------------------
// Root
//---------------------------------------------------------

var Root = React.createFactory(React.createClass({
  render: function() {
    var tables = indexer.facts("workspaceView").map(function(cur, ix) {
      return tiles.table({table: cur[0],
                          ix: ix + 1});
    })
    return JSML.react(["div",
                       ReactSearcher(),
                       ["div", {"id": "cards"},
                        tiles.ui({ix: 0}),
                        tables
                        ]]);
  }
}));

//---------------------------------------------------------
// tiles
//---------------------------------------------------------

var tileGrid;

var tiles = {
  table: reactFactory({
    header: reactFactory({
      render: function() {
        var name = indexer.index("displayName")[this.props.field[0]];
        return JSML.react(["div", {"className": "header"}, name]);
      }
    }),
    row: reactFactory({
      render: function() {
        var fields = [];
        foreach(field of this.props.row) {
          fields.push(["div", field]);
        }
        return JSML.react(["div", {"className": "grid-row"}, fields]);
      }
    }),
    render: function() {
      var self = this;
      var headers = indexer.index("viewToFields")[this.props.table].sort(function(a, b) {
        return a[2] - b[2];
      }).map(function(cur) {
        return self.header({field: cur});
      });
      var rows = indexer.facts(this.props.table).map(function(cur) {
        return self.row({row: cur});
      });
      return JSML.react(["div", {"className": "card",
                                 "style": grid.wrapPosition(tileGrid, this.props.ix, {})},
                         ["h2", this.props.table],
                         ["div", {"className": "grid"},
                          ["div", {"className": "grid-header"},
                            headers],
                          ["div", {"className": "grid-rows"},
                            rows]]]);
    }
  }),
  ui: reactFactory({
    render: function() {
      return JSML.react(["div", {"className": "card uiCard",
                                "style": grid.wrapPosition(tileGrid, this.props.ix, {})}]);
    }
  })
};


//---------------------------------------------------------
// Dispatcher
//---------------------------------------------------------

var currentSystem = null;

function dispatch(eventInfo) {
  unpack [event, info] = eventInfo;
  switch(event) {
    case "diffsHandled":
      React.render(Root(), document.body);
      break;
    case "openView":
      // open that card?
      unpack [uuid, name] = info;
      var diff = {"workspaceView": {adds: [[uuid]], removes: []}};
      indexer.handleDiffs(diff);
      console.log("open: ", info);
      break;

    case "sortCard":
      eventInfo[1].sortBy(eventInfo[2], eventInfo[3]);
      break;

    case "selectField":
      selectField(eventInfo[1], eventInfo[2], eventInfo[3]);
      break;

    case "selectCard":
      if(mode === "grid") {
        window.history.pushState({cardName: info.name}, info.name, "/" + info.name);
//         selectCard(info);
      } else {
        //window.history.pushState({}, "eve", "/");
        //deselectCard();
      }
      break;

    case "locationChange":
      if(info.state && info.state.cardName && viewUI[info.state.cardName]) {
//         selectCard(viewUI[info.state.cardName]);
      } else if(mode !== "grid") {
//         deselectCard();
      }
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
    // @FIXME: temporary hack for better searching until we use display names.
    if(uuid.toLowerCase().indexOf(needle.toLowerCase()) > -1) {
      //results.push([uuid, displayNames[uuid]]);
      results.push([uuid, uuid]);
    }
  }
  return results;
}

var ReactSearcher = reactFactory({
  getInitialState: function() {
    return {search: ""};
  },

  input: function(e) {
    this.setState({search: e.target.value});
  },

  focus: function(e) { this.setState({active: true}); },
  blur: function(e) {
    var self = this;
    setTimeout(function() {
      self.setState({active: false})
    }, 200);
  },

  render: function() {
    var cx = React.addons.classSet;
    var possible = searchForView(currentSystem, this.state.search);
    var results = [];
    for(var i = 0; i < 20; i++) {
      results.push(SearcherItem({item: possible[i], event: "openView"}));
    }
    return JSML.react(["div", {"className": cx({"searcher": true,
                                                "active": this.state.active})},
                       ["input", {"type": "text",
                                  "onFocus": this.focus,
                                  "onBlur": this.blur,
                                  "onInput": this.input}],
                       ["ul", {},
                        results]]);
  }
});

var SearcherItem = reactFactory({
  click: function() {
    dispatch([this.props.event, this.props.item]);
  },
  render: function() {
    var display = this.props.item ? "" : "none";
    var name = this.props.item ? this.props.item[0] : "";
    return JSML.react(["li", {"onClick": this.click, style: {display: display}}, name]);
  }
});

//---------------------------------------------------------
// Init
//---------------------------------------------------------

function init(system) {
  currentSystem = system;
  window.indexer = indexer = new Indexer(system);
  indexer.addIndex("displayName", "displayName", indexers.makeLookup(0, 1));
  indexer.addIndex("field", "viewToFields", indexers.makeCollector(1));
  indexer.addIndex("tag", "idToTags", indexers.makeCollector(0));
  indexer.forward("workspaceView");
  var dims = document.body.getBoundingClientRect();
  tileGrid = grid.makeGrid(document.body, {
    dimensions: [dims.width - 50, dims.height - 110],
    gridSize: [5,2],
    marginSize: [10,10]
  });
  React.render(Root(), document.body);
  window.addEventListener("popstate", function(e) {
    dispatch(["locationChange", event]);
  });
}

module.exports.init = init;


function handleProgramDiffs(diffs) {
  indexer.handleDiffs(diffs, true);
}
module.exports.handleProgramDiffs = handleProgramDiffs;
