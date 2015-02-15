import macros from "../macros.sjs";

var React = require("react/addons");
var bootstrap = require("./bootstrap");
var JSML = require("./jsml");
var helpers = require("./helpers");
var Card = require("./card");
var grid = require("./grid");
var incrementalUI = require("./incrementalUI");

//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var ide = module.exports;
var indexer;
var defaultSize = [6,3];
var KEYCODES = {
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  ENTER: 13,
  ESCAPE: 27
};

function aget(obj, keys, create) {
  var cur = obj;
  foreach(key of keys) {
    if(!cur[key]) {
      if(!create) { return undefined; }
      cur[key] = {};
    }
    cur = cur[key];
  }
  return cur;
}


//---------------------------------------------------------
// Indexer
//---------------------------------------------------------

var indexers = {
  makeLookup: function(keyIx, valueIx) {
    if(valueIx !== false) {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          final[remove[keyIx]] = null;
        }
        foreach(add of diffs.adds) {
          final[add[keyIx]] = add[valueIx];
        }
        return final;
      }
    } else {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          final[remove[keyIx]] = null;
        }
        foreach(add of diffs.adds) {
          final[add[keyIx]] = add;
        }
        return final;
      }
    }
  },
  makeLookup2D: function(key1Ix, key2Ix, valueIx) {
    return function(cur, diffs) {
      var final = cur || {};
      foreach(add of diffs.adds) {
        var key1 = add[key1Ix];
        if(!final[key1]) {
          final[key1] = {};
        }
        var key2 = add[key2Ix];
        final[key1][key2] = add[valueIx];
      }
      foreach(remove of diffs.removes) {
        var key1 = remove[key1Ix];
        if(!final[key1]) {
          continue;
        }
        var key2 = remove[key2Ix];
        final[key1][key2] = null;
      }

      return final;
    };
  },
  makeCollector: function(keyIx) {
    if(arguments.length === 1) {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          final[remove[keyIx]] = final[remove[keyIx]].filter(function(cur) {
            return !arrayEqual(cur, remove)
          });
        }

        foreach(add of diffs.adds) {
          if(!final[add[keyIx]]) {
            final[add[keyIx]] = [];
          }
          final[add[keyIx]].push(add);
        }

        return final;
      }
    } else {
      var keyIxes = [].slice.apply(arguments);
      var lastKeyIx = keyIxes.pop();
      return function(cur, diffs) {
        var final = cur || {};
        foreach(add of diffs.adds) {
          var keys = [];
          foreach(ix, keyIx of keyIxes) {
            keys[ix] = add[keyIx];
          }
          var cur = aget(final, keys, true);
          if(!cur[add[lastKeyIx]]) {
            cur[add[lastKeyIx]] = [];
          }
          cur[add[lastKeyIx]].push(add);
        }
        foreach(remove of diffs.removes) {
          var keys = [];
          foreach(ix, keyIx of keyIxes) {
            keys[ix] = remove[keyIx];
          }
          var cur = aget(final, keys, false);
          cur[remove[lastKeyIx]] = cur[remove[lastKeyIx]].filter(function(c) {
            return !arrayEqual(cur, remove);
          });

        }
        return final;
      }
    }
  },
  makeSorter: function() {
    var sortIxes = [].slice.apply(arguments);
    return function(cur, diffs) {
      var final = cur || [];
      foreach(remove of diffs.removes) {
        foreach(ix, item of final) {
          if(arrayEqual(item, remove)) {
            final.splice(ix, 1);
            break;
          }
        }
      }

      // @NOTE: This can be optimized further by presorting adds and maintaining loIx as a sliding window.
      foreach(add of diffs.adds) {
        var loIx = 0;
        var hiIx = final.length;
        foreach(sortIx of sortIxes) {
          for(var ix = loIx; ix < hiIx; ix++) {
            var item = final[ix];
            if(add[sortIx] > item[sortIx]) {
              loIx = ix + 1;
            } else if(add[sortIx] < item[sortIx]) {
              hiIx = ix;
              break;
            }
          }
        }
        final.splice(loIx, 0, add);
      }

      return final;
    }
  }
};

