//---------------------------------------------------------
// Utils
//---------------------------------------------------------

var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
}

function extend(dest, src) {
  for(var key in src) {
    if(!src.hasOwnProperty(key)) { continue; }
    dest[key] = src[key];
  }
  return dest;
}

function findWhere(arr, key, needle) {
  for(var ix = 0, len = arr.length; ix < len; ix++) {
    var cur = arr[ix];
    if(cur[key] === needle) {
      return cur;
    }
  }
}

function range(from, to) {
  if(to === undefined) {
    to = from;
    from = 0;
  }
  var results = [];
  for(var i = from; i < to; i++) {
    results.push(i);
  }
  return results;
}

//---------------------------------------------------------
// UI state
//---------------------------------------------------------

var uiState = {};
var ixer = new Indexing.Indexer();

//---------------------------------------------------------
// Root component
//---------------------------------------------------------

var toolbar = reactFactory({
  displayName: "toolbar",
  render: function() {
    var content = ["div", {className: "toolbar", key: this.props.key}];
    content.push.apply(content, this.props.controls);
    return JSML(content);
  }
});

var root = reactFactory({
  displayName: "root",
  getInitialState: function() {
    return {editingGrid: false, bounds: this.getBounds()};
  },
  componentDidMount: function() {
    window.addEventListener("resize", this.updateGrid);
  },
  componentWillUnmount: function() {
    window.removeEventListener("resize", this.updateGrid);
  },
  updateGrid: function() {
    // @FIXME: I need to be debounced.
    this.setState({bounds: this.getBounds()});
  },
  getBounds: function() {
    var bounds = extend({}, document.querySelector("body").getBoundingClientRect());
    bounds.height -= 80;
    bounds.width -= 40;
    return bounds;
  },
  chooseProgram: function() {
    console.warn("@TODO: Implement me.");
  },
  toggleEditGrid: function() {
    this.setState({editingGrid: !this.state.editingGrid});
  },
  render: function() {
    var tiles = ixer.facts("gridTile").map(function(tile) {
      return {
        id: tile[0], grid: tile[1], type: tile[2],
        pos: [tile[3], tile[4]], size: [tile[5], tile[6]]
      };
    });

    return JSML(
      ["div",
       ["canvas", {width: 1, height: 1, id: "clear-pixel", key: "root-clear-pixel"}],
       stage({bounds: this.state.bounds, editing: this.state.editingGrid, key: "root-stage", tiles: tiles}),
       toolbar({
         key: "root-toolbar",
         controls: [
           ["button", {
             title: "choose program",
             className: "btn-choose-program ion-ios-albums-outline pull-right",
             onClick: this.chooseProgram,
             key: 0
           }],
           ["button", {
             title: "edit grid",
             className: "btn-edit-grid ion-grid pull-right",
             onClick: this.toggleEditGrid,
             key: 1
           }]
         ]
       })]
    );
  }
});

//---------------------------------------------------------
// Grid components
//---------------------------------------------------------

var tiles = {};

tiles.debug = {
  flippable: false,
  navigable: false,
  content: reactFactory({
    displayName: "debug",
    render: function() {
      return JSML(["span", "hello, world!"]);
    }
  })
};


