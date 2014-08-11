var eve = {};
var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}, activeElement: {}, selection: {}, undo: {stack:{children: []}}};
var d = React.DOM;

var clearPixel = document.createElement("img");
clearPixel.src = document.querySelector("#clear-pixel").toDataURL();
clearPixel.width = 10;
clearPixel.height = 10;


var picker = $("#picker").spectrum({
  flat: true,
  showInput: false,
  showButtons: false,
  move: function(color) {
    if(data.selection.selections && data.selection.selections[0]) {
      data.selection.selections[0][data.selection.colorType] = color.toHexString();
      dirty();
    }
  }
});

var dirty = function() {
  if(!eve.dirty) {
    eve.dirty = true;
    window.requestAnimationFrame(eve.start);
  }
}

var relativeTo = function(x, y, elem) {
  var parentRect = elem.getBoundingClientRect();
  return {x: (x - parentRect.left),
          y: (y - parentRect.top)};
}

var mouseRelativeTo = function(e, elem) {
  return relativeTo(e.clientX, e.clientY, elem);
}

var relativeToCanvas = function(x,y) {
  return relativeTo(x,y,document.getElementById("design-frame"));
}

var canvasToGlobal = function(x,y) {
  var parentRect = document.getElementById("design-frame").getBoundingClientRect();
  return {x: (x + parentRect.left + document.body.scrollLeft),
          y: (y + parentRect.top + document.body.scrollTop)};
}

var fixDragStart = function(e) {
  e.dataTransfer.setData("move", "move");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.dropEffect = "move";
  e.dataTransfer.setDragImage(clearPixel, 0,0);
};

var applyToSelection = function(fn) {
  //do it to all the selected things
  var els = data.selection.selections;
  for(var i in els) {
    fn(els[i]);
  }
  //do it to the box
  fn(data.selection.box || (data.selection.box = {}));
};

var fitSelectionBox = function() {
  var elems = data.selection.selections;
  var left = 10000000;
  var right = 0;
  var top = 1000000;
  var bottom = 0;
  for(var i in elems) {
    var cur = elems[i];
    if(cur.left < left) {
      left = cur.left;
    }
    if(cur.left + cur.width > right) {
      right = cur.left + cur.width;
    }
    if(cur.top < top) {
      top = cur.top;
    }
    if(cur.top + cur.height > bottom) {
      bottom = cur.top + cur.height;
    }
  }
  var pos = canvasToGlobal(left, top);
  data.selection.box = {top: pos.y, left: pos.x, width: right - left, height: bottom - top};
}

var addSelection = function(elem, skipFit) {
  var sels = data.selection.selections;
  if(!sels) {
    sels = data.selection.selections = [];
  }
  data.selection.selecting = true;
  elem.selected = true;
  sels.push(elem);
  if(!skipFit) {
    fitSelectionBox();
  }
};

var setSelections = function(sels) {
  clearSelections();
  for(var i in sels) {
    addSelection(sels[i], true);
  }
  fitSelectionBox();
};

var clearSelections = function() {
  var sels = data.selection.selections;
  for(var i in sels) {
    sels[i].selected = false;
  }
  data.selection = {}
  data.selection.selections = [];
};