function Indexer(program) {
  this.worker = program.worker
  this.system = program.system;
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
    var specialDiffs = ["view", "field"];
    var isSpecial = false;
    foreach(table of specialDiffs) {
      if(!diffs[table]) { continue; }
      applyDiff(system, table, diffs[table]);
      isSpecial = true;
    }
    if(isSpecial) {
      system.recompile();
      //all non-input views were just cleared, make sure the worker clears storage
      //so that we end up with the views getting repopulated correctly.
      this.worker.postMessage({type: "clearStorage", views: getNonInputWorkspaceViews()})
    }

    forattr(table, diff of diffs) {
      if(tableToIndexes[table]) {
        foreach(index of tableToIndexes[table]) {
          cur = this.indexes[index];
          cur.index = cur.indexer(cur.index, diff);
        }
      }
      if(specialDiffs.indexOf(table) !== -1) { continue; }
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
      this.worker.postMessage({type: "diffs", diffs: toSend});
    }

    //if we forced a recompile, we shouldn't redraw until the worker comes back
    //with the latest diffs.
    if(!isSpecial) {
      dispatch(["diffsHandled", diffs]);
    }
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
    if(!table) { return; }
    else if(typeof table === "object" && table.length) {
      this.tablesToForward.push.apply(this.tablesToForward, table);
    } else {
      this.tablesToForward.push(table);
    }
  },
  unforward: function(table) {
    var ix = this.tablesToForward.indexOf(table);
    if(ix !== -1) {
      this.tablesToForward.splice(ix, 1);
    }
  },
  first: function(table) {
    return this.facts(table)[0];
  }
};

//---------------------------------------------------------
// Index helpers
//---------------------------------------------------------

function hasTag(id, needle) {
  var tags = indexer.index("idToTags")[id];
  foreach(tagEntry of tags) {
    unpack [_, tag] = tagEntry;
    if(tag === needle) return true;
  }
  return false;
}

//all the tables that the table queries or joins on
function incomingTables(curTable) {
  var incoming = {};
  var queries = indexer.index("viewToQuery")[curTable];
  var queryToConstraint = indexer.index("queryToViewConstraint");
  var queryToAggregate = indexer.index("queryToAggregateConstraint");
  var constraints;
  foreach(query of queries) {
    constraints = queryToConstraint[query[0]];
    foreach(constraint of constraints) {
      incoming[constraint[2]] = true;
    }
    aggregates = queryToAggregate[query[0]];
    foreach(agg of aggregates) {
      incoming[agg[3]] = true;
    }
  }
  return Object.keys(incoming);
}

//all the tables that query or join on this table
function outgoingTables(curTable) {
  //@TODO
}

function getNonInputWorkspaceViews() {
  var final = [];
  var views = indexer.facts("workspaceView");
  foreach(view of views) {
    if(!hasTag(view[0], "input")) {
      final.push(view[0]);
    }
  }
  return final;
}

function getTileFootprints() {
  return indexer.facts("gridTile").map(function(cur, ix) {
    unpack [tile, type, w, h, x, y] = cur;
    return {pos: [x, y], size: [w, h]};
  });
}

function sortByIx(facts, ix) {
  return facts.sort(function(a, b) {
    return a[ix] - b[ix];
  });
};

//---------------------------------------------------------
// React helpers
//---------------------------------------------------------

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
};

//---------------------------------------------------------
// Mixins
//---------------------------------------------------------

var editableRowMixin = {
  getInitialState: function() {
    return {edits: [], activeField: -1};
  },
  click: function(e) {
    var ix = parseInt(e.currentTarget.getAttribute("data-ix"), 10);
    this.setState({activeField: ix});
    e.currentTarget.focus();
    e.stopPropagation();
  },
  keyDown: function(e) {
    //handle pressing enter
    if(e.keyCode === KEYCODES.ENTER) {
      this.blur();
      e.preventDefault();
    }
  },
  input: function(e) {
    var edits = this.state.edits;
    edits[this.state.activeField] = e.target.textContent;
  },
  blur: function() {
    this.setState({activeField: -1});
    var commitSuccessful = this.commit();
    if(commitSuccessful) {
      this.setState({edits: []});
    }
  },
  wrapEditable: function(attrs, content) {
    var ix = attrs["data-ix"];
    var editing = this.state.activeField === ix;
    attrs.contentEditable = editing;
    attrs.className += (editing) ? " selected" : "";
    attrs.onClick = this.click;
    attrs.onKeyDown = this.keyDown;
    attrs.onInput = this.input;
    attrs.onBlur = this.blur;
    attrs.dangerouslySetInnerHTML = {__html: this.state.edits[ix] || content};
    return attrs;
  }
};