var gridTile = reactFactory({
  displayName: "grid-tile",
  mixins: [Drag.mixins.resizable],
  getInitialState: function() {
    return {currentPos: [this.props.left, this.props.top], currentSize: [this.props.width, this.props.height]};
  },
  startDrag: function(evt) {
    console.log("start");
    var dT = evt.dataTransfer;
    dT.setData("tile/" + this.props.type, this.props.id);
    dT.setData("tile/generic", this.props.id);
    dT.setDragImage(document.getElementById("clear-pixel"), 0, 0);
    var offset = [evt.clientX - this.props.left, evt.clientY - this.props.top];
    this.setState({dragging: true, dragOffset: offset});
  },
  endDrag: function(evt) {
    this.setState({dragging: false, dragOffset: undefined});
  },
  dragging: function(evt) {
    var offset = this.state.dragOffset;
    var pos = [evt.clientX - offset[0], evt.clientY - offset[1]];
    var currentPos = this.state.currentPos;
    if(pos[0] !== currentPos[0] || pos[1] !== currentPos[1]) {
      this.setState({currentPos: pos});
      this.props.updateFootprint(pos, this.state.currentSize);
    }
  },
  resizing: function(dimensions) {
    var currentSize = this.state.currentSize;
    if(dimensions[0] !== currentSize[0] || dimensions[1] !== currentSize[1]) {
      this.setState({currentSize: dimensions});
      this.props.updateFootprint(this.state.currentPos, dimensions);
    }
  },
  render: function() {
    var tile = tiles[this.props.type];
    if(!tile) { throw new Error("Invalid tile type specified: '" + this.props.type + "'."); }
    var style = {
      top: this.props.top,
      left: this.props.left,
      width: this.props.width,
      height: this.props.height
    };
    var attrs = {
      key: this.props.id,
      className: "grid-tile " + this.props.type,
      style: style,
      draggable: this.props.draggable
    };
    var content = ["div", attrs, tile.content({tileId: this.props.id})];
    if(this.props.resizable) {
      attrs.onResize = this.resizing;
      content = this.wrapResizableJsml(content);
    }
    if(this.props.draggable) {
      attrs.onDragStart = this.startDrag;
      attrs.onDragEnd = this.endDrag;
      attrs.onDrag = this.dragging;
    }
    return JSML(content);
  }
});

var stage = reactFactory({
  displayName: "stage",
  mixins: [Drag.mixins.dropzone],
  getInitialState: function() {
    return {
      grid: Grid.makeGrid({bounds: this.props.bounds, gutter: 8}),
    };
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({grid: Grid.makeGrid({bounds: nextProps.bounds, gutter: 8})});
  },
  dragTileOver: function(evt, type) {
    // @TODO: Once converted to tables, retrieve pos / size here for updateFootprint.
    var id = evt.dataTransfer.getData(type);
    if(this.state.dragId !== id) {
      this.setState({dragId: id});
    }
  },
  dragTileOut: function(evt) {
    this.setState({dragId: undefined, dragPos: undefined, dragSize: undefined});
  },
  dropTile: function() {
    if(this.state.dragValid) {
      dispatch("updateTile", {id: this.state.dragId, pos: this.state.dragPos, size: this.state.dragSize});
    }
    this.setState({dragId: undefined, dragPos: undefined, dragSize: undefined});
  },
  updateFootprint: function(pos, size) {
    var oldPos = this.state.dragPos;
    var pos = Grid.coordsToPos(this.state.grid, pos[0], pos[1], true);
    if(!oldPos || pos[0] !== oldPos[0] || pos[1] !== oldPos[1]) {
      this.setState({dragPos: pos});
    }

    var oldSize = this.state.dragSize;
    var size = Grid.coordsToSize(this.state.grid, size[0], size[1], true);
    if(!oldSize || size[0] !== oldSize[0] || size[1] !== oldSize[1]) {
      this.setState({dragSize: size});
    }

    var oldValid = this.state.dragValid;
    var tile = findWhere(this.props.tiles, "id", this.state.dragId);
    var tiles = this.props.tiles.slice();
    tiles.splice(tiles.indexOf(tile), 1);
    var valid = Grid.hasGapAt(this.state.grid, tiles, {pos: pos, size: size});
    if(oldValid !== valid) {
      this.setState({dragValid: valid});
    }
  },

  render: function() {
    var isEditing = this.props.editing;
    var children = [];
    for(var tileIx = 0, tilesLength = this.props.tiles.length; tileIx < tilesLength; tileIx++) {
      var tileRaw = this.props.tiles[tileIx];
      var tileRect = Grid.getRect(this.state.grid, tileRaw);
      var tile = extend(extend({}, tileRaw), tileRect);
      tile.key = tile.id;
      tile.draggable = tile.resizable = isEditing;
      tile.updateFootprint = this.updateFootprint;
      children.push(gridTile(tile));
    }
    var attrs = {key: this.props.key, className: "tile-grid" + (isEditing ? " editing" : "")};
    if(this.props.editing) {
      attrs.onDragOver = this.dragTileOver;
      attrs.onDragLeave = this.dragTileOut;
      attrs.onDrop = this.dropTile;
      attrs = this.wrapDropzone(attrs, {accepts: ["tile/generic"]});
    }
    var content = ["div", attrs];
    content.push.apply(content, children);

    if(this.state.dragId && this.state.dragPos) {
      var footprint = Grid.getRect(this.state.grid, {pos: this.state.dragPos, size: this.state.dragSize});
      content.push(["div", {
        className: "grid-tile-footprint" + (this.state.dragValid ? " valid" : " invalid"),
        style: {
          top: footprint.top, left: footprint.left, height: footprint.height, width: footprint.width,
        }
      }, ""]);
    }

    return JSML(content);
  }
});