var snapSelection = function() {
  if(!data.selection.box
     || data.selection.modified
     || (!data.selection.snapable && !data.selection.positioning && !data.selection.resizing)) {
    data.selection.snapable = false;
    return;
  }
  data.selection.snapable = data.selection.positioning || data.selection.resizing;
  var active = data.selection;
  var adjusted = relativeToCanvas(active.box.left, active.box.top);
  var elem = {top: adjusted.y, left: adjusted.x, width: active.box.width, height: active.box.height};
  var elemCenterX = (elem.left + elem.width / 2);

  var snapVisibleThreshold = 30;
  var snapThreshold = 10;
  var centerCanvas = 1280 / 2;
  var snaps = {};

  var centerGuide;
  if(elemCenterX <= snapThreshold + centerCanvas && elemCenterX >= centerCanvas - snapThreshold) {
    applyToSelection(function(cur) {
      cur.left += (centerCanvas - elem.width / 2 - elem.left);
    });
    snaps.center = {center: centerCanvas};
    elem.left = (centerCanvas - elem.width / 2);
  };

  var els = data.tree.elements;
  for(var i in els) {
    var cur = els[i];
    if(cur.selected) continue;

    if(elem.left <= snapThreshold + cur.left && elem.left > cur.left - snapThreshold) {
      if(!snaps.left) {
        snaps.left = cur;
      } else if(elem.left - cur.left < elem.left - snaps.left.left) {
        snaps.left = cur;
      }
    }

    if(elem.left + elem.width >= cur.left + cur.width - snapThreshold && elem.left + elem.width <= cur.left + cur.width) {
      if(!snaps.right) {
        snaps.right = cur;
      } else if(elem.left + elem.width - cur.left - cur.width > elem.left + elem.width - snaps.right.left - snaps.right.width) {
        snaps.right = cur;
      }
    }

    if(elem.top <= snapThreshold + cur.top && elem.top >= cur.top) {
      if(!snaps.top) {
        snaps.top = cur;
      } else if(elem.top - cur.top < elem.top - snaps.top.top) {
        snaps.top = cur;
      }
    }

    if(elem.top + elem.height >= cur.top + cur.height - snapThreshold && elem.top + elem.height <= cur.top + cur.height) {
      if(!snaps.bottom) {
        snaps.bottom = cur;
      } else if(elem.top + elem.height - cur.top - cur.height > elem.top + elem.height - snaps.bottom.top - snaps.bottom.height) {
        snaps.bottom = cur;
      }
    }
  }

  if(active.resizing) {

    if(active.resizing.left && snaps.left) {
      applyToSelection(function(sel) {
        if(snaps.center) {
          sel.width += elem.left - snaps.left.left;
        }
        sel.width += elem.left - snaps.left.left;
        sel.left += snaps.left.left - elem.left;
      });
      elem.left = snaps.left.left;
    }

    if(active.resizing.right && snaps.right) {
      applyToSelection(function(sel) {
        sel.width += snaps.right.left + snaps.right.width - elem.left - elem.width;
        if(snaps.center) {
          sel.left -= snaps.right.left + snaps.right.width - elem.left - elem.width;
          sel.width += snaps.right.left + snaps.right.width - elem.left - elem.width;
        }
      });
    }

    if(active.resizing.top && snaps.top) {
      applyToSelection(function(sel) {
        sel.height += elem.top - snaps.top.top;
        sel.top += snaps.top.top - elem.top;
      });
      elem.height += elem.top - snaps.top.top;
      elem.top = snaps.top.top;
    }

    if(active.resizing.bottom && snaps.bottom) {
      applyToSelection(function(sel) {
        sel.height += snaps.bottom.top + snaps.bottom.height - elem.height - elem.top;
      });
      elem.height += snaps.bottom.top + snaps.bottom.height - elem.height - elem.top;
    }

  } else {
    if(snaps.left) {
      applyToSelection(function(sel) {
        sel.left += snaps.left.left - elem.left;
      });
      elem.left = snaps.left.left;
    }

    if(snaps.right) {
      applyToSelection(function(sel) {
        sel.left += snaps.right.left + snaps.right.width - elem.left - elem.width;
      });
      elem.left = snaps.right.left + snaps.right.width - elem.width;
    }

    if(snaps.top) {
      applyToSelection(function(sel) {
        sel.top += snaps.top.top - elem.top;
      });
      elem.top = snaps.top.top;
    }

    if(snaps.bottom) {
      applyToSelection(function(sel) {
        sel.top += snaps.bottom.top + snaps.bottom.height - elem.height - elem.top;
      });
      elem.top = snaps.bottom.top + snaps.bottom.height - elem.height;
    }

  }
};

var cloneSelected = function(fields) {
  var sels = data.selection.selections;
  var clone = [];
  if(!fields) {
    for(var i in sels) {
      var neue = {};
      for(var key in sels[i]) {
        neue[key] = sels[i][key];
      }
      clone[i] = neue;
    }
  } else {
    for(var i in sels) {
      var neue = {};
      for(var x in fields) {
        var key = fields[x];
        neue[key] = sels[i][key];
      }
      clone[i] = neue;
    }
  }
  return clone;
};

var noop = function() {};
var snapshotUndo = function(entry) {
  var sels = entry.selections;
  var orig = entry.original;
  for(var i in sels) {
    var sel = sels[i]
    var cur = orig[i];
    for(var key in cur) {
      sel[key] = cur[key];
    }
  }
};