// @TODO: Consider rewriting row / adderRow to use this per field instead.
var editableFieldMixin = {
  getInitialState: function() {
    return {editing: false, edit: null};
  },
  click: function(e) {
    this.setState({editing: true});
    e.currentTarget.focus();
    e.stopPropagation();
  },
  keyDown: function(e) {
    //handle pressing enter
    if(e.keyCode === KEYCODES.ENTER) {
      this.blur();
      e.preventDefault();
    }
  },
  input: function(e) {
    this.state.edit = e.target.textContent;
  },
  blur: function() {
    this.setState({editing: false});
    var commitSuccessful = this.commit();
    if(commitSuccessful) {
      this.setState({edit: ""});
    }
  },
  wrapEditable: function(attrs, content) {
    attrs.contentEditable = this.state.editing;
    attrs.className += (this.state.editing) ? " selected" : "";
    attrs.onClick = this.click;
    attrs.onKeyDown = this.keyDown;
    attrs.onInput = this.input;
    attrs.onBlur = this.blur;
    attrs.dangerouslySetInnerHTML = {__html: this.state.edit || content};
    return attrs;
  }
};

//---------------------------------------------------------
// Root
//---------------------------------------------------------
var gridSize = [6, 2];

var Root = React.createFactory(React.createClass({
  adjustPosition: function(activeTile, cur) {
    unpack [tile, type, width, height, row, col] = cur;
    unpack [atile, atype, awidth, aheight, activeRow, activeCol] = activeTile;
    var rowOffset = row - activeRow;
    var colOffset = col - activeCol;
    var rowEdge = rowOffset > 0 ? tileGrid.rows + 1 : (rowOffset < 0 ? -2 * height : row);
    var colEdge = colOffset > 0 ? tileGrid.cols + 1 : (colOffset < 0 ? -2 * width : col);
    return [rowEdge, colEdge];
  },
  expand: function() {
    return {size: [tileGrid.cols - 2, tileGrid.rows],
            pos: [0, 1]};
  },
  render: function() {
    var activeTile;
    var activeTileEntry = indexer.first("activeTile");
    if(activeTileEntry) {
       activeTile = indexer.index("gridTile")[activeTileEntry[0]];
    }
    var self = this;

    var tables = indexer.facts("gridTile").map(function(cur, ix) {
      unpack [tile, type, width, height, row, col] = cur;
      if(activeTile && tile !== activeTile[0]) {
        unpack [row, col] = self.adjustPosition(activeTile, cur);
      } else if(activeTile) {
        var expanded = self.expand();
        unpack [width, height] = expanded.size;
        unpack [row, col] = expanded.pos;

      }

      var gridItem = {size: [width, height], pos: [row, col]};

      if(type === "table") {
        var table = indexer.index("tileToTable")[tile];
        gridItem.table = table;
        gridItem.tile = tile;
        return tiles.table(gridItem);
      } else if(type === "ui") {
        gridItem.tile = "uiTile";
        return tiles.ui(gridItem);
      }
    });

    var gridContainer = ["div", {"id": "cards", "onClick": this.click}, tables];

    // if there isn't an active tile, add placeholder tiles for areas that can hold them.
    if(!activeTile) {
      var gridItems = getTileFootprints();
      while(true) {
        var slot = grid.firstGap(tileGrid, gridItems, defaultSize);
        if(!slot) { break; }
        var gridItem = {size: defaultSize, pos: slot};
        gridItems.push(gridItem);
        gridContainer.push(tiles.addTile(gridItem));
      }
    }

    var menu = indexer.first("contextMenu");
    return JSML.react(["div",
                       menu ? ContextMenu({x: menu[0], y: menu[1]}) : null,
                       ProgramLoader(),
                       ReactSearcher(),
                       gridContainer]);
  }
}));

//---------------------------------------------------------
// tiles
//---------------------------------------------------------

var tileGrid;

