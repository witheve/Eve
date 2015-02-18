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
var aggregateFuncs = ["sum", "count", "avg"];
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

function cloneArray(arr) {
  var result = [];
  foreach(item of arr) {
    if(item instanceof Array) {
      item = cloneArray(item);
    }
    result.push(item);
  }
  return result;
}

// Delete any keys or descendant keys which are empty.
function garbageCollectIndex(index) {
  forattr(key, group of index) {
    if(group instanceof Array) {
      if(!group || !group.length) {
        delete index[key];
      }
    } else if(typeof group === "object") {
      garbageCollectIndex(group);
      if(!Object.keys(group).length) {
        delete index[key];
      }
    }
  }
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
          delete final[remove[keyIx]];
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
          delete final[remove[keyIx]];
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
        delete final[key1][key2];
      }

      return final;
    };
  },
  makeCollector: function(keyIx) {
    if(arguments.length === 1) {
      return function(cur, diffs) {
        var final = cur || {};
        foreach(remove of diffs.removes) {
          if(!final[remove[keyIx]]) continue;
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

        garbageCollectIndex(final);
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
            return !arrayEqual(c, remove);
          });

        }
        garbageCollectIndex(final);
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
  latestDiffs: {},
  handleDiffs: function(diffs, fromProgram) {
    this.latestDiffs = diffs;
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
      var viewsToClear = getNonInputWorkspaceViews();

      // Nuke indexes before the system nukes facts.
      foreach(table of viewsToClear) {
        if(!tableToIndexes[table]) { continue; }
        var diff = {adds: [], removes: this.facts(table)};
        foreach(index of tableToIndexes[table]) {
          var cur = this.indexes[index];
          cur.indexer(cur.index, diff);
        }
      }

      system.recompile();
      //all non-input views were just cleared, make sure the worker clears storage
      //so that we end up with the views getting repopulated correctly.
      this.worker.postMessage({type: "clearStorage", views: viewsToClear})
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
      if(Object.keys(toSend).length) {
        this.worker.postMessage({type: "diffs", diffs: toSend});
      }
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
  hasIndex: function(index) {
    return !!this.indexes[index];
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
  },
  last: function(table) {
    var facts = this.facts(table);
    return facts[facts.length - 1];
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

//all the tables that the table queries on
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

//all the tables that query on this table
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
}

function parseValue(value) {
  //if there are non-numerics then it can't be a number
  if(value.match(new RegExp("[^\\d\\.-]"))) {
    return value;
  } else if(value.indexOf(".")) {
    //it's a float
    return parseFloat(value);
  }
  return parseInt(value);
}

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
    edits[this.state.activeField] = parseValue(e.target.textContent);
  },
  blur: function(e) {
    var commitSuccessful = this.commit(this.state.activeField);
    this.setState({activeField: -1});
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
    this.state.edit = parseValue(e.target.textContent);
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


var uiEditorElementMixin = {
  getInitialState: function() {
    unpack [id, type, x, y, width, height] = this.props.elem;
    return {x: x, y: y, width: width, height: height};
  },
  dragStart: function(e) {
    var myDims = e.currentTarget.getBoundingClientRect();
    this.state.offsetX = e.clientX - myDims.left;
    this.state.offsetY = e.clientY - myDims.top;
    e.dataTransfer.setData("id", this.props.elem[0]);
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  drag: function(e) {
    if(e.clientX && e.clientY) {
      var parentDims = document.querySelector(".ui-tile").getBoundingClientRect();
      this.setState({x: e.clientX - parentDims.left - this.state.offsetX, y: e.clientY - parentDims.top - this.state.offsetY});
    }
  },
  dragEnd: function(e) {
    this.moved();
  },
  wrapStyle: function(opts) {
    var state = this.state;
    opts.style = {width: state.width, height: state.height, top: state.y, left: state.x, position: "absolute"};
    return opts;
  },
  wrapDragEvents: function(opts) {
    opts.draggable = "true";
    opts.onDrag = this.drag;
    opts.onDragStart = this.dragStart;
    opts.onDragEnd = this.dragEnd;
    return opts;
  },
  resize: function(dims) {
    this.setState({x: dims.x, y: dims.y, width: dims.width, height: dims.height});
  },
  moved: function() {
    unpack [id, type, x, y, width, height] = this.props.elem;
    dispatch(["uiEditorElementMove", {neue: [id, type, this.state.x, this.state.y, this.state.width, this.state.height],
                                      old: this.props.elem}]);
  }
};

var Resizer = reactFactory({
  handleSize: [8,8],
  minSize: [10,10],
  componentWillReceiveProps: function(neue) {
    if(this.state.x !== neue.x || this.state.y !== neue.y) {
      this.setState({x: neue.x, y: neue.y, width: neue.width, height: neue.height});
    }
  },
  wrapStyle: function(opts) {
    var state = this.state;
    opts.style = {width: state.width, height: state.height, top: state.y, left: state.x, position: "absolute"};
    return opts;
  },
  wrapHandleStyle: function(opts) {
    var dx = opts["data-x"];
    var dy = opts["data-y"];
    unpack [handleWidth, handleHeight] = this.handleSize;
    opts.className = "resize-handle";

    //init to left
    var x = handleWidth / -2;
    if(dx === "right") {
      x = (handleWidth / -2) + this.state.width;
    } else if(dx === "center") {
      x = (handleWidth / -2) + (this.state.width / 2);
    }

    //init to top
    var y = handleHeight / -2;
    if(dy === "bottom") {
      y = (handleHeight / -2) + this.state.height;
    } else if(dy === "middle") {
      y = (handleHeight / -2) + (this.state.height / 2);
    }
    opts.style = {width: handleWidth, height: handleHeight, top: y - 1, left: x - 1};
    return opts;
  },
  dragStart: function(e) {
    this.state.dx = e.currentTarget.getAttribute("data-x");
    this.state.dy = e.currentTarget.getAttribute("data-y");
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  drag: function(e) {
    if(e.clientX && e.clientY) {
      var grandParentDims = document.querySelector(".ui-tile").getBoundingClientRect();
      var relX = e.clientX - grandParentDims.left;
      var relY = e.clientY - grandParentDims.top;

      var minSize = this.props.minSize || this.minSize;

      //init to doing nothing
      var x = this.state.x;
      var width = this.state.width;
      var xdiff = relX - x;
      if(this.state.dx === "left") {
        x = relX;
        width = this.state.width - xdiff;
        if(width < minSize[0]) {
          width = minSize[0];
          x = (this.state.x + this.state.width) - minSize[0];
        }
      } else if(this.state.dx === "right") {
        width = width + (xdiff - width);
        if(width < minSize[0]) {
          width = minSize[0];
        }
      }

      //init to doing nothing
      var y = this.state.y;
      var height = this.state.height;
      var ydiff = relY - y;
      if(this.state.dy === "top") {
        y = relY;
        height = height - ydiff;
        if(height < minSize[1]) {
          height = minSize[1];
          y = (this.state.y + this.state.height) - minSize[1];
        }
      } else if(this.state.dy === "bottom") {
        height = height + (ydiff - height);
        if(height < minSize[1]) {
          height = minSize[1];
        }
      }
      this.setState({x: x, y: y, width: width, height: height});
      if(this.props.resize) {
        this.props.resize(this.state);
      }
    }
  },
  dragEnd: function(e) {
    if(this.props.resizeEnd) {
      this.props.resizeEnd(this.state);
    }
  },
  wrapDragEvents: function(opts) {
    opts.draggable = "true";
    opts.onDrag = this.drag;
    opts.onDragStart = this.dragStart;
    opts.onDragEnd = this.dragEnd;
    return opts;
  },
  wrapHandle: function(opts) {
    return this.wrapDragEvents(this.wrapHandleStyle(opts));
  },
  getInitialState: function() {
    return {x: this.props.x, y: this.props.y, width: this.props.width, height: this.props.height};
  },
  render: function() {
    return JSML.react(["div", this.wrapStyle({className: "resizer"}),
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "top"})],
                       ["div", this.wrapHandle({"data-x": "center", "data-y": "top"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "top"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "middle"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "bottom"})],
                       ["div", this.wrapHandle({"data-x": "center", "data-y": "bottom"})],
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "bottom"})],
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "middle"})]
                      ])
  }
});

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
    var activeTileTable;
    var activeTileEntry = indexer.first("activeTile");
    if(activeTileEntry) {
       activeTile = indexer.index("gridTile")[activeTileEntry[0]];
      if(activeTile[1] === "table") {
        activeTileTable = indexer.index("tileToTable")[activeTile[0]];
      }
    }
    var self = this;

    var tables = indexer.facts("gridTile").map(function(cur, ix) {
      unpack [tile, type, width, height, row, col] = cur;
      var gridItem = {};
      if(activeTile && tile !== activeTile[0]) {
        unpack [row, col] = self.adjustPosition(activeTile, cur);
      } else if(activeTile) {
        var expanded = self.expand();
        unpack [width, height] = expanded.size;
        unpack [row, col] = expanded.pos;
        gridItem.active = true;
      }

      gridItem.size = [width, height];
      gridItem.pos = [row, col];

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
                       ["canvas", {id: "clear-pixel", width: 1, height: 1}],
                       menu ? ContextMenu({x: menu[0], y: menu[1]}) : null,
                       ProgramLoader(),
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
    contextMenu: function(e) {
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
                                 "onContextMenu": this.props.contextMenu || this.contextMenu,
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
      dispatch(["setActivePosition", [this.props.size[0], this.props.size[1], this.props.pos[0], this.props.pos[1]]]);
      dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                items: [
                                  [0, "text", "New Table", "addTableTile", ""],
                                  [1, "text", "New View", "addViewTile", ""],
                                  [2, "text", "New UI", "addUI", ""],
                                  [3, "viewSearcher", "Existing table or view", "openView", ""]
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
        e.stopPropagation();
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "text", "filter", "filterField", this.props.field[0]],
                                    [1, "text", "group", "groupField", this.props.field[0]],
                                    [2, "fieldSearcher", "join", "joinField", this.props.field[0]]
                                  ]}]);
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
        var className = "header";
        if(hasTag(id, "grouped")) {
          className += " grouped";
        }
        return JSML.react(["div", this.wrapEditable({
          className: className,
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
      commit: function(ix) {
        var table = this.props.table;

        //if this is a constant view, then we just modify the row
        if(hasTag(table, "constant")) {
          var oldRow = this.props.row;
          var newRow = oldRow.slice();
          var edits = this.state.edits;
          foreach(ix, field of newRow) {
            if(edits[ix] !== null && edits[ix] !== undefined) {
              newRow[ix] = edits[ix];
            }
          }
          dispatch(["updateRow", {table: table, oldRow: oldRow, newRow: newRow}]);
        } else if(ix > -1 && this.state.edits[ix] !== undefined) { //FIXME: how is blur getting called with an ix of -1?
          //if this isn't a constant view, then we have to modify
          dispatch(["updateCalculated", {table: table, field: this.props.fields[ix][0], value: this.state.edits[ix]}]);
        }
        return true;
      },
      render: function() {
        var fields = [];
        foreach(ix, field of this.props.row) {
          if(ix < (this.props.startIx || 0)) { continue; }
          fields.push(["div", this.wrapEditable({"data-ix": ix}, field)]);
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
    contextMenu: function(e) {
      var isInput = hasTag(this.props.table, "input");
      if(!isInput) {
        e.preventDefault();
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "viewSearcher", "Add table", "addTableToView", this.props.table]
                                  ]}]);
      }
    },
    render: function() {
      var self = this;
      var table = this.props.table;
      var viewFields = indexer.index("viewToFields")[table] || [];
      sortByIx(viewFields, 2);
      var headers = viewFields.map(function(cur) {
        return self.header({field: cur});
      });


      function indexToRows(index, startIx) {
        startIx = startIx || 0;
        var rows = [];
        if(index instanceof Array) {
          rows = index.map(function factToRow(cur) {
            return self.row({row: cur, table: table, fields: viewFields, startIx: startIx});
          });
        } else {
          forattr(value, group of index) {
            var groupRow = ["div", {className: "grid-group"}];
            groupRow.push.apply(groupRow, indexToRows(group, startIx + 1));
            rows.push(["div", {className: "grid-row"},
                       ["div", {className: "grouped-field"}, value],
                       groupRow]);
          }
        }
        return rows;
      }

      var index;
      if(indexer.hasIndex(table + "|rows")) {
        index = indexer.index(table + "|rows");
      } else {
        index = indexer.facts(table) || [];
      }
      var rows = indexToRows(index);
      var isConstant = hasTag(table, "constant");
      var isInput = hasTag(table, "input");
      var className = (isConstant || isInput) ? "input-card" : "view-card";
      var content =  [self.title({id: table}),
                      (this.props.active ? ["pre", viewToDSL(table)] : null),
                      ["div", {className: "grid"},
                       ["div", {className: "grid-header"},
                        headers,
                        self.addHeader({view: table})],
                       ["div", {className: "grid-rows"},
                        rows,
                        isConstant ? this.adderRow({len: headers.length, table: table}) : null]]];
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, tile: this.props.tile, class: className, content: content, contextMenu: this.contextMenu});
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
    box: reactFactory({
      mixins: [uiEditorElementMixin],
      render: function() {
        var state = this.state;
        var opts = this.wrapStyle(this.wrapDragEvents({}));
        return JSML.react(["div", {key: this.props.elem[0]},
                           Resizer({x: state.x, y: state.y, width: state.width, height: state.height, resize: this.resize, resizeEnd: this.moved}),
                           ["div", opts, "box"]]);
      }
    }),
    text: reactFactory({
      mixins: [uiEditorElementMixin],
      render: function() {
        var state = this.state;
        var opts = this.wrapStyle(this.wrapDragEvents({}));
        return JSML.react(["div", {key: this.props.elem[0]},
                           Resizer({x: state.x, y: state.y, width: state.width, height: state.height, resize: this.resize, resizeEnd: this.moved}),
                           ["span", opts, "text"]]);
      }
    }),
    button: reactFactory({
      mixins: [uiEditorElementMixin],
      render: function() {
        var state = this.state;
        var opts = this.wrapStyle(this.wrapDragEvents({}));
        return JSML.react(["div", {key: this.props.elem[0]},
                           Resizer({x: state.x, y: state.y, width: state.width, height: state.height, resize: this.resize, resizeEnd: this.moved}),
                           ["button", opts, "button"]]);
      }
    }),
    input: reactFactory({
      mixins: [uiEditorElementMixin],
      render: function() {
        var state = this.state;
        var opts = this.wrapStyle(this.wrapDragEvents({placeholder: "input"}));
        return JSML.react(["div", {key: this.props.elem[0]},
                           Resizer({x: state.x, y: state.y, width: state.width, height: state.height, resize: this.resize, resizeEnd: this.moved}),
                           ["input", opts]]);
      }
    }),
    contextMenu: function(e) {
      e.preventDefault();
      dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                items: [
                                  [0, "text", "box", "addUIEditorElementFromMenu", "box"],
                                  [0, "text", "text", "addUIEditorElementFromMenu", "text"],
                                  [0, "text", "button", "addUIEditorElementFromMenu", "button"],
                                  [0, "text", "input", "addUIEditorElementFromMenu", "input"]
                                ]}]);
    },
    render: function() {
      if(this.props.active) {
        var self = this;
        var editorElems = indexer.facts("uiEditorElement").map(function(cur) {
          unpack [id, type] = cur;
          return self[type]({elem: cur})
        });
        var content = JSML.react(["div", {className: "ui-design-surface", onContextMenu: this.contextMenu},
                                  editorElems]);
      } else {
        var content = [this.container({})];
      }

      return tiles.wrapper({class: "ui-tile", controls: false, content: content,
                            pos: this.props.pos, size: this.props.size, tile: this.props.tile});
    }
  })
};

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