var snapshotRedo = function(entry) {
  var sels = entry.selections;
  var final = entry.final;
  for(var i in sels) {
    var sel = sels[i]
    var cur = final[i];
    for(var key in cur) {
      sel[key] = cur[key];
    }
  }
};

var undoEntry = function(description) {
  var stack = data.undo.stack;
  var entry = {undo: snapshotUndo, redo: snapshotRedo, parent: stack, children: [], description: description};
  entry.selections = data.selection.selections.slice(0);
  stack.children.push(entry);
  data.undo.stack = entry;
  return entry;
}

var undo = function() {
  var cur = data.undo.stack;
  if(cur.parent) {
    cur.undo(cur);
    data.undo.stack = cur.parent;
    if(cur.selections) {
      setSelections(cur.selections);
    }
  }
};

var redo = function() {
  var cur = data.undo.stack;
  if(cur.children.length) {
    var last = cur.children[cur.children.length - 1];
    last.redo(last);
    data.undo.stack = last;
    if(last.selections) {
      setSelections(last.selections);
    }
  }
};


mix.container = {
  getElems: function() {
    var elems = this.props.node.elements;
    var items = [];
    for(var i in elems) {
      var elem = elems[i];
      items[i] = comps.elements[elem.type]({node: elem});
    }
    return items;
  },
  onDragOver: function(e) {
    if(!e.defaultPrevented) {
      //data.activeElement = {elem: this, box: e.target.getBoundingClientRect()};
      //dirty();
      e.preventDefault();
    }
  },
  onDrop: function(e) {
    if(!e.defaultPrevented) {
      var type = e.dataTransfer.getData("tool");

      if(!type) return;

      var pos = mouseRelativeTo(e, document.getElementById("design-frame"));

      var elem = comps.elements.make[type]();
      elem.top = pos.y - (elem.height / 2);
      elem.left = pos.x - (elem.width / 2);
      this.props.node.elements.push(elem);
      dirty();
      e.preventDefault();
    }
  }
};

mix.element = {
  componentDidMount: function() {
    if(this.props.node.width === undefined) {
      this.measureSize(this.getDOMNode());
    }
  },
  measureSize: function(elem) {
    var rect = elem.getBoundingClientRect();
    this.props.node.width = rect.width;
    this.props.node.height = rect.height;
  },
  onDragStart: function(e) {
    fixDragStart(e);
    data.selection.positioning = true;
    var undo = undoEntry("move selection (drag)");
    undo.original = cloneSelected(["top", "left"]);
    picker.spectrum("container").css("display", "none");
    dirty();
    e.stopPropagation();
  },

  onDrag: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    if(e.shiftKey) { data.selection.modified = true; }
    else { data.selection.modified = false; }
    var pos = relativeToCanvas(e.clientX, e.clientY);
    var me = this.props.node;
    var dx = (pos.x - (me.width / 2) - me.left);
    var dy = (pos.y - (me.height / 2) - me.top);
    applyToSelection(function(cur) {
      cur.left += dx;
      cur.top += dy;
    });
    snapSelection();
    dirty();
    e.stopPropagation();
  },

  onDragEnd: function(e) {
    data.selection.positioning = false;
    var entry = data.undo.stack;
    entry.final = cloneSelected(["top", "left"]);
    dirty();
    e.stopPropagation();
  },

  onClick: function(e) {
    if(e.shiftKey && !this.props.node.selected) {
      addSelection(this.props.node);
      dirty();
    } else if(!this.props.node.selected) {
      clearSelections();
      addSelection(this.props.node);
      dirty();
    }
    e.stopPropagation();
  },

  doubleClick: function(e) {
    data.selection.editing = true;
    dirty();
  },

  destroy: function(e) {
    var elems = data.tree.elements;
    var index = elems.indexOf(this.props.node);
    if(index > -1) {
      elems.splice(index, 1);
    }
    data.selection = {};
    dirty();
  },

  getStyle: function() {
    return {background: this.props.node.background, color: this.props.node.color, height: this.props.node.height, width: this.props.node.width, top: this.props.node.top || 100, left: this.props.node.left || 100};
  },

  getAttributes: function(klass) {
    var active = {};
    var selected = "";
    if(this.props.node.selected) {
      selected = " selected";
      active = data.selection;
    }
    return {className: klass + " elem" + selected, draggable: "true", onDoubleClick:this.doubleClick, onInput: this.change,  onMouseDown: this.onClick, onDragEnd: this.onDragEnd, onDragStart: this.onDragStart, onDrag: this.onDrag, contentEditable: active.editing, style: this.getStyle()}
  }
}

