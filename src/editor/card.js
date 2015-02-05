import macros from "../macros.sjs";

var JSML = require("./jsml");
var incrementalUI = require("./incrementalUI");
var helpers = require("./helpers");
var ide = require("./ide");

const FIELD_FIELD = 0;
const FIELD_VIEW = 1;
const FIELD_IX = 2;

const DISPLAY_NAME_ID = 0;
const DISPLAY_NAME_NAME = 1;

function Card(id, name, system) {
  this.name = id;
  this.id = name;
  this.system = system;
  this.rows = {};
  this.sortIx = 0;
  this.sortDir = 1;
  this.type = "table-card";

  var isInputs = this.system.getStore("isInput").getFacts();
  if(helpers.select(isInputs, 0, this.id).length) {
    this.type = "input-card";
  }
}

Card.prototype = {
  //-------------------------------------------------------
  // Data Methods
  //-------------------------------------------------------
  getFacts: function() {
    return this.system.getStore(this.id).getFacts();
  },

  getFields: function(fields) {
    fields = fields || this.system.getStore("field").getFacts();
    return helpers.select(fields, FIELD_VIEW, this.id);
  },

  // Get a mapping of {[id:String]: name:String}
  getNameMap: function(names, fields) {
    names = names || this.system.getStore("displayName").getFacts();
    fields = this.getFields(fields);
    var fieldIds = helpers.pluck(fields, FIELD_FIELD);
    var fieldNames = helpers.contains(names, DISPLAY_NAME_ID, fieldIds);
    return fieldNames.reduce(function(memo, nameFact) {
      unpack [id, name] = nameFact;
      memo[id] = name;
      return memo;
    }, {});
  },

  sortBy: function(ix, dir) {
    this.sortIx = ix;
    this.sortDir = dir;

    forattr(rowId, $row of this.rows) {
      var fact = idToFact(rowId);
      $row.eveSortValue = fact[this.sortIx];
    }

    forattr(rowId, $row of this.rows) {
      this.appendRow($row);
    }
  },

  //-------------------------------------------------------
  // View Methods
  //-------------------------------------------------------
  appendRow: function($child) {
    if(!this.$rows.childNodes.length) {
      return this.$rows.appendChild($child);
    }

    switch(this.sortDir) {
      case 0:
        incrementalUI.appendSortElement(this.$rows, $child);
        break;
      case 1:
        incrementalUI.appendSortElementDesc(this.$rows, $child);
        break;
      default:
        this.$rows.appendChild($child);
    }
  },

  renderCard: function(names, fields) {
    fields = this.getFields(fields).slice();
    fields.sort(function(a, b) {
      return (a[ix] > b[ix]) ? 1 : -1;
    });
    var nameMap = this.getNameMap(names, fields);

    if(this.$container) {
      this.$container.parentNode.removeChild(this.$container);
      this.$container = this.$rows = null;
    }

    // Populate the grid-header with field headers.
    var header = ["div", {class: "grid-header"}];
    foreach(fieldFact of fields) {
      unpack [field, view, ix] = fieldFact;
      var handler = this._sortTableHandler(this, ix);
      header.push(
        ["div", {class: "header", ix: ix},
         nameMap[field],
         ["button", {class: "sort-btn", "sort-dir": 0, click: handler}]
        ]
      );
    }
    // header.push(["div", {class: "header"}]);

    this.$newRow = this.createRow("newRow", new Array(fields.length), {class: "empty"});
    this.$rows = JSML.parse(["div", {class: "grid-rows"}]);
    this.$container = JSML.parse(
      ["div", {class: "card open " + this.type},
       ["h2", this.name],
       ["div", {class: "grid"},
        header,
        this.$rows,
        (this.type === "input-card") ? this.$newRow : ""
       ]
      ]
    );

    return this.$container;
  },

  createRow: function(rowId, fact, opts) {
    opts = opts || {};
    opts.class = opts.class || "";
    var row = ["div", {class: "grid-row " + opts.class, rowId: rowId}];
    foreach(ix, field of fact) {
      var handler = this._selectFieldHandler(this, rowId, ix);
      row.push(["div", {click: handler}, field]);
    }

    return JSML.parse(row);
  },

  renderRows: function() {
    var facts = this.getFacts();
    this.addRows(facts);
  },

  clearRows: function() {
    forattr(id, $row of this.$rows) {
      this.$rows.removeChild($row);
    }
    this.rows = {};
  },

  removeRows: function(removes) {
    foreach(row of removes) {
      var rowId = factToId(row);
      var $row = this.rows[rowId];
      if($row) {
        this.$rows.removeChild($row);
        delete this.rows[rowId];
      }
    }
  },

  addRows: function(adds) {
    foreach(fact of adds) {
      var rowId = factToId(fact);
      if(this.rows[rowId]) { continue; }

      var $row = this.createRow(rowId, fact);
      $row.eveSortValue = fact[this.sortIx];
      this.rows[rowId] = $row;
      this.appendRow($row);
    }
  },

  getField: function(rowId, ix) {
    var $row = this.rows[rowId];
    if(!$row) {
      if(rowId === "newRow") {
        return this.$newRow.childNodes[ix];
      }
      return;
    }

    return $row.childNodes[ix];
  },

  //-------------------------------------------------------
  // Event handlers / Interactions
  //-------------------------------------------------------
  selectField: function(rowId, ix) {
    if(this.selectedField) {
      unpack [oldRowId, oldIx] = (this.selectedField);
      var $oldField = this.getField(oldRowId, oldIx);
      $oldField.classList.remove("selected");
    }

    var $field = this.getField(rowId, ix);
    if(!$field) {
      this.selectedField = null;
      return;
    }

    this.selectedField = [rowId, ix]
    $field.classList.add("selected");
  },

  _sortTableHandler: function(self, ix) {
    return function(evt) {
      var sortDir = +evt.target.getAttribute("sort-dir") + 1;
      if(sortDir > 1) {
        sortDir = 0;
      }

      $(self.$container).find(".sort-btn").attr("sort-dir", -1);
      evt.target.setAttribute("sort-dir", sortDir);
      ide.dispatch(["sortCard", self, ix, sortDir]);
    };
  },

  _selectFieldHandler: function(self, rowId, ix) {
    return function(evt) {
      ide.dispatch(["selectField", self, rowId, ix]);
    }
  }
};
module.exports = Card;