//---------------------------------------------------------
// Searcher
//---------------------------------------------------------

var searchMethod = {
  view: function searchForView(needle) {
    var results = [];
    var names = indexer.index("displayName");
    var name;
    foreach(view of indexer.facts("view")) {
      unpack [id] = view;
      name = names[id];
      if(name && name.toLowerCase().indexOf(needle.toLowerCase()) > -1) {
        results.push([id, name]);
      }
    }
    return results;
  },

  field: function searchForField(needle, searchOpts) {
    searchOpts = searchOpts || {};
    var results = [];
    var names = indexer.index("displayName");
    var name;
    var fields = indexer.index("viewToFields")[searchOpts.view];
    if(!fields) {
      fields = indexer.facts("field");
    }
    foreach(field of fields) {
      unpack [id, view, ix] = field;
      name = names[id];
      if(name && name.toLowerCase().indexOf(needle.toLowerCase()) > -1) {
        results.push([id, name]);
      }
    }
    return results;
  }
};

var ReactSearcher = reactFactory({
  getInitialState: function() {
    var search = searchMethod[this.props.type];
    if(!search) throw new Error("No search function defined for type: '" + this.props.type + "'.");
    return {active: false, index: undefined,
            current: "", value: "",
            max: this.props.max || 5,
            possible: search('', this.props.searchOpts),
            search: search};
  },

  input: function(e) {
    this.setState({
      active: true,
      index: undefined,
      value: e.target.value,
      current: e.target.value,
      possible: this.state.search(e.target.value, this.props.searchOpts)
    });
  },

  focus: function(e) { this.setState({active: true}); },
  blur: function(e) {},
  select: function(ix) {
    var cur = this.state.possible[ix];
    if(cur) {
      dispatch([this.props.event, {selected: cur, id: this.props.id}]);
    }
    var state = this.getInitialState();
    this.setState(state);
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
          this.setState({index: undefined, value: this.state.current});
        } else if (this.state.index !== undefined) {
          var newindex = this.state.index - 1;
          this.setState({index: newindex, value: this.state.possible[newindex][1]});
        }
      break;
      case KEYCODES.ENTER:
        this.select(this.state.index || 0);
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
      results.push(SearcherItem({searcher: this, focus: this.state.index === i, ix: i, item: possible[i], select: this.select}));
    }
    return JSML.react(["div", {"className": cx({"searcher": true,
                                                "active": this.state.active})},
                       ["input", {"type": "text",
                                  "placeholder": this.props.placeholder || "Search",
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
    this.props.select(this.props.ix);
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

ContextMenuItems = {
  text: reactFactory({
    click: function() {
      dispatch([this.props.event, this.props.id]);
    },
    render: function() {
      return JSML.react(["div", {className: "menu-item", onClick: this.click}, this.props.text]);
    }
  }),
  viewSearcher: reactFactory({
    click: function(e) {
      e.stopPropagation();
    },
    render: function() {
      return JSML.react(["div", {className: "menu-item", onClick: this.click},
                         ReactSearcher({event: this.props.event, placeholder: this.props.text, id: this.props.id, type: "view"})]);
    }
  }),
  fieldSearcher: reactFactory({
    click: function(e) {
      e.stopPropagation();
    },
    render: function() {
      return JSML.react(["div", {className: "menu-item", onClick: this.click},
                         ReactSearcher({event: this.props.event, placeholder: this.props.text,
                                        id: this.props.id, type: "field",
                                        searchOpts: {view: indexer.index("fieldToView")[this.props.id]}})]);
    }
  })
};

var ContextMenu = reactFactory({
  clear: function() {
    dispatch(["clearContextMenu"]);
  },
  render: function() {
    var items = indexer.facts("contextMenuItem").map(function(cur) {
      unpack [pos, type, text, event, id] = cur;
      return ContextMenuItems[type]({pos: pos, text: text, event: event, id: id});
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
      //TODO: Should we push this off to a requestAnimationFrame?
      React.render(Root(), document.body);
      break;


    //---------------------------------------------------------
    // Tiles
    //---------------------------------------------------------
    case "setActivePosition":
      var diff = {};
      diff["activePosition"] = {adds: [info], removes: indexer.facts("activePosition")};
      indexer.handleDiffs(diff);
      break;

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

    //---------------------------------------------------------
    // Menu actions
    //---------------------------------------------------------

    case "addTableTile":
      var id = dispatch(["addView", {type: "constant"}]);
      var activePosition = indexer.first("activePosition");
      if(activePosition) {
        unpack [width, height, x, y] = activePosition;
        dispatch(["addTile", {pos: [x, y], size: [width, height], type: "table", id: id}]);
      } else {
        dispatch(["addTile", {type: "table", id: id}]);
      }
      dispatch(["clearContextMenu"]);
      break;

    case "addViewTile":
      var id = dispatch(["addView", {name: "Untitled view"}]);
      var activePosition = indexer.first("activePosition");
      if(activePosition) {
        unpack [width, height, x, y] = activePosition;
        dispatch(["addTile", {pos: [x, y], size: [width, height], type: "table", id: id}]);
      } else {
        dispatch(["addTile", {type: "table", id: id}]);
      }
      dispatch(["clearContextMenu"]);
      // add an initial query
      var queryId = global.uuid();
      var diff = {
        query: {adds: [[queryId, id, 0]], removes: []}
      }
      indexer.handleDiffs(diff);
      break;


    case "openView":
      unpack [tableId, name] = info.selected;
      var diff = {"workspaceView": {adds: [[tableId]], removes: []}};
      indexer.handleDiffs(diff);
      if(hasTag(tableId, "constant")) {
        indexer.forward(tableId);
      }
      var activePosition = indexer.first("activePosition");
      if(activePosition) {
        unpack [width, height, x, y] = activePosition;
        dispatch(["addTile", {pos: [x, y], size: [width, height], type: "table", id: tableId}]);
      } else {
        dispatch(["addTile", {size: defaultSize, type: "table", id: tableId}]);
      }
      dispatch(["clearContextMenu"]);
      break;


    case "addTableToView":
      unpack [tableId, tableName] = info.selected;
      unpack [queryId, view, ix] = indexer.index("viewToQuery")[info.id][0];
      var currentFields = indexer.index("viewToFields")[info.id];
      var currentFieldCount = 0;
      if(currentFields) {
        currentFieldCount = currentFields.length;
      }
      var constraintId = global.uuid();
      var tableFields = indexer.index("viewToFields")[tableId];
      var displayNameLookup = indexer.index("displayName");
      var newFields = [];
      var bindings = [];
      var displayNames = [];
      foreach(ix, field of tableFields) {
        var fieldId = global.uuid();
        //generate fields for each field in the added view
        newFields.push([fieldId, info.id, ix + currentFieldCount]);
        //use their displayName
        displayNames.push([fieldId, displayNameLookup[field[0]]]);
        //generate view constraint bindings for each of those fields
        bindings.push([constraintId, fieldId, field[0]]);
      }
      var diff = {
        field: {adds: newFields, removes: []},
        displayName: {adds: displayNames, removes: []},
        viewConstraint: {adds: [[constraintId, queryId, tableId, false]], removes: []},
        viewConstraintBinding: {adds: bindings, removes: []}
      }
      indexer.handleDiffs(diff);
      dispatch(["clearContextMenu"]);
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
      var diff = {};
      var id = global.uuid();
      var isConstant = hasTag(info.view, "constant");
      var fields = indexer.index("viewToFields")[info.view] || [];

      //if this is a constant view, patch up the facts that already
      //exist for the view
      if(isConstant) {
        var oldFacts = (indexer.facts(info.view) || []).slice();
        var newFacts = new Array(oldFacts.length);
        foreach(ix, fact of oldFacts) {
          var newFact = fact.slice();
          newFact.push("");
          newFacts[ix] = newFact;
        };
        diff[info.view] = {adds: newFacts, removes: oldFacts};
      } else {
        //if this isn't a constant view, then we need to fill this field with
        //something. @TODO: should this be a constant? should we do this some
        //other way?
        //@TODO: we can't assume there's only ever one query...
        unpack [queryId] = indexer.index("viewToQuery")[info.view][0];
        diff.constantConstraint = {adds: [[queryId, id, ""]], removes: []};
        diff.tag = {adds: [[id, "calculated"]], removes: []};
      }

      diff.field = {adds: [[id, info.view, fields.length]], removes: []};
      diff.displayName = {adds: [[id, info.name]], removes: []};
      indexer.handleDiffs(diff);

      break;

    case "groupField":
      var viewId = indexer.index("fieldToView")[info];
      var oldFields = indexer.index("viewToFields")[viewId].slice();
      var fields = cloneArray(oldFields);
      var oldFacts = indexer.facts(viewId).slice();
      var facts = cloneArray(oldFacts);

      // Splits fields into grouped and ungrouped.
      var groups = [];
      var rest = [];
      sortByIx(fields, 2);
      foreach(field of fields) {
        if(field[0] === info || hasTag(field[0], "grouped")) {
          groups.push(field);
        } else {
          rest.push(field);
        }
      }
      fields = groups.concat(rest);

      // Updates field ixes and reorders facts if changed.
      var modified = false;
      foreach(ix, field of fields) {
        if(field[2] === ix) { continue; }
        modified = true;
        foreach(factIx, fact of oldFacts) {
          facts[factIx][ix] = fact[field[2]];
        }
        field[2] = ix;
      }

      var diff = {
        field: {adds: fields, removes: oldFields},
        tag: {adds: [[info, "grouped"]], removes: []}
      };
      if(modified) {
        diff[viewId] = {adds: facts, removes: oldFacts};
      }
      indexer.handleDiffs(diff);
      indexer.addIndex(viewId, viewId + "|rows",
                       indexers.makeCollector.apply(null, helpers.pluck(groups, 2)));
      break;

    case "joinField":
      var field1 = info.id;
      var field2 = info.selected[0];

      var bindings = indexer.index("fieldToBindings")[field2];
      if(!bindings || !bindings.length) {
        throw new Error("Cannot join with unbound (local?) field: '" + indexer.index("displayName")[field2] + "'.");
      }
      var binding = bindings[0];
      unpack [constraint, __, sourceField] = binding;
      // @TODO: check for flipped duplicates?
      // var bindings = indexer.index("viewConstraintToBinding")[constraint] || [];

      indexer.handleDiffs({
        "viewConstraintBinding": {adds: [[constraint, field1, sourceField]], removes: []},
        "tag": {adds: [[field2, "hidden"]], removes: []}
      });
      dispatch(["clearContextMenu"]);
      break;

    case "updateCalculated":
      var table = info.table;
      var field = info.field;
      var value = info.value;
      var diff = {};

      //@TODO: we can't assume there's only ever one query...
      unpack [queryId] = indexer.index("viewToQuery")[table][0];

      //it is either an aggregateConstraint, a functionConstraint, or a constantConstraint
      //@TODO: this is super frail. Filters are function + constant and you can filter a
      //the result of a function. How would we know what to edit?

      var functions = indexer.index("queryToFunctionConstraint")[queryId] || [];
      var foundFunc = functions.filter(function(cur) {
        unpack [id, queryId, constraintField] = cur;
        return constraintField === field;
      });

      var aggs = indexer.index("queryToAggregateConstraint")[queryId] || [];
      var foundAgg = functions.filter(function(cur) {
        unpack [id, queryId, constraintField] = cur;
        return constraintField === field;
      });

      var constants = indexer.index("queryToConstantConstraint")[queryId] || [];
      var foundConstant = constants.filter(function(cur) {
        unpack [id, constraintField] = cur;
        return constraintField === field;
      });

      if(foundFunc.length) {
        unpack [constraintId] = foundFunc[0]
        diff.functionConstraint = {adds: [], removes: [foundFunc[0]]};
        diff.functionConstraintInput = {adds: [],
                                        removes: indexer.index("functionConstraintToInput")[constraintId] || []};
      } else if(foundAgg.length) {
        unpack [constraintId] = foundAgg[0]
        diff.aggregateConstraint = {adds: [], removes: [foundAgg[0]]};
        diff.aggregateConstraintAggregateInput = {adds: [],
                                                  removes: indexer.index("aggregateConstraintToInput")[constraintId] || []};
      } else if(foundConstant.length) {
        unpack [constraintId] = foundConstant[0]
        diff.constantConstraint = {adds: [], removes: [foundConstant[0]]};
      }


      // add a new thing.
      if(value[0] === "=") {
        //it's a function
        var id = global.uuid();
        var viewFields = indexer.index("viewToFields")[table];
        var displayNames = indexer.index("displayName");
        var namedFields = viewFields.map(function(cur) {
          return [cur[0], displayNames[cur[0]]];
        });
        var inputs = [];
        foreach(named of namedFields) {
          unpack [fieldId, name] = named;
          if(value.indexOf(name) > -1) {
            inputs.push([id, fieldId, name]);
          }
        }

        var isAggregate = false;
        foreach(agg of aggregateFuncs) {
          if(value.indexOf(agg + "(") > -1) {
            isAggregate = true;
            break;
          }
        }

        if(isAggregate) {
          if(!diff.aggregateConstraint) {
            diff.aggregateConstraint = {adds: [], removes: []};
            diff.aggregateConstraintBinding = {adds: [], removes: []};
            diff.aggregateConstraintSolverInput = {adds: [], removes: []};
            diff.aggregateConstraintAggregateInput = {adds: [], removes: []};
          }
          var groups = viewFields.filter(function(cur) {
            return hasTag(cur[0], "grouped");
          }).map(function(cur) {
            return [id, cur[0], cur[0]];
          });
          diff.aggregateConstraint.adds.push([id, queryId, field, table, value.substring(1)]);
          //add groups
          diff.aggregateConstraintBinding.adds = groups;
          //add non-aggregate inputs
          diff.aggregateConstraintAggregateInput.adds = inputs;
        } else {
          if(!diff.functionConstraint) {
            diff.functionConstraint = {adds: [], removes: []};
            diff.functionConstraintInput = {adds: [], removes: []};
          }
          diff.functionConstraint.adds.push([id, queryId, field, value.substring(1)]);
          diff.functionConstraintInput.adds = inputs;
        }

      } else {
        //it's a constant
        if(!diff.constantConstraint) {
          diff.constantConstraint = {adds: [], removes: []};
        }
        diff.constantConstraint.adds.push([queryId, field, value]);
      }

      indexer.handleDiffs(diff);
      break;

    //---------------------------------------------------------
    // UI Editor
    //---------------------------------------------------------

    case "addUIEditorElementFromMenu":
      var diff = {
        uiEditorElement: {adds: [], removes: []}
      }
      unpack [menuX, menuY] = indexer.first("contextMenu");
      //@TODO: it seems sketchy to query the DOM here, but we have to get the relative
      //position of the click to the design surface.
      var surfaceDimensions = document.querySelector(".ui-tile").getBoundingClientRect();
      var x = menuX - surfaceDimensions.left;
      var y = menuY - surfaceDimensions.top;
      var id = global.uuid();
      var elem = [id, info, x, y, 100, 20];
      diff.uiEditorElement.adds.push(elem);
      var views = elementToViews(elem);
      forattr(table, values of views) {
        diff[table] = {adds: values, removes: []};
      }
      indexer.handleDiffs(diff);
      break;

    case "uiEditorElementMove":
      var diff = {
        uiEditorElement: {adds: [info.neue], removes: [info.old]}
      }
      var neueViews = elementToViews(info.neue);
      var oldViews = elementToViews(info.old);
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table]};
      }
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
// UI Helpers
//---------------------------------------------------------

function elementToViews(element) {
  var typeToDOM = {"box": "div", "button": "button", "text": "span", "input": "input"};
  var results = {view: [], field: [], query: [], viewConstraint: [], viewConstraintBinding: [], constantConstraint: []};
  unpack [id, type, x, y, width, height] = element;
  //uiElem view
  var uiElemFeederId = id + "|uiElemFeeder";
  results.view.push([uiElemFeederId]);
  results.field.push([uiElemFeederId + "|id", uiElemFeederId, 0],
                     [uiElemFeederId + "|type", uiElemFeederId, 1]);
  var uiElemFeederQueryId = uiElemFeederId + "|query";
  results.query.push([uiElemFeederQueryId, uiElemFeederId, 0]);
  results.constantConstraint.push([uiElemFeederQueryId, uiElemFeederId + "|id", id]);
  results.constantConstraint.push([uiElemFeederQueryId, uiElemFeederId + "|type", typeToDOM[type]]);

  var uiElemQueryId = id + "|uiElem|Query";
  results.query.push([uiElemQueryId, "uiElem", 0]);
  var uiElemViewConstraintId = uiElemQueryId + "|viewConstraint";
  results.viewConstraint.push([uiElemViewConstraintId, uiElemQueryId, uiElemFeederId, false]);
  results.viewConstraintBinding.push([uiElemViewConstraintId, "uiElem|field=id", uiElemFeederId + "|id"]);
  results.viewConstraintBinding.push([uiElemViewConstraintId, "uiElem|field=type", uiElemFeederId + "|type"]);

  //uiAttr view - pack all the styles into style
  var styleStr = "top: " + y + "px; left: " + x + "px; width:" + width + "px; height:" + height + "px; background: red; position:absolute;";
  var uiAttrFeederId = id + "|uiAttrFeeder";
  results.view.push([uiAttrFeederId]);
  results.field.push([uiAttrFeederId + "|id", uiAttrFeederId, 0],
                     [uiAttrFeederId + "|attr", uiAttrFeederId, 1],
                     [uiAttrFeederId + "|value", uiAttrFeederId, 2]);
  var uiAttrFeederQueryId = uiAttrFeederId + "|query";
  results.query.push([uiAttrFeederQueryId, uiAttrFeederId, 0]);
  results.constantConstraint.push([uiAttrFeederQueryId, uiAttrFeederId + "|id", id]);
  results.constantConstraint.push([uiAttrFeederQueryId, uiAttrFeederId + "|attr", "style"]);
  results.constantConstraint.push([uiAttrFeederQueryId, uiAttrFeederId + "|value", styleStr]);

  var uiAttrQueryId = id + "|uiAttr|Query";
  results.query.push([uiAttrQueryId, "uiAttr", 0]);
  var uiAttrViewConstraintId = uiAttrQueryId + "|viewConstraint";
  results.viewConstraint.push([uiAttrViewConstraintId, uiAttrQueryId, uiAttrFeederId, false]);
  results.viewConstraintBinding.push([uiAttrViewConstraintId, "uiAttr|field=id", uiAttrFeederId + "|id"]);
  results.viewConstraintBinding.push([uiAttrViewConstraintId, "uiAttr|field=attr", uiAttrFeederId + "|attr"]);
  results.viewConstraintBinding.push([uiAttrViewConstraintId, "uiAttr|field=value", uiAttrFeederId + "|value"]);

  //uiText view
  //@TODO

  //uiChild view
  var uiChildFeederId = id + "|uiChildFeeder";
  results.view.push([uiChildFeederId]);
  results.field.push([uiChildFeederId + "|parent", uiChildFeederId, 0],
                     [uiChildFeederId + "|pos", uiChildFeederId, 1],
                     [uiChildFeederId + "|child", uiChildFeederId, 2]);
  var uiChildFeederQueryId = uiChildFeederId + "|query";
  results.query.push([uiChildFeederQueryId, uiChildFeederId, 0]);
  results.constantConstraint.push([uiChildFeederQueryId, uiChildFeederId + "|parent", "eve-root"]);
  results.constantConstraint.push([uiChildFeederQueryId, uiChildFeederId + "|pos", 0]);
  results.constantConstraint.push([uiChildFeederQueryId, uiChildFeederId + "|child", id]);

  var uiChildQueryId = id + "|uiChild|Query";
  results.query.push([uiChildQueryId, "uiChild", 0]);
  var uiChildViewConstraintId = uiChildQueryId + "|viewConstraint";
  results.viewConstraint.push([uiChildViewConstraintId, uiChildQueryId, uiChildFeederId, false]);
  results.viewConstraintBinding.push([uiChildViewConstraintId, "uiChild|field=parent", uiChildFeederId + "|parent"]);
  results.viewConstraintBinding.push([uiChildViewConstraintId, "uiChild|field=pos", uiChildFeederId + "|pos"]);
  results.viewConstraintBinding.push([uiChildViewConstraintId, "uiChild|field=child", uiChildFeederId + "|child"]);
  return results;

}

//---------------------------------------------------------
// AST helpers
//---------------------------------------------------------

function namespacedField(displayNames, tableAndField) {
  unpack [table, field] = tableAndField;
  return displayNames[table] + "." + displayNames[field];
}

function viewToDSL(view) {
  var displayNames = indexer.index("displayName");
  var queries = indexer.index("viewToQuery")[view];
  if(!queries) return;
  var query = queries[0];
  var final = "";
  var queryId = query[0];

  var constants = indexer.index("queryToConstantConstraint")[queryId];
  var viewConstraints = indexer.index("queryToViewConstraint")[queryId];
  var viewConstraintBindings = {};
  var VCBIndex = indexer.index("viewConstraintToBinding");
  foreach(vc of viewConstraints) {
    unpack [id, _, sourceView] = vc;
    var bindings = VCBIndex[id];
    if(!bindings) continue;

    foreach(binding of bindings) {
      unpack [_, field, sourceField] = binding;
      if(!viewConstraintBindings[field]) {
        viewConstraintBindings[field] = [];
      }
      viewConstraintBindings[field].push([sourceView, sourceField]);
    }
  }

  var functionConstraints = indexer.index("queryToFunctionConstraint")[queryId];
  var aggregateConstraints = indexer.index("queryToAggregateConstraint")[queryId];
  var aggregateConstraintBindings = {};
  var ACBIndex = indexer.index("aggregateConstraintToBinding");
  foreach(agg of aggregateConstraints) {
    unpack [id, _, field, sourceView, code] = agg;
    var bindings = ACBIndex[id];
    if(!bindings) continue;

    foreach(binding of bindings) {
      unpack [_, field, sourceField] = binding;
      if(!aggregateConstraintBindings[field]) {
        aggregateConstraintBindings[field] = [];
      }
      aggregateConstraintBindings[field].push([sourceView, sourceField]);
    }
  }

  foreach(vc of viewConstraints) {
    unpack [id, _, sourceView] = vc;
    final += "<- " + displayNames[sourceView] + "\n";
  }

  foreach(agg of aggregateConstraints) {
    unpack [id, query, field, sourceView, code] = agg;
    final += "<= " + displayNames[sourceView] + "\n";
  }

  var constantFields = {};
  foreach(constant of constants) {
    unpack [queryId, field, value] = constant;
    constantFields[field] = value;
    if(viewConstraintBindings[field]) {
      final += namespacedField(displayNames, viewConstraintBindings[field][0]) + " = " + JSON.stringify(value) + "\n";
    }
  }

  forattr(field, bindings of viewConstraintBindings) {
    if(bindings.length > 1) {
      final += namespacedField(displayNames, bindings[0]);
      final += " = " + namespacedField(displayNames, bindings[1]);
      final += "\n";
    }
  }

  forattr(field, bindings of aggregateConstraintBindings) {
    var vcb = viewConstraintBindings[field];
    var constant = constantFields[field];
    if(bindings.length) {
      var cur = displayNames[field];
      if(vcb) {
        cur = namespacedField(displayNames, vcb[0]);
      } else if(constantFields[field]) {
        cur = JSON.stringify(constantFields[field]);
      }
      final += namespacedField(displayNames, bindings[0]);
      final += " = " + cur;
      final += "\n";
    }
  }

  var filters = [];
  foreach(func of functionConstraints) {
    unpack [id, query, field, code] = func;
    if(!hasTag(id, "filter")) {
      final += displayNames[field] + " = " + code.trim() + "\n";
    } else {
      filters.push(code.trim());
    }
  }

  foreach(agg of aggregateConstraints) {
    unpack [id, query, field, sourceView, code] = agg;
    final += displayNames[field] + " = " + code.trim() + "\n";
  }

  foreach(filter of filters) {
    final += filter + "\n";
  }

  return final;
}

global.viewToDSL = viewToDSL;

//---------------------------------------------------------
// IDE tables
//---------------------------------------------------------

function ideTables() {
  var facts = [];
  pushAll(facts, inputView("activePosition", ["w", "h", "x", "y"]));
  pushAll(facts, inputView("activeTile", ["tile"]));
  pushAll(facts, inputView("gridTile", ["tile", "type", "w", "h", "x", "y"]));
  pushAll(facts, inputView("tableTile", ["tile", "table"]));
  pushAll(facts, inputView("contextMenu", ["x", "y"]));
  pushAll(facts, inputView("contextMenuItem", ["pos", "type", "text", "event", "id"]));
  pushAll(facts, inputView("uiEditorElement", ["id", "type", "x", "y", "w", "h"]));
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
  indexer.addIndex("viewConstraint", "viewConstraint", indexers.makeLookup(0, false));
  indexer.addIndex("viewConstraintBinding", "viewConstraintToBinding", indexers.makeCollector(0));
  indexer.addIndex("viewConstraintBinding", "fieldToBindings", indexers.makeCollector(1));
  indexer.addIndex("aggregateConstraint", "queryToAggregateConstraint", indexers.makeCollector(1));
  indexer.addIndex("aggregateConstraintBinding", "aggregateConstraintToBinding", indexers.makeCollector(0));
  indexer.addIndex("aggregateConstraintAggregateInput", "aggregateConstraintToInput", indexers.makeCollector(0));
  indexer.addIndex("functionConstraint", "queryToFunctionConstraint", indexers.makeCollector(1));
  indexer.addIndex("functionConstraintInput", "functionConstraintToInput", indexers.makeCollector(0));
  indexer.addIndex("constantConstraint", "queryToConstantConstraint", indexers.makeCollector(0));
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
