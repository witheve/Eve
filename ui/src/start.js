//---------------------------------------------------------
// Utils
//---------------------------------------------------------

var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
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
  render: function() {
//     return JSML(["p", "hey!"]);
    return table({table: "foo"});
  }
});

//---------------------------------------------------------
// Grid components
//---------------------------------------------------------

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
    var fields = [];
    for(var i = 0, len = this.props.length; i < len; i++) {
      var content = this.props.row[i];
      fields.push(["td", editable({value: content, onSubmit: function(value) {
        self.setColumn(i, value);
      }})])
    }
    return JSML(["tr", fields]);
  }
});

var table = reactFactory({
  displayName: "table",
  getInitialState: function() {
    return {partialRows: [uuid()]};
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
    dispatch("addColumnToTable", {table: this.props.table});
  },
  render: function() {
    var self = this;
    var fields = code.viewToFields(this.props.table);
    var rows = ixer.facts(this.props.table);
    var numColumns = fields.length;
    var headers = fields.map(function(cur) {
      return tableHeader({field: code.name(cur[0]), id: cur[0]});
    });
    var rowIds = ixer.index("editId")[this.props.table];
    if(rowIds) {
      rows.sort(function(a, b) {
        return rowIds[JSON.stringify(a)] - rowIds[JSON.stringify(b)];
      });
    }
    var rowComponents = rows.map(function(cur, ix) {
      return tableRow({table: self.props.table, row: cur, length: numColumns, key: JSON.stringify(cur) + ix});
    });
    this.state.partialRows.forEach(function(cur) {
      rowComponents.push(tableRow({table: self.props.table, row: [], length: numColumns, isNewRow: true, onRowAdded: self.rowAdded, onRowModified: self.addedRowModified, key: cur, id: cur}));
    });
    return JSML(["div", {className: "tableWrapper"},
                 ["table",
                  ["thead", ["tr", headers]],
                  ["tbody", rowComponents]],
                ["div", {className: "addColumn", onClick: this.addColumn}, "+"]]);
  }
});

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