//---------------------------------------------------------
// Table components
//---------------------------------------------------------

var editable = reactFactory({
  displayName: "editable",
  getInitialState: function() {
    return {value: "", modified: false};
  },
  handleChange: function(e) {
    this.setState({value: e.target.textContent, modified: true});
  },
  handleKeys: function(e) {
    //submit on enter
    if(e.keyCode === 13) {
      this.submit();
      e.preventDefault();
    }
    if(this.props.onKey) {
      this.props.onKey(e);
    }
  },
  submit: function() {
    if(this.props.onSubmit && this.state.modified) {
      this.setState({modified: false});
      this.props.onSubmit(this.state.value);
    }
  },
  render: function() {
    var value = this.state.value || this.props.value;
    return JSML(["div", {"contentEditable": true,
                         "onInput": this.handleChange,
                         "onBlur": this.submit,
                         "onKeyDown": this.handleKeys,
                         dangerouslySetInnerHTML: {__html: value !== undefined ? value : ""}}]);
  }
});

var tableHeader = reactFactory({
  displayName: "tableHeader",
  renameHeader: function(value) {
    //do stuff
    dispatch("rename", {id: this.props.id, value: value});
  },
  render: function() {
    return JSML(["th", editable({value: this.props.field, onSubmit: this.renameHeader})]);
  }
});

var tableRow = reactFactory({
  displayName: "tableRow",
  getInitialState: function() {
    var row = [];
    var cur = this.props.row;
    for(var i = 0, len = this.props.length; i < len; i++) {
      row[i] = cur[i];
    }
    return {row: row};
  },
  componentDidUpdate: function(prev) {
    if(!Indexing.arraysIdentical(prev.row, this.props.row)) {
      var row = this.state.row;
      var cur = this.props.row;
      for(var i = 0, len = this.props.length; i < len; i++) {
        row[i] = cur[i];
      }
    }
  },
  checkRowComplete: function() {
    var row = this.state.row;
    for(var i = 0, len = this.props.length; i < len; i++) {
      if(row[i] === undefined) return false;
    }
    return true;
  },
  setColumn: function(ix, value) {
    this.state.row[ix] = value;
    if(this.checkRowComplete()) {
      this.submitRow();
    } else {
      if(this.props.onRowModified) this.props.onRowModified(this.props.id);
    }
  },
  submitRow: function() {
    if(this.props.isNewRow) {
      if(this.props.onRowAdded) this.props.onRowAdded(this.props.id);
      dispatch("addRow", {table: this.props.table, neue: this.state.row});
    } else {
      dispatch("swapRow", {table: this.props.table, old: this.props.row, neue: this.state.row});
    }
  },
  render: function() {
    var self = this;
    var fields = range(this.props.length).map(function(cur) {
      var content = self.props.row[cur];
      if(content === undefined) {
        content = "";
      }
      if(self.props.editable) {
        return ["td", editable({value: content, onSubmit: function(value) {
          self.setColumn(cur, value);
        }})];
      } else {
        return ["td", content];
      }
    });
    return JSML(["tr", fields]);
  }
});

