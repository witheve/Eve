import macros from "../macros.sjs";

var React = require("react/addons");
var bootstrap = require("./bootstrap");
var JSML = require("./jsml");
var helpers = require("./helpers");
var grid = require("./grid");
var incrementalUI = require("./incrementalUI");
var index = require("./indexer");
var indexers = index.indexers;

//---------------------------------------------------------
// Globals
//---------------------------------------------------------

var ide = module.exports;
var indexer;
var defaultSize = [12,3];
var aggregateFuncs = ["sum", "count", "avg", "maxBy"];
var KEYCODES = {
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  ENTER: 13,
  ESCAPE: 27
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

var headerMixin = {
  dragStart: function(e) {
    e.currentTarget.classList.add("dragging");
    dispatch(["dragField", {table: this.props.table, field: this.props.field[0]}]);
  },
  dragEnd: function(e) {
    e.currentTarget.classList.remove("dragging");
    dispatch(["clearDragField", {table: this.props.table, field: this.props.field[0]}]);
  },
  doubleClick: function(e) {
    e.stopPropagation();
    this.click(e);
  },
  wrapHeader: function(attrs, content) {
    attrs.draggable = true;
    attrs.onDoubleClick = this.doubleClick;
    attrs.onClick = null;
    attrs.onDragStart = this.dragStart;
    attrs.onDragEnd = this.dragEnd;
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
  stop: function(e) {
    e.stopPropagation();
  },
  keyDown: function(e) {
    //handle pressing enter
    if(e.keyCode === KEYCODES.ENTER) {
      this.state.force = true;
      e.currentTarget.blur();
      e.preventDefault();
    }
  },
  input: function(e) {
    this.state.edit = parseValue(e.target.textContent);
  },
  blur: function() {
    this.setState({editing: false});
    var commitSuccessful = this.commit(this.state.force);
    this.state.force = false;
    if(commitSuccessful) {
      this.setState({edit: ""});
    }
  },
  wrapEditable: function(attrs, content) {
    attrs.contentEditable = this.state.editing;
    attrs.className += (this.state.editing) ? " selected" : "";
    attrs.onClick = this.click;
    attrs.onDoubleClick = this.stop;
    attrs.onKeyDown = this.keyDown;
    attrs.onInput = this.input;
    attrs.onBlur = this.blur;
    attrs.dangerouslySetInnerHTML = {__html: this.state.edit || content};
    return attrs;
  }
};

var editableInputMixin = helpers.cloneShallow(editableFieldMixin);
editableInputMixin.input = function(e) {
  this.state.edit = e.target.value;
};
editableInputMixin.wrapEditable = function(attrs, content) {
    attrs.className += (this.state.editing) ? " selected" : "";
    attrs.onClick = this.click;
    attrs.onKeyDown = this.keyDown;
    attrs.onInput = this.input;
    attrs.onBlur = this.blur;
    attrs.value = this.state.edit || content;
    return attrs;
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
    dispatch(["setActiveUIEditorElement", this.props.elem[0]]);
  },
  dragOver: function(e) {
    if(indexer.first("dragField")) {
      //class?
      e.preventDefault();
    }
  },
  drop: function(e) {
    e.stopPropagation();
    var dragged = indexer.first("dragField");
    if(dragged) {
      unpack[table, field] = dragged;
      if(this.dropMenu) {
        dispatch(["dropField", {table: table, field: field}]);
        dispatch(["setActiveUIEditorElement", this.props.elem[0]]);
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: this.dropMenu()}]);
      }
    }
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
  },
  setActive: function(e) {
    dispatch(["setActiveUIEditorElement", this.props.elem[0]]);
    e.stopPropagation();
  },
  stopPropagation: function(e) { e.stopPropagation(); },
  contextMenu: function(e) {
    e.preventDefault();
    e.stopPropagation();
    dispatch(["setActiveUIEditorElement", this.props.elem[0]]);
    dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                              items: this.contextMenuItems()}]);
  },
  isActive: function() {
    var active = indexer.first("activeUIEditorElement");
    if(!active) return false;
    return active[0] === this.props.elem[0];
  },
  render: function() {
    var state = this.state;
    return JSML.react(["div", {key: this.props.elem[0], onContextMenu: this.contextMenu, onClick: this.setActive, onDoubleClick: this.stopPropagation, onDragOver: this.dragOver, onDrop: this.drop},
                       this.isActive() ? Resizer({x: state.x, y: state.y, width: state.width, height: state.height, resize: this.resize, resizeEnd: this.moved}) : null,
                       this.element()
                      ]);
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

    opts.className += " resize-handle";
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
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "top", className: "nwse-handle"})],
                       ["div", this.wrapHandle({"data-x": "center", "data-y": "top", className: "ns-handle"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "top", className: "nesw-handle"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "middle", className: "ew-handle"})],
                       ["div", this.wrapHandle({"data-x": "right", "data-y": "bottom", className: "nwse-handle"})],
                       ["div", this.wrapHandle({"data-x": "center", "data-y": "bottom", className: "ns-handle"})],
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "bottom", className: "nesw-handle"})],
                       ["div", this.wrapHandle({"data-x": "left", "data-y": "middle", className: "ew-handle"})]
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
    return {size: [tileGrid.cols - 0, tileGrid.rows],
            pos: [0, 0]};
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

    var menu = indexer.first("contextMenu");
    var gridContainer = ["div", {"id": "cards", "onClick": this.click}, tables];

    // if there isn't an active tile, add placeholder tiles for areas that can hold them.
    if(!activeTile) {
      var gridItems = index.getTileFootprints();
      var activePosition = indexer.first("activePosition") || [];
      while(true) {
        var slot = grid.firstGap(tileGrid, gridItems, defaultSize);
        if(!slot) { break; }
        var gridItem = {size: defaultSize, pos: slot, active: (menu && activePosition[2] === slot[0] && activePosition[3] === slot[1])};
        gridItems.push(gridItem);
        gridContainer.push(tiles.addTile(gridItem));
      }
    }

    return JSML.react(["div",
                       ["canvas", {id: "clear-pixel", width: 1, height: 1}],
                       ProgramLoader(),
                       gridContainer,
                       menu ? ContextMenu({x: menu[0], y: menu[1]}) : null]);
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
                                 "onDrop": this.props.drop,
                                 "onDragOver": this.props.dragOver,
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
      var className = "add-tile" + (this.props.active ? " selected" : "");
      var content = JSML.react(["div", {onClick: this.click, onContextMenu: this.click}, "+"]);
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, id: "addTile", class: className, content: content, controls: false, selectable: false});
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
        if(index.hasTag(id, "constant")) { label = " - constant"; }
        else if(index.hasTag(id, "input")) { label = "- input"; }

        return JSML.react(
          ["h2",
           ["span", this.wrapEditable({key: id + "-title",}, name)],
           label]);
      }
    }),
    header: reactFactory({
      mixins: [editableFieldMixin, headerMixin],
      contextMenu: function(e) {
        e.preventDefault();
        e.stopPropagation();
        var id = this.props.field[0];
        var joins = indexer.index("fieldToJoins")[id];
        var isJoined = joins && joins.length;

        var items = [
          [0, "input", "filter", "filterField", id],
          (index.hasTag(id, "grouped") ? [1, "text", "ungroup", "ungroupField", id] : [1, "text", "group", "groupField", id])
        ];
        if(isJoined) {
          items.push([items.length, "text", "unjoin", "unjoinField", id]);
        }
        items.push([items.length, "fieldSearcher", "join", "joinField", id])

        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: items}]);
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
        if(index.hasTag(id, "grouped")) {
          className += " grouped";
        }
        var opts = this.wrapEditable({
          className: className,
          key: id,
          onContextMenu: this.contextMenu
        }, name);
        opts = this.wrapHeader(opts);
        return JSML.react(["div", opts]);
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
        if(index.hasTag(table, "constant")) {
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
          if(this.props.hidden[ix]) { continue; }
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
      var isInput = index.hasTag(this.props.table, "input");
      if(!isInput) {
        e.preventDefault();
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "viewSearcher", "Add table", "addTableToView", this.props.table]
                                  ]}]);
      }
    },
    dragOver: function(e) {
      if(indexer.first("dragField")) {
        //class?
        e.preventDefault();
      }
    },
    drop: function(e) {
      e.stopPropagation();
      var dragged = indexer.first("dragField");
      if(dragged) {
        unpack[table, field] = dragged;
        if(this.props.table !== table) {
          dispatch(["addFieldToView", {table: table, field: field, current: this.props.table}]);
        }
      }
    },
    render: function() {
      var self = this;
      var table = this.props.table;
      var viewFields = indexer.index("viewToFields")[table] || [];
      index.sortByIx(viewFields, 2);
      var hidden = [];
      var headers = viewFields.map(function(cur, ix) {
        hidden[ix] = index.hasTag(cur[0], "hidden");
        if(!hidden[ix]) {
          return self.header({field: cur, table: table});
        }
      });


      function indexToRows(index, hidden, startIx) {
        startIx = startIx || 0;
        hidden = hidden || [];
        var rows = [];
        if(index instanceof Array) {
          rows = index.map(function factToRow(cur) {
            return self.row({row: cur, table: table, fields: viewFields, hidden: hidden});
          }).filter(Boolean);
        } else {
          var newHidden = hidden.slice();
          newHidden[startIx] = true;
          forattr(value, group of index) {
            var groupRow = ["div", {className: "grid-group"}];
            groupRow.push.apply(groupRow, indexToRows(group, newHidden, startIx + 1));
            rows.push(["div", {className: "grid-row grouped-row"},
                       ["div", {className: "grouped-field"}, value],
                       groupRow]);
          }
        }
        return rows;
      }

      var rowIndex;
      if(indexer.hasIndex(table + "|rows")) {
        rowIndex = indexer.index(table + "|rows");
      } else {
        rowIndex = indexer.facts(table) || [];
      }
      var rows = indexToRows(rowIndex, hidden);
      var isConstant = index.hasTag(table, "constant");
      var isInput = index.hasTag(table, "input");
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
      return tiles.wrapper({pos: this.props.pos, size: this.props.size, tile: this.props.tile, class: className, content: content, contextMenu: this.contextMenu,
                           drop: this.drop, dragOver: this.dragOver});
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
      element: function() {
        var opts = this.wrapStyle(this.wrapDragEvents({className: "uiElement box"}));
        return ["div", opts];
      }
    }),
    text: reactFactory({
      mixins: [uiEditorElementMixin],
      dropMenu: function(table, field) {
        return [
          [0, "text", "text", "bindUIElementText", "text"]
        ];
      },
      contextMenuItems: function(e) {
        return [
          [0, "text", "Live view", "liveUIMode", this.props.tile],
        ];
      },
      element: function() {
        var opts = this.wrapStyle(this.wrapDragEvents({className: "text uiElement"}));
        var attrs = indexer.index("uiElementToElementAttr")[this.props.elem[0]];
        var text = "";
        if(attrs && attrs["text"]) {
          unpack [_, attr, field, isBinding] = attrs["text"][0];
          if(isBinding) {
            text = "Bound to " + indexer.index("displayName")[field];
          } else {
            text = field;
          }
        }
        return ["span", opts, text];
      }
    }),
    button: reactFactory({
      mixins: [uiEditorElementMixin, editableFieldMixin],
      dropMenu: function(table, field) {
        return [
          [0, "text", "text", "bindUIElementText", "text"]
        ];
      },
      contextMenuItems: function(e) {
        return [
          [0, "text", "Live view", "liveUIMode", this.props.tile],
          [1, "input", "Button name", "bindUIElementName", this.props.elem[0]],
          [2, "input", "Text", "setUIElementText", this.props.elem[0]],
          [3, "text", "Get clicks", "setUIElementEvent", "click"]
        ];
      },
      commit: function() {
        dispatch(["setUIElementText", this.state.edit]);
      },
      element: function() {
        var attrs = indexer.index("uiElementToElementAttr")[this.props.elem[0]];
        var text = "";
        if(attrs && attrs["text"]) {
          unpack [_, attr, field, isBinding] = attrs["text"][0];
          if(isBinding) {
            text = "Bound to " + indexer.index("displayName")[field];
          } else {
            text = field;
          }
        }
        var opts = this.wrapStyle(this.wrapDragEvents({className: "uiElement button"}));
        return ["button", opts, text];
      }
    }),
    input: reactFactory({
      mixins: [uiEditorElementMixin],
      contextMenuItems: function(e) {
        return [
          [0, "text", "Live view", "liveUIMode", this.props.tile],
          [1, "input", "input", "setUIElementEvent", "input"]
        ];
      },
      element: function() {
        var opts = this.wrapStyle(this.wrapDragEvents({placeholder: "input", className: "uiElement input"}));
        return ["div", opts];
      }
    }),
    contextMenu: function(e) {
      e.preventDefault();
      var mode = indexer.index("uiEditorTileToMode")[this.props.tile] || "designer";
      if(mode === "designer") {
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "text", "Live view", "liveUIMode", this.props.tile],
                                    [1, "text", "box", "addUIEditorElementFromMenu", "box"],
                                    [2, "text", "text", "addUIEditorElementFromMenu", "text"],
                                    [3, "text", "button", "addUIEditorElementFromMenu", "button"],
                                    [4, "text", "input", "addUIEditorElementFromMenu", "input"]
                                  ]}]);
      } else {
        dispatch(["contextMenu", {e: {clientX: e.clientX, clientY: e.clientY},
                                  items: [
                                    [0, "text", "Designer", "designerUIMode", this.props.tile]
                                  ]}]);
      }
    },
    render: function() {
      var self = this;
      var mode = indexer.index("uiEditorTileToMode")[this.props.tile] || "designer";
      var switcherClick = function(mode) {
        return function(e) {
          dispatch([mode, self.props.tile]);
        }
      }
      var switcher = JSML.react(["div", {className: "switcher"},
                                 ["span", {className: mode === "designer" ? "active" : "", onClick: switcherClick("designerUIMode")}, "designer"],
                                 ["span", {className: mode === "live" ? "active" : "", onClick: switcherClick("liveUIMode")},"live"]])
      if(mode === "designer") {
        var self = this;
        var editorElems = indexer.facts("uiEditorElement").map(function(cur) {
          unpack [id, type] = cur;
          return self[type]({elem: cur, tile: self.props.tile, key: id});
        });
        var content = [switcher,
          JSML.react(["div", {className: "ui-design-surface"},
                                  editorElems])];
      } else {
        var content = [switcher, this.container({})];
      }

      return tiles.wrapper({class: "ui-tile", controls: false, content: content, contextMenu: this.contextMenu,
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
      name = names[id] ? names[id].toString() : false;
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
            max: this.props.max || 10,
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
                                  className: "full-input",
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
  input: reactFactory({
    mixins: [editableInputMixin],
    commit: function(force) {
      dispatch([this.props.event, {id: this.props.id, text: this.state.edit, force: force}]);
      return true;
    },
    render: function() {
      return JSML.react(["div", {className: "menu-item"},
                         ["input", this.wrapEditable({className: "full-input", type: "text", placeholder: this.props.text})]
                        ]);
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

function sortView(view) {
  var oldFields = indexer.index("viewToFields")[view].slice();
  var fields = helpers.cloneArray(oldFields);
  var oldFacts = indexer.facts(view).slice();
  var facts = helpers.cloneArray(oldFacts);

  // Splits fields into grouped and ungrouped.
  var groups = [];
  var rest = [];
  index.sortByIx(fields, 2);
  foreach(field of fields) {
    if(index.hasTag(field[0], "grouped")) {
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

  if(modified) {
    var diff = {
      field: {adds: fields, removes: oldFields},
    };
    diff[view] = {adds: facts, removes: oldFacts};
    indexer.handleDiffs(diff);
  }

  if(groups.length) {
    indexer.addIndex(view, view + "|rows",
                     indexers.makeCollector.apply(null, helpers.pluck(groups, 2)));
  }
}

function _clearFilter(field) {
  var diff = {};
  var view = indexer.index("fieldToView")[field];
  var queries = indexer.index("viewToQuery")[view];
  var functionConstraints = [];
  foreach(queryFact of queries) {
    functionConstraints.push.apply(functionConstraints, indexer.index("queryToFunctionConstraint")[queryFact[0]]);
  }
  foreach(constraint of functionConstraints) {
    if(!index.hasTag(constraint[0], "filter") || !index.hasTag(constraint[0], field)) { continue; }
    var field = constraint[2];
    var fieldFact = indexer.index("field")[field];
    helpers.merge(diff, index.diff.remove("field", fieldFact));
  }
  var constantConstraints = indexer.index("fieldToConstantConstraint")[field];
  foreach(constraint of constantConstraints) {
    helpers.merge(diff, index.diff.remove("constantConstraint", constraint));
  }

  return diff;
}

function dispatch(eventInfo) {
  unpack [event, info] = eventInfo;
  switch(event) {
    case "diffsHandled":
      //TODO: Should we push this off to a requestAnimationFrame?
      console.time("render");
      React.render(Root(), document.body);
      console.timeEnd("render");
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
        info.pos = grid.firstGap(tileGrid, index.getTileFootprints(), defaultSize);
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
        activePosition: {adds: [], removes: indexer.facts("activePosition")}
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
      if(index.hasTag(tableId, "constant")) {
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
      var isConstant = index.hasTag(info.view, "constant");
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

    case "addFieldToView":
      var diff = {};
      var addedTable = info.table;
      var addedField = info.field;
      var currentTable = info.current;
      var query = indexer.index("viewToQuery")[currentTable];
      if(!query || !query.length) return;
      var queryId = query[0][0];
      var viewConstraints = indexer.index("queryToViewConstraint")[queryId];
      var viewConstraintId;
      foreach(vc of viewConstraints) {
        unpack [vcId, _, sourceView, isNegated] = vc;
        if(sourceView === addedTable) {
          viewConstraintId = vcId;
        }
      }
      if(!viewConstraintId) {
        viewConstraintId = global.uuid();
        diff.viewConstraint = {adds: [[viewConstraintId, queryId, addedTable, false]], removes: []};
      }

      var fieldIx = indexer.index("viewToFields")[currentTable] ? indexer.index("viewToFields")[currentTable].length : 0;
      var fieldId = global.uuid();
      var name = indexer.index("displayName")[addedField] || "";
      diff.field = {adds: [[fieldId, currentTable, fieldIx]], removes: []};
      diff.displayName = {adds: [[fieldId, name]], removes: []};
      diff.viewConstraintBinding = {adds: [[viewConstraintId, fieldId, addedField]], removes: []};
      indexer.handleDiffs(diff);
      break;

    case "dragField":
      var table = info.table;
      var field = info.field;
      var diff = {
        "dragField": {adds: [[table, field]], removes: indexer.facts("dragField")}
      };
      indexer.handleDiffs(diff);
      break;

    case "clearDragField":
      var diff = {
        "dragField": {adds: [], removes: indexer.facts("dragField")}
      };
      indexer.handleDiffs(diff);
      break;

    case "dropField":
      var table = info.table;
      var field = info.field;
      var diff = {
        "dragField": {adds: [], removes: indexer.facts("dragField")},
        "dropField": {adds: [[table, field]], removes: indexer.facts("dropField")}
      };
      indexer.handleDiffs(diff);
      break;

    case "groupField":
      var view = indexer.index("fieldToView")[info];
      var diff = {
        tag: {adds: [[info, "grouped"]], removes: []}
      };
      indexer.handleDiffs(diff);
      sortView(view);
      break;

    case "ungroupField":
      var view = indexer.index("fieldToView")[info];
      var diff = {
        tag: {adds: [], removes: [[info, "grouped"]]}
      }
      indexer.removeIndex(view, view + "|rows");
      indexer.handleDiffs(diff);
      sortView(view);
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
        "tag": {adds: [[field2, "hidden"]], removes: []},
        "join": {adds: [[field1, sourceField]], removes: []}
      });
      dispatch(["clearContextMenu"]);
      break;

    case "unjoinField":
      var joins = indexer.index("fieldToJoins")[info];
      var bindings = indexer.index("fieldToBindings")[info];
      var diff = {
        join: {adds: [], removes: joins},
        tag: {adds: [], removes: []},
        viewConstraintBinding: {adds: [], removes: []}
      };
      foreach(join of joins) {
        unpack [field, sourceField] = join;
        // Remove the viewConstraintBinding
        foreach(binding of bindings) {
          unpack [constraint, __, bindingSource] = binding;
          if(bindingSource === sourceField) {
            diff.viewConstraintBinding.removes.push(binding);

            // Reveal any fields which were collapsed into this one by the join.
            var relatedBindings = indexer.index("viewConstraintToBinding")[constraint];
            foreach(related of relatedBindings) {
              unpack [__, relatedField, __] = related;
              diff.tag.removes.push([relatedField, "hidden"]);
            }
          }
        }
      }
      indexer.handleDiffs(diff);
      break;

    case "filterField":
      var clearDiff = _clearFilter(info.id);
      var diff = {};
      if(!info.text) { return; }
      var view = indexer.index("fieldToView")[info.id];
      var viewFields = indexer.index("viewToFields")[view];
      var queries = indexer.index("viewToQuery")[view];
      if(!queries || !queries.length) {
        throw new Error("cannot filter malformed view: '" + view + "' containing field: '" + info.id + "'.");
      }
      var query = queries[0][0]; // @FIXME: Handle multiple queries.

      if(info.text[0] === "=") {
        // This is a function filter.
        var code = info.text.substring(1);
        var id = global.uuid();
        var filterField = global.uuid();
        var displayNames = indexer.index("displayName");
        var namedFields = viewFields.map(function(cur) {
          return [cur[0], displayNames[cur[0]]];
        });
        var inputs = [];
        foreach(named of namedFields) {
          unpack [fieldId, name] = named;
          if(code.indexOf(name) > -1) {
            inputs.push([id, fieldId, name]);
          }
        }

        var filterIx = viewFields.length - (clearDiff.field ? clearDiff.field.removes.length : 0);
        diff.field = {adds: [[filterField, view, filterIx]], removes: []};
        diff.constantConstraint = {adds: [[query, filterField, true]], removes: []};
        diff.tag = {adds: [[id, "filter"],
                           [id, info.id],
                           [filterField, "filter"],
                           [filterField, "hidden"]
                          ], removes: []};
        diff.functionConstraint = {adds: [[id, query, filterField, code]], removes: []};
        diff.functionConstraintInput = {adds: inputs, removes: []};

      } else {
        // This is a constant filter.
        diff.constantConstraint = {adds: [[query, info.id, parseValue(info.text)]], removes: []};
      }

      helpers.merge(diff, clearDiff);
      indexer.handleDiffs(diff);
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
            return index.hasTag(cur[0], "grouped");
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
      var id = global.uuid();
      var diff = {
        uiEditorElement: {adds: [], removes: []},
        activeUIEditorElement: {adds: [[id]], removes: indexer.facts("activeUIEditorElement")}
      }
      unpack [menuX, menuY] = indexer.first("contextMenu");
      //@TODO: it seems sketchy to query the DOM here, but we have to get the relative
      //position of the click to the design surface.
      var surfaceDimensions = document.querySelector(".ui-tile").getBoundingClientRect();
      var x = menuX - surfaceDimensions.left;
      var y = menuY - surfaceDimensions.top;
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

    case "setActiveUIEditorElement":
      var diff = {
        activeUIEditorElement: {adds: [[info]], removes: indexer.facts("activeUIEditorElement")}
      };
      indexer.handleDiffs(diff);
      break;

    case "bindUIElementName":
      var elementId = info.id;
      var name = info.text;
      var force = info.force;
      if(!name) return;
      var eventFact = [elementId, "name", name, false];
      var diff = {
        uiEditorElementAttr: {adds: [eventFact], removes: []}
      };
      var prevEvents = indexer.index("uiElementToElementEvent")[elementId];
      var oldViews;
      var neueViews;
      //@TODO for now this will only affect events, but once we allow repetition
      //changing the name will affect every view created for this element.
      if(prevEvents) {
        forattr(type, events of prevEvents) {
          if(events && events[0]) {
            diff.uiEditorElementAttr.removes.push(events[0]);
            oldViews = elementEventToViews(events[0], oldViews);
            var updated = events[0].slice();
            updated[3] = name;
            diff.uiEditorElementAttr.adds.push(updated);
            neueViews = elementEventToViews(updated, neueViews);
          }
        }
      } else {
        neueViews = {};
        oldViews = {};
      }

      //remove the old name
      var prevName = indexer.index("uiElementToElementAttr")[elementId];
      if(prevName && prevName["name"] && prevName["name"][0]) {
        diff.uiEditorElementAttr.removes.push(prevName["name"][0]);
      }
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table] || []};
      }
      indexer.handleDiffs(diff);
      if(force) {
        dispatch(["clearContextMenu"]);
      }
      break;

    case "setUIElementEvent":
      var type = info;
      if(!type) return;
      var elementId = indexer.first("activeUIEditorElement")[0];
      var name = elementId;
      var attrs = indexer.index("uiElementToElementAttr")[elementId];
      if(attrs && attrs["name"] && attrs["name"][0]) {
        name = attrs["name"][0][2];
      }
      console.log("Have name: ", name);
      var eventFact = [elementId, type, type, name];
      var diff = {
        uiEditorElementEvent: {adds: [eventFact], removes: []}
      };
      var prevEvents = indexer.index("uiElementToElementEvent")[elementId];
      var oldViews = {};
      var prev;
      if(prevEvents) {
        prev = prevEvents[type];
        if(prev && prev[0]) {
          diff.uiEditorElementEvent.removes.push(prev[0]);
          oldViews = elementEventToViews(prev[0]);
        }
      }
      var neueViews = elementEventToViews(eventFact);
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table] || []};
      }
      indexer.handleDiffs(diff);
      var eventViewId = elementId + "|uiEvent|" + type;
      if(!indexer.index("tableToTile")[eventViewId]) {
        dispatch(["openView", {selected: [eventViewId]}]);
      } else {
        dispatch(["clearContextMenu"]);
      }
      break;

    case "bindUIElementStyle":
      var attr = info;
      var elementId = indexer.first("activeUIEditorElement")[0];
      var dropField = indexer.first("dropField");
      if(!dropField) return;
      unpack [table, field] = dropField;
      var eventFact = [elementId, attr, field, true];
      var diff = {
        uiEditorElementAttr: {adds: [eventFact], removes: []}
      };
      var prevEvents = indexer.index("uiElementToElementAttr")[elementId];
      var oldViews = {};
      var prev;
      if(prevEvents) {
        prev = prevEvents[attr];
        if(prev && prev[0]) {
          diff.uiEditorElementAttr.removes.push(prev[0]);
          oldViews = elementStyleToViews(prev[0]);
        }
      }
      var neueViews = elementStyleToViews(eventFact);
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table] || []};
      }
      indexer.handleDiffs(diff);
      break;

    case "bindUIElementText":
      var attr = info;
      var elementId = indexer.first("activeUIEditorElement")[0];
      var dropField = indexer.first("dropField");
      if(!dropField) return;
      unpack [table, field] = dropField;
      var eventFact = [elementId, "text", field, true];
      var diff = {
        uiEditorElementAttr: {adds: [eventFact], removes: []}
      };
      var prevEvents = indexer.index("uiElementToElementAttr")[elementId];
      var oldViews = {};
      var prev;
      if(prevEvents) {
        prev = prevEvents[attr];
        if(prev && prev[0]) {
          diff.uiEditorElementAttr.removes.push(prev[0]);
          oldViews = elementTextToViews(prev[0]);
        }
      }
      var neueViews = elementTextToViews(eventFact);
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table] || []};
      }
      indexer.handleDiffs(diff);
      break;

    case "setUIElementText":
      var text = info.text;
      var elementId = indexer.first("activeUIEditorElement")[0];
      var eventFact = [elementId, "text", text, false];
      var diff = {
        uiEditorElementAttr: {adds: [eventFact], removes: []}
      };
      var prevEvents = indexer.index("uiElementToElementAttr")[elementId];
      var oldViews = {};
      var prev;
      if(prevEvents) {
        prev = prevEvents[attr];
        if(prev && prev[0]) {
          diff.uiEditorElementAttr.removes.push(prev[0]);
          oldViews = elementTextToViews(prev[0]);
        }
      }
      var neueViews = elementTextToViews(eventFact);
      forattr(table, values of neueViews) {
        diff[table] = {adds: values, removes: oldViews[table] || []};
      }
      indexer.handleDiffs(diff);
      break;

    case "liveUIMode":
    case "designerUIMode":
      var tile = info;
      var mode = "live";
      if(event === "designerUIMode") {
        mode = "designer";
      }
      var removes = [];
      var prev = indexer.index("uiEditorTileToMode")[tile];
      if(prev) {
        removes = [[tile, prev]];
      }
      var diff = {
        uiEditorMode: {adds: [[tile, mode]], removes: removes}
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

function elementEventToViews(event, results) {
  var results = results || {view: [], field: [], query: [], viewConstraint: [], viewConstraintBinding: [], constantConstraint: [], displayName: []};
  unpack [id, type, label, key] = event;
  //uiEvent view
  var uiEventFeederId = id + "|uiEventFeeder";
  results.view.push([uiEventFeederId]);
  results.field.push([uiEventFeederId + "|id", uiEventFeederId, 0],
                     [uiEventFeederId + "|event", uiEventFeederId, 1],
                     [uiEventFeederId + "|label", uiEventFeederId, 2],
                     [uiEventFeederId + "|key", uiEventFeederId, 3]);
  var uiEventFeederQueryId = uiEventFeederId + "|query";
  results.query.push([uiEventFeederQueryId, uiEventFeederId, 0]);
  results.constantConstraint.push([uiEventFeederQueryId, uiEventFeederId + "|id", id]);
  results.constantConstraint.push([uiEventFeederQueryId, uiEventFeederId + "|label", label]);
  results.constantConstraint.push([uiEventFeederQueryId, uiEventFeederId + "|event", type]);
  results.constantConstraint.push([uiEventFeederQueryId, uiEventFeederId + "|key", key]);

  var uiEventQueryId = id + "|uiEvent|Query";
  results.query.push([uiEventQueryId, "uiEvent", 0]);
  var uiEventViewConstraintId = uiEventQueryId + "|viewConstraint";
  results.viewConstraint.push([uiEventViewConstraintId, uiEventQueryId, uiEventFeederId, false]);
  results.viewConstraintBinding.push([uiEventViewConstraintId, "uiEvent|field=id", uiEventFeederId + "|id"]);
  results.viewConstraintBinding.push([uiEventViewConstraintId, "uiEvent|field=label", uiEventFeederId + "|label"]);
  results.viewConstraintBinding.push([uiEventViewConstraintId, "uiEvent|field=event", uiEventFeederId + "|event"]);
  results.viewConstraintBinding.push([uiEventViewConstraintId, "uiEvent|field=key", uiEventFeederId + "|key"]);

  //filtered view of Events for this event
  var filterViewId = id + "|uiEvent|" + type;
  results.view.push([filterViewId]);
  //if we haven't given this element a name, don't make a crazy view name
  if(id === key) {
    results.displayName.push([filterViewId, label + "events"]);
  } else {
    results.displayName.push([filterViewId, key + " " + label + "s"]);
  }
  results.field.push([filterViewId + "|id", filterViewId, 0],
                     [filterViewId + "|label", filterViewId, 2],
                     [filterViewId + "|key", filterViewId, 1]);
  results.displayName.push([filterViewId + "|id", "eventNumber"]);
  results.displayName.push([filterViewId + "|label", "event"]);
  results.displayName.push([filterViewId + "|key", "element"]);
  var filterViewQueryId = filterViewId + "|query";
  results.query.push([filterViewQueryId, filterViewId, 0]);
  var eventsViewConstraintId = filterViewQueryId + "|viewConstraint";
  results.viewConstraint.push([eventsViewConstraintId, filterViewQueryId, "event", false]);
  results.viewConstraintBinding.push([eventsViewConstraintId, filterViewId + "|id", "event|field=eid"]);
  results.viewConstraintBinding.push([eventsViewConstraintId, filterViewId + "|label", "event|field=label"]);
  results.viewConstraintBinding.push([eventsViewConstraintId, filterViewId + "|key", "event|field=key"]);
  results.constantConstraint.push([filterViewQueryId, filterViewId + "|label", label]);
  results.constantConstraint.push([filterViewQueryId, filterViewId + "|key", key]);

  if(type === "input") {
    results.field.push([filterViewId + "|value", filterViewId, 3]);
    results.displayName.push([filterViewId + "|value", "value"]);
    results.viewConstraintBinding.push([eventsViewConstraintId, "event|field=value", filterViewId + "|value"]);
  }

  return results;
}

function elementAttrToViews(attr) {
  unpack [elementId, attrType, value, isBinding] = attr;
  if(attrType === "text") {
    elementTextToViews(results, attr);
  }
  return results;
}

function elementTextToViews(text) {
  var results = {view: [], field: [], query: [], viewConstraint: [], viewConstraintBinding: [], constantConstraint: [], displayName: []};
  unpack [id, _, field, isBinding] = text;
  var view = indexer.index("fieldToView")[field];
  //uiText view
  var uiTextFeederId = id + "|uiTextFeeder";
  var uiTextId = id + "|uiText";
  results.view.push([uiTextFeederId]);
  results.field.push([uiTextFeederId + "|id", uiTextFeederId, 0],
                     [uiTextFeederId + "|text", uiTextFeederId, 1]);
  var uiTextFeederQueryId = uiTextFeederId + "|query";
  results.query.push([uiTextFeederQueryId, uiTextFeederId, 0]);
  results.constantConstraint.push([uiTextFeederQueryId, uiTextFeederId + "|id", uiTextId]);
  //create a viewConstraint and bind it
  if(isBinding) {
    var bindingVCId = uiTextFeederQueryId + "|" + view + "|viewConstraint";
    results.viewConstraint.push([bindingVCId, uiTextFeederQueryId, view, false]);
    results.viewConstraintBinding.push([bindingVCId, uiTextFeederId + "|text", field]);
  } else {
    //otherwise it's just a constant
    results.constantConstraint.push([uiTextFeederQueryId, uiTextFeederId + "|text", field]);
  }

  var uiTextQueryId = id + "|uiText|Query";
  results.query.push([uiTextQueryId, "uiText", 0]);
  var uiTextViewConstraintId = uiTextQueryId + "|viewConstraint";
  results.viewConstraint.push([uiTextViewConstraintId, uiTextQueryId, uiTextFeederId, false]);
  results.viewConstraintBinding.push([uiTextViewConstraintId, "uiText|field=id", uiTextFeederId + "|id"]);
  results.viewConstraintBinding.push([uiTextViewConstraintId, "uiText|field=text", uiTextFeederId + "|text"]);

  //uiChild view for uiText
  var uiChildTextFeederId = id + "|uiChildTextFeeder";
  results.view.push([uiChildTextFeederId]);
  results.field.push([uiChildTextFeederId + "|parent", uiChildTextFeederId, 0],
                     [uiChildTextFeederId + "|pos", uiChildTextFeederId, 1],
                     [uiChildTextFeederId + "|child", uiChildTextFeederId, 2]);
  var uiChildTextFeederQueryId = uiChildTextFeederId + "|query";
  results.query.push([uiChildTextFeederQueryId, uiChildTextFeederId, 0]);
  results.constantConstraint.push([uiChildTextFeederQueryId, uiChildTextFeederId + "|parent", id]);
  results.constantConstraint.push([uiChildTextFeederQueryId, uiChildTextFeederId + "|pos", 0]);
  results.constantConstraint.push([uiChildTextFeederQueryId, uiChildTextFeederId + "|child", uiTextId]);

  var uiChildTextQueryId = id + "|uiChildText|Query";
  results.query.push([uiChildTextQueryId, "uiChild", 0]);
  var uiChildTextViewConstraintId = uiChildTextQueryId + "|viewConstraint";
  results.viewConstraint.push([uiChildTextViewConstraintId, uiChildTextQueryId, uiChildTextFeederId, false]);
  results.viewConstraintBinding.push([uiChildTextViewConstraintId, "uiChild|field=parent", uiChildTextFeederId + "|parent"]);
  results.viewConstraintBinding.push([uiChildTextViewConstraintId, "uiChild|field=pos", uiChildTextFeederId + "|pos"]);
  results.viewConstraintBinding.push([uiChildTextViewConstraintId, "uiChild|field=child", uiChildTextFeederId + "|child"]);
  return results;
}

function elementToViews(element) {
  var typeToDOM = {"box": "div", "button": "button", "text": "span", "input": "input"};
  var results = {view: [], field: [], query: [], viewConstraint: [], viewConstraintBinding: [], constantConstraint: [], displayName: []};
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
  var styleStr = "top: " + y + "px; left: " + x + "px; width:" + width + "px; height:" + height + "px; position:absolute;";
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
    final += "with " + displayNames[sourceView] + "\n";
  }

  foreach(agg of aggregateConstraints) {
    unpack [id, query, field, sourceView, code] = agg;
    final += "with { " + displayNames[sourceView] + " }\n";
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
    if(!index.hasTag(id, "filter")) {
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
  pushAll(facts, inputView("editId", ["view", "fact", "id"], ["system input"]));
  pushAll(facts, inputView("join", ["field", "sourceField"]));
  pushAll(facts, inputView("activePosition", ["w", "h", "x", "y"]));
  pushAll(facts, inputView("activeTile", ["tile"]));
  pushAll(facts, inputView("gridTile", ["tile", "type", "w", "h", "x", "y"]));
  pushAll(facts, inputView("tableTile", ["tile", "table"]));
  pushAll(facts, inputView("contextMenu", ["x", "y"]));
  pushAll(facts, inputView("contextMenuItem", ["pos", "type", "text", "event", "id"]));
  pushAll(facts, inputView("uiEditorElement", ["id", "type", "x", "y", "w", "h"]));
  pushAll(facts, inputView("uiEditorMode", ["tile", "mode"]));
  pushAll(facts, inputView("uiEditorElementEvent", ["element", "event", "label", "key"]));
  pushAll(facts, inputView("uiEditorElementAttr", ["element", "attr", "value", "isBinding"]));
  pushAll(facts, inputView("activeUIEditorElement", ["element"]));
  pushAll(facts, inputView("dragField", ["table", "field"]));
  pushAll(facts, inputView("dropField", ["table", "field"]));
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
  window.indexer = indexer = new index.Indexer(program, {
    diffsHandled: function(diffs) {
      dispatch(["diffsHandled", diffs]);
    }
  });
  indexer.addIndex("displayName", "displayName", indexers.makeLookup(0, 1));
  indexer.addIndex("field", "viewToFields", indexers.makeCollector(1));
  indexer.addIndex("field", "fieldToView", indexers.makeLookup(0, 1));
  indexer.addIndex("field", "field", indexers.makeLookup(0, false));
  indexer.addIndex("tag", "idToTags", indexers.makeCollector(0));
  indexer.addIndex("editId", "editRowToId", indexers.makeLookup2D(0, 1, 2));
  indexer.addIndex("editId", "editViewToIds", indexers.makeCollector(0));
  indexer.addIndex("join", "fieldToJoins", indexers.makeCollector(0));
  indexer.addIndex("query", "viewToQuery", indexers.makeCollector(1));
  indexer.addIndex("viewConstraint", "queryToViewConstraint", indexers.makeCollector(1));
  indexer.addIndex("viewConstraint", "viewConstraint", indexers.makeLookup(0, false));
  indexer.addIndex("viewConstraintBinding", "viewConstraintToBinding", indexers.makeCollector(0));
  indexer.addIndex("viewConstraintBinding", "fieldToBindings", indexers.makeCollector(1));
  indexer.addIndex("aggregateConstraint", "queryToAggregateConstraint", indexers.makeCollector(1));
  indexer.addIndex("aggregateConstraintBinding", "aggregateConstraintToBinding", indexers.makeCollector(0));
  indexer.addIndex("aggregateConstraintAggregateInput", "aggregateConstraintToInput", indexers.makeCollector(0));
  indexer.addIndex("functionConstraint", "queryToFunctionConstraint", indexers.makeCollector(1));
  indexer.addIndex("functionConstraint", "fieldToFunctionConstraint", indexers.makeCollector(2));
  indexer.addIndex("functionConstraintInput", "functionConstraintToInput", indexers.makeCollector(0));
  indexer.addIndex("constantConstraint", "queryToConstantConstraint", indexers.makeCollector(0));
  indexer.addIndex("constantConstraint", "fieldToConstantConstraint", indexers.makeCollector(1));
  indexer.addIndex("tableTile", "tileToTable", indexers.makeLookup(0, 1));
  indexer.addIndex("tableTile", "tableToTile", indexers.makeLookup(1, 0));
  indexer.addIndex("tableTile", "tableTile", indexers.makeLookup(0, false));
  indexer.addIndex("gridTile", "gridTile", indexers.makeLookup(0, false));
  indexer.addIndex("uiEditorMode", "uiEditorTileToMode", indexers.makeLookup(0, 1));
  indexer.addIndex("uiEditorElementEvent", "uiElementToElementEvent", indexers.makeCollector(0, 1));
  indexer.addIndex("uiEditorElementAttr", "uiElementToElementAttr", indexers.makeCollector(0, 1));
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