comps.elements = {

  make: {
    button: function() {
      return {type: "button", width:100, height:30, background:"#ccc", color:"#333", content: "button text"};
    },
    text: function() {
      return {type: "text", width:100, height:30, color:"#333", content: "some awesome text"};
    },
    image: function() {
      return {type: "image",
              width:100,
              height:100,
              src: "http://www.palantir.net/sites/default/files/styles/blogpost-mainimage/public/blog/images/Rubber_duck_meme.jpg?itok=fm9xZ0tw"};
    },
    div: function() {
      return {type: "div", width:200, height:100, background:"#ccc"};
    }
  },

  button: React.createClass({
    mixins: [mix.element],
    change: function(e) {
      this.props.node.content = e.target.innerHTML;
    },
    controls: {background: true, color: true},
    render: function() {
      return d.a(this.getAttributes("button"), this.props.node.content);
    }
  }),

  text: React.createClass({
    mixins: [mix.element],
    change: function(e) {
      this.props.node.content = e.target.innerHTML;
    },
    controls: {background: true, color: true},
    render: function() {
      return d.span(this.getAttributes("text"), this.props.node.content);
    }
  }),

  image: React.createClass({
    mixins: [mix.element],
    controls: {background: false, color: false},
    render: function() {
      var attrs = this.getAttributes("image");
      attrs.onInput = null;
      attrs.src = this.props.node.src;
      return d.img(attrs);
    }
  }),

  div: React.createClass({
    mixins: [mix.element],
    controls: {background:true},
    render: function() {
      var attrs = this.getAttributes("box");
      attrs.onInput = null;
      return d.div(attrs);
    }
  }),
}

comps.toolbar = React.createClass({
  render: function() {
    return d.ul({className: "toolbar"},
                d.li({className: "ion-wrench"}),
                d.li({className: "ion-pie-graph"}),
                d.li({className: "ion-flask"})
               );
  }
});

comps.toolbox = React.createClass({
  render: function() {
    var handler = function(type) {
      return function(e) {
        e.dataTransfer.setData("tool", type);
      }
    };
    return d.ul({className: "toolbox"},
                d.li({draggable: "true",
                      onDragStart: handler("button")}, "button"),
                d.li({draggable: "true",
                      onDragStart: handler("div")}, "div"),
                d.li({draggable: "true",
                      onDragStart: handler("text")}, "text"),
                d.li({draggable: "true",
                      onDragStart: handler("image")}, "image")
               );
  }
});