tiles.table = {
  content: reactFactory({
    displayName: "table",
    getInitialState: function() {
      var table = "foo"; //@FIXME derive this from tableTile index.
      return {table: table, partialRows: [uuid()]};
    },
    rowAdded: function(id) {
      this.setState({partialRows: this.state.partialRows.filter(function(cur) {
        return cur !== id;
      })});
    },
    addedRowModified: function(id) {
      if(this.state.partialRows[this.state.partialRows.length - 1] === id) {
        this.state.partialRows.push(uuid());
        this.setState({partialRows: this.state.partialRows})
      }
    },
    addColumn: function() {
      dispatch("addColumnToTable", {table: this.state.table});
    },
    render: function() {
      var self = this;
      var fields = code.viewToFields(this.state.table);
      var rows = ixer.facts(this.state.table);
      var numColumns = fields.length;
      var headers = fields.map(function(cur) {
        return tableHeader({field: code.name(cur[0]), id: cur[0]});
      });
      var rowIds = ixer.index("editId")[this.state.table];
      if(rowIds) {
        rows.sort(function(a, b) {
          return rowIds[JSON.stringify(a)] - rowIds[JSON.stringify(b)];
        });
      }
      var rowComponents = rows.map(function(cur, ix) {
        return tableRow({table: self.state.table, row: cur, length: numColumns, key: JSON.stringify(cur) + ix, editable: true});
      });
      this.state.partialRows.forEach(function(cur) {
        rowComponents.push(tableRow({table: self.state.table, row: [], length: numColumns, editable: true, isNewRow: true, onRowAdded: self.rowAdded, onRowModified: self.addedRowModified, key: cur, id: cur}));
      });
      return JSML(["div", {className: "table-wrapper"},
                   ["table",
                    ["thead", ["tr", headers]],
                    ["tbody", rowComponents]],
                   ["div", {className: "add-column", onClick: this.addColumn}, "+"]]);
    }
  })
};

//---------------------------------------------------------
// View components
//---------------------------------------------------------

var viewSource = reactFactory({
  render: function() {
    return JSML(["div", {className: "view-source"},
                 ["h1", "foo"],
                 tiles.table.content({tileId: this.props.tileId})
                ]);
  }
});

tiles.view = {
  content: reactFactory({
    render: function() {
      //edit view
      return JSML(["div", {className: "view-wrapper"},
                   viewSource({}),
                   viewSource({}),
                   ["div", "add source"]
                  ]);
    }
  })
}

//---------------------------------------------------------
// UI editor components
//---------------------------------------------------------

function relativeCoords(e, me, parent) {
    //TODO: this doesn't account for scrolling
    var canvasRect = parent.getBoundingClientRect();
    var myRect = me.getBoundingClientRect();
    var canvasRelX = e.clientX - canvasRect.left;
    var canvasRelY = e.clientY - canvasRect.top;
    var elementRelX = e.clientX - myRect.left;
    var elementRelY = e.clientY - myRect.top;
    return {canvas: {left: canvasRelX, top: canvasRelY}, element: {left: elementRelX, top: elementRelY}}
}

var uiControls = {
  button: {
    control: "button",
    displayName: "button",
    attrs: [{displayName: "width"},
            {displayName: "height"},
            {displayName: "x"},
            {displayName: "y"},
            {displayName: "text color"},
           ]
  },
  text: {
    control: "text",
    displayName: "text",
    attrs: [{displayName: "width"},
            {displayName: "height"},
            {displayName: "x"},
            {displayName: "y"},
            {displayName: "text color"},
           ]
  },
  box: {
    control: "box",
    displayName: "box",
    attrs: [{displayName: "width"},
            {displayName: "height"},
            {displayName: "x"},
            {displayName: "y"},
            {displayName: "text color"},
           ]
  }

}

