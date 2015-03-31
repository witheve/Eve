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

function mergeDiffs(dest, src) {
  for(var key in src) {
    if(!src.hasOwnProperty(key) && !ignoreHasOwnProperty) { continue; }
    if(!dest[key].adds) { dest[key].adds = []; }
    if(!dest[key].removes) { dest[key].removes = []; }
    if(src[key].adds) { dest[key].adds.push.apply(dest[key], src[key].adds); }
    if(src[key].removes) { dest[key].removes.push.apply(dest[key], src[key].removes); }
  }
  return dest;
}

function unique(arr) {
  arr.sort(function(a, b) { return a - b; });
  var prev = arr[0];
  var ix = 1;
  while(ix < arr.length) {
    if(arr[ix] === prev) {
      arr.splice(ix, 1);
    } else {
      prev = arr[ix];
      ix++;
    }
  }
  return ix;
}

function nearestNeighbor(haystack, needle) {
  var prevDelta = Infinity;
  var delta = Infinity;
  for(var ix = 0, len = haystack.length; ix < len; ix++) {
    delta = Math.abs(haystack[ix] - needle);
    if(delta < prevDelta) {
      prevDelta = delta;
    } else {
      return ix - 1;
    }
  }
  return ix - 1;
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
    }, 600);
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
             className: "btn-choose-program icon-btn icon-btn-lg ion-ios-albums-outline pull-right",
             onClick: this.chooseProgram,
             key: 0
           }],
           ["button", {
             title: "edit grid",
             className: "btn-edit-grid icon-btn icon-btn-lg ion-grid pull-right",
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
  navigable: false,
  flippable: false,
  resizable: false,
  draggable: false,
  content: reactFactory({
    displayName: "add",
    addTile: function(evt) {
      dispatch("addTile", {
        id: this.props.tileId,
        type: "addChooser",
        pos: this.props.pos,
        size: this.props.size
      });
    },
    render: function() {
      return JSML(["div", {onClick: this.addTile}]);
    }
  })
};

var addTileTypes = {
  "ui": {
    name: "ui", description: "Visualize your data with a user interface.",
    add: function(id) {
      dispatch("updateTile", {id: id, type: "ui"});
    }
  },
  "existing": {
    name: "existing", description: "Add new data in a spreadsheet.",
    pane: function(id) {
      return tableSelector({onSelect: addTileTypes.existing.add.bind(null, id)});
    },
    add: function(id, view) {
      // Update type.
      dispatch("setTileView", {tileId: id, view: view});
    }
  },
  "view": {
    name: "view", description: "Run calculations or transformations on your data.",
    add: function(id) {
      dispatch("addView", id);
    }
  },
  "table": {
    name: "table", description: "Open an existing tile in this grid.",
    add: function(id) {
      dispatch("addTable", id);
    }
  },
};


tiles.addChooser = {
  navigable: false,
  flippable: false,
  content: reactFactory({
    displayName: "add-chooser",
    getInitialState: function() {
      return {description: "Hover a tile type to read about what it is used for.", type: undefined};
    },
    hoverType: function(type) {
      if(this.state.type !== type) {
        this.setState({type: type, description: addTileTypes[type].description, pane2: undefined});
      }
    },
    chooseType: function(type) {
      var tile = addTileTypes[type];
      if(tile.pane) {
        this.setState({pane2: addTileTypes[type].pane(this.props.tileId)});
      } else {
        tile.add(this.props.tileId);
      }
    },
    render: function() {
      var controls = [];
      for(var type in addTileTypes) {
        var tile = addTileTypes[type];
        var control = ["button", {
          onMouseOver: this.hoverType.bind(this, type),
          onClick: this.chooseType.bind(this, type)
        }, tile.name];
        controls.push(control);
      }
      return JSML(
        ["div", {className: "tile-type-chooser"},
         ["div", {className: "pane-1"}, controls],
         (this.state.pane2 ? ["div", {className: "pane-2 pane"}, this.state.pane2] : undefined),
         (this.state.description ? ["div", {className: "description pane"}, this.state.description] : undefined)]
      );
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

var tableProperties = reactFactory({
  displayName: "table-properties",
  getInitialState: function() {
    var type = ixer.index("gridTile")[this.props.tileId][2];
    return {type: type};
  },
  getView: function() {
    return ixer.index(this.state.type + "Tile")[this.props.tileId][1];
  },
  setName: function(val) {
    var id = this.getView();
    dispatch("rename", {id: id, value: val});
  },
  render: function() {
    var id = this.getView();
    var name = ixer.index("displayName")[id];

    return JSML(
      ["div",
       tileProperties({tileId: this.props.tileId}),
       ["br"],
       ["table", verticalTable([
         ["id", id],
         ["name", editable({value: name, onSubmit: this.setName})]
       ])]
      ]
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
      duration: 1500,
      easing: "easeInSine",
      complete: function() {
        self.setState({flipped: !self.state.flipped});
      }
    });
    Velocity(this.getDOMNode(), {rotateY: dir + "90deg"}, {duration: 3500, easing: "easeOutCubic"});
  },

  // Dragging
  startDrag: function(evt) {
    var dT = evt.dataTransfer;
    //NOTE: setting the text data is necessary for some browser to subsequently
    //trigger the drop event :(
    dT.setData("text", "foo");
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
    //NOTE: setting the text data is necessary for some browser to subsequently
    //trigger the drop event :(
    dT.setData("text", "foo");
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

    controls.push(["button", {className: "close-tile icon-btn icon-btn-lg ion-android-close", onClick: this.close}]);

    if(tile.flippable !== false) {
      attrs.className += (this.state.flipped ? " flipped" : "");
      controls.push(["button", {className: "flip-tile icon-btn icon-btn-lg " + (this.state.flipped ? "ion-forward" : "ion-reply"), onClick: this.flip}]);
    }
    if(tile.navigable !== false) {
      attrs.onDoubleClick = this.navigate;
      controls.push(["button", {className: "navigate-tile icon-btn icon-btn-lg ion-link", onClick: this.navigate}]);
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
    if(value === undefined) {
      value = ""
    } else if(typeof value === "object") {
      value = JSON.stringify(value);
    }
    return JSML(["div", {"contentEditable": true,
                         "className": this.props.className,
                         "onInput": this.handleChange,
                         "onBlur": this.submit,
                         "onKeyDown": this.handleKeys,
                         dangerouslySetInnerHTML: {__html: value}}]);
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
  backContent: tableProperties
};

//---------------------------------------------------------
// Constraint editor
//---------------------------------------------------------

//---------------------------------------------------------
// Function editor
//---------------------------------------------------------


var structuredSelectorItem = reactFactory({
  set: function() {
    if(this.props.onSet) {
      this.props.onSet(this.props.item.id);
    }
  },
  render: function() {
    return JSML(["li", {onClick: this.set}, this.props.item.text]);
  }
});

var structuredSelector = reactFactory({
  getInitialState: function() {
    return {active: false};
  },
  toggleActive: function() {
    this.setState({active: !this.state.active});
  },
  deactivate: function() {
    this.setState({active: false});
  },
  set: function(id) {
    this.deactivate();
    if(this.props.onSet) {
      this.props.onSet(id);
    }
  },
  render: function() {
    var self = this;
    var items;
    if(this.state.active) {
      items = this.props.items.map(function(cur) {
        return structuredSelectorItem({item: cur, onSet: self.set});
      });
    }
    var validClass = " valid";
    if(this.props.invalid) {
      validClass = " invalid";
    }
    var activeClass = " inactive";
    if(this.state.active) {
      activeClass = " active";
    }
    return JSML(["div", {className: "structured-selector" + validClass + activeClass},
                 ["span", {className: "input", onClick: this.toggleActive}, this.props.value],
                 ["ul", items]]);
  }
});

var structuredMultiSelector = reactFactory({
  getInitialState: function() {
    return {active: false, mode: false};
  },
  componentDidMount: function() {
    if(this.props.mode === "constant") this.selectEditable();
  },
  componentDidUpdate: function(prev) {
    if(this.props.mode !== prev.mode || !pathEqual(prev.path, this.props.path)) {
      var self = this;
      this.setState({mode: this.props.mode});
    }
  },
  set: function(id) {
    if(this.props.onSet) {
      this.props.onSet(id);
    }
  },
  setMode: function(e) {
    var mode = e.currentTarget.getAttribute("data-mode");
    if(!this.props.disabled || !this.props.disabled[mode]) {
      this.setState({mode: mode}, function() {
        if(mode === "constant") this.selectEditable();
      });
    }
  },
  selectEditable: function() {
    React.findDOMNode(this.refs.editable).focus();
  },
  setConstant: function(value) {
    this.set({"": "constant", value: value});
  },
  render: function() {
    var self = this;
    var mode = this.state.mode || this.props.mode || "field";
    var items;
    var column2;
    if(mode === "field") {
      var fields = this.props.fields || [];
      items = fields.map(function(cur) {
        return structuredSelectorItem({item: cur, onSet: self.set});
      });
      if(items.length < 8 || items.length % 2 !== 0) {
        for(var i = items.length; i < 8 || i % 2 === 1; i++) {
          items[i] = ["li", {className: "dummy"}];
        }
      }
      if(items.length) {
        column2 = ["ul", items];
      }
    }
    if(mode === "function") {
      var funcs = this.props.functions || [];
      items = funcs.map(function(cur) {
        return structuredSelectorItem({item: cur, onSet: self.set});
      });
      if(items.length < 8 || items.length % 2 !== 0) {
        for(var i = items.length; i < 8 || i % 2 === 1; i++) {
          items[i] = ["li", {className: "dummy"}];
        }
      }
      if(items.length) {
        column2 = ["ul", items];
      }
    }
    if(mode === "match") {
      column2 = ["div", {className: "workspace"}];
    }
    if(mode === "constant") {
      column2 = ["div", {className: "workspace", onClick: this.selectEditable},
                editable({className: "input", ref: "editable", onSubmit: this.setConstant, value: this.props.value})];
    }
    if(column2) {
      column2 = ["div", {className: "column"},
                   column2
                  ];
    }
    var modes = ["field", "function", "match", "constant"];
    var modeButtons = modes.map(function(cur) {
      var className = mode === cur ? "selected" : "";
      className +=  self.props.disabled && self.props.disabled[cur] ? " disabled" : "";
      return ["button", {className: className, onClick: self.setMode, "data-mode": cur}, cur];
    });
    var activeClass = this.state.active ? " active" : " inactive";
    return JSML(["div", {className: "structured-editor" + activeClass},
                 ["div", {},
//                   ["div", {className: "code", onClick: this.toggleActive}, this.props.value],
                  ["div", {className: "selectors"},
                   ["div", {className: "column"}, modeButtons],
                   column2]],
                ]);
  }
});

var primitiveInfo = {
  "+": {infix: true, args: ["number", "number"]},
  "-": {infix: true, args: ["number", "number"]},
  "*": {infix: true, args: ["number", "number"]},
  "/": {infix: true, args: ["number", "number"]},
  "sum": {infix: false, args: ["number"]},
  "count": {infix: false, args: ["group"]},
  "average": {infix: false, args: ["number"]},

}

var pathEqual = Indexing.arraysIdentical;
function tokenAtPath(component, value, pathExtension) {
  return astComponents["token"]({path: pathExtension ? component.props.path.concat(pathExtension) : component.props.path,
                                 onSelect: component.props.onSelect,
                                 activePath: component.props.activePath,
                                 value: value});
}
function componentAtPath(component, value, pathExtension) {
  return astComponents[value[""]]({path: pathExtension ? component.props.path.concat(pathExtension) : component.props.path,
                                 onSelect: component.props.onSelect,
                                 activePath: component.props.activePath,
                                 value: value});
}

var astComponents = {
  "token": reactFactory({
    onSelect: function() {
      this.props.onSelect(this.props.path);
    },
    render: function() {
      var activeClass = "";
      if(this.props.activePath) {
        activeClass = pathEqual(this.props.activePath, this.props.path) ? " selected" : "";
      }
      var invalidClass = this.props.invalid ? " invalid" : "";
      return JSML(["span", {className: "token" + activeClass + invalidClass, onClick: this.onSelect}, this.props.value])
    }
  }),
  "field-source-ref": reactFactory({
    render: function() {
      var name = code.refToName(this.props.value);
      var value = ["span", {className: "ref"}, ["span", {className: "namespace"}, "", name.view, " "], name.field];
      return tokenAtPath(this, value);
    }
  }),
  "source-ref": reactFactory({
    render: function() {
      //       return {"": "source-ref", source: source};
    }
  }),
  constant: reactFactory({
    render: function() {
      //       return {"": "constant", value: value};
      return tokenAtPath(this, this.props.value.value)
    }
  }),
  op: reactFactory({
    render: function() {
      return tokenAtPath(this, this.props.value);
    }
  }),
  variable: reactFactory({
    render: function() {
      //       return {"": "variable", string: string};
    }
  }),
  call: reactFactory({
    placeholderOrValue: function(args, placeholders, ix) {
      var curArg = args[ix];
      if(curArg) {
        return componentAtPath(this, curArg, ["args", ix]);
      }
      return tokenAtPath(this, placeholders[ix], ["args", ix]);
    },
    render: function() {
      //       return {"": "call", primitive: primitive, args: args};
      var self = this;
      var prim = this.props.value.primitive;
      var args = this.props.value.args || [];
      var info = primitiveInfo[prim];
      var rep;
      var op = tokenAtPath(this, prim);
      if(info.infix) {
        var arg1 = this.placeholderOrValue(args, info.args, 0);
        var arg2 = this.placeholderOrValue(args, info.args, 1);
        rep = ["span", arg1, op, arg2];
      } else {
        args = info.args.map(function(cur, ix) {
          return self.placeholderOrValue(args, info.args, ix);
        });
        rep = ["span", op, args];
      }
      return JSML(["div", {}, rep]);
    }
  }),
  match: reactFactory({
    render: function() {
      //       return {"": "match", patterns: patterns, handlers: handlers};
    }
  }),
  tuple: reactFactory({
    render: function() {
      //       return {"": "tuple", patterns: patterns};
    }
  }),
  expression: reactFactory({
    getInitialState: function() {
      return {editing: false}
    },
    onSet: function(id) {
      //@TODO: if this expression is complete and valid
      var path = this.state.editing;
      //@TODO: deep clone
      var exp = this.props.expression;
      if(!path.length) {
        exp = id;
      } else {
        //follow the path, modify the thing there.
        var cursor = exp;
        for(var i = 0, len = path.length - 1; i < len; i++) {
          cursor = cursor[path[i]];
        }
        cursor[path[path.length - 1]] = id;
      }
      if(this.props.onSet) {
        this.props.onSet(exp);
        this.moveCursor(path, exp);
      }
    },
    moveCursor: function(path, exp) {
      var info = this.parentTupleAndPath(path, exp);
      var parent = info.parent;
      var remaining = info.path || [];
      var child = info.child || {};

      //if we're dealing with a function, we want to move the cursor
      //to the next empty arg
      if(child[""] === "call") {
        var info = primitiveInfo[child.primitive];
        this.startEditing(path.concat(["args", 0]));
        return
      } else if(parent[""] === "call") {
        //find the next empty arg
        var info = primitiveInfo[parent.primitive];
        for(var i = 0, len = info.args.length; i < len; i++) {
          if(!parent.args[i]) break;
        }
        if(i === info.args.length) {
          //we've filled everything in, we're done editing
          this.stopEditing();
          return;
        }
        if(remaining[0] === "args") {
          var final = path.slice(0,path.length - 1);
          final.push(i);
          this.startEditing(final);
        } else {
          this.startEditing(path.concat(["args", i]));
        }
      }
    },
    parentTupleAndPath: function(path, exp) {
      var parent, remaining, child;
      if(!path || !path.length) {
        parent = exp;
        remaining = path.slice();
      } else {
        var cursor = exp;
        parent = cursor;
        var remainingIx = 0;
        for(var i = 0, len = path.length - 1; i < len; i++) {
          cursor = cursor[path[i]];
          if(cursor[""]) {
            remainingIx = i;
            parent = cursor;
          }
        }
        child = cursor[path[path.length - 1]];
        if(remainingIx > 0) {
          remaining = path.slice(remainingIx + 1);
        } else {
          remaining = path.slice();
        }
      }
      return {parent: parent, path: remaining, child: child};
    },
    getFuncs: function() {
      var funcs = [{id: {"": "call", "primitive": "+", args: []}, text: "+"},
                   {id: {"": "call", "primitive": "-", args: []}, text: "-"},
                   {id: {"": "call", "primitive": "*", args: []}, text: "*"},
                   {id: {"": "call", "primitive": "/", args: []}, text: "/"},
                   {id: {"": "call", "primitive": "sum", args: []}, text: "sum"},
                   {id: {"": "call", "primitive": "count", args: []}, text: "count"},
                   {id: {"": "call", "primitive": "average", args: []}, text: "average"}];
      return funcs;
    },
    getFields: function(type) {
      var allRefs = code.viewToRefs(this.props.viewId, type);
      var items = allRefs.map(function(cur) {
        var name = code.refToName(cur);
        return {id: cur, text: ["span", {className: "ref"}, ["span", {className: "namespace"}, "", name.view, " "], name.field]};
      });
      return items;
    },
    fullEditor: function() {
      this.startEditing([]);
    },
    stopEditing: function() {
      this.setState({editing: false});
    },
    startEditing: function(path) {
      if(this.state.editing && Indexing.arraysIdentical(path, this.state.editing)) {
        this.stopEditing();
        return;
      }
      this.setState({editing: path});
    },
    selectorProperties: function() {
      var info = this.parentTupleAndPath(this.state.editing, this.props.expression);
      var exp = info.parent || {};
      var path = info.path || [];
      var child = info.child || {};
      var cur = exp;
      if(child[""]) {
        cur = child;
      }

      var final = {
        fields: this.getFields(),
        functions: this.getFuncs(),
        onSet: this.onSet,
        mode: "function",
        disabled: {}
      };

      if(exp[""] === "call" || cur[""] === "call") {
        var info = primitiveInfo[exp.primitive];
        if(path[0] === "args") {
          final.fields = this.getFields(info.args[path[1]]);
          final.mode = "field";
        }
      }

      if(cur[""] === "constant") {
        final.mode = "constant";
        final.value = cur.value;
      }

      return final;
    },
    render: function() {
      if(this.props.expression) {
        value = astComponents[this.props.expression[""]]({value: this.props.expression, path: [], activePath: this.state.editing, onSelect: this.startEditing});
      } else {
        value = ["span", {className: "token", onClick: this.fullEditor}, "yo"];
      }
      if(this.state.editing) {
        var editorProps = this.selectorProperties();
        editorProps.path = this.state.editing;
        var editor = structuredMultiSelector(editorProps);
      }
      return JSML(["div", {className: "code-container"},
                   value,
                   editor]);
    }
  }),
  constraint: reactFactory({
    getInitialState: function() {
      return {};
    },
    setLeft: function(ref) {
      var neue = this.props.constraint.slice();
      neue[2] = ref;
      this.setState({editing: false});
      dispatch("swapConstraint", {old: this.props.constraint, neue: neue});
    },
    setRight: function(ref) {
      var neue = this.props.constraint.slice();
      neue[3] = ref;
      this.setState({editing: false});
      dispatch("swapConstraint", {old: this.props.constraint, neue: neue});
    },
    validateRight: function(selected, raw) {
      //@TODO: can either be a constant or a ref
      //left and right have to type check
      var left = code.refToType(this.props.constraint[2]);
      if(this.props.constraint[3][""] === "field-source-ref") {
        var right = code.refToType(this.props.constraint[3]);
      } else {
        var right = typeof this.props.constraint[3].value;
      }
      return code.typesEqual(left, right);
    },
    setOp: function(op) {
      var neue = this.props.constraint.slice();
      neue[1] = op;
      this.setState({editing: false});
      dispatch("swapConstraint", {old: this.props.constraint, neue: neue});
    },
    editingLeft: function() {
      if(this.state.editing === "left") {
        this.stopEditing();
        return;
      }
      this.setState({editing: "left"});
    },
    editingRight: function() {
      if(this.state.editing === "right") {
        this.stopEditing();
        return;
      }
      this.setState({editing: "right"});
    },
    editingOp: function() {
      if(this.state.editing === "op") {
        this.stopEditing();
        return;
      }
      this.setState({editing: "op"});
    },
    stopEditing: function() {
      this.setState({editing:false});
    },
    render: function() {
      var view = this.props.source[1];
      var sourceId = this.props.source[0];
      var viewOrData = this.props.source[3];
      var allRefs = code.viewToRefs(view);
      var cur = this.props.constraint;
      var editing = this.state.editing;
      var left = astComponents["field-source-ref"]({value: cur[2], onSelect: this.editingLeft, path: ["left"], activePath: [editing]});
      //@TODO: right can be a constant or a ref...
      var right = astComponents[cur[3][""]]({value: cur[3], onSelect: this.editingRight, path: ["right"], activePath: [editing], invalid: !this.validateRight()});
      var op = astComponents["op"]({value: cur[1], path: ["op"], activePath: [editing], onSelect: this.editingOp});
      var content = ["div", {className: "structured-constraint",
                             onClick: this.startEditing},
                     left, op, right];
      var editor;
      if(this.state.editing === "left") {
        var localRefs = allRefs.filter(function(cur) {
          return cur.source === sourceId;
        }).map(function(cur) {
          var name = code.refToName(cur);
          return {id: cur, text: ["span", {className: "ref"}, ["span", {className: "namespace"}, "", name.view, " "], name.field]};
        });
        editor = structuredMultiSelector({fields: localRefs,
                                          path: this.state.editing,
                                          onSet: this.setLeft,
                                          value: content,
                                          mode: "field",
                                          disabled: {"function": "Only a field is allowed here.",
                                                     "match": "Only a field is allowed here.",
                                                     "constant": "Only a field is allowed here."}});
      } else if(this.state.editing === "right") {
        var leftType = code.refToType(this.props.constraint[2]);
        var rightRefs = allRefs.filter(function(cur) {
          return code.typesEqual(leftType, code.refToType(cur));
        }).map(function(cur) {
          var name = code.refToName(cur);
          return {id: cur, text: ["span", {className: "ref"}, ["span", {className: "namespace"}, "", name.view, " "], ["span", name.field]]};
        });
        var value = "";
        var mode = "field";
        if(cur[3][""] === "constant") {
          value = cur[3].value;
          mode = "constant";
        }
        editor = structuredMultiSelector({fields: rightRefs,
                                          path: this.state.editing,
                                          onSet: this.setRight,
                                          value: value,
                                          mode: mode,
                                          disabled: {"function": "Only a field or value is allowed here.",
                                                     "match": "Only a field or value is allowed here."}});
      } else if(this.state.editing === "op") {
        var allOps = [{id: "=", text: "="},
                      {id: ">", text: ">"},
                      {id: "<", text: "<"},
                      {id: ">=", text: ">="},
                      {id: "<=", text: "<="},
                      {id: "!=", text: "!="}];
        editor = structuredMultiSelector({functions: allOps,
                                          onSet: this.setOp,
                                          path: this.state.editing,
                                          value: content,
                                          mode: "function",
                                          disabled: {"field": "Only a function is allowed here.",
                                                     "match": "Only a function is allowed here.",
                                                     "constant": "Only a function is allowed here."}});
      }
      return JSML(["div", {className: "code-container"}, content, editor]);
    }
  }),
}

//---------------------------------------------------------
// View components
//---------------------------------------------------------

var viewSource = reactFactory({
  updateCalculation: function(expression) {
    var neue = this.props.source.slice();
    neue[3] = expression;
      dispatch("swapCalculationSource", {old: this.props.source, neue: neue});
  },
  render: function() {
    var self = this;
    var viewOrFunction = this.props.source[3];
    var constraints = this.props.constraints.map(function(cur) {
      var remove = function() {
//         dispatch("removeConstaint", {constraint: cur.slice()})
      };
      return ["li", {onClick: remove}, astComponents["constraint"]({constraint: cur, source: self.props.source})];
    });
    var content;
    if(typeof viewOrFunction === "string") {
      content = table({tileId: this.props.tileId, tableId: viewOrFunction});
    } else {
      content = ["div", astComponents["expression"]({viewId: this.props.viewId, expression: viewOrFunction, onSet: this.updateCalculation})];
    }
    return JSML(["div", {className: "view-source"},
                 ["h1", code.name(viewOrFunction)],
                 ["ul", constraints],
                 content
                ]);
  }
});

tiles.view = {
  content: reactFactory({
    getInitialState: function() {
      return {addingSource: false};
    },
    getView: function() {
      return ixer.index("viewTile")[this.props.tileId][1];
    },
    startAddingSource: function() {
      this.setState({addingSource: true});
    },
    stopAddingSource: function(view) {
      this.setState({addingSource: false});
      dispatch("addSource", {view: this.getView(), source: view});
    },
    startAddingCalculation: function() {
      this.setState({addingCalculation: true});
    },
    stopAddingCalculation: function(expression) {
      this.setState({addingCalculation: false});
      dispatch("addCalculationSource", {view: this.getView(), source: expression});
    },
    render: function() {
      var self = this;
      var view = this.getView();
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
        return viewSource({tileId: self.props.tileId, viewId: view, source: cur, constraints: sourceToConstraints[cur[0]] || []});
      });
      var add;
      if(this.state.addingSource) {
        add = tableSelector({onSelect: this.stopAddingSource});
      } else {
        add = ["div", {onClick: this.startAddingSource}, "add source"];
      }
      var calculate;
      if(this.state.addingCalculation) {
        calculate = ["div", astComponents["expression"]({viewId: view, onSet: this.stopAddingCalculation})];
      } else {
        calculate = ["div", {onClick: this.startAddingCalculation}, "add calculation"];
      }
      //edit view
      return JSML(["div", {className: "view-wrapper"},
                   items,
                   ["div",
                    add,
                    calculate]
                  ]);
    }
  }),
  backContent: tableProperties
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

};

var uiControl = reactFactory({
  displayName: "ui-control",
  startMoving: function(e) {
    e.dataTransfer.setData("uiElementAdd", this.props.control.control);
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  addElement: function(e) {
    dispatch("uiComponentElementAdd", {component: this.props.component, layer: this.props.layer, control: this.props.control.control, left: 100, top: 100, right: 200, bottom: 200});
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
      return uiControl({control: cur, component: self.props.component, layer: self.props.layer});
    });
    return JSML(["div", {className: "ui-tools"},
                 ["ul", items]]);
  }
});

var uiLayers = reactFactory({
  displayName: "ui-layers",
  selectLayer: function(layer, evt) {
    this.props.selectLayer(layer);
  },
  addLayer: function(evt) {
    var newLayer = this.props.layers.reduce(function(max, layer) {
      if(layer.layer > max) { return layer.layer; }
      return max;
    }, -1) + 1;

    dispatch("uiComponentLayerAdd", {component: this.props.component, layer: newLayer});
  },
  toggleVisible: function(layer, evt) {
    evt.stopPropagation();
    layer.invisible = !layer.invisible;
    dispatch("uiComponentLayerUpdate", layer);
  },
  toggleLocked: function(layer, evt) {
    evt.stopPropagation();
    layer.locked = !layer.locked;
    dispatch("uiComponentLayerUpdate", layer);
  },
  settings: function(layer, evt) {
    console.warn("@TODO: implement layer settings");
    evt.stopPropagation();
  },
  render: function() {
    var self = this;
    var layerEls = this.props.layers.map(function(layer) {
      var invisible = layer.invisible;
      var locked = layer.locked;
      return ["li", {className: "ui-layer " + (layer.layer === self.props.layer ? "selected" : ""),
                    onClick: self.selectLayer.bind(self, layer)},
              layer.name,
             ["button", {className: "layer-toggle-visible icon-btn icon-btn-md " + (invisible ? "ion-eye-disabled" : "ion-eye"),
                         onClick: self.toggleVisible.bind(self, layer)}],
              ["button", {className: "layer-toggle-locked icon-btn icon-btn-md " + (locked ? "ion-locked" : "ion-unlocked"),
                          onClick: self.toggleLocked.bind(self, layer)}],
              ["button", {className: "layer-settings ion-gear-a icon-btn icon-btn-md ",
                          onClick: self.settings.bind(self, layer)}]];
    });
    return JSML(
      ["div", {className: "ui-layers"},
       ["ul", layerEls],
      ["button", {className: "add-layer", onClick: this.addLayer}, "Add layer"]]
    );
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

// Elem: {top: Number, left: Number, bottom: Number, right: Number}
// SnapSet: {x: Number[], y: Number[]}

var uiSelection = reactFactory({
  displayName: "selection",
  getInitialState: function() {
    return this.getBounds(this.props.elements);
  },
  shouldComponentUpdate: function(nextProps, nextState) {
    var self = this;
    var state = this.state;
    if(this.props.id !== nextProps.id
       || state.left !== nextState.left
       || state.right !== nextState.right
       || state.top !== nextState.top
       || state.bottom !== nextState.bottom
      ) {
      return true;
    }

    if(this.props.elements.length !== nextProps.elements.length) { return true; }
    return nextProps.elements.some(function(neue, ix) {
      var old = self.props.elements[ix];
      if(old.id !== neue.id
         || old.left !== neue.left
         || old.right !== neue.right
         || old.top !== neue.top
         || old.bottom !== neue.bottom) {
        return true;
      }
    });
  },
  componentDidUpdate: function(prev) {
    var shouldSetState = false;
    if(this.props.elements.length !== prev.elements.length) {
      shouldSetState = true;
    } else {
      shouldSetState = this.props.elements.some(function(neue, ix) {
        var old = prev.elements[ix];
        if(old.id !== neue.id
           || old.left !== neue.left
           || old.right !== neue.right
           || old.top !== neue.top
           || old.bottom !== neue.bottom) {
          return true;
        }
      });
    }

    if(shouldSetState) {
      this.setState(this.getBounds(this.props.elements));
    }
  },

  getBounds: function(elements) {
    var bounds = {
      top: Infinity, bottom: -Infinity,
      left: Infinity, right: -Infinity
    };
    for(var ix = 0, len = elements.length; ix < len; ix++) {
      var el = elements[ix];
      if(el.top < bounds.top) { bounds.top = el.top; }
      if(el.left < bounds.left) { bounds.left = el.left; }
      if(el.bottom > bounds.bottom) { bounds.bottom = el.bottom; }
      if(el.right > bounds.right) { bounds.right = el.right; }
    }
    return bounds;
  },
  localizeCoords: function(child, parent) {
    return {
      left: child.left - parent.left,
      right: child.right - parent.left,
      top: child.top - parent.top,
      bottom: child.bottom - parent.top
    };
  },
  globalizeCoords: function(child, parent) {
    return {
      left: child.left + parent.left,
      right: child.right + parent.left,
      top: child.top + parent.top,
      bottom: child.bottom + parent.top
    };
  },
  transformSelection: function(neue, old, elements) { // (Bounds, Bounds, Elem[]) -> Elem[]
    var offsetX = old.left - neue.left;
    var offsetY = old.top - neue.top;

    var widthRatio = (neue.right - neue.left) / (old.right - old.left);
    var heightRatio = (neue.bottom - neue.top) / (old.bottom - old.top);

    for(var ix = 0, len = elements.length; ix < len; ix++) {
      var el = extend({}, elements[ix]);
      el = this.localizeCoords(el, old);
      el.left *= widthRatio;
      el.right *= widthRatio;
      el.top *= heightRatio;
      el.bottom *= heightRatio;
      elements[ix] = this.globalizeCoords(el, neue);
    }

    return elements;
  },

  // Moving
  startMoving: function(e) {
    this.setState({initialBounds: this.getBounds(this.props.elements)});
    var rel = relativeCoords(e, e.target, e.target.parentNode.parentNode);
    this.state.offset = rel.element;
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
  },
  move: function(e) {
    if(e.clientX === 0 && e.clientY === 0) return;
    //calculate offset;
    var canvasPos = relativeCoords(e, e.target, e.target.parentNode.parentNode).canvas;
    var left = canvasPos.left - this.state.offset.left;
    var top = canvasPos.top   - this.state.offset.top;
    var right = this.state.right + (left - this.state.left);
    var bottom = this.state.bottom + (top - this.state.top);
    var pos = {left: left, top: top, right: right, bottom: bottom};
    this.setState(this.props.snap(pos));
  },
  stopMoving: function(e) {
    var self = this;
    var oldBounds = this.state.initialBounds;
    var neueBounds = {left: this.state.left, top: this.state.top, right: this.state.right, bottom: this.state.bottom};
    var elements = this.transformSelection(neueBounds, oldBounds, this.props.elements.slice());

    // @FIXME: This needs to be atomic.
    elements.map(function(neue, ix) {
      var old = self.props.elements[ix];
      dispatch("uiComponentElementMoved", {element: old, left: neue.left, top: neue.top, right: neue.right, bottom: neue.bottom});
    });
    this.props.snap();
    this.setState({initialBounds: undefined});
  },

  // Resizing
  startResizing: function(e) {
    this.state.resizeX = e.target.getAttribute("x");
    this.state.resizeY = e.target.getAttribute("y");
    e.dataTransfer.setDragImage(document.getElementById("clear-pixel"), 0,0);
    this.setState({initialBounds: this.getBounds(this.props.elements)});
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
    if(e.clientX === 0 && e.clientY === 0) return;
    var rel = relativeCoords(e, e.target, e.target.parentNode.parentNode).canvas;
    var state = this.state;
    var neue = {left: state.left, top: state.top, right: state.right, bottom: state.bottom};
    var only = {};
    if(this.state.resizeX) {
      neue[this.state.resizeX] = rel.left;
      only[this.state.resizeX] = true;
    }
    if(this.state.resizeY) {
      neue[this.state.resizeY] = rel.top;
      only[this.state.resizeY] = true;
    }
    var snaps = this.props.snap(neue, only);
    this.setState(this.checkSize(state, snaps));
  },
  stopResizing: function(e) {
    var self = this;
    var oldBounds = this.state.initialBounds;
    var neueBounds = {left: this.state.left, top: this.state.top, right: this.state.right, bottom: this.state.bottom};
    var elements = this.transformSelection(neueBounds, oldBounds, this.props.elements.slice());

    // @FIXME: This needs to be atomic.
    elements.map(function(neue, ix) {
      var old = self.props.elements[ix];
      dispatch("uiComponentElementMoved", {element: old, left: neue.left, top: neue.top, right: neue.right, bottom: neue.bottom});
    });
    this.props.snap();
    this.setState({initialBounds: undefined});
  },
  wrapResizeHandle: function(opts) {
    opts.draggable = true;
    opts.onDragStart = this.startResizing;
    opts.onDrag = this.resize;
    opts.onDragEnd = this.stopResizing;
    opts.onMouseDown = function(evt) {
      evt.stopPropagation();
    };
    var size = 14;
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

  // Rendering
  render: function() {
    var self = this;
    var width = this.state.right - this.state.left;
    var height = this.state.bottom - this.state.top;

    var oldBounds = this.state.initialBounds;
    var neueBounds = {left: this.state.left, top: this.state.top, right: this.state.right, bottom: this.state.bottom};

    var bounds = this.props.elements.slice();
    if(oldBounds) {
      this.transformSelection(neueBounds, oldBounds, bounds);
    }

    return JSML(
      ["div", {
        className: "ui-selection",
        style: {top: this.state.top, left: this.state.left, width: width, height: height},

      },

       ["div", this.wrapResizeHandle({className: "resize-handle", x: "left", y: "top"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", y: "top"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", x: "right", y: "top"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", x: "right"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", x: "right", y: "bottom"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", y: "bottom"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", x: "left", y: "bottom"})],
       ["div", this.wrapResizeHandle({className: "resize-handle", x: "left"})],

       ["div", {onDragStart: this.startMoving,
        onDrag: this.move,
        onDragEnd: this.stopMoving,
        draggable: true},
        bounds.map(function(cur, ix) {
          var element = self.props.elements[ix];
          var local = self.localizeCoords(cur, neueBounds);
          var width = local.right - local.left;
          var height = local.bottom - local.top;

          return ["div", {className: "control",
                          style: {top: local.top, left: local.left, width: width, height: height, zIndex: cur.layer},
                          onMouseDown: function(evt) {
                            evt.stopPropagation();
                          },
                          onClick: function(evt) {
                            self.props.select(cur, evt.shiftKey);
                          }
                         },
                  element.control]
        })]
      ]);
  }
});

var uiCanvas = reactFactory({
  displayName: "ui-canvas",
  getInitialState: function() {
    return {snapGuides: [], selection: []};
  },
  componentDidUpdate: function() {
    var self = this;
    if(this.state.selection.length) {
      var updateState = false;
      var selection = this.state.selection.map(function(sel) {
        var ix = self.props.elements.indexOf(sel);
        if(ix !== -1) { return sel; }

        updateState = true;
        for(var ix = 0, len = self.props.elements.length; ix < len; ix++) {
          if(self.props.elements[ix].id === sel.id) {
            return self.props.elements[ix];
          }
        }

        return undefined;
      }).filter(Boolean);

      if(updateState) {
        self.setState({selection: selection});
      }
    }
  },
  elementOver: function(e) {
    e.preventDefault();
  },
  drawSnaps: function(snaps) {
    this.setState({snapGuides: snaps});
  },
  elementDropped: function(e) {
    var type = e.dataTransfer.getData("uiElementAdd");
    if(!type) return;
    var canvas = e.target;
    var rel = relativeCoords(e, canvas, canvas).canvas;
    dispatch("uiComponentElementAdd", {component: this.props.component, layer: this.props.layer, control: type, left: rel.left, top: rel.top, right: rel.left + 100, bottom: rel.top + 100});
  },

  select: function(el, modify) {
    var selection = [];
    if(modify) {
      selection = this.state.selection.slice();
      var ix = selection.indexOf(el);
      if(ix !== -1) {
        selection.splice(ix, 1);
      } else {
        selection.push(el);
      }
    }
    else if(el) {
      selection.push(el);
    }
    this.setState({selection: selection});
  },

  // Snapping
    axis: {
    left: "x", right: "x", centerX: "x",
    top: "y", bottom: "y", centerY: "y"
  },
  opposite: {
    left: "right", right: "left",
    top: "bottom", bottom: "top"
  },

  findPossibleSnaps: function(elems, types, grid) { // (Elem[], {[String]: Bool}?, Grid?) -> SnapSet
    types = types || {edge: true, center: true, grid: true};
    var snaps = {x: [], y: []};
    for(var elemIx in elems) {
      var elem = elems[elemIx];
      if(types.edge) {
        snaps.x.push(elem.left, elem.right);
        snaps.y.push(elem.top, elem.bottom);
      }
      if(types.center) {
        snaps.x.push(elem.left + (elem.right - elem.left) / 2);
        snaps.y.push(elem.top + (elem.bottom - elem.top) / 2);
      }
    }
    if(types.grid) {
      for(var x = 0, w = grid.size[0]; x < w; x++) {
        snaps.x.push(x * grid.calculated.cellWidth + x * grid.gutter);
      }
      for(var y = 0, h = grid.size[1]; y < h; y++) {
        snaps.y.push(y * grid.calculated.cellHeight + y * grid.gutter);
      }
    }

    unique(snaps.x);
    unique(snaps.y);
    return snaps;
  },
  findSnaps: function(elem, snapSet, snapZone, only) { // (Elem, SnapSet, Number, Elem?) -> Elem
    elem = extend({}, elem);
    var sides = {top: true, left: true, bottom: true, right: true, centerX: true, centerY: true};
    var snaps = {};
    var guides = [];
    elem.centerX = elem.left + (elem.right - elem.left) / 2;
    elem.centerY = elem.top + (elem.bottom - elem.top) / 2;

    for(var side in sides) {
      var axis = this.axis[side];
      var opposite = this.opposite[side];
      if(only[opposite]) { continue; }
      snaps[side] = snapSet[axis][nearestNeighbor(snapSet[axis], elem[side])];
      if(!snaps[side] || Math.abs(snaps[side] - elem[side]) > snapZone) {
        snaps[side] = undefined;
      } else {
        guides.push({side: side, axis: axis, pos: snaps[side]});
      }
    }

    // choose the closer of centerX/left and centerY/top to determine which should be snapped to.
    var size = {x: (elem.right - elem.left), y: (elem.bottom - elem.top)};
    var centerX = elem.left + size.x / 2;
    var centerY = elem.top + size.y / 2;
    if(!only.right && !only.left && (!snaps.left || Math.abs(snaps.centerX - centerX) < Math.abs(snaps.left - elem.left))) {
      snaps.left = snaps.centerX - size.x / 2;
    }
    if(!only.bottom && !only.top && (!snaps.top || Math.abs(snaps.centerY - centerY) < Math.abs(snaps.top - elem.top))) {
      snaps.top = snaps.centerY - size.y / 2;
    }

    // Constrain size when moving.
    if(!only.left && snaps.left) {
      snaps.right = snaps.left + size.x;
    }
    else if(!only.right && snaps.right) {
      snaps.left = snaps.right - size.x;
    }
    if(!only.top && snaps.top) {
      snaps.bottom = snaps.top + size.y;
    }
    else if(!only.bottom && snaps.bottom) {
      snaps.top = snaps.bottom - size.y;
    }
    for(side in snaps) {
      if(!snaps[side]) {
        snaps[side] = elem[side];
      }
    }

    return {snaps: snaps, guides: guides};
  },

  snap: function(pos, only) {
    if(!pos) { return this.drawSnaps([]); }

    var self = this;
    var snapThreshold = 8;
    only = only || {};

    var els = this.props.elements.filter(function(cur) {
      return self.state.selection.indexOf(cur) === -1 && cur.invisible === false;
    });
    var possibleSnaps = this.findPossibleSnaps(els, {edge: true, center: true});
    var found = this.findSnaps(pos, possibleSnaps, snapThreshold, only);
    this.drawSnaps(found.guides);
    return found.snaps;
  },

  render: function() {
    var self = this;

    // Remove selected and render separately.
    var selection = uiSelection({elements: this.state.selection, snap: this.snap, select: this.select});


    var elems = this.props.elements.filter(function(cur) {
      return self.state.selection.indexOf(cur) === -1 && cur.invisible === false;
    })
    .map(function(cur) {
      var width = cur.right - cur.left;
      var height = cur.bottom - cur.top;
      var locked = (cur.locked ? "none" : undefined);
      return ["div", {className: "control",
                      style: {top: cur.top, left: cur.left, width: width, height: height, zIndex: cur.layer, pointerEvents: locked},
                      onMouseDown: function(evt) {
                        self.select(cur, evt.shiftKey);
                        evt.stopPropagation();
                      }},
              cur.control]

    });
    var snaps = this.state.snapGuides.map(function(cur) {
      var style = {};
      if(cur.axis === "y") {
        style.left = 0;
        style.right = 0;
        style.top = cur.pos;
        style.height = 1;
      } else if(cur.axis === "x") {
        style.top = 0;
        style.bottom = 0;
        style.left = cur.pos;
        style.width = 1;
      }
      return ["div", {className: "ui-guide", style: style}];
    });
    return JSML(["div", {className: "ui-canvas",
                         onDragOver: this.elementOver,
                         onDrop: this.elementDropped,
                         onMouseDown: function() {
                           self.select();
                         }
                        },
                 elems,
                 (this.state.selection.length ? selection : undefined),
                 snaps
                ]);
  }
});

tiles.ui = {
  content: reactFactory({
    displayName: "ui-editor",
    getInitialState: function() {
      return {layer: 0};
    },
    selectLayer: function(layer) {
      if(this.state.layer !== layer.layer) {
        this.setState({layer: layer.layer});
      }
    },
    render: function() {
      var id = this.props.tileId;

      var layersMap = {};
      var layers = ixer.index("uiComponentToLayers")[id] || [];
      layers = layers.map(function(cur) {
        var name = cur[2];
        var layer = {id: cur[0], component: cur[1], layer: cur[2], locked: cur[3], invisible: cur[4], name: name};
        layersMap[layer.layer] = layer;
        return layer;
      });
      layers.sort(function(a, b) {
        return a.layer - b.layer;
      });

      var elements = ixer.index("uiComponentToElements")[id] || [];
      elements = elements.map(function(cur) {
        var element = {id: cur[0], component: cur[1], layer: cur[2], control: cur[3], left: cur[4], top: cur[5], right: cur[6], bottom: cur[7]};
        var layer = layersMap[element.layer];
        element.locked = layer.locked;
        element.invisible = layer.invisible;
        return element;
      });

      // @TODO: Elements on uninitialized layers will generate a layer.

      return JSML(["div", {className: "ui-editor"},
                   uiTools({component: id, layer: this.state.layer}),
                   uiCanvas({elements: elements, component: id, layer: this.state.layer, layers: layers}),
                   uiLayers({component: id, layer: this.state.layer, layers: layers,
                             selectLayer: this.selectLayer})]);
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
      var prev = [element.id, element.component, element.layer, element.control, element.left, element.top, element.right, element.bottom];
      var neue = [element.id, element.component, element.layer, element.control, arg.left, arg.top, arg.right, arg.bottom];
      diffs = {
        uiComponentElement: {adds: [neue], removes: [prev]}
      };

      break;
    case "uiComponentElementAdd":
      var neue = [uuid(), arg.component, arg.layer, arg.control, arg.left, arg.top, arg.right, arg.bottom];
      diffs = {
        uiComponentElement: {adds: [neue], removes: []}
      };
      break;
    case "uiComponentLayerAdd":
      var neue = [uuid(), arg.component, arg.layer, false, false];
      diffs = {
        uiComponentLayer: {adds: [neue], removes: []}
      };
      break;
    case "uiComponentLayerUpdate":
      var neue = [arg.id, arg.component, arg.layer, arg.locked, arg.invisible];
      var old = ixer.index("uiComponentLayer")[arg.id];
      diffs = {
        uiComponentLayer: {adds: [neue], removes: [old]}
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
    case "updateTile":
      var fact = ixer.index("gridTile")[arg.id].slice();
      var oldFact = fact.slice();
      fact[1] = arg.grid || fact[1];
      fact[2] = arg.type || fact[2];
      if(arg.pos) {
        fact[3] = arg.pos[0];
        fact[4] = arg.pos[1];
      }
      if(arg.size) {
        fact[5] = arg.size[0];
        fact[6] = arg.size[1];
      }
      diffs = {gridTile: {adds: [fact], removes: [oldFact]}};
      break;
    case "closeTile":
      // @TODO: clean up old dependent facts.
      var fact = ixer.index("gridTile")[arg].slice();
      diffs.gridTile = {removes: [fact]};
      break;
    case "setTileView":
      var oldTile = ixer.index("gridTile")[arg.tileId].slice();
      var tile = oldTile.slice();
      //set to a tile type
      var type = tile[2] = (code.hasTag(arg.view, "table") ? "table" : "view");
      diffs = {gridTile: {adds: [tile], removes: [oldTile]}};
      diffs[type + "Tile"] = {adds: [[tile[0], arg.view]]}; // @NOTE: So hacky
      break;
    case "addTable":
      var oldTile = ixer.index("gridTile")[arg].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[2] = "table";
      var tableId = uuid();
      diffs = code.diffs.addView("Untitled Table", {A: "string"}, undefined, tableId, ["table"]);
      diffs.gridTile = {adds: [tile], removes: [oldTile]};
      diffs.tableTile = {adds: [[arg, tableId]]};
      break;
    case "addView":
      var oldTile = ixer.index("gridTile")[arg].slice();
      var tile = oldTile.slice();
      //set to a table tile
      tile[2] = "view";
      var viewId = uuid();
      diffs = code.diffs.addView("Untitled View", {}, undefined, viewId, ["view"]);
      diffs.gridTile = {adds: [tile], removes: [oldTile]};
      diffs.viewTile = {adds: [[arg, viewId]]};
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
    case "addCalculationSource":
      var ix = (ixer.index("viewToSources")[arg.view] || []).length;
      var sourceId = uuid();
      //@TODO: should we auto-join calculations?
      diffs["source"] = {adds: [[sourceId, arg.view, ix, arg.source, true]], removes: []};
      break;
    case "swapCalculationSource":
      diffs["source"] = {adds: [arg.neue.slice()], removes: [arg.old.slice()]};
      break;
    case "removeConstraint":
      diffs.constraint = {removes: [arg.constraint]};
      break;
    case "swapConstraint":
      diffs.constraint = {adds: [arg.neue.slice()], removes: [arg.old.slice()]}
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
    addView: function(name, fields, initial, id, tags) { // (S, {[S]: Type}, Fact[]?, Uuid?, S[]?) -> Diffs
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
      if(initial && initial.length) {
        diffs[id] = {adds: initial};
      }
      if(tags) {
        diffs.tag = {adds: tags.map(function(tag) {
          return [id, tag];
        })};
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
  hasTag: function(id, tag) {
    var tags = ixer.index("tag")[id];
    for(var ix in tags) {
      if(tags[ix][1] == tag) {
        return true;
      }
    }
    return false;
  },
  ast: {
    fieldSourceRef: function(source, field) {
      return {"": "field-source-ref", source: source, field: field};
    },
    sourceRef: function(source) {
      return {"": "source-ref", source: source};
    },
    fieldRef: function(field) {
      return {"": "field-ref", field: field};
    },
    constant: function(value) {
      return {"": "constant", value: value};
    },
    variable: function(string) {
      return {"": "variable", string: string};
    },
    call: function(primitive, args) {
      return {"": "call", primitive: primitive, args: args};
    },
    match: function(patterns, handlers) {
      return {"": "match", patterns: patterns, handlers: handlers};
    },
    tuple: function(patterns) {
      return {"": "tuple", patterns: patterns};
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
        return {string: view + "." + field, view: view, field: field};
        break;
      default:
        return "Unknown ref: " + JSON.stringify(ref);
        break;
    }
  },
  refToType: function(ref) {
    return ixer.index("field")[ref.field][3];
  },
  typesEqual: function(a, b) {
    //@TODO: equivalence. e.g. int = number
    return a === b;
  },
  viewToRefs: function(view, ofType) {
    var refs = [];
    var sources = ixer.index("viewToSources")[view] || [];
    sources.forEach(function(source) {
      var viewOrData = source[3];
      var sourceView = viewOrData;
      //view
      if(typeof viewOrData !== "string") {
        //@TODO: handle getting the refs for functions
        sourceView = null;
      } else {
        code.viewToFields(sourceView).forEach(function(field) {
          if(!ofType || ofType === field[3]) {
            refs.push(code.ast.fieldSourceRef(source[0], field[0]));
          }
        });
      }
    });
    return refs;
  },
  name: function(id) {
    return ixer.index("displayName")[id];
  }
};

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
ixer.addIndex("tag", "tag", Indexing.create.collector([0]));
ixer.addIndex("displayName", "displayName", Indexing.create.lookup([0, 1]));
ixer.addIndex("view", "view", Indexing.create.lookup([0, false]));
ixer.addIndex("field", "field", Indexing.create.lookup([0, false]));
ixer.addIndex("sourceToData", "source", Indexing.create.lookup([0, 3]));
ixer.addIndex("editId", "editId", Indexing.create.lookup([0,1,2]));
ixer.addIndex("viewToSchema", "view", Indexing.create.lookup([0, 1]));
ixer.addIndex("viewToSources", "source", Indexing.create.collector([1]));
ixer.addIndex("viewToConstraints", "constraint", Indexing.create.collector([0]));
ixer.addIndex("schemaToFields", "field", Indexing.create.collector([1]));
ixer.addIndex("uiComponentToElements", "uiComponentElement", Indexing.create.collector([1]));
ixer.addIndex("uiComponentLayer", "uiComponentLayer", Indexing.create.lookup([0, false]));
ixer.addIndex("uiComponentToLayers", "uiComponentLayer", Indexing.create.collector([1]));

// Grid Indexes
ixer.addIndex("gridTarget", "gridTarget", Indexing.create.lookup([0, 1]));
ixer.addIndex("gridTile", "gridTile", Indexing.create.lookup([0, false]));
ixer.addIndex("tableTile", "tableTile", Indexing.create.lookup([0, false]));
ixer.addIndex("viewTile", "viewTile", Indexing.create.lookup([0, false]));

function initIndexer() {
  ixer.handleDiffs(code.diffs.addView("view", {id: "string", schema: "string", query: "string"}, undefined, "view", ["table"]));
  ixer.handleDiffs(code.diffs.addView("field", {id: "string", schema: "string", ix: "number"}, undefined, "field", ["table"]));
  ixer.handleDiffs(code.diffs.addView("displayName", {id: "string", name: "string"}, undefined, "displayName", ["table"]));
  ixer.handleDiffs(code.diffs.addView("tableTile", {id: "string", view: "string"}, undefined, "tableTile", ["table"]));
  ixer.handleDiffs(code.diffs.addView("viewTile", {id: "string", view: "string"}, undefined, "viewTile", ["table"]));

  //add some views
  ixer.handleDiffs({view: {adds: [["foo", "foo-schema", "query"], ["qq", "qq-schema", "query"]], removes: []},
                    schema: {adds: [["foo-schema"], ["qq-schema"]], removes: []},
                    field: {adds: [["foo-a", "foo-schema", 0, "string"], ["foo-b", "foo-schema", 1, "number"], ["qq-a", "qq-schema", 0, "string"]], removes: []},
                    //                   source: {adds: [["foo-source", "qq", 0, "foo", true], ["zomg-source", "qq", 0, "zomg", false]], removes: []},
                    editId: {adds: [["foo", JSON.stringify(["a", "b"]), 0], ["foo", JSON.stringify(["c", "d"]), 1]], removes: []},
                    foo: {adds: [["a", "b"], ["c", "d"]], removes: []},
                    input: {adds: [["foo", ["a", "b"]], ["foo", ["c", "d"]]], removes: []},
                    displayName: {adds: [["foo", "foo"], ["foo-a", "a"], ["foo-b", "foo B"]], removes: []},
                    uiComponent: {adds: [["myUI"]], removes: []},
                   });

  ixer.handleDiffs(code.diffs.addView("zomg", {
    a: "string",
    e: "number",
    f: "number"
  }, [
    ["a", "b", "c"],
    ["d", "e", "f"]
  ], "zomg", ["table"]));


//code views
ixer.handleDiffs(
  code.diffs.addView("schema", {id: "id"}, [], "schema"));
ixer.handleDiffs(
  code.diffs.addView("field", {id: "id", schema: "id", ix: "int", type: "type"}, [], "field"));
ixer.handleDiffs(
  code.diffs.addView("primitive", {id: "id", inSchema: "id", outSchema: "id"}, [], "primitive"));
ixer.handleDiffs(
  code.diffs.addView("view", {id: "id", schema: "id", kind: "query|union"}, [], "view"));
ixer.handleDiffs(
  code.diffs.addView("source", {id: "id", view: "id", ix: "int", data: "data", splat: "bool"}, [], "source"));
ixer.handleDiffs(
  code.diffs.addView("constraint", {view: "id", op: "op", left: "reference", right: "reference"}, [], "constraint"));


//example tables
ixer.handleDiffs(
  code.diffs.addView("employees", {department: "string", name: "string", salary: "float"}, [], false));
ixer.handleDiffs(
  code.diffs.addView("department heads", {department: "string", head: "string"}, [], false));


// grid views
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
    [uiViewId, gridId, "ui", 0, 0, 6, 3],
    [bigUiViewId, "grid://ui", "ui", 0, 0, 12, 12],
  ], "gridTile", ["table"]));

  ixer.handleDiffs(code.diffs.addView(
    "activeGrid",
    {grid: "string"},
    [[gridId]],
    "activeGrid", ["table"]));

  ixer.handleDiffs(code.diffs.addView(
    "gridTarget",
    {tile: "string", target: "string"}, [
      [uiViewId, "grid://ui"],
      [bigUiViewId, "grid://default"]
    ], "gridTarget", ["table"]));

// ui views
ixer.handleDiffs(
  code.diffs.addView("uiComponentElement", {id: "string", component: "string", layer: "number", control: "string", left: "number", top: "number", right: "number", bottom: "number"}, [], "uiComponentElement", ["table"]));
ixer.handleDiffs(
  code.diffs.addView("uiComponentLayer", {id: "string", component: "string", layer: "number", locked: "boolean", invisible: "boolean"}, [], "uiComponentLayer", ["table"]));
}
dispatch("load");

function clearStorage() {
  window.DO_NOT_SAVE = true;
  localStorage.clear();
}
