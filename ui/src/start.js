//---------------------------------------------------------
// Utils
//---------------------------------------------------------

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
}

//---------------------------------------------------------
// UI state
//---------------------------------------------------------

var uiState = {};

//---------------------------------------------------------
// Root component
//---------------------------------------------------------

var root = reactFactory({
  render: function() {
    return JSML(["p", "hey!"]);
//     return table({fields: ["no wai", "ya wai"], rows: [[0,1],[0,2]]});
  }
});

//---------------------------------------------------------
// Grid components
//---------------------------------------------------------

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
                         dangerouslySetInnerHTML: {__html: value}}]);
  }
});

var tableHeader = reactFactory({
  renameHeader: function(value) {
    //do stuff
    dispatch("rename", {id: this.props.field, value: value});
  },
  render: function() {
    return JSML(["th", editable({value: this.props.field, onSubmit: this.renameHeader})]);
  }
});

var tableRow = reactFactory({
  getInitialState: function() {
    return {row: []};
  },
  setColumn: function(ix, value) {
    this.state.row[ix] = value;
    console.log(this.state.row);
  },
  submitRow: function() {
    dispatch("setRow", {table: this.props.table, row: this.props.row, updatedRow: this.state.row});
  },
  render: function() {
    var self = this;
    var fields = this.props.row.map(function(field, ix) {
      return ["td", editable({value: field, onSubmit: function(value) {
        self.setColumn(ix, value);
      }})];
    });
    return JSML(["tr", fields]);
  }
});

var table = reactFactory({
  render: function() {
    var headers = this.props.fields.map(function(cur) {
      return tableHeader({field: cur});
    });
    var rows = this.props.rows.map(function(cur) {
      return tableRow({row: cur});
    });
    return JSML(["table",
                ["thead", ["tr", headers]],
                ["tbody", rows]]);
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
    default:
      console.error("Dispatch for unknown event: ", event, arg);
      break;
  }

  if(!noRedraw) {
    React.render(root(), document.body);
  }
}

//---------------------------------------------------------
// Go
//---------------------------------------------------------

dispatch("load");