var uiControl = reactFactory({
  displayName: "ui-control",
  startMoving: function(e) {
    e.dataTransfer.setData("uiElementAdd", this.props.control.control);
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  addElement: function(e) {
    dispatch("uiComponentElementAdd", {component: this.props.component, control: this.props.control.control, left: 100, top: 100, right: 200, bottom: 200});
  },
  render: function() {
    return JSML(["li", {draggable: true,
                        onClick: this.addElement,
                        onDragStart: this.startMoving},
                 this.props.control.displayName]);
  }
});

var uiTools = reactFactory({
  displayName: "ui-tools",
  render: function() {
    var self = this;
    var items = Object.keys(uiControls).map(function(cur) {
      var cur = uiControls[cur];
      return uiControl({control: cur, component: self.props.component});
    });
    return JSML(["div", {className: "ui-tools"},
                 ["ul", items]]);
  }
});

var uiInpector = reactFactory({
  displayName: "ui-inspector",
  render: function() {
    var info = uiControls[this.props.element.control];
    var attrs = info.attrs.map(function(cur) {
      return ["li", cur.displayName];
    });
    return JSML(["div", {className: "ui-inspector"},
                 ["ul", attrs]
                ]);
  }
});

var uiCanvasElem = reactFactory({
  getInitialState: function() {
    var cur = this.props.element;
    return {right: cur.right, bottom: cur.bottom, left: cur.left, top: cur.top};
  },
  componentDidUpdate: function(prev) {
    if(prev.element.id !== this.props.element.id) {
      var cur = this.props.element;
      this.setState({right: cur.right, bottom: cur.bottom, left: cur.left, top: cur.top});
    }
  },
  startMoving: function(e) {
    var rel = relativeCoords(e, e.target, e.target.parentNode.parentNode);
    this.state.offset = rel.element;
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  move: function(e) {
    if(e.clientX === 0 && e.clientY === 0) return;
    //calculate offset;
    var canvasPos = relativeCoords(e, e.target, e.target.parentNode.parentNode).canvas;
    var left = canvasPos.left - this.state.offset.left;
    var top = canvasPos.top - this.state.offset.top;
    var right = this.state.right + (left - this.state.left);
    var bottom = this.state.bottom + (top - this.state.top);
    this.setState({left: left, top: top, right: right, bottom: bottom});
  },
  stopMoving: function(e) {
    var state = this.state;
    var element = this.props.element;
    dispatch("uiComponentElementMoved", {element: element, left: state.left, top: state.top, right: state.right, bottom: state.bottom});
  },
  startResizing: function(e) {
    this.state.resizeX = e.target.getAttribute("x");
    this.state.resizeY = e.target.getAttribute("y");
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  checkSize: function(orig, neue) {
    var minSize = 10;
    var width = neue.right - neue.left;
    var height = neue.bottom - neue.top;
    if(width < minSize) {
      //figure out which dimension changed and fix it to a width of minSize
      if(neue.left !== orig.left) {
        neue.left = neue.right - minSize;
      } else if(neue.right !== orig.right) {
        neue.right = neue.left + minSize;
      }
    }
    if(height < minSize) {
      //figure out which dimension changed and fix it to a height of minSize
      if(neue.top !== orig.top) {
        neue.top = neue.bottom - minSize;
      } else if(neue.bottom !== orig.bottom) {
        neue.bottom = neue.top + minSize;
      }
    }
    return neue;
  },
  resize: function(e) {
    var rel = relativeCoords(e, e.target, e.target.parentNode.parentNode).canvas;
    var state = this.state;
    var neue = {left: state.left, top: state.top, right: state.right, bottom: state.bottom};
    if(this.state.resizeX) {
      neue[this.state.resizeX] = rel.left;
    }
    if(this.state.resizeY) {
      neue[this.state.resizeY] = rel.top;
    }
    this.setState(this.checkSize(state, neue));
  },
  stopResizing: function(e) {
    var state = this.state;
    var element = this.props.element;
    dispatch("uiComponentElementMoved", {element: element, left: state.left, top: state.top, right: state.right, bottom: state.bottom});
  },
  wrapResizeHandle: function(opts) {
    opts.draggable = true;
    opts.onDragStart = this.startResizing;
    opts.onDrag = this.resize;
    opts.onDragEnd = this.stopResizing;
    var size = 7;
    var offset = size / 2;
    var width = this.state.right - this.state.left;
    var height = this.state.bottom - this.state.top;
    var style = opts.style = {};
    style.width = size + "px";
    style.height = size + "px";
    //set position
    if(opts.x === "left") {
      //left edge
      style.left = 0 - offset + "px";
    } else if(opts.x === "right") {
      //right edge
      style.left = width - offset + "px";
    } else {
      //center
      style.left = (width / 2) - offset + "px";
    }
    if(opts.y === "top") {
      //top edge
      style.top = 0 - offset + "px";
    } else if(opts.y === "bottom") {
      style.top = height - offset + "px";
    } else {
      style.top = (height / 2) - offset + "px";
    }
    return opts;
  },
  render: function() {
    var cur = this.props.element;
    var width = this.state.right - this.state.left;
    var height = this.state.bottom - this.state.top;
    return JSML(["div", {style: {top: this.state.top, left: this.state.left, width: width, height: height}},
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "left", y: "top"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", y: "top"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "right", y: "top"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "right"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "right", y: "bottom"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", y: "bottom"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "left", y: "bottom"})],
                 ["div", this.wrapResizeHandle({className: "resize-handle", x: "left"})],
                 ["div", {className: "control",
                          style: {width: width, height: height},
                          onDragStart: this.startMoving,
                          onDrag: this.move,
                          onDragEnd: this.stopMoving,
                          draggable: true},
                  cur.control]]);
  }
});

