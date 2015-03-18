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
  render: function() {
    var content = ["div", {className: "toolbar"}];
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
    return JSML(
      ["div",
       ["canvas", {width: 1, height: 1, id: "clear-pixel"}],
       stage({bounds: this.state.bounds, editing: this.state.editingGrid}),
       toolbar({
         controls: [
           ["button", {
             title: "choose program",
             className: "btn-choose-program ion-ios-albums-outline pull-right",
             onClick: this.chooseProgram
           }],
           ["button", {
             title: "edit grid",
             className: "btn-edit-grid ion-grid pull-right",
             onClick: this.toggleEditGrid
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
    displayName: "debug-tile",
    render: function() {
      return JSML(["span", "hello, world!"]);
    }
  })
};


var gridTile = reactFactory({
  displayName: "grid-tile",
  mixins: [Drag.mixins.draggable],
  render: function() {
    var tile = tiles[this.props.type];
    if(!tile) { throw new Error("Invalid tile type specified: '" + this.props.type + "'."); }

    var style = {
      top: this.props.top,
      left: this.props.left,
      width: this.props.width,
      height: this.props.height
    };
    var attrs = {className: "grid-tile " + this.props.type, style: style};
    var data = {};
    data["tile/" + this.props.type] = this.props.id;
    data["tile/generic"] = this.props.id;
    if(this.props.draggable) { attrs = this.wrapDraggable(attrs, {data: data, effect: "move"}); }
    return JSML(["div", attrs, tile.content(tile)]);
  }
});

var stage = reactFactory({
  displayName: "stage",
  mixins: [Drag.mixins.dropzone],
  getInitialState: function() {
    return {
      grid: Grid.makeGrid({bounds: this.props.bounds, gutter: 8}),
      tiles: [
        {pos: [0, 0], size: [6, 4], type: "table", id: uuid()},
        {pos: [6, 0], size: [6, 4], type: "ui", id: uuid()}
      ]
    };
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({grid: Grid.makeGrid({bounds: nextProps.bounds, gutter: 8})});
  },
  showTileFootprint: function(evt) {
    var pos = Grid.coordsToGrid(this.state.grid, evt.clientX, evt.clientY);

    var x = evt.clientX;
    var y = evt.clientY;
    console.log(pos, x, y);
  },

  render: function() {
    var isEditing = this.props.editing;
    var children = [];
    for(var tileIx = 0, tilesLength = this.state.tiles.length; tileIx < tilesLength; tileIx++) {
      var tileRaw = this.state.tiles[tileIx];
      var tileRect = Grid.getRect(this.state.grid, tileRaw.pos, tileRaw.size);
      var tile = extend(extend({}, tileRaw), tileRect);
      tile.draggable = tile.resizable = isEditing;
      children.push(gridTile(tile));
    }
    var attrs = {className: "tile-grid" + (isEditing ? " editing" : "")};
    if(this.props.editing) {
      attrs.onDragOver = this.showTileFootprint;
      attrs = this.wrapDropzone(attrs, {accepts: ["tile/generic"]});
    }
    var content = ["div", attrs];
    content.push.apply(content, children);
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
      return JSML(["div", {className: "tableWrapper"},
                   ["table",
                    ["thead", ["tr", headers]],
                    ["tbody", rowComponents]],
                   ["div", {className: "addColumn", onClick: this.addColumn}, "+"]]);
    }
  })
};

//---------------------------------------------------------
// View components
//---------------------------------------------------------

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
    return {canvas: {x: canvasRelX, y: canvasRelY}, element: {x: elementRelX, y: elementRelY}}
}

var uiControls = {
  button: {
    displayName: "button",
    attrs: [{displayName: "width"},
            {displayName: "height"},
            {displayName: "x"},
            {displayName: "y"},
            {displayName: "text color"},
           ]
  },
  text: {
    displayName: "text",
    attrs: [{displayName: "width"},
            {displayName: "height"},
            {displayName: "x"},
            {displayName: "y"},
            {displayName: "text color"},
           ]
  },
  box: {
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
    e.dataTransfer.setData("uiElementAdd", this.props.control.displayName);
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  addElement: function(e) {
    dispatch("uiComponentElementAdd", {component: this.props.component, control: this.props.control.displayName, x: 100, y: 100, width: 100, height: 100});
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
    return {width: cur.width, height: cur.height, x: cur.x, y: cur.y};
  },
  componentDidUpdate: function(prev) {
    if(prev.element.id !== this.props.element.id) {
      var cur = this.props.element;
      this.setState({width: cur.width, height: cur.height, x: cur.x, y: cur.y});
    }
  },
  startMoving: function(e) {
    var rel = relativeCoords(e, e.target, e.target.parentNode);
    this.state.offset = rel.element;
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  move: function(e) {
    if(e.clientX === 0 && e.clientY === 0) return;
    //calculate offset;
    var canvasPos = relativeCoords(e, e.target, e.target.parentNode).canvas;
    var x = canvasPos.x - this.state.offset.x;
    var y = canvasPos.y - this.state.offset.y;
    this.setState({x: x, y: y});
  },
  stopMoving: function(e) {
    var state = this.state;
    var element = this.props.element;
    dispatch("uiComponentElementMoved", {element: element, x: state.x, y: state.y});
  },
  render: function() {
    var cur = this.props.element;
    return JSML(["div", {className: "control",
                         style: {top: this.state.y, left: this.state.x, width: this.state.width, height: this.state.height},
                         onDragStart: this.startMoving,
                         onDrag: this.move,
                         onDragEnd: this.stopMoving,
                         draggable: true},
                 cur.control]);
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
    dispatch("uiComponentElementAdd", {component: this.props.component, control: type, x: rel.x, y: rel.y, width: 100, height: 100});
    console.log("add", type);
  },
  render: function() {
    var elems = this.props.elements.map(function(cur) {
      return uiCanvasElem({element: cur});
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
      var id = "myUI";
      var elements = ixer.index("uiComponentToElements")[id] || [];
      elements = elements.map(function(cur) {
        return {component: cur[0], id: cur[1], control: cur[2], width: cur[3], height: cur[4], x: cur[5], y: cur[6]};
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
      var prev = [element.component, element.id, element.control, element.width, element.height, element.x, element.y];
      var neue = [element.component, element.id, element.control, element.width, element.height, arg.x, arg.y];
      var diffs = {
        uiComponentElement: {adds: [neue], removes: [prev]}
      };
      ixer.handleDiffs(diffs);
      break;
    case "uiComponentElementAdd":
      var neue = [arg.component, uuid(), arg.control, arg.width, arg.height, arg.x, arg.y];
      var diffs = {
        uiComponentElement: {adds: [neue], removes: []}
      };
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
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([0]));
ixer.handleDiffs({view: {adds: [["foo", "foo-schema", false]], removes: []},
                  schema: {adds: [["foo-schema"]], removes: []},
                  field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "string"]], removes: []},
                  editId: {adds: [["foo", JSON.stringify(["a", "b"]), 0], ["foo", JSON.stringify(["c", "d"]), 1]], removes: []},
                  foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                  input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                  displayName: {adds: [["foo-a", "foo A"], ["foo-b", "foo B"]], removes: []},
                  uiComponent: {adds: [["myUI"]], removes: []},

                 });

dispatch("load");
