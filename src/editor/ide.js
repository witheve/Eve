import macros from "../macros.sjs";

var React = require("react/addons");
var JSML = require("./jsml");
var helpers = require("./helpers");
var Card = require("./card");
var grid = require("./grid");

//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var indexer;

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
    var cur = this.indexes[index];
    if(!cur) throw new Error("No index named: " + index);
    return cur.index;
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
// Index helpers
//---------------------------------------------------------

function hasTag(id, needle) {
  var tags = indexer.index("idToTags")[id];
  foreach(tagEntry of tags) {
    unpack [uuid, tag] = tagEntry;
    if(tag === needle) return true;
  }
  return false;
}

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
  getInitialState: function() {
    return {activeRow: false, activeCol: false};
  },
  click: function() {
//     if(this.state.activeRow === false) {
//       this.setState({activeRow: 1, activeCol: 1});
//     } else {
//       this.setState({activeRow: false, activeCol: false});
//     }
  },
  calculateRowCol: function(row, col) {
    var newRow = row;
    var newCol = col;
    if(this.state.activeRow !== false) {
      var rowOffset = row - this.state.activeRow;
      var colOffset = col - this.state.activeCol;
      var rowEdge = rowOffset > 0 ? tileGrid.rows + 1 : (rowOffset < 0 ? -2 : row);
      var colEdge = colOffset > 0 ? tileGrid.cols + 1 : (colOffset < 0 ? -2 : col);
      newRow = rowEdge;
      newCol = colEdge;
    }
    return [newRow, newCol];
  },
  render: function() {
    var self = this;
    var tables = indexer.facts("workspaceView").map(function(cur, ix) {
      unpack [uuid] = cur;
      unpack [row, col] = grid.indexToRowCol(tileGrid, ix + 1);
      unpack [finalRow, finalCol] = self.calculateRowCol(row, col);
      var size = [1,1];
      if(finalRow === self.state.activeRow && finalCol === self.state.activeCol) {
        size = [tileGrid.cols, tileGrid.rows];
        finalRow = 0;
        finalCol = 0;
        console.log("here", size);
      }
      return tiles.table({table: uuid,
                          size: size,
                          pos: [finalRow, finalCol]});
    })
    var uiPos = this.calculateRowCol(0,0);
    return JSML.react(["div",
                       ReactSearcher(),
                       ["div", {"id": "cards",
                                "onClick": this.click},
                        tiles.ui({pos: uiPos, size: [1,1]}),
                        tables
                        ]]);
  }
}));

//---------------------------------------------------------
// tiles
//---------------------------------------------------------

var tileGrid;