comps.uiCanvas = React.createClass({
  mixins: [mix.container],
  getInitialState: function() {
    return {width: "1280px"};
  },
  onMouseDown: function(e) {
    if(e.target.id == "design-frame") {
      clearSelections();
      picker.spectrum("container").css("display", "none");
      dirty();
    }
  },
  onDragStart: function(e) {
    fixDragStart(e);
    clearSelections();
    data.selection.selecting = true;
    data.selection.sizing = true;
    data.selection.box = {left: e.clientX,
                          top: e.clientY};
    data.selection.start = {x: e.clientX,
                            y: e.clientY};
    dirty();
  },
  onDrag: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    if(e.clientX > data.selection.start.x) {
      data.selection.box.width = e.clientX - data.selection.start.x;
    } else {
      data.selection.box.left = e.clientX;
      data.selection.box.width = data.selection.start.x - e.clientX;
    }

    if(e.clientY > data.selection.start.y) {
      data.selection.box.height = e.clientY - data.selection.start.y;
    } else {
      data.selection.box.top = e.clientY;
      data.selection.box.height = data.selection.start.y - e.clientY;
    }
    var elems = data.tree.elements;
    var pos = relativeToCanvas(data.selection.box.left, data.selection.box.top);
    var left = pos.x;
    var right = left + data.selection.box.width;
    var top = pos.y;
    var bottom = top + data.selection.box.height;
    var sels = data.selection.selections;
    for(var i in sels) {
      sels[i].selected = false;
    }
    data.selection.selections = [];
    for(var i in elems) {
      var cur = elems[i];
      //if they intersect
      if(left < cur.left + cur.width //left of the right edge
         && right > cur.left //right of the left edge
         && top < cur.top + cur.height //above the bottom
         && bottom > cur.top //bottom below top
        ) {
        addSelection(cur, true);
      }
    }
    dirty();
  },
  onDragEnd: function(e) {
    data.selection.sizing = false;
    if(data.selection.selections.length) {
      fitSelectionBox();
    } else {
      clearSelections();
    }
    dirty();
  },
  clearSelections: function(e) {
    //data.selection = {};
    //data.activeElement = {};
    //picker.spectrum("container").css("display", "none");
  },
  render: function() {
    var guides = comps.guides();
    var actives = [];

    var selectionRect;
    if(data.selection.selecting) {
      if(!data.selection.sizing) {
        fitSelectionBox();
      }
      selectionRect = d.div({className: "selection-rect",
                             style: {top: data.selection.box.top,
                                     left: data.selection.box.left,
                                     width: data.selection.box.width,
                                     height: data.selection.box.height}});
      var sels = data.selection.selections;
      for(var i in sels) {
        actives.push(comps.activeElement({elem: sels[i]}));
      }
    }

    return d.div({className: "ui-canvas",
                  id: "ui-canvas",
                  onMouseDown: this.clearSelections},
                 d.div({className: "canvas",
                        draggable: true,
                        onDragStart: this.onDragStart,
                        onDrag: this.onDrag,
                        onDragEnd: this.onDragEnd},
                       d.div({id: "design-frame",
                              className: "design-frame",
                              style: {width: this.state.width},
                              onMouseDown: this.onMouseDown,
                              onDrop: this.onDrop,
                              onDragOver: this.onDragOver},
                             guides,
                             this.getElems(),
                             actives
                            )
                      ),
                 selectionRect
                );
  }
});


comps.guides = React.createClass({
  render: function() {
    if(!data.selection.box || data.selection.sizing) return d.div();
    var active = data.selection;
    var adjusted = relativeToCanvas(active.box.left, active.box.top);
    var elem = {top: adjusted.y, left: adjusted.x, width: active.box.width, height: active.box.height};
    var elemCenterX = elem.left + elem.width / 2;

    var snapVisibleThreshold = 20;
    var snapThreshold = 10;
    var centerCanvas = 1280 / 2;

    var guides = [];

    var centerGuide;
    if(elemCenterX <= snapVisibleThreshold + centerCanvas && elemCenterX >= centerCanvas - snapVisibleThreshold) {
      guides.push(d.div({className: "guide vertical-guide", style: {left: centerCanvas}}));
    }

    var els = data.tree.elements;
    for(var i in els) {
      var cur = els[i];
      if(cur.selected) continue;

      if(elem.left <= snapVisibleThreshold + cur.left && elem.left >= cur.left) {
        guides.push(d.div({className: "guide vertical-guide", style: {left: cur.left}}));
      }

      if(elem.left + elem.width >= cur.left + cur.width - snapVisibleThreshold && elem.left + elem.width <= cur.left + cur.width) {
        guides.push(d.div({className: "guide vertical-guide", style: {left: cur.left + cur.width}}));
      }

      if(elem.top <= snapVisibleThreshold + cur.top && elem.top >= cur.top) {
        guides.push(d.div({className: "guide horizontal-guide", style: {top: cur.top}}));
      }

      if(elem.top + elem.height >= cur.top + cur.height - snapVisibleThreshold && elem.top + elem.height <= cur.top + cur.height) {
        guides.push(d.div({className: "guide horizontal-guide", style: {top: cur.top + cur.height}}));
      }
    }
    return d.div({className: "guides"},
                 guides
                );
  }
});

