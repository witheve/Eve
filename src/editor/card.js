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

function factToKey(card, fact) {
  return JSON.stringify(fact);
}

function factToId(card, fact) {
  var key = JSON.stringify(fact);
  if(!(key in card.rowIds)) {
    card.rowIds[key] = card._maxRowId++;
  }
  return card.rowIds[key];
}

function idToFact(card, id) {
  id = +id;
  forattr(key, cid of card.rowIds) {
    if(id === cid) {
      return JSON.parse(key);
    }
  }
}


function Card(id, name, system) {
  this.name = id;
  this.id = name;
  this.system = system;
  this.currentFields = [];
  this.rows = {};
  this.rowIds = {};
  this._maxRowId = 0;
  this.selectedField = null;
  this.sortIx = null;
  this.sortDir = 0;
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

    $(this.$container).find(".header .sort-btn").attr("sort-dir", -1);

    if(ix !== null) {
      // Sort by ix.
      $(this.$container).find(".header[ix=" + ix + "] .sort-btn").attr("sort-dir", dir);
      forattr(rowId, $row of this.rows) {
        var fact = idToFact(this, rowId);
        $row.eveSortValue = fact[this.sortIx];
      }
    } else {
      // Sort by insertion.
      forattr(rowId, $row of this.rows) {
        $row.eveSortValue = rowId;
      }
    }

    forattr(rowId, $row of this.rows) {
      this.appendRow($row);
    }
  },

  rowIdToFact: function(rowId) {
    return idToFact(this, rowId);
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

    if(this.$container) {
      if(JSON.stringify(fields) === JSON.stringify(this.currentFields)) { return this.$container; }
      this.$container.parentNode.removeChild(this.$container);
      this.$container = null;
      this.clearRows();
    }

    fields.sort(function(a, b) {
      if(a[FIELD_IX] === b[FIELD_IX]) return 0;
      return (a[FIELD_IX] > b[FIELD_IX]) ? 1 : -1;
    });
    this.currentFields = fields;
    var nameMap = this.getNameMap(names, fields);
    // Populate the grid-header with field headers.
    var header = ["div", {class: "grid-header"}];
    foreach(fieldFact of fields) {
      unpack [field, view, ix] = fieldFact;
      var handler = this._sortTableHandler(this, ix);
      header.push(
        ["div", {class: "header", ix: ix},
         nameMap[field],
         ["button", {class: "sort-btn", "sort-dir": -1, click: handler}]
        ]
      );
    }
    // header.push(["div", {class: "header"}]);

    var self = this;
    var selectCard = function() {
      ide.dispatch(["selectCard", self]);
    }

    this.$newRow = this.createRow("newRow", new Array(fields.length), {class: "empty"});
    this.$rows = JSML.parse(["div", {class: "grid-rows"}]);
    this.$container = JSML.parse(
      ["div", {class: "card open " + this.type,
               click: selectCard},
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
    forattr(id, $row of this.rows) {
      this.$rows.removeChild($row);
    }
    this.rows = {};
  },

  removeRows: function(removes) {
    foreach(row of removes) {
      var rowId = factToId(this, row);
      var $row = this.rows[rowId];
      if($row) {
        this.$rows.removeChild($row);
        delete this.rows[rowId];
      }

      var key = factToKey(this, row);
      delete this.rowIds[key];
    }
  },

  addRows: function(adds) {
    foreach(fact of adds) {
      var rowId = factToId(this, fact);
      if(this.rows[rowId]) { continue; }

      var $row = this.createRow(rowId, fact);
      if(this.sortIx !== null) {
        $row.eveSortValue = fact[this.sortIx];
      } else {
        $row.eveSortValue = rowId;
      }
      this.rows[rowId] = $row;
      this.appendRow($row);
    }

    if(this.selectedField) {
      unpack [rowId, ix] = this.selectedField;
      this.selectField(rowId, ix);
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
      if(oldRowId === "newRow") {
        // Clear sort order when adding a new row.
        this.sortBy(null, 0);
      }
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