var tiles = {
  wrapper: reactFactory({
    doubleClick: function() {
      var active = indexer.first("activeTile");
      if(!active || active[0] !== this.props.tile) {
        dispatch(["selectTile", this.props.tile]);
      } else {
        dispatch(["deselectTile", this.props.tile]);
      }
    },
    close: function(e) {
      var active = indexer.first("activeTile");
      if(active && active[0] === this.props.tile) {
        dispatch(["deselectTile", this.props.tile]);
      }
      dispatch(["closeTile", this.props.tile]);
      e.stopPropagation();
    },
    render: function() {
      var selectable = (this.props.selectable !== undefined) ? this.props.selectable : true;
      var controls = "";
      if(this.props.controls !== false) {
        controls = ["div", {className: "tile-controls"},
                    ["button", {className: "tile-control close-btn",
                                onClick: this.close}, "X"]];
      }
      return JSML.react(["div", {"className": "card " + (this.props.class || ""),
                                 "key": this.props.tile,
                                 "onDoubleClick": (selectable) ? this.doubleClick : undefined,
                                 "style": grid.getSizeAndPosition(tileGrid, this.props.size, this.props.pos)},
                         controls,
                         this.props.content]);
    }
  }),
  addTile: reactFactory({
    click: function(e) {
      e.preventDefault();
      e.stopPropagation();
      var sizePos = {pos: this.props.pos, size: this.props.size};
      dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                items: [
                                  [0, "Table", "addTableTile", sizePos],
                                  [1, "View", "addViewTile", sizePos],
                                  [2, "UI", "addUI", sizePos]
                                ]}]);
    },
    render: function() {
      var content = JSML.react(["div", {onClick: this.click, onContextMenu: this.click}, "+"]);
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, id: "addTile", class: "add-tile", content: content, controls: false, selectable: false});
    }
  }),
  table: reactFactory({
    title: reactFactory({
      mixins: [editableFieldMixin],
      commit: function() {
        if(!this.state.edit) { return; }
        dispatch(["rename", {id: this.props.id, name: this.state.edit}]);
        return true;
      },
      render: function() {
        var id = this.props.id;
        var name = this.state.edit || indexer.index("displayName")[id];
        var label = "";
        if(hasTag(id, "constant")) { label = " - constant"; }
        else if(hasTag(id, "input")) { label = "- input"; }

        return JSML.react(
          ["h2",
           ["span", this.wrapEditable({key: id + "-title",}, name)],
           label]);
      }
    }),
    header: reactFactory({
      mixins: [editableFieldMixin],
      contextMenu: function(e) {
        e.preventDefault();
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "filter", "filterField", this.props.field[0]],
                                    [1, "group", "groupField", this.props.field[0]],
                                    [2, "lookup", "lookupField", this.props.field[0]]
                                  ]}])
      },
      commit: function() {
        unpack [id] = this.props.field;
        if(!this.state.edit) { return; }
        dispatch(["rename", {id: id, name: this.state.edit}]);
        return true;
      },
      render: function() {
        unpack [id] = this.props.field;
        var name = this.state.edit || indexer.index("displayName")[id];
        return JSML.react(["div", this.wrapEditable({
          className: "header",
          key: id,
          onContextMenu: this.contextMenu
        }, name)]);
      }
    }),
    addHeader: reactFactory({
      mixins: [editableFieldMixin],
      commit: function() {
        if(!this.state.edit) { return; }
        dispatch(["addField", {view: this.props.view, name: this.state.edit}]);
        return true;
      },
      componentDidUpdate: function() {
        //@HACK: React doesn't correctly clear contentEditable fields
        this.getDOMNode().textContent = "";
      },
      render: function() {
        return JSML.react(["div", this.wrapEditable({
          className: "header add-header",
          key: this.props.view + "-add-header"}, "")]);
      }
    }),
    row: reactFactory({
      mixins: [editableRowMixin],
      commit: function() {
        var oldRow = this.props.row;
        var newRow = oldRow.slice();
        var edits = this.state.edits;
        foreach(ix, field of newRow) {
          if(edits[ix] !== null && edits[ix] !== undefined) {
            newRow[ix] = edits[ix];
          }
        }
        dispatch(["updateRow", {table: this.props.table, oldRow: oldRow, newRow: newRow}]);
        return true;
      },
      render: function() {
        var fields = [];
        foreach(ix, field of this.props.row) {
          fields.push(["div", this.wrapEditable({"data-ix": ix,}, field)]);
        }
        return JSML.react(["div", {"className": "grid-row", "key": JSON.stringify(this.props.row)}, fields]);
      }
    }),
    adderRow: reactFactory({
      mixins: [editableRowMixin],
      checkComplete: function() {
        for(var i = 0, len = this.props.len; i < len; i++) {
          if(this.state.edits[i] === undefined || this.state.edits[i] === null) return false;
        }
        return true;
      },
      commit: function() {
        if(this.checkComplete()) {
          var row = this.state.edits.slice();
          dispatch(["addRow", {table: this.props.table, row: row}]);
          //@HACK: React doesn't correctly clear contentEditable fields
          foreach(ix, _ of row) {
            this.getDOMNode().children[ix].textContent = "";
          }
          return true;
        }
        return false;
      },
      render: function() {
        var fields = [];
        var className;
        var contentEditable;
        for(var i = 0, len = this.props.len; i < len; i++) {
          fields.push(["div", this.wrapEditable({"tabIndex": -1, "data-ix": i}, "")]);
        }
        return JSML.react(["div", {"className": "grid-row add-row", "key": "adderRow"}, fields]);
      }
    }),
    render: function() {
      var self = this;
      var table = this.props.table;
      var viewFields = indexer.index("viewToFields")[table] || [];
      var headers = sortByIx(viewFields, 2).map(function(cur) {
        return self.header({field: cur});
      });
      //@TODO: sorting. We should probably use a sorted indexer as sorting all the rows
      // every update is going to be stupidly expensive.
      var facts = indexer.facts(table);
      var rows = indexer.facts(table).map(function(cur) {
        return self.row({row: cur, table: table});
      });
      var isConstant = hasTag(table, "constant");
      var isInput = hasTag(table, "input");
      var className = (isConstant || isInput) ? "input-card" : "view-card";
      var content =  [self.title({id: table}),
                      ["div", {className: "grid"},
                       ["div", {className: "grid-header"},
                        headers,
                        self.addHeader({view: table})],
                       ["div", {className: "grid-rows"},
                        rows,
                        isConstant ? this.adderRow({len: headers.length, table: table}) : null]]];
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, tile: this.props.tile, class: className, content: content});
    }
  }),
  ui: reactFactory({
    //we create this container element because we need something that will
    //never update, otherwise the content that gets injected by the program
    //will get removed.
    container: reactFactory({
      shouldComponentUpdate: function(props, state) {
        return false;
      },
      componentDidMount: function() {
        this.getDOMNode().appendChild(incrementalUI.storage["builtEls"]["eve-root"]);
      },
      click: function(e) {
        e.stopPropagation();
        e.preventDefault();
      },
      render: function() {
        return JSML.react(["div", {"className": "uiCard",
                                   "onDoubleClick": this.click}]);
      }
    }),
    render: function() {
      var content = this.container({});
      return tiles.wrapper({class: "ui-tile", controls: false, content: content,
                            pos: this.props.pos, size: this.props.size, tile: this.props.tile});
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
    unpack [id] = view;
    //@TODO: why are none of the views in displayName?
    name = names[id];
    if(name.toLowerCase().indexOf(needle.toLowerCase()) > -1) {
      results.push([id, name]);
    }
  }
  return results;
}

var ProgramLoader = reactFactory({
  getInitialState: function() {
    var programs = Object.keys(bootstrap.taskManager.list());
    var current = bootstrap.taskManager.current().name;
    return {programs: programs, current: current};
  },
  change: function(e) {
    bootstrap.taskManager.run(e.target.value);
  },
  render: function() {
    var current = this.state.current;
    var options = [];
    foreach(ix, name of this.state.programs) {
      options.push(["option", {value: name}, name]);
    }
    return JSML.react(["select", {className: "program-loader", onChange: this.change, value: current}, options]);
  }
});

var ReactSearcher = reactFactory({
  getInitialState: function() {
    return { active: false, max: 20, index: undefined, search: "", value: "", possible: searchForView('') };
  },

  cleanup: function() {
    // FIXME: This is gross.
    var self = this;
    setTimeout(function() {
      self.setState(self.getInitialState());
    }, 200);
  },

  input: function(e) {
    this.setState({
      active: true,
      index: undefined,
      value: e.target.value,
      search: e.target.value,
      possible: searchForView(e.target.value)
    });
  },

  focus: function(e) { this.setState({active: true}); },
  blur: function(e) {
    // FIXME: This is gross.
    var self = this;
    setTimeout(function() {
      self.setState({active: false, index: undefined})
    }, 200);
  },

  keydown: function(e) {
    var max = Math.min(this.state.possible.length, this.state.max);

    // FIXME: stupid 1 access to grab the name.
    switch (e.keyCode) {
      case KEYCODES.DOWN:
        e.preventDefault();
        if (this.state.index === undefined) {
          var newindex = 0;
          this.setState({index: newindex, value: this.state.possible[newindex][1]});
        } else if (this.state.index !== max) {
          var newindex = this.state.index + 1;
          this.setState({index: newindex, value: this.state.possible[newindex][1]});
        }
      break;
      case KEYCODES.UP:
        e.preventDefault();
        if (this.state.index === 0) {
          this.setState({index: undefined, value: this.state.search});
        } else if (this.state.index !== undefined) {
          var newindex = this.state.index - 1;
          this.setState({index: newindex, value: this.state.possible[newindex][1]});
        }
      break;
      case KEYCODES.ENTER:
        if (this.state.index !== undefined) {
          dispatch(["openView", this.state.possible[this.state.index]]);
        }
        var state = this.getInitialState();
        state.active = true;
        this.setState(state);
      break;
      case KEYCODES.ESCAPE:
        this.setState(this.getInitialState());
      break;
    }
  },

  render: function() {
    var cx = React.addons.classSet;
    var possible = this.state.possible;
    var possiblelength = possible.length;
    var results = [];
    for(var i = 0; i < this.state.max && i < possiblelength; i++) {
      results.push(SearcherItem({searcher: this, focus: this.state.index === i, item: possible[i], event: "openView"}));
    }
    return JSML.react(["div", {"className": cx({"searcher": true,
                                                "active": this.state.active})},
                       ["input", {"type": "text",
                                  "value": this.state.value,
                                  "onFocus": this.focus,
                                  "onBlur": this.blur,
                                  "onKeyDown": this.keydown,
                                  "onInput": this.input}],
                       ["ul", {},
                        results]]);
  }
});

var SearcherItem = reactFactory({
  click: function() {
    // FIXME: How dirty is it to pass the "parent" to the child?
    this.props.searcher.cleanup();
    dispatch([this.props.event, this.props.item]);
  },
  render: function() {
    var focus = this.props.focus ? "focused" : "";
    var name = this.props.item ? this.props.item[1] : "";
    return JSML.react(["li", {"onClick": this.click, className: focus}, name]);
  }
});


//---------------------------------------------------------
// Context menu
//---------------------------------------------------------

var ContextMenuItem = reactFactory({
  click: function() {
    dispatch([this.props.event, this.props.id]);
  },
  render: function() {
    return JSML.react(["div", {className: "menu-item", onClick: this.click}, this.props.text]);
  }
});

var ContextMenu = reactFactory({
  clear: function() {
    dispatch(["clearContextMenu"]);
  },
  render: function() {
    var items = indexer.facts("contextMenuItem").map(function(cur) {
      unpack [pos, text, event, id] = cur;
      return ContextMenuItem({pos: pos, text: text, event: event, id: id});
    });
    return JSML.react(["div", {className: "menu-shade", onClick: this.clear},
                       ["div", {className: "menu", style: {top: this.props.y, left: this.props.x}},
                        items]]);
  }
});

//---------------------------------------------------------
// Dispatcher
//---------------------------------------------------------

function maxRowId(view) {
  var ids = indexer.index("editViewToIds")[view];
  if(ids && ids.length) {
    return ids[ids.length - 1][2];
  } else {
    return -1;
  }
}

function dispatch(eventInfo) {
  unpack [event, info] = eventInfo;
  switch(event) {
    case "diffsHandled":
      React.render(Root(), document.body);
      break;


    //---------------------------------------------------------
    // Tiles
    //---------------------------------------------------------
    case "selectTile":
      var diff = {};
      diff["activeTile"] = {adds: [[info]], removes: indexer.facts("activeTile")};
      indexer.handleDiffs(diff);
      break;

    case "deselectTile":
      var diff = {};
      diff["activeTile"] = {adds: [], removes: indexer.facts("activeTile")};
      indexer.handleDiffs(diff);
      break;

    case "addView":
      var id = global.uuid();
      var diff = {
        view: {adds: [[id]], removes: []},
        workspaceView: {adds: [[id]], removes: []},
        displayName: {adds: [[id, info.name || "Untitled table"]], removes: []}
      };
      if(info.type === "constant") {
        diff.isInput = {adds: [[id]], removes: []};
        diff.tag = {adds: [[id, "input"], [id, "constant"]], removes: []};
      }
      indexer.handleDiffs(diff);
      indexer.forward(id);
      return id;
      break;

    case "addTile":
      var id = info.id;
      var tileId = global.uuid();
      if(!info.pos) {
        info.pos = grid.firstGap(tileGrid, getTileFootprints(), defaultSize);
        if(!info.pos) {
          console.warn("Grid is full, aborting.");
          break;
        }
      }
      unpack [x, y] = info.pos;
      unpack [w, h] = info.size;
      var diff = {
        tableTile: {adds: [[tileId, id]], removes: []},
        gridTile: {adds: [[tileId, info.type, w, h, x, y]], removes: []},
      };
      indexer.handleDiffs(diff);
      return tileId;
      break;

    case "addTableTile":
      var id = dispatch(["addView", {type: "constant"}]);
      dispatch(["addTile", {pos: info.pos, size: info.size, type: "table", id: id}]);
      break;

    case "addViewTile":
      var id = dispatch(["addView", {name: "Untitled view"}]);
      dispatch(["addTile", {pos: info.pos, size: info.size, type: "table", id: id}]);
      break;

    case "closeTile":
      var tileId = info;
      var tableId = indexer.index("tileToTable")[tileId];
      var diff = {
        gridTile: {adds: [], removes: [indexer.index("gridTile")[tileId]]},
        tableTile: {adds: [], removes: [indexer.index("tableTile")[tileId]]},
        workspaceView: {adds: [], removes: [tableId]}
      };
      indexer.handleDiffs(diff);
      indexer.unforward(tableId);
      break;

    case "openView":
      unpack [tableId, name] = info;
      var diff = {"workspaceView": {adds: [[tableId]], removes: []}};
      indexer.handleDiffs(diff);
      if(hasTag(tableId, "constant")) {
        indexer.forward(tableId);
      }

      dispatch(["addTile", {id: tableId, size: defaultSize, type: "table"}]);
      break;

    //---------------------------------------------------------
    // Tables
    //---------------------------------------------------------
    case "addRow":
      var diff = {};
      diff[info.table] = {adds: [info.row], removes: []};
      var id = maxRowId(info.table) + 1;
      if(id) { id += 1; }
      diff["editId"] = {adds: [[info.table, JSON.stringify(info.row), id]], removes: []};
      indexer.handleDiffs(diff);
      break;

    case "updateRow":
      var diff = {};
      var oldFact = JSON.stringify(info.oldRow);
      var newFact = JSON.stringify(info.newRow);
      var edits = indexer.index("editRowToId")[info.table];
      var editId;
      if(edits && edits[oldFact] !== undefined && edits[oldFact] !== null) {
        editId = edits[oldFact];
      } else {
        // Hack-around until every constant row has a *saved* editId.
        editId = maxRowId(info.table) + 1;
      }

      diff[info.table] = {adds: [info.newRow], removes: [info.oldRow]};
      diff["editId"] = {adds: [[info.table, newFact, editId]], removes: [[info.table, oldFact, editId]]};
      indexer.handleDiffs(diff);
      break;

    case "addField":
      var id = global.uuid();
      var fields = indexer.index("viewToFields")[info.view] || [];
      var oldFacts = indexer.facts(info.view) || [];
      var newFacts = new Array(oldFacts.length);
      foreach(ix, fact of oldFacts) {
        var newFact = fact.slice();
        newFact.push("");
        newFacts[ix] = newFact;
      };
      var diff = {
        field: {adds: [[id, info.view, fields.length]], removes: []},
        displayName: {adds: [[id, info.name]], removes: []}
      };
      diff[info.view] = {adds: newFacts, removes: oldFacts};
      indexer.handleDiffs(diff);
      break;

    case "groupField":
      var viewId = indexer.index("fieldToView")[info];
      var oldFields = indexer.index("viewToFields")[viewId];

      // Adjust field indexes.
      var fields = sortByIx(oldFields.slice(), 2);
      // @TODO: groups, then sorts, then rest.
      var groups = [];
      var rest = [];
      foreach(field of fields) {
        if(field[0] === info || hasTag(field[0], "grouped")) {
          groups.push(field);
        } else {
          rest.push(field);
        }
      }
      fields = groups.concat(rest);
      var oldIx;
      var newIx;
      foreach(ix, field of fields) {
        if(field[0] === info) {
          oldIx = field[2];
          newIx = ix;
        }
        field[2] = ix;
      }

      // Adjust view fact indexes.
      var oldFacts = indexer.facts(viewId);
      var facts = oldFacts.slice();
      foreach(ix, fact of facts) {
        facts[ix] = fact = fact.slice();
        fact.splice(newIx, 0, fact.splice(oldIx, 1)[0]);
      }

      var diff = {
        field: {adds: fields, removes: oldFields},
        tag: {adds: [[info, "grouped"]], removes: []}
      };
      diff[viewId] = {adds: facts, removes: oldFacts};
      indexer.handleDiffs(diff);
      break;

    //---------------------------------------------------------
    // Misc.
    //---------------------------------------------------------
    case "rename":
      var oldFact = indexer.index("displayName")[info.id];
      var diff = {
        displayName: {adds: [[info.id, info.name]], removes: [oldFact]}
      };
      indexer.handleDiffs(diff);
      break;

    case "contextMenu":
      var diff = {
        contextMenu: {adds: [[info.e.clientX, info.e.clientY]], removes: indexer.facts("contextMenu") || []},
        contextMenuItem: {adds: info.items, removes: indexer.facts("contextMenuItem") || []},
      }
      indexer.handleDiffs(diff);
      break;

    case "clearContextMenu":
      var diff = {
        contextMenu: {adds: [], removes: indexer.facts("contextMenu") || []},
        contextMenuItem: {adds: [], removes: indexer.facts("contextMenuItem") || []},
      }
      indexer.handleDiffs(diff);
      break;


    default:
      console.warn("[dispatch] Unhandled event:", event, info);
  }
}
module.exports.dispatch = dispatch;

//---------------------------------------------------------
// IDE tables
//---------------------------------------------------------

function ideTables() {
  var facts = [];
  pushAll(facts, inputView("activeTile", ["tile"]));
  pushAll(facts, inputView("gridTile", ["tile", "type", "w", "h", "x", "y"]));
  pushAll(facts, inputView("tableTile", ["tile", "table"]));
  pushAll(facts, inputView("contextMenu", ["x", "y"]));
  pushAll(facts, inputView("contextMenuItem", ["pos", "text", "event", "id"]));
  return facts;
}

//---------------------------------------------------------
// Init
//---------------------------------------------------------

function startingDiffs() {
  return {"gridTile": {adds: [["uiTile", "ui", defaultSize[0], defaultSize[1], 0, 0]], removes: []}}
}

function init(program) {
  React.unmountComponentAtNode(document.body);
  program.system.update(ideTables(), []);
  program.system.recompile();
  window.indexer = indexer = new Indexer(program);
  indexer.addIndex("displayName", "displayName", indexers.makeLookup(0, 1));
  indexer.addIndex("field", "viewToFields", indexers.makeCollector(1));
  indexer.addIndex("field", "fieldToView", indexers.makeLookup(0, 1));
  indexer.addIndex("tag", "idToTags", indexers.makeCollector(0));
  indexer.addIndex("editId", "editRowToId", indexers.makeLookup2D(0, 1, 2));
  indexer.addIndex("editId", "editViewToIds", indexers.makeCollector(0));
  indexer.addIndex("query", "viewToQuery", indexers.makeCollector(1));
  indexer.addIndex("viewConstraint", "queryToViewConstraint", indexers.makeCollector(1));
  indexer.addIndex("aggregateConstraint", "queryToAggregateConstraint", indexers.makeCollector(1));
  indexer.addIndex("tableTile", "tileToTable", indexers.makeLookup(0, 1));
  indexer.addIndex("tableTile", "tableTile", indexers.makeLookup(0, false));
  indexer.addIndex("gridTile", "gridTile", indexers.makeLookup(0, false));
  indexer.forward("workspaceView");

  indexer.forward(global.compilerTables);

  var dims = document.body.getBoundingClientRect();
  tileGrid = grid.makeGrid(document.body, {
    dimensions: [dims.width - 100, dims.height - 110],
    gridSize: [12, 12],
    marginSize: [10,10]
  });
  window.addEventListener("popstate", function(e) {
    dispatch(["locationChange", event]);
  });
  indexer.handleDiffs(startingDiffs());
}

module.exports.init = init;


function handleProgramDiffs(diffs) {
  indexer.handleDiffs(diffs, true);
}
module.exports.handleProgramDiffs = handleProgramDiffs;



// Debug
global.indexers = indexers;
