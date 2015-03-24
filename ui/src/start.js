//---------------------------------------------------------
// Utils
//---------------------------------------------------------

var alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

var KEYS = {UP: 38,
            DOWN: 40,
            ENTER: 13,
            Z: 90};

function reactFactory(obj) {
  return React.createFactory(React.createClass(obj));
}

function extend(dest, src, ignoreHasOwnProperty) {
  for(var key in src) {
    if(!src.hasOwnProperty(key) && !ignoreHasOwnProperty) { continue; }
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

function findMatch(haystack, needles) {
  for(var ix = 0, len = needles.length; ix < len; ix++) {
    var needle = needles[ix];
    if(haystack.indexOf(needle) !== -1) {
      return needle;
    }
  }
}

function coerceInput(input) {
  if(input.match(/^-?[\d]+$/gim)) {
    return parseInt(input);
  } else if(input.match(/^-?[\d]+\.[\d]+$/gim)) {
    return parseFloat(input);
  }
  return input;
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

function verticalTable(rows) {
  var content = [];
  for(var rowIx = 0, rowsLength = rows.length; rowIx < rowsLength; rowIx++) {
    var row = rows[rowIx];
    var rowEl = ["tr"];

    if(row[0]) {
      rowEl.push(["th", row[0]]);
    }
    for(var ix = 1, len = row.length; ix < len; ix++) {
      rowEl.push(["td", row[ix]]);
    }

    content.push(rowEl);
  }
  return content;
}

function factToTile(tile) {
  return {
    id: tile[0], grid: tile[1], type: tile[2],
    pos: [tile[3], tile[4]], size: [tile[5], tile[6]]
  };
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
    var bounds = extend({}, document.body.getBoundingClientRect(), true);
    bounds.height -= 80;
    bounds.width -= 40;
    return bounds;
  },
  getTiles: function(grid) {
    return ixer.facts("gridTile").filter(function(fact) {
      return fact[1] === grid;
    }).map(factToTile);
  },
  navigate: function(id) {
    var target = ixer.index("gridTarget")[id];
    if(!target) {
      return;
    }

    var inward = false;
    if(this.state.prevNav) {
      var prevNavTile = factToTile(ixer.index("gridTile")[this.state.prevNav.id]);
      inward = prevNavTile.grid === target && !this.state.prevNav.inward;
    }

    this.setState({nav: {target: target, id: id, inward: inward}, editingGrid: false});
    var self = this;
    setTimeout(function() {
      self.setState({nav: false, prevNav: self.state.nav});
      dispatch("navigate", {id: id, target: target});
    }, 500);
  },
  chooseProgram: function() {
    console.warn("@TODO: Implement me.");
  },
  toggleEditGrid: function() {
    this.setState({editingGrid: !this.state.editingGrid});
  },
  render: function() {
    var activeGrid = ixer.facts("activeGrid")[0][0];
    var tiles = this.getTiles(activeGrid);
    var animTiles = [];
    var navTile;
    var animations;

    if(this.state.nav) {
      animTiles = this.getTiles(this.state.nav.target);
      navTile = factToTile(ixer.index("gridTile")[this.state.nav.id]);
      var prevNavTile = (this.state.prevNav ? factToTile(ixer.index("gridTile")[this.state.prevNav.id]) : undefined);
      animations = (this.state.nav.inward ?
                    [["unevacuate", prevNavTile.pos], ["confine", prevNavTile]] :
                    [["unconfine", navTile], ["evacuate", navTile.pos]]
                   );
    }

    return JSML(
      ["div",
       ["canvas", {width: 1, height: 1, id: "clear-pixel", key: "root-clear-pixel"}],
      (animTiles.length ? stage({
         key: "anim-stage",
         tiles: animTiles,
         bounds: this.state.bounds,
         animation: animations[0],
         style: {zIndex: this.state.nav.inward ? 2 : 1}
       }) : undefined),
       stage({
         key: "root-stage",
         tiles: tiles,
         bounds: this.state.bounds,
         editing: this.state.editingGrid,
         onNavigate: this.navigate,
         animation: this.state.nav ? animations[1] : undefined
       }),
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
  navigable: false,
  content: reactFactory({
    displayName: "debug",
    render: function() {
      return JSML(["span", "hello, world!"]);
    }
  })
};

tiles.add = {
  flippable: false,
  resizable: false,
  draggable: false,
  content: reactFactory({
    displayName: "add",
    addTile: function(evt) {
      dispatch("addTile", {
        id: this.props.tileId,
        type: "addTable",
        pos: this.props.pos,
        size: this.props.size
      });
    },
    render: function() {
      return JSML(["div", {
        onClick: this.addTile
      }]);
    }
  })
};

// @FIXME: Embed this in a table format?
var tileProperties = reactFactory({
  displayName: "properties",
  setTarget: function(val) {
    dispatch("setTarget", {id: this.props.tileId, target: val});
  },
  render: function() {
    var target = ixer.index("gridTarget")[this.props.tileId];
    return JSML(
      ["table", {className: "tile-properties flex"}, verticalTable([
        ["Id", this.props.tileId],
        ["Type", this.props.type],
        ["Target", editable({value: target, onSubmit: this.setTarget})]
      ])]
    );
  }
});

var gridTile = reactFactory({
  displayName: "grid-tile",
  getInitialState: function() {
    return {currentPos: [this.props.left, this.props.top], currentSize: [this.props.width, this.props.height]};
  },

  close: function(evt) {
    dispatch("closeTile", this.props.id);
  },

  navigate: function(evt) {
    if(this.props.onNavigate) {
      this.props.onNavigate(this.props.id);
    }
  },

  flip: function(evt) {
    var self = this;
    var dir = (this.state.flipped ? "+=" : "-=");
    Velocity(this.getDOMNode(), {rotateY: dir + "90deg"}, {
      duration: 150,
      easing: "easeInSine",
      complete: function() {
        self.setState({flipped: !self.state.flipped});
      }
    });
    Velocity(this.getDOMNode(), {rotateY: dir + "90deg"}, {duration: 350, easing: "easeOutCubic"});
  },

  // Dragging
  startDrag: function(evt) {
    var dT = evt.dataTransfer;
    dT.setData("tile/" + this.props.type, this.props.id);
    dT.setData("tile/generic", this.props.id);
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
      this.props.updateFootprint(pos, [this.props.width, this.props.height]);
    }
  },

  // Resizing
  startResize: function(evt) {
    evt.stopPropagation();
    var dT = evt.dataTransfer;
    dT.setData("tile/generic", this.props.id);
    dT.setDragImage(document.getElementById("clear-pixel"), 0, 0);
    var offset = [evt.clientX - this.props.width, evt.clientY - this.props.height];
    this.setState({resizing: true, resizeOffset: offset});
  },
  endResize: function(evt) {
    evt.stopPropagation();
    this.setState({resizing: false, resizeoffset: undefined});
  },
  resizing: function(evt) {
    evt.stopPropagation();
    var offset = this.state.resizeOffset;
    var dimensions = [evt.clientX - offset[0], evt.clientY - offset[1]];
    var currentSize = this.state.currentSize;
    if(dimensions[0] !== currentSize[0] || dimensions[1] !== currentSize[1]) {
      this.setState({currentSize: dimensions});
      this.props.updateFootprint([this.props.left, this.props.top], dimensions);
    }
  },

  // Rendering
  render: function() {
    var tile = tiles[this.props.type];
    if(!tile) { throw new Error("Invalid tile type specified: '" + this.props.type + "'."); }
    var style = {
      top: this.props.top,
      left: this.props.left,
      width: this.props.width,
      height: this.props.height
    };

    var attrs = {key: this.props.id, className: "grid-tile " + this.props.type, style: style};
    var controls = [];
    var children = [];

    controls.push(["button", {className: "close-tile ion-android-close", onClick: this.close}]);

    if(tile.flippable !== false) {
      attrs.className += (this.state.flipped ? " flipped" : "");
      controls.push(["button", {className: "flip-tile " + (this.state.flipped ? "ion-forward" : "ion-reply"), onClick: this.flip}]);
    }
    if(tile.navigable !== false) {
      attrs.onDoubleClick = this.navigate;
      controls.push(["button", {className: "navigate-tile ion-link", onClick: this.navigate}]);
    }

    if(this.props.resizable && tile.resizable !== false) {
      attrs.onResize = this.resizing;
      children.push(["div", {
        className: "corner-se-grip ion-drag",
        draggable: true,
        onDragStart: this.startResize,
        onDragEnd: this.stopResize,
        onDrag: this.resizing
      }]);
    }
    if(this.props.draggable && tile.draggable !== false) {
      attrs.className += (this.state.dragging ? " dragging" : "");
      attrs.draggable = true;
      attrs.onDragStart = this.startDrag;
      attrs.onDragEnd = this.endDrag;
      attrs.onDrag = this.dragging;
    }

    var inner;
    if(this.state.flipped) {
      if(tile.backContent) {
        inner = tile.backContent({tileId: this.props.id, pos: this.props.pos, size: this.props.size, type: this.props.type});
      } else {
        inner = tileProperties({tileId: this.props.id, pos: this.props.pos, size: this.props.size, type: this.props.type});
      }
    } else {
      inner = tile.content({tileId: this.props.id, pos: this.props.pos, size: this.props.size});
    }
    var content = ["div", attrs,
                   ["div", {className: "grid-tile-inner", style: {transform: (this.state.flipped ? "rotateY(180deg)" : undefined)}},
                    inner,
                    toolbar({key: "toolbar", controls: controls}),
                    children
                   ]];
    return JSML(content);
  }
});

var stage = reactFactory({
  displayName: "stage",
  getInitialState: function() {
    return {
      accepts: ["tile/generic"],
      grid: Grid.makeGrid({bounds: this.props.bounds, gutter: 8}),
    };
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({grid: Grid.makeGrid({bounds: nextProps.bounds, gutter: 8})});
  },
  componentDidMount: function() {
    if(this.props.animation) {
      this.animate.apply(this, this.props.animation);
    }
  },
  componentDidUpdate: function(prevProps, prevState) {
    if(this.props.animation) {
      this.animate.apply(this, this.props.animation);
    }
  },
  animate: function(type, arg) {
    for(var tileIx = 0, len = this.props.tiles.length; tileIx < len; tileIx++) {
      var child = this.refs["tile-" + tileIx];
      var style;
      switch(type) {
        case "evacuate":
          var tile = Grid.evacuateTile(this.state.grid, child.props, arg, true);
          style = Grid.getRect(this.state.grid, tile);
          if(child.props.pos[0] === arg[0] && child.props.pos[1] === arg[1]) {
            child.getDOMNode().style.opacity = 0;
          }
          break;
        case "unevacuate":
          var tileRect = Grid.getRect(this.state.grid, Grid.evacuateTile(this.state.grid, child.props, arg, true));
          extend(child.getDOMNode().style, tileRect);
          style = Grid.getRect(this.state.grid, child.props);
          break;
        case "confine":
          var tile = Grid.confineTile(this.state.grid, child.props, this.props.animation[1]);
          style = Grid.getRect(this.state.grid, tile);
          break;
        case "unconfine":
          var tileRect = Grid.getRect(this.state.grid, Grid.confineTile(this.state.grid, child.props, this.props.animation[1]));
          extend(child.getDOMNode().style, tileRect);
          style = Grid.getRect(this.state.grid, child.props);
          break;
        default:
          console.error("Unhandled animation: '" + type + "'.");
      }
      Velocity(child.getDOMNode(), style, {duration: 500});
    }
  },
  dragTileOver: function(evt) {
    // @TODO: Once converted to tables, retrieve pos / size here for updateFootprint.
    var dT = evt.dataTransfer;
    var type = findMatch(this.state.accepts, dT.types);
    if(!type) { return; }

    evt.preventDefault();
    var id = dT.getData(type);
    if(this.state.dragId !== id) {
      this.setState({dragId: id});
    }
  },
  dragTileOut: function(evt) {
    this.setState({dragId: undefined, dragPos: undefined, dragSize: undefined});
  },
  dropTile: function() {
    if(this.state.dragValid && this.state.dragPos && this.state.dragSize) {
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
    if(size[0] < 1 || size[1] < 1) { valid = false; }
    if(oldValid !== valid) {
      this.setState({dragValid: valid});
    }
  },

  render: function() {
    var isEditing = this.props.editing;
    var tiles = this.props.tiles.slice();

    var addPos;
    while(addPos = Grid.findGap(this.state.grid, tiles, Grid.DEFAULT_SIZE)) {
      tiles.push({
        pos: addPos,
        size: Grid.DEFAULT_SIZE,
        type: "add",
        id: uuid()
      });
    }

    var children = [];
    for(var tileIx = 0, tilesLength = tiles.length; tileIx < tilesLength; tileIx++) {
      var tileRaw = tiles[tileIx];
      var tileRect = Grid.getRect(this.state.grid, tileRaw);
      var tile = extend(extend({}, tileRaw), tileRect);
      tile.ref = "tile-" + tileIx;
      tile.key = tile.id;
      tile.draggable = tile.resizable = isEditing;
      tile.updateFootprint = this.updateFootprint;
      tile.onNavigate = this.props.onNavigate;
      var child = gridTile(tile);
      children.push(child);
    }
    var attrs = {key: this.props.key, className: "tile-grid" + (isEditing ? " editing" : ""), style: this.props.style};
    var content = ["div", attrs];
    content.push.apply(content, children);

    if(this.props.editing) {
      attrs.onDragOver = this.dragTileOver;
      attrs.onDragLeave = this.dragTileOut;
      attrs.onDrop = this.dropTile;

      var gridShadows = [];
      for(var x = 0; x < this.state.grid.size[0]; x++) {
        for(var y = 0; y < this.state.grid.size[1]; y++) {
          var shadowStyle = Grid.getRect(this.state.grid, {pos: [x, y], size: [1, 1]});
          gridShadows.push(["div", {className: "grid-shadow", key: x + "," + y, style: shadowStyle}]);
        }
      }
      content.push.apply(content, gridShadows);
    }

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
// Table selector
//---------------------------------------------------------

var tableSelectorItem = reactFactory({
  select: function() {
    if(this.props.select) {
      this.props.select(this.props.view);
    }
  },
  render: function() {
    var displayNames = ixer.index("displayName");
    var fields = code.viewToFields(this.props.view) || [];
    var items = fields.map(function(cur) {
      return ["li", displayNames[cur[0]]];
    });
    var className = "result";
    if(this.props.selected) {
      className += " selected";
    }
    return JSML(["li", {className: className,
                        onClick: this.select},
                 ["h2", this.props.name],
                 ["ul", items]]);
  }
});

var tableSelector = reactFactory({
  getInitialState: function() {
    return {search: "", selected: -1};
  },
  updateSearch: function(e) {
    this.setState({search: e.target.value, selected: -1});
  },
  handleKeys: function(e) {
    if(e.keyCode === KEYS.ENTER) {
      var sel = this.state.selected;
      if(sel === -1) {
        sel = 0;
      }
      this.select(this.state.results[sel]);
    } else if(e.keyCode === KEYS.UP) {
      var sel = this.state.selected;
      if(sel > 0) {
        sel -= 1;
      } else {
        sel = this.state.results.length - 1;
      }
      this.setState({selected: sel});
    } else if(e.keyCode === KEYS.DOWN) {
      var sel = this.state.selected;
      if(sel < this.state.results.length - 1) {
        sel += 1;
      } else {
        sel = 0;
      }
      this.setState({selected: sel});
    }
  },
  select: function(view) {
    if(this.props.onSelect) {
      this.props.onSelect(view);
    }
  },
  render: function() {
    var self = this;
    var displayNames = ixer.index("displayName");
    var search = this.state.search;
    var items = [];
    var results = [];
    ixer.facts("view").forEach(function(cur) {
      var view = cur[0];
      var name = displayNames[cur[0]]
      if(name && name.indexOf(search) > -1) {
        var selected = items.length === self.state.selected;
        results.push(view);
        items.push(tableSelectorItem({view: view, name: name, selected: selected, select: self.select}));
      }
    });
    this.state.results = results;
    return JSML(["div", {className: "table-selector"},
                 ["input", {type: "text", placeholder: "search", onKeyDown: this.handleKeys, onInput: this.updateSearch, value: this.state.search}],
                 ["ul", items]]);
  }
});

tiles.addTable = {
  flippable: false,
  content: reactFactory({
    onSelect: function(view) {
      dispatch("setTileView", {tileId: this.props.tileId, view: view});
    },
    render: function() {
      return tableSelector({onSelect: this.onSelect});
    }
  })
};

//---------------------------------------------------------
// Table components
//---------------------------------------------------------

var editable = reactFactory({
  displayName: "editable",
  getInitialState: function() {
    return {value: "", modified: false};
  },
  handleChange: function(e) {
    this.setState({value: coerceInput(e.target.textContent), modified: true});
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
      dispatch("addColumnToTable", {table: this.props.tableId});
    },
    render: function() {
      var self = this;
      var fields = code.viewToFields(this.props.tableId);
      var rows = ixer.facts(this.props.tableId);
      var numColumns = fields.length;
      var headers = fields.map(function(cur) {
        return tableHeader({field: code.name(cur[0]), id: cur[0]});
      });
      var rowIds = ixer.index("editId")[this.props.tableId];
      if(rowIds) {
        rows.sort(function(a, b) {
          return rowIds[JSON.stringify(a)] - rowIds[JSON.stringify(b)];
        });
      }
      var rowComponents = rows.map(function(cur, ix) {
        return tableRow({table: self.props.tableId, row: cur, length: numColumns, key: JSON.stringify(cur) + ix, editable: true});
      });
      this.state.partialRows.forEach(function(cur) {
        rowComponents.push(tableRow({table: self.props.tableId, row: [], length: numColumns, editable: true, isNewRow: true, onRowAdded: self.rowAdded, onRowModified: self.addedRowModified, key: cur, id: cur}));
      });
      var addColumn;
      if(this.props.editable) {
        addColumn = ["div", {className: "add-column", onClick: this.addColumn}, "+"];
      }
      return JSML(["div", {className: "table-wrapper"},
                   ["table",
                    ["thead", ["tr", headers]],
                    ["tbody", rowComponents]],
                   addColumn
                   ]);
    }
  });

tiles.table = {
  content: function(opts) {
    var currentTable = ixer.index("tableTile")[opts.tileId];
    if(currentTable) {
      opts.tableId = currentTable[1];
      opts.editable = true;
      return table(opts);
    }
  },
  backContent: reactFactory({
    displayName: "table-properties",
    setName: function(val) {
      var currentTable = ixer.index("tableTile")[this.props.tileId];
      var id = currentTable[1];
      dispatch("rename", {id: id, value: val});
    },
    render: function() {
      var currentTable = ixer.index("tableTile")[this.props.tileId];
      var id = currentTable[1];
      var name = ixer.index("displayName")[id];

      return JSML(
        ["div",
         tileProperties({tileId: this.props.tileId}),
         ["br"],
         ["table", verticalTable([
           ["name", editable({value: name, onSubmit: this.setName})]
         ])]
        ]
      );
    }
  })
};

//---------------------------------------------------------
// View components
//---------------------------------------------------------

var viewSource = reactFactory({
  render: function() {
    var viewOrFunction = this.props.source[3];
    var constraints = this.props.constraints.map(function(cur) {
      var left = code.refToName(cur[2]);
      var right = code.refToName(cur[3]);
      var remove = function() {
        dispatch("removeConstaint", {constraint: cur.slice()})
      };
      return ["li", {onClick: remove},
              left, " " + cur[1] + " ", right];
    });
    return JSML(["div", {className: "view-source"},
                 ["h1", viewOrFunction],
                 ["ul", constraints],
                 table({tileId: this.props.tileId, tableId: viewOrFunction})
                ]);
  }
});

tiles.view = {
  content: reactFactory({
    getInitialState: function() {
      return {addingSource: false};
    },
    startAddingSource: function() {
      this.setState({addingSource: true});
    },
    stopAddingSource: function(view) {
      this.setState({addingSource: false});
      dispatch("addSource", {view: this.props.view || "qq", source: view});
    },
    render: function() {
      var self = this;
      var view = "qq";
      var sources = ixer.index("viewToSources")[view] || [];
      var constraints = ixer.index("viewToConstraints")[view] || [];
      var sourceToConstraints = {};
      constraints.forEach(function(cur) {
        var source = cur[2].source;
        if(!sourceToConstraints[source]) {
          sourceToConstraints[source] = [];
        }
        sourceToConstraints[source].push(cur);
      })
      sources.sort(function(a, b) {
        //sort by ix
        return a[2] - b[2];
      });
      var items = sources.map(function(cur) {
        return viewSource({tileId: self.props.tileId, source: cur, constraints: sourceToConstraints[cur[0]] || []});
      });
      var add;
      if(this.state.addingSource) {
        add = tableSelector({onSelect: this.stopAddingSource});
      } else {
        add = ["div", {onClick: this.startAddingSource}, "add source"];
      }
      //edit view
      return JSML(["div", {className: "view-wrapper"},
                   items,
                   add
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
    var old = prev.element;
    var neue = this.props.element;
    if(old.id !== neue.id
       || old.left !== neue.left
       || old.right !== neue.right
       || old.top !== neue.top
       || old.bottom !== neue.bottom) {
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
// Diff Helpers
//---------------------------------------------------------

function reverseDiff(diff) {
  var neue = {};
  for(var table in diff) {
    var old = diff[table];
    neue[table] = {adds: old.removes, removes: old.adds};
  }
  return neue;
}

function mergeDiffs(a,b) {
  var neue = {};
  for(var table in a) {
    neue[table] = {};
    neue[table].adds = a[table].adds;
    neue[table].removes = a[table].removes;
  }
  for(var table in b) {
    if(!neue[table]) {
      neue[table] = {};
    }
    if(neue[table].adds) {
      neue[table].adds = neue[table].adds.concat(b[table].adds);
    } else {
      neue[table].adds = b[table].adds;
    }
    if(neue[table].removes) {
      neue[table].removes = neue[table].removes.concat(b[table].removes);
    } else {
      neue[table].removes = b[table].removes;
    }
  }
  return neue;
}

function into(diff, addOrRemove, tables) {
  for(var table in tables) {
    if(!diff[table]) {
      diff[table] = {};
    }
    if(diff[table][addOrRemove]) {
      diff[table][addOrRemove] = diff[table][addOrRemove].concat(tables[table]);
    } else {
      diff[table][addOrRemove] = tables[table];
    }
  }
  return diff;
}

//---------------------------------------------------------
// Event dispatch
//---------------------------------------------------------

var eventStack = {root: true, children: []};

function scaryUndoEvent() {
  if(!eventStack.parent || !eventStack.diffs) return {};

  var old = eventStack;
  eventStack = old.parent;
  return reverseDiff(old.diffs);
}

function scaryRedoEvent() {
  if(!eventStack.children.length) return {};

  eventStack = eventStack.children[eventStack.children.length - 1];
  return eventStack.diffs;
}

function dispatch(event, arg, noRedraw) {
  var storeEvent = true;
  var diffs = {};

  switch(event) {
    case "load":
      var session = localStorage.getItem("session");
      if(session) {
        ixer.load(JSON.parse(session));
      } else {
        initIndexer();
      }
      break;
    case "unload":
      if(!window.DO_NOT_SAVE) {
        var session = JSON.stringify(ixer.tables, null, 2);
        localStorage.setItem("session", session);
      }
      break;
    case "addColumnToTable":
      diffs = code.diffs.addColumn(arg.table);
      break;
    case "swapRow":
      var oldKey = JSON.stringify(arg.old);
      var edits = ixer.index("editId")[arg.table]
      var time = edits ? edits[oldKey] : 0;
      diffs = {
        editId: {adds: [[arg.table, JSON.stringify(arg.neue), time]], removes: [[arg.table, oldKey, time]]}
      };
      diffs[arg.table] = {adds: [arg.neue.slice()], removes: [arg.old.slice()]};
      break;
    case "addRow":
      diffs = {
        editId: {adds: [[arg.table, JSON.stringify(arg.neue), (new Date()).getTime()]], removes: []}
      };
      diffs[arg.table] = {adds: [arg.neue.slice()], removes: []};
      break;
    case "rename":
      diffs = code.diffs.changeDisplayName(arg.id, arg.value);
      break;
    case "uiComponentElementMoved":
      var element = arg.element;
      var prev = [element.component, element.id, element.control, element.left, element.top, element.right, element.bottom];
      var neue = [element.component, element.id, element.control, arg.left, arg.top, arg.right, arg.bottom] ;
      diffs = {
        uiComponentElement: {adds: [neue], removes: [prev]}
      };
      break;
    case "uiComponentElementAdd":
      var neue = [arg.component, uuid(), arg.control, arg.left, arg.top, arg.right, arg.bottom];
      diffs = {
        uiComponentElement: {adds: [neue], removes: []}
      };
      break;
    case "addTile":
      // @FIXME: active grid
      var activeGrid = ixer.facts("activeGrid")[0][0];
      var fact = [arg.id, activeGrid, arg.type, arg.pos[0], arg.pos[1], arg.size[0], arg.size[1]];
      diffs = {
        gridTile: {adds: [fact]}
      };
      break;
    case "closeTile":
      // @TODO: clean up old dependent facts.
      var fact = ixer.index("gridTile")[arg].slice();
      diffs.gridTile = {removes: [fact]};
      break;
    case "updateTile":
      var oldTile = ixer.index("gridTile")[arg.id].slice();
      var tile = oldTile.slice();
      tile[3] = arg.pos[0], tile[4] = arg.pos[1];
      tile[5] = arg.size[0], tile[6] = arg.size[1];
      diffs = {gridTile: {adds: [tile], removes: [oldTile]}};
      break;
    case "setTileView":
      var oldTile = ixer.index("gridTile")[arg.tileId].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[2] = "table";
      diffs = {gridTile: {adds: [tile], removes: [oldTile]},
                  tableTile: {adds: [[tile[0], arg.view]]}};
      break;
    case "setTarget":
      diffs = {
        gridTarget: {adds: [[arg.id, arg.target]], removes: [[arg.id, ixer.index("gridTarget")[arg.id]]]}
      };
      ixer.handleDiffs(diffs);
      break;
    case "navigate":
      if(!arg.target.indexOf("grid://") === 0) { throw new Error("Cannot handle non grid:// urls yet."); }
      diffs = {
        activeGrid: {adds: [[arg.target]], removes: ixer.facts("activeGrid").slice()}
      }
      break;
    case "addSource":
      var ix = (ixer.index("viewToSources")[arg.view] || []).length;
      var sourceId = uuid();
      diffs = code.diffs.autoJoins(arg.view, arg.source, sourceId);
      diffs["source"] = {adds: [[sourceId, arg.view, ix, arg.source, true]], removes: []};
      break;
    case "removeConstaint":
      diffs.constraint = {removes: [arg.constraint]};
      break;
    case "undo":
      storeEvent = false;
      diffs = scaryUndoEvent();
      break;
    case "redo":
      storeEvent = false;
      diffs = scaryRedoEvent();
      break;
    default:
      console.error("Dispatch for unknown event: ", event, arg);
      return;
      break;
  }

  if(storeEvent) {
    var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack};
    eventStack.children.push(eventItem);
    eventStack = eventItem;
  }

  ixer.handleDiffs(diffs);

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
        view: {adds: [[id, schema, "union"]]},
        field: {adds: fieldAdds},
        displayName: {adds: displayNames}
      };
      if(initial) {
        diffs[id] = {adds: initial};
      }
      return diffs;
    },
    autoJoins: function(view, sourceView, sourceId) {
      var displayNames = ixer.index("displayName");
      var sources = ixer.index("viewToSources")[view] || [];
      var fields = code.viewToFields(sourceView);
      var constraints = [];
      fields = fields.map(function(cur) {
        return [cur[0], displayNames[cur[0]]];
      });
      sources.forEach(function(cur) {
        theirFields = code.viewToFields(cur[3]);
        if(!theirFields) return;

        for(var i in theirFields) {
          var theirs = theirFields[i];
          for(var x in fields) {
            var myField = fields[x];
            if(displayNames[theirs[0]] === myField[1]) {
              //same name, join them.
              constraints.push(
                [view, "=",
                 {"": "field-source-ref", field: myField[0], source: sourceId},
                 {"": "field-source-ref", field: theirs[0], source: cur[0]}]);
            }
          }
        }
      });
      return {constraint: {adds: constraints, removes: []}};
    }
  },
  viewToFields: function(view) {
    var schema = ixer.index("viewToSchema")[view];
    return ixer.index("schemaToFields")[schema];
  },
  refToName: function(ref) {
    switch(ref[""]) {
      case "field-source-ref":
        var view = code.name(ixer.index("sourceToData")[ref.source]);
        var field = code.name(ref.field);
        return view + "." + field;
        break;
      default:
        return "Unknown ref: " + JSON.stringify(ref);
        break;
    }
  },
  name: function(id) {
    return ixer.index("displayName")[id];
  }
}

//---------------------------------------------------------
// Global key handling
//---------------------------------------------------------

document.addEventListener("keydown", function(e) {
  //Don't capture keys if they are
  if(e.defaultPrevented
     || e.target.nodeName === "INPUT"
     || e.target.getAttribute("contentEditable")) {
    return;
  }

  //undo + redo
  if((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === KEYS.Z) {
    dispatch("redo");
  } else if((e.metaKey || e.ctrlKey) && e.keyCode === KEYS.Z) {
    dispatch("undo");
  }
});

window.addEventListener("unload", function(e) {
  dispatch("unload");
});

//---------------------------------------------------------
// Go
//---------------------------------------------------------

// Core
ixer.addIndex("displayName", "displayName", Indexing.create.lookup([0, 1]));
ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
ixer.addIndex("sourceToData", "source", Indexing.create.lookup([0, 3]));
ixer.addIndex("editId", "editId", Indexing.create.lookup([0,1,2]));
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("viewToSources", "source", Indexing.create.collector([1]));
ixer.addIndex("viewToConstraints", "constraint", Indexing.create.collector([0]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([0]));

// Grid Indexes
ixer.addIndex("gridTarget", "gridTarget", Indexing.create.lookup([0, 1]));
ixer.addIndex("gridTile", "gridTile", Indexing.create.lookup([0, false]));
ixer.addIndex("tableTile", "tableTile", Indexing.create.lookup([0, false]));


function initIndexer() {
  //add some views
  ixer.handleDiffs({view: {adds: [["foo", "foo-schema", "query"], ["qq", "qq-schema", "query"]], removes: []},
                    schema: {adds: [["foo-schema"], ["qq-schema"]], removes: []},
                    field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "string"], ["qq-a", "qq-schema", 0, "string"]], removes: []},
                    //                   source: {adds: [["foo-source", "qq", 0, "foo", true], ["zomg-source", "qq", 0, "zomg", false]], removes: []},
                    editId: {adds: [["foo", JSON.stringify(["a", "b"]), 0], ["foo", JSON.stringify(["c", "d"]), 1]], removes: []},
                    foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                    input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                    displayName: {adds: [["foo", "foo"], ["foo-a", "a"], ["foo-b", "foo B"]], removes: []},
                    uiComponent: {adds: [["myUI"]], removes: []},
                   });

  ixer.handleDiffs(code.diffs.addView("zomg", {
    a: "string",
    e: "string",
    f: "string"
  }, [
    ["a", "b", "c"],
    ["d", "e", "f"]
  ], "zomg"));


  var gridId = "grid://default";
  var uiViewId = uuid();
  var bigUiViewId = uuid();
  ixer.handleDiffs(code.diffs.addView("gridTile", {
    tile: "string",
    grid: "string",
    type: "string",
    x: "number",
    y: "number",
    w: "number",
    h: "number"
  }, [
    [uiViewId, gridId, "ui", 0, 0, 6, 4],
    [uuid(), gridId, "view", 6, 0, 6, 4],
    [bigUiViewId, "grid://ui", "ui", 0, 0, 12, 12],
  ], "gridTile"));

  ixer.handleDiffs(code.diffs.addView(
    "activeGrid",
    {grid: "string"},
    [[gridId]],
    "activeGrid"));

  ixer.handleDiffs(code.diffs.addView(
    "gridTarget",
    {tile: "string", target: "string"}, [
      [uiViewId, "grid://ui"],
      [bigUiViewId, "grid://default"]
    ], "gridTarget"));
}
dispatch("load");

function clearStorage() {
  window.DO_NOT_SAVE = true;
  localStorage.clear();
}