comps.activeElement = React.createClass({
  componentDidUpdate: function() {
  },
  render: function() {
    if(!this.props.elem.top) {
      return d.div({className: "active-element-overlay", style: {display: "none"}});
    }
    var box = this.props.elem;
    var top = box.top;
    var left = box.left;
    var width = box.width;
    var height = box.height;
    var start = {x: 0, y: 0};
    var elem = this.props.elem;
    var gripSize = 4;

    var dragStart = function(e) {
      fixDragStart(e);
      data.selection.resizing = {};
      var entry = undoEntry("resize selection");
      entry.original = cloneSelected(["top", "left", "width", "height"]);
      e.stopPropagation();
    };

    var dragEnd = function(e) {
      data.selection.resizing = false;
      data.undo.stack.final = cloneSelected(["top", "left", "width", "height"]);
      e.stopPropagation();
    };

    var modified = function(e) {
      if(e.shiftKey) { data.selection.modified = true; }
      else { data.selection.modified = false; }
    }

    var setBox = function(elem, prev) {
      if(elem.width < 1) {
        elem.width = 1;
      }
      if(elem.height < 1) {
        elem.height = 1;
      }
      if(elem.top >= prev.top + prev.height) {
        elem.top = prev.top + prev.height - elem.height;
      }
      if(elem.left >= prev.left + prev.width) {
        elem.left = prev.left + prev.width - elem.width;
      }
    };

    var controls = data.selection.selections.length === 1;
    var colorPicker, backgroundPicker;
    if(controls) {
      var cur = data.selection.selections[0];
      if(cur.background) {
        backgroundPicker = d.div({className: "control color-picker control-background-color",
                                  type: "color",
                                  onClick: function(e) {
                                    eve.data.selection.colorType = "background";
                                    picker.spectrum("set", elem.background);
                                    picker.spectrum("container").css({top: e.clientY - 100, left: e.clientX + 15, display:"inline-block"});
                                  },
                                  style: {top: 0,
                                          left: width + 15,
                                          background: elem.background}});
      }
      if(cur.color) {
        colorPicker = d.div({className: "control color-picker control-background-color",
                             type: "color",
                             onClick: function(e) {
                               eve.data.selection.colorType = "color";
                               picker.spectrum("set", elem.color);
                               picker.spectrum("container").css({top: e.clientY - 15, left: e.clientX + 15, display:"inline-block"});
                             },
                             style: {top: 16,
                                     left: width + 15,
                                     background: elem.color}});
      }
    }

    return d.div({className: "active-element-overlay",
                  style: {top: top,
                          left: left,
                          width: width,
                          height: height}},
                 backgroundPicker,
                 colorPicker,
                 //top left
                 d.div({className: "grip grip-down-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.top = true;
                          data.selection.resizing.left = true;
                          var dy = pos.y - top;
                          var dx = pos.x - left;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.top += dy;
                            cur.height -= dy;
                            cur.left += dx;
                            cur.width -= dx;
                            setBox(cur, prev);
                          });
                          top = pos.y;
                          left = pos.x;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: -gripSize,
                                left: -gripSize}}),
                 //top
                 d.div({className: "grip grip-vertical",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.top = true;
                          var dy = pos.y - top;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.top += dy;
                            cur.height -= dy;
                            setBox(cur, prev);
                          });
                          top = pos.y;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: -gripSize,
                                left: (width / 2) - gripSize}}),
                 //top right
                 d.div({className: "grip grip-up-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.top = true;
                          data.selection.resizing.right = true;
                          var dy = pos.y - top;
                          var dx = pos.x - left - width;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.top += dy;
                            cur.height -= dy;
                            cur.width += dx;
                            setBox(cur, prev);
                          });
                          top = pos.y;
                          width = pos.x - left;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: -gripSize,
                                left: width - gripSize}}),
                 //right
                 d.div({className: "grip grip-horizontal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.right = true;
                          var dx = pos.x - left - width;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.width += dx;
                            setBox(cur, prev);
                          });
                          width = pos.x - left;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: (height / 2) - gripSize,
                                left: width - gripSize}}),
                 //bottom right
                 d.div({className: "grip grip-down-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.right = true;
                          data.selection.resizing.bottom = true;
                          var dy = pos.y - top - height;
                          var dx = pos.x - left - width;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.height += dy;
                            cur.width += dx;
                            setBox(cur, prev);
                          });
                          height = pos.y - top;
                          width = pos.x - left;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: height - gripSize,
                                left: width - gripSize}}),
                 //bottom
                 d.div({className: "grip grip-vertical",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.bottom = true;
                          var dy = pos.y - top - height;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.height += dy;
                            setBox(cur, prev);
                          });
                          height = pos.y - top;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: height - gripSize,
                                left: (width / 2) - gripSize}}),
                 //bottom left
                 d.div({className: "grip grip-up-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.bottom = true;
                          data.selection.resizing.left = true;
                          var dy = pos.y - top - height;
                          var dx = pos.x - left;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.height += dy;
                            cur.left += dx;
                            cur.width -= dx;
                            setBox(cur, prev);
                          });
                          height = pos.y - top;
                          left = pos.x;
                          width -= dx;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: height - gripSize,
                                left: -gripSize}}),
                 //left
                 d.div({className: "grip grip-horizontal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDragEnd: dragEnd,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          modified(e);
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          data.selection.resizing.left = true;
                          var dx = pos.x - left;
                          applyToSelection(function(cur) {
                            var prev = {top: cur.top, left: cur.left, width: cur.width, height: cur.height};
                            cur.left += dx;
                            cur.width -= dx;
                            setBox(cur, prev);
                          });
                          left = pos.x;
                          width -= dx;
                          snapSelection();
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: (height / 2) - gripSize,
                                left: -gripSize}})

                );
  }
});

