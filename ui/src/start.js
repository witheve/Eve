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

//---------------------------------------------------------
// UI state
//---------------------------------------------------------

var uiState = {};
var ixer = new Indexing.Indexer();

//---------------------------------------------------------
// Root component
//---------------------------------------------------------

var root = reactFactory({
  displayName: "root",
  render: function() {
//     return JSML(["p", "hey!"]);
    return stage({parent: "body"});
  }
});

//---------------------------------------------------------
// Grid components
//---------------------------------------------------------

var tiles = {
};

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
  render: function() {
    var tile = tiles[this.props.type];
    if(!tile) { throw new Error("Invalid tile type specified: '" + this.props.type + "'."); }

    var style = {
      top: this.props.top,
      left: this.props.left,
      width: this.props.width,
      height: this.props.height
    };

    return JSML(["div", {className: "grid-tile " + this.props.type, style: style}, tile.content(tile)]);
  }
});

var stage = reactFactory({
  displayName: "stage",
  getInitialState: function() {
    return {
      grid: Grid.makeGrid({container: this.props.parent, gutter: 8}),
      tiles: [
        {pos: [0, 0], size: [3, 1], type: "debug"},
        {pos: [3, 0], size: [9, 1], type: "debug"},
        {pos: [0, 1], size: [1, 5], type: "debug"},
        {pos: [1, 1], size: [2, 1], type: "debug"},
        {pos: [3, 1], size: [9, 1], type: "debug"},
        {pos: [1, 2], size: [4, 8], type: "table"},
        {pos: [5, 2], size: [7, 4], type: "table"}
      ]
    };
  },
  render: function() {
    var children = [];
    for(var tileIx = 0, tilesLength = this.state.tiles.length; tileIx < tilesLength; tileIx++) {
      var tileRaw = this.state.tiles[tileIx];
      var tileRect = Grid.getRect(this.state.grid, tileRaw.pos, tileRaw.size);
      var tile = extend(extend({}, tileRaw), tileRect);
      children.push(gridTile(tile));
    }
    var content = ["div", {className: "tile-grid"}];
    content.push.apply(content, children);
    return JSML(content);
  }
});

//---------------------------------------------------------
// Table components
//---------------------------------------------------------

var editable = reactFactory({
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
  renameHeader: function(value) {
    //do stuff
    dispatch("rename", {id: this.props.id, value: value});
  },
  render: function() {
    return JSML(["th", editable({value: this.props.field, onSubmit: this.renameHeader})]);
  }
});

var tableRow = reactFactory({
  getInitialState: function() {
    var row = [];
    var cur = this.props.row;
    for(var i = 0, len = this.props.length; i < len; i++) {
      row[i] = cur[i];
    }
    return {row: row};
  },
  componentDidUpdate: function() {
    var row = this.state.row;
    var cur = this.props.row;
    for(var i = 0, len = this.props.length; i < len; i++) {
      row[i] = cur[i];
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
    }
  },
  submitRow: function() {
    if(this.props.isNewRow) {
      dispatch("addRow", {table: this.props.table, neue: this.state.row});
    } else {
      dispatch("swapRow", {table: this.props.table, old: this.props.row, neue: this.state.row});
    }
  },
  render: function() {
    var self = this;
    var fields = this.state.row.map(function(field, ix) {
      return ["td", editable({value: field, onSubmit: function(value) {
        self.setColumn(ix, value);
      }})];
    });
    return JSML(["tr", fields]);
  }
});

tiles.table = {
  content: reactFactory({
    displayName: "table-tile",
    getInitialState: function() {
      // @TODO: lookup table from tile Id.
      return {table: "foo"};
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
      var rows = rows.map(function(cur) {
        return tableRow({table: self.props.table, row: cur, length: numColumns});
      });
      rows.push(tableRow({table: this.state.table, row: [], length: numColumns, isNewRow: true}));
      return JSML(["div", {className: "tableWrapper"},
                   ["table",
                    ["thead", ["tr", headers]],
                    ["tbody", rows]],
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
      var diffs = {};
      diffs[arg.table] = {adds: [arg.neue], removes: [arg.old]};
      ixer.handleDiffs(diffs);
      break;
    case "addRow":
      var diffs = {};
      diffs[arg.table] = {adds: [arg.neue], removes: []};
      ixer.handleDiffs(diffs);
      break;
    case "rename":
      console.log("rename", arg);
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
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));
ixer.handleDiffs({view: {adds: [["foo", "foo-schema", false]], removes: []},
                  schema: {adds: [["foo-schema"]], removes: []},
                  field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "string"]], removes: []},
                  foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                  input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                  displayName: {adds: [["foo-a", "foo A"], ["foo-b", "foo B"]], removes: []},
                 });

dispatch("load");