var uiCanvas = reactFactory({
  displayName: "ui-canvas",
  elementOver: function(e) {
    e.preventDefault();
  },
  elementDropped: function(e) {
    var type = e.dataTransfer.getData("uiElementAdd");
    if(!type) return;
    var canvas = e.target;
    var rel = relativeCoords(e, canvas, canvas).canvas;
    dispatch("uiComponentElementAdd", {component: this.props.component, control: type, left: rel.left, top: rel.top, right: rel.left + 100, bottom: rel.top + 100});
    console.log("add", type);
  },
  render: function() {
    var elems = this.props.elements.map(function(cur) {
      return uiCanvasElem({element: cur, key: cur.element});
    })
    return JSML(["div", {className: "ui-canvas",
                         onDragOver: this.elementOver,
                         onDrop: this.elementDropped},
                 elems
                ]);
  }
});

tiles.ui = {
  content: reactFactory({
    displayName: "ui-editor",
    render: function() {
      var id = this.props.tileId;
      var elements = ixer.index("uiComponentToElements")[id] || [];
      elements = elements.map(function(cur) {
        return {component: cur[0], id: cur[1], control: cur[2], left: cur[3], top: cur[4], right: cur[5], bottom: cur[6]};
      });
      return JSML(["div", {className: "ui-editor"},
                   uiTools({component: id}),
                   uiCanvas({elements: elements, component: id}),
                   uiInpector({element: {control: "button"}})]);
    }
  })
};

//---------------------------------------------------------
// Event dispatch
//---------------------------------------------------------

function dispatch(event, arg, noRedraw) {
  switch(event) {
    case "load":
      break;
    case "addColumnToTable":
      var diffs = code.diffs.addColumn(arg.table);
      ixer.handleDiffs(diffs);
      break;
    case "swapRow":
      var oldKey = JSON.stringify(arg.old);
      var time = ixer.index("editId")[arg.table][oldKey];
      var diffs = {
        editId: {adds: [[arg.table, JSON.stringify(arg.neue), time]], removes: [[arg.table, oldKey, time]]}
      };
      diffs[arg.table] = {adds: [arg.neue.slice()], removes: [arg.old.slice()]};
      ixer.handleDiffs(diffs);
      break;
    case "addRow":
      var diffs = {
        editId: {adds: [[arg.table, JSON.stringify(arg.neue), (new Date()).getTime()]], removes: []}
      };
      diffs[arg.table] = {adds: [arg.neue.slice()], removes: []};
      ixer.handleDiffs(diffs);
      break;
    case "rename":
      var diffs = code.diffs.changeDisplayName(arg.id, arg.value);
      ixer.handleDiffs(diffs);
      break;
    case "uiComponentElementMoved":
      var element = arg.element;
      var prev = [element.component, element.id, element.control, element.left, element.top, element.right, element.bottom];
      var neue = [element.component, element.id, element.control, arg.left, arg.top, arg.right, arg.bottom] ;
      var diffs = {
        uiComponentElement: {adds: [neue], removes: [prev]}
      };
      ixer.handleDiffs(diffs);
      break;
    case "uiComponentElementAdd":
      var neue = [arg.component, uuid(), arg.control, arg.left, arg.top, arg.right, arg.bottom];
      var diffs = {
        uiComponentElement: {adds: [neue], removes: []}
      };
      ixer.handleDiffs(diffs);
      break;
    case "updateTile":
      var oldTile = ixer.index("gridTile")[arg.id].slice();
      var tile = oldTile.slice();
      tile[3] = arg.pos[0], tile[4] = arg.pos[1];
      tile[5] = arg.size[0], tile[6] = arg.size[1];
      diffs = {gridTile: {adds: [tile], removes: [oldTile]}};
      console.log(diffs);
      ixer.handleDiffs(diffs);
      break;
    default:
      console.error("Dispatch for unknown event: ", event, arg);
      break;
  }

  if(!noRedraw) {
    React.render(root(), document.body);
  }
}