var tiles = {
  wrapper: reactFactory({
    render: function() {
      return JSML.react(["div", {"className": "card " + (this.props.class || ""),
                                 "style": grid.getSizeAndPosition(tileGrid, this.props.size, this.props.pos)},
                         this.props.content]);
    }
  }),
  table: reactFactory({
    header: reactFactory({
      render: function() {
        unpack [uuid] = this.props.field;
        var name = indexer.index("displayName")[uuid];
        return JSML.react(["div", {"className": "header", "key": uuid}, name]);
      }
    }),
    row: reactFactory({
      render: function() {
        var fields = [];
        foreach(field of this.props.row) {
          fields.push(["div", field]);
        }
        return JSML.react(["div", {"className": "grid-row", "key": JSON.stringify(this.props.row)}, fields]);
      }
    }),
    adderRow: reactFactory({
      getInitialState: function() {
        return {row: [], activeField: -1};
      },
      checkComplete: function() {
        for(var i = 0, len = this.props.len; i < len; i++) {
          if(this.state.row[i] === undefined || this.state.row[i] === null) return false;
        }
        return true;
      },
      click: function(e) {
        var ix = parseInt(e.currentTarget.getAttribute("data-ix"));
        this.setState({activeField: ix});
        e.currentTarget.focus();
      },
      keyDown: function(e) {
        //handle pressing enter
        if(e.keyCode === 13) {
          this.blur();
          e.preventDefault();
        }
      },
      input: function(e) {
        var row = this.state.row;
        row[this.state.activeField] = e.target.textContent;
      },
      blur: function() {
        this.setState({activeField: -1});
        this.commit();
      },
      commit: function() {
        if(this.checkComplete()) {
          var row = this.state.row.slice();
          this.setState(this.getInitialState(), function() {
          });
          dispatch(["addRow", {table: this.props.table, row: row}]);
        }
      },
      render: function() {
        var fields = [];
        var className;
        var contentEditable;
        for(var i = 0, len = this.props.len; i < len; i++) {
          className = "";
          contentEditable = false;
          if(this.state.activeField === i) {
            className = "selected";
            contentEditable = true;
          }
          fields.push(["div", {
            "tabIndex": -1,
            "className": className,
            "contentEditable": contentEditable,
            "onInput": this.input,
            "onBlur": this.blur,
            "onKeyDown": this.keyDown,
            "onClick": this.click,
            "data-ix": i,
            "dangerouslySetInnerHTML": {__html: this.state.row[i] || ""}
          }]);
        }
        return JSML.react(["div", {"className": "grid-row", "key": "adderRow"}, fields]);
      }
    }),
    render: function() {
      var self = this;
      var table = this.props.table;
      var headers = indexer.index("viewToFields")[table].sort(function(a, b) {
        //compare their ixes
        return a[2] - b[2];
      }).map(function(cur) {
        return self.header({field: cur});
      });
      //@TODO: sorting. We should probably use a sorted indexer as sorting all the rows
      // every update is going to be stupidly expensive.
      var rows = indexer.facts(table).map(function(cur) {
        return self.row({row: cur});
      });
      var isInput = hasTag(table, "input");
      var content =  [JSML.react(["h2", table, isInput ? " - input" : ""]),
                      JSML.react(["div", {"className": "grid"},
                                  ["div", {"className": "grid-header"},
                                   headers],
                                  ["div", {"className": "grid-rows"},
                                   rows,
                                   isInput ? this.adderRow({len: headers.length, table: table}) : null]])];
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, content: content});
    }
  }),
  ui: reactFactory({
    render: function() {
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, class: "uiCard"});
    }
  })
};


//---------------------------------------------------------
// Searcher
//---------------------------------------------------------

function searchForView(needle) {
  var results = [];
  var names = indexer.index("displayName");
  var name;
  foreach(view of indexer.facts("view")) {
    unpack [uuid] = view;
    //@TODO: why are none of the views in displayName?
    name = names[uuid];
    if(name.toLowerCase().indexOf(needle.toLowerCase()) > -1) {
      results.push([name, uuid]);
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
    var possible = searchForView(this.state.search);
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
// Dispatcher
//---------------------------------------------------------

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
      break;

    case "addRow":
      //@TODO: we haven't set up view forwarding for constant/input views
      var diff = {};
      diff[info.table] = {adds: [info.row], removes: []};
      indexer.handleDiffs(diff);
      break;

    case "sortCard":
      eventInfo[1].sortBy(eventInfo[2], eventInfo[3]);
      break;

    case "selectField":
      selectField(eventInfo[1], eventInfo[2], eventInfo[3]);
      break;
  }
}
module.exports.dispatch = dispatch;


//---------------------------------------------------------
// Init
//---------------------------------------------------------

function init(system) {
  window.indexer = indexer = new Indexer(system);
  indexer.addIndex("displayName", "displayName", indexers.makeLookup(0, 1));
  indexer.addIndex("field", "viewToFields", indexers.makeCollector(1));
  indexer.addIndex("tag", "idToTags", indexers.makeCollector(0));
  indexer.forward("workspaceView");
  var dims = document.body.getBoundingClientRect();
  tileGrid = grid.makeGrid(document.body, {
    dimensions: [dims.width - 100, dims.height - 110],
    gridSize: [5, 2],
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