comps.undoList = React.createClass({
  render: function() {
    var items = [];
    var cur = data.undo.stack;
    for(var i = 0; i < 20; i++) {
      if(!cur.parent) break;
      items.push(d.li({}, cur.description));
      cur = cur.parent;
    }
    return d.ul({className: "undo-tree"}, items);
  }
});

comps.wrapper = React.createClass({
  render: function() {
    return d.div({id: "wrapper"},
                 comps.undoList(),
                 comps.toolbar(),
                 comps.toolbox(),
                 comps.uiCanvas({node: data.tree})
                );
  }
});

//Key Handling

var keys = {backspace: 8,
            shift: 16,
            enter: 13,
            left: 37,
            up: 38,
            right: 39,
            down: 40,
            c: 67,
            v: 86,
            z: 90};

document.addEventListener("keydown", function(e) {
  var handled = false;
  var shift = e.shiftKey;
  switch(e.keyCode) {
    case keys.backspace:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        var entry = undoEntry("remove selected elements");
        entry.undo = function(ent) {
          var sels = ent.selections;
          for(var i in sels) {
            data.tree.elements.push(sels[i]);
          }
          setSelections(ent.selections);
        };
        entry.redo = function(ent) {
          data.tree.elements = data.tree.elements.filter(function(cur) {
            return ent.selections.indexOf(cur) === -1;
          });
          clearSelections();
        };
        entry.redo(entry);
      }
      break;

    case keys.left:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.left -= shift ? 10 : 1;
        })
      }
      break;
    case keys.right:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.left += shift ? 10 : 1;
        })
      }
      break;
    case keys.up:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.top -= shift ? 10 : 1;
        })
      }
      break;
    case keys.down:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.top += shift ? 10 : 1;
        })
      }
      break;
    case keys.shift:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        data.selection.modified = true;
      }
      break;
    case keys.c:
      if((e.ctrlKey || e.metaKey) && data.selection.selections && data.selection.selections.length && !data.selection.editing) {
        handled = true;
        var cloned = cloneSelected();
        data.clipboard = cloned;
      }
      break;
    case keys.v:
      if((e.ctrlKey || e.metaKey) && data.clipboard && !data.selection.editing) {
        handled = true;
        cb = data.clipboard;
        for(var i in cb) {
          data.tree.elements.push(cb[i]);
        }
        clearSelections();
        data.selection.selecting = true;
        data.selection.selections = cb;
        data.clipboard = cloneSelected();
      }
      break;

    case keys.z:
      if(!(e.ctrlKey || e.metaKey) || data.selection.editing) break;

      handled = true;
      if(!e.shiftKey) {
        undo();
      } else {
        redo();
      }
      break;
  }

  if(handled) {
    dirty();
    e.preventDefault();
    e.stopPropagation();
  }
});

document.addEventListener("keyup", function(e) {
  var handled = false;
  switch(e.keyCode) {
    case keys.shift:
      if(data.selection.selecting) {
        handled = true;
        data.selection.modified = false;
      }
      break;
  }

  if(handled) {
    dirty();
    e.preventDefault();
    e.stopPropagation();
  }
});


eve.start = function() {
  React.renderComponent(comps.wrapper(eve.data), document.querySelector("#outer-wrapper"));
  eve.dirty = false;
}

window.eve = eve;
window.eve.start();

//TODO:
// - undo for add
// - undo for resize
// - undo for property change
// - fix center resizing
// - center snapping?
// - selection rules? (fully contained for divs, overlapping for others)
// - src property editor
// - font property editor
// - exact size property editor
// - reaction editor?
// - custom guide lines
