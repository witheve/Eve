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
    if(this.props.draggable) { attrs = this.wrapDraggable(attrs, {data: data, image: null}); }
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
        {pos: [0, 0], size: [3, 1], type: "debug", id: uuid()},
        {pos: [3, 0], size: [9, 1], type: "debug", id: uuid()},
        {pos: [0, 1], size: [1, 5], type: "debug", id: uuid()},
        {pos: [1, 1], size: [2, 1], type: "debug", id: uuid()},
        {pos: [3, 1], size: [9, 1], type: "debug", id: uuid()},
        {pos: [1, 2], size: [4, 8], type: "table", id: uuid()},
        {pos: [5, 2], size: [7, 4], type: "table", id: uuid()}
      ]
    };
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({grid: Grid.updateGrid(this.state.grid, {bounds: nextProps.bounds})});
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
    if(this.props.editing) { attrs = this.wrapDropzone(attrs); }
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
ixer.handleDiffs({view: {adds: [["foo", "foo-schema", false]], removes: []},
                  schema: {adds: [["foo-schema"]], removes: []},
                  field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "string"]], removes: []},
                  editId: {adds: [["foo", JSON.stringify(["a", "b"]), 0], ["foo", JSON.stringify(["c", "d"]), 1]], removes: []},
                  foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                  input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                  displayName: {adds: [["foo-a", "foo A"], ["foo-b", "foo B"]], removes: []},
                 });

dispatch("load");