//---------------------------------------------------------
// Data API
//---------------------------------------------------------

var code = {
  diffs: {
    addColumn: function(viewId) {
      var view = ixer.index("view")[viewId];
      var fields = code.viewToFields(viewId) || [];
      var schema = view[1];
      var fieldId = uuid();
      var diffs = {
        field: {adds: [[fieldId, schema, fields.length, "unknown"]], removes: []},
        displayName: {adds: [[fieldId, alphabet[fields.length]]], removes: []}
      };
      return diffs;
    },
    changeDisplayName: function(id, neue) {
      var cur = ixer.index("displayName")[id];
      var diffs = {
        displayName: {adds: [[id, neue]], removes: [[id, cur]]}
      }
      return diffs;
    },
    addView: function(name, fields, initial, id) { // (S, {[S]: Type}, Fact[]?, Uuid?) -> Diffs
      id = id || uuid();
      var schema = uuid();
      var displayNames = [[id, name]];
      var fieldIx = 0;
      var fieldAdds = [];
      for(var fieldName in fields) {
        if(!fields.hasOwnProperty(fieldName)) { continue; }
        var fieldId = uuid()
        fieldAdds.push([fieldId, schema, fieldIx++, fields[fieldName]]);
        displayNames.push([fieldId, fieldName]);
      }

      var diffs = {
        view: {adds: [id, schema, false]}, // @NOTE: What is false?
        field: {adds: fieldAdds},
        displayName: {adds: displayNames}
      };
      if(initial) {
        diffs[id] = {adds: initial};
      }
      return diffs;
    }
  },
  viewToFields: function(view) {
    var schema = ixer.index("viewToSchema")[view];
    return ixer.index("schemaToFields")[schema];
  },
  name: function(id) {
    return ixer.index("displayName")[id];
  }
}

//---------------------------------------------------------
// Go
//---------------------------------------------------------


//add some views
ixer.addIndex("displayName", "displayName", Indexing.create.lookup([0, 1]));
ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
ixer.addIndex("editId", "editId", Indexing.create.lookup([0,1,2]));
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("viewToSources", "source", Indexing.create.collector([1]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([0]));
ixer.handleDiffs({view: {adds: [["foo", "foo-schema", "query"], ["qq", "qq-schema", "query"]], removes: []},
                  schema: {adds: [["foo-schema"], ["qq-schema"]], removes: []},
                  field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "string"], ["qq-a", "qq-schema", 0, "string"]], removes: []},
                  source: {adds: [["foo-source", "qq", 0, "foo", true], ["foo-source", "qq", 0, "foo", false]], removes: []},
                  editId: {adds: [["foo", JSON.stringify(["a", "b"]), 0], ["foo", JSON.stringify(["c", "d"]), 1]], removes: []},
                  foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                  input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                  displayName: {adds: [["foo-a", "foo A"], ["foo-b", "foo B"]], removes: []},
                  uiComponent: {adds: [["myUI"]], removes: []},
                 });

// Grid Indexes
ixer.addIndex("gridTile", "gridTile", Indexing.create.lookup([0, false]));
ixer.addIndex("tableTile", "tableTile", Indexing.create.lookup([0, false]));

var gridId = "default";

ixer.handleDiffs(code.diffs.addView("gridTile", {
  tile: "string",
  grid: "string",
  type: "string",
  x: "number",
  y: "number",
  w: "number",
  h: "number"
}, [
  [uuid(), gridId, "ui", 0, 0, 6, 4],
  [uuid(), gridId, "table", 6, 0, 6, 4]
], "gridTile"));


dispatch("load");
