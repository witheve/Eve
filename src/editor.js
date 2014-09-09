var eve = {};

var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}, selection: {}, undo: {stack:{children: []}},

                       page: "rules",
                       selector: {open: {}, selected: false},
                       activeRule: "foo",
                       globalId: 0,
                       rules: { },
                       tables: {"users": {name: "users",
                                          id: "users",
                                          fields: [{name: "id", id: "users_id"}, {name: "name", id: "users_name"}, {name: "email", id: "users_email"}, {name: "phone", id: "users_phone"}]},
                                "ui_elems": {name: "elems",
                                          id: "ui_elems",
                                          fields: [{name: "id", id: "elem_id"}, {name: "type", id: "elem_type"}]},
                                "ui_text": {name: "ui text",
                                            id: "ui_text",
                                            fields: [{name: "id", id: "text_id"}, {name: "text", id: "text_text"}]},
                                "ui_child": {name: "ui children",
                                             id: "ui_child",
                                             fields: [{name: "parent", id: "child_id"}, {name: "position", id: "child_position"}, {name: "child", id: "child_childid"}]},
                                "ui_events": {name: "ui events",
                                             id: "ui_events",
                                             fields: [{name: "elem", id: "events_elem_id"}, {name: "event", id: "events_event"}, {name: "label", id: "events_label"}, {name: "key", id: "events_key"}]},
                                "external_events": {name: "external_events",
                                             id: "external_events",
                                             fields: [{name: "elem", id: "extevents_elem_id"}, {name: "label", id: "extevents_label"}, {name: "key", id: "extevents_key"}, {name: "event id", id: "extevents_event_id"}]},
                                "edges": {name: "edges",
                                          id: "edges",
                                          fields: [{name: "from", id: "edges_from"}, {name: "to", id: "edges_to"}]},
                                "path": {name: "path",
                                         id: "path",
                                         fields: [{name: "from", id: "path_from"}, {name: "to", id: "path_to"}]},
                                "todos": {name: "todos",
                                          id: "todos",
                                          fields: [{name: "id", id: "todos_id"}, {name: "text", id: "todos_text"}, {name: "completed", id: "todos_completed"}]},
                                "email outbox": {name: "email outbox",
                                                 id: "email outbox",
                                                 fields: [{name: "id", id: "email outbox_id"}, {name: "to", id: "email outbox_to"}, {name: "from", id: "email outbox_from"}, {name: "subject", id: "email outbox_subject"}, {name: "body", id: "email outbox_body"}]},
                                "sms outbox": {name: "sms outbox",
                                               id: "sms outbox",
                                               fields: [{name: "id", id: "sms outbox_id"}, {name: "phone", id: "sms outbox_phone"}, {name: "message", id: "sms outbox_message"}]},
                                "sms_to_send": {name: "sms to send",
                                                id: "sms_to_send",
                                                fields: [{name: "id", id: "sms_to_send_id"}, {name: "phone", id: "sms_to_send_phone"}, {name: "message", id: "sms_to_send_message"}]},
                                "sms_pending": {name: "sms pending",
                                                id: "sms_pending",
                                                fields: [{name: "id", id: "sms pending_id"}]},
                                "email inbox": {name: "email inbox",
                                                id: "email inbox",
                                                fields: [{name: "id", id: "email inbox_id"}, {name: "to", id: "email inbox_to"}, {name: "from", id: "email inbox_from"}, {name: "subject", id: "email inbox_subject"}, {name: "body", id: "email inbox_body"}]}},

                      };
var d = React.DOM;

if(localStorage["eve_rules"]) {
  data.rules = JSON.parse(localStorage["eve_rules"]);
  data.globalId = JSON.parse(localStorage["eve_globalId"]);
}

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

var dirty = function(recompile) {
  localStorage["eve_rules"] = JSON.stringify(data.rules);
  localStorage["eve_globalId"] = data.globalId;
  if(recompile && !eve.recompile) {
    eve.recompile = true;
    data.system = uiBuildSystem();
    eve.recompile = false;
  }
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

var undoEntry = function(ent) {
  var stack = data.undo.stack;
  var entry = {undo: ent.undo, redo: ent.redo, parent: stack, children: [], description: ent.description};
  stack.children.push(entry);
  data.undo.stack = entry;
  return entry;
}

var uiUndoEntry = function(description) {
  var entry = undoEntry({description: description, undo: snapshotUndo, redo:snapshotRedo});
  entry.selections = data.selection.selections.slice(0);
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
    var undo = uiUndoEntry("move selection (drag)");
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
      var entry = uiUndoEntry("resize selection");
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

comps.gridHeader = React.createClass({
  render: function() {
    var props = this.props;
    var cur = this.props.column;
    return d.th({draggable: "true",
                 onClick: function(e) {
                   var name = prompt("name: ", cur.name);
                   cur.name = name;
                   dirty();
                 },
                 onDragStart: function(e) {
                   data.selection = {action: "move column",
                                     column: cur};
                 },
                 onDragOver: function(e) {
                   e.preventDefault();
                 },
                 onDrop: function(e) {
                   //TODO: this logic probably doesn't really belong here.
                   //TODO: this is not undoable
                   data.dropZone = "";
                   var valve = data.selection.column.id;
                   if(!valve) return;

                   if(props.table) {
                     data.rules[data.activeRule].links.push({valve: valve, type: "tableConstraint", table: props.table, field: props.column.id})
                     dirty(true);
                   } else {
                     var col = data.selection.column;
                     var rule = data.rules[data.activeRule];
                     var cols = rule.valves;
                     for(var ix = 0; ix < cols.length; ix++) {
                       if(cols[ix].id == col.id) {
                         break;
                       }
                     }
                     var table, field;
                     cols.splice(ix, 1);
                     rule.links = rule.links.filter(function(cur) {
                       if(cur.valve == col.id && cur.type == "tableConstraint") {
                         table = cur.table;
                         field = cur.field;
                       }
                       return cur.valve != col.id;
                     });
                     data.rules[data.activeRule].joins.push({valve: props.column.id, table: table, field: field})
                     dirty(true);
                   }
                   e.stopPropagation();
                 }
                },
                    cur.name);
  }
});

comps.grid = React.createClass({
  createSetFunctionCB: function(rule, fn) {
    return function() {
      var result = prompt("function:", fn.userCode || fn.code);
      setFunctionCode(rule, fn, result);
      dirty(true);
    }
  },
  render: function() {
    if(!this.props.table.fields.length) return d.table();

    var rule = getActiveRule();
    var ths = [];
    var thfilters = [];
    var headers = this.props.table.fields;
    var headersLen = headers.length;
    var mods = this.props.table.joins;
    var fns = [];
    for(var i in headers) {
      var cur = headers[i];
      var fn = false;
      if(rule) {
        fn = getFunctionForValve(rule, cur.id);
      }
      if(fn) {
        fns.push(this.createSetFunctionCB(rule, fn));
      } else {
        fns.push(null);
      }
      ths.push(comps.gridHeader({column: cur, table: this.props.sinkId}));
      if(mods && mods[cur.id]) {
        thfilters.push(d.th({className: "modifier"}, "merged " + mods[cur.id]));
      } else {
        thfilters.push(d.th({className: "empty"}));
      }
    }

    var trs = [];
    var rows = this.props.table.rows;
    if(!rows || !rows.length) {
      rows = [["", "", "", "", ""]];
    }
    var skip = this.props.table.withoutTable ? 0 : 1;
    var rowLen = rows.length;
    for(var i = 0; i < rowLen; i++) {
      var row = rows[i];
      var tds = [];
      for(var header = 0; header < headersLen; header++) {
        tds.push(d.td({onClick: fns[header]}, row[header + skip]));
      }
      if(this.props.table.add) {
        tds.push(d.td({className:  "add-column",
                       onClick: function() {
                         var rule = getActiveRule();
                         var valve = addValveToRule(rule, "calculated" + data.globalId++);
                         addFunctionToValve(rule, valve, "5");
                         dirty(true);
                       }}));
      }
      trs.push(d.tr({className: ""}, tds));
    }

    if(this.props.table.add) {
        ths.push(d.th({className: "add-column"}, "+"));
    }

    return d.table({className: "grid"},
                   d.thead({}, d.tr({}, thfilters), d.tr({}, ths)),
                   d.tbody({}, trs));
  }
});

comps.inputColumnList = React.createClass({
  render: function() {
    var table = this.props.table;
    var items = table.fields.map(function(cur) {
      return d.li({draggable: true,
                   onDragStart: function(e) {
                     data.selection = {};
                     data.selection.action = "add column";
                     data.selection.column = {tableName: table.name, table: table.id, column: cur.id, name: cur.name};
                     data.selector.selected = table.id;
                     e.dataTransfer.effectAllowed = "move";
                     e.dataTransfer.dropEffect = "move";
                     e.stopPropagation();
                   }},
                  cur.name);
    })
    return d.ul({className: "column-list"}, items);
  }
});

comps.dataSelectorItem = React.createClass({
  render: function() {
    var cur = this.props.table;
    var active = data.selector.open[cur.id];
    var items = [d.span({className: "selector-toggle " + (active ? "ion-ios7-arrow-down" : "ion-ios7-arrow-right"),
                         onClick: function() {
                            data.selector.open[cur.id] = !active;
                         }}),
                 d.span({className: "table-name"}, cur.name)];
    if(data.selector.open[cur.id]) {
      items.push(comps.inputColumnList({table: cur, id: this.props.id}));
    }
    return d.li({className: "" + (data.selector.open[cur.id] ? "active" : "") + (data.selector.selected === cur.id ? " selected" : ""),
                 draggable: true,
                 onDragStart: function(e) {
                     data.selection = {};
                     data.selection.action = "add table";
                     data.selection.table = cur;
                     data.selector.selected = cur.id;
                     e.dataTransfer.effectAllowed = "move";
                     e.dataTransfer.dropEffect = "move";
                 },
                 onDoubleClick: function() {
                    data.page = "table-view";
                    data.activeRule = cur.id;
                    dirty();
                 },
                 onClick: function() {
                    data.selector.selected = cur.id;
                   dirty();
                 },
                 onBlur: function() {
                   cur.active = false;
                   dirty();
                 }},
                items);
  }
});

comps.dataSelector = React.createClass({
  render: function() {

    var items = [];
    var tables = data.tables;
    for(var i in tables) {
      var cur = tables[i];
      items.push(comps.dataSelectorItem({table: cur}));
    }

    return d.div({className: "data-selector container"},
                 d.ul({className: "data-selector-tables"}, items));
  }
});

comps.workspace = React.createClass({
  addColumn: function(col, ix) {
    var cols = this.props.rule.valves;
    for(var i in cols) {
      if(cols[i].table == col.table && cols[i].name == col.name) {
        return;
      }
    }
    var pipe = findPipeForTable(this.props.rule, col.table);
    if(!pipe) {
        //TODO: how does negation fit into this?
        pipe = {id: "pipe" + data.globalId++, table: col.table, type: "+source"};
        this.props.rule.pipes.push(pipe);

    }
    var valveId = "valve" + data.globalId++;
    var valve = {id: valveId, name: col.tableName + "." + col.name};
    this.props.rule.links.push({type: "tableConstraint", valve: valveId, table: pipe.id, field: col.column});
    if(ix === undefined) {
      cols.push(valve);
      return cols.length - 1;
    } else {
      cols.splice(ix,0,valve);
      return ix;
    }
  },
  removeColumn: function(col) {
    var cols = this.props.rule.valves;
    var ix = cols.indexOf(col);
    cols.splice(ix, 1);
    this.props.rule.links = this.props.rule.links.filter(function(cur) {
      return cur.valve != col.id;
    });
    return ix;
  },
  onDrop: function(e) {
    var self = this;
    var action = data.selection.action;
    data.dropZone = false;
    if(action == "add column") {
      var col = data.selection.column;
      var ix = this.addColumn(col);
      if(ix !== undefined) {
        undoEntry({description: "add column",
                   undo: function(ent) {
                     self.removeColumn(col);
                   },
                   redo: function(ent) {
                     self.addColumn(col,ix);
                   }});
        dirty(true);
      }
    } else if(action == "move column") {
      var col = data.selection.column;
      var ix = this.removeColumn(col);
      //FIXME: links are lost.
      undoEntry({description: "remove column",
                 undo: function(ent) {
                   self.addColumn(col,ix);
                 },
                 redo: function(ent) {
                   self.removeColumn(col);
                 }});
      dirty(true);
    } else if(action == "add table") {
      var table = data.selection.table;
      table.fields.forEach(function(cur) {
        self.addColumn({tableName: table.name, table: table.id, column: cur.id, name: cur.name});
      });
      dirty(true);
    }
  },
  onDragOver: function(e) {
    e.preventDefault();
    if(data.selection.action.indexOf("add") < 0) return;
    data.dropZone = "workspace";
    dirty();
  },

  onDragLeave: function(e) {
    data.dropZone = false;
    dirty();
  },

  getIntermediates: function() {
    var dump = dumpMemory(data.system.memory);
    try {
      var flow = compileRule(dump, data.activeRule);
      var outputAdds = [];
      flow.source.update(data.system.memory, outputAdds, []);
      return outputAdds;
    } catch (e) {
      return [];
    }
  },

  render: function() {
    var rule = this.props.rule;
    var cols = rule.valves;
    var joins = rule.joins;
    var filters = rule.joins;
    var joinMap = {};
    var filterMap = {};

    for(var i in joins) {
      var cur = joins[i];
      joinMap[cur.valve] = columnToName(rule, cur);
    }

    for(var i in filters) {
      var cur = filters[i];
      filterMap[cur.valve] = cur;
    }

    return d.div({className: "workspace-container container" + (data.dropZone === "workspace" ? " dropping" : ""),
                  onDragLeave: this.onDragLeave,
                  onDragOver: this.onDragOver,
                  onDrop: this.onDrop},
                  d.div({className: "vbox"},
                        d.input({className: "description", type: "text", value: rule.description, onChange: function(e) {
                          rule.description = e.target.value;
                          dirty();
                        }}),
                        d.div({className: "workspace"},
                              comps.grid({table: {fields: cols,
                                                  joins: joinMap,
                                                  filters: filterMap,
                                                  add: true,
                                                  withoutTable: true,
                                                  //TODO: show the real intermediates
                                                  rows: this.getIntermediates()}}
                                        ))
                       ));
  }
});

comps.ioSelectorItem = React.createClass({
  render: function() {
    var props = this.props;
    return d.li({className: "",
                 onClick: function() {
                   data.rules[data.activeRule].pipes.push({id: "pipe" + data.globalId++, table: props.table.id, type: props.type});
                   data[props.type.substring(1) + "Selector"] = "closed";
                   dirty(true);
                 }},
                props.table.name);
  }
});

comps.ioSelector = React.createClass({
  render: function() {
    var type = this.props.type;
    var selector = type + "Selector";
    if(!data[selector] || data[selector] == "closed") {
      return d.li({className: "ion-ios7-plus-empty add-button add-" + type + " " + type + "-selector",
                   onClick: function() {
                     data[selector] = "open";
                     dirty(true);
                   }});
    }

    var items = [];
    for(var i in data.tables) {
      items.push(comps.ioSelectorItem({table: data.tables[i], type: "+" + type}));
    }

    return d.li({className: type + "-selector"},
                d.ul({className: ""}, items));
  }
});

comps.sinks = React.createClass({
  getSolutions: function() {
    var dump = dumpMemory(data.system.memory);
    var flow = compileRule(dump, data.activeRule);
    var output = flow.update(data.system.memory, Memory.empty())
    var final = {};
    output.facts.forEach(function(cur) {
      var table = cur[0];
      if(!final[table]) {
        final[table] = [];
      }
      final[table].push(cur);
    });
    return final;
  },

  onDragOver: function(e) {
    data.dropZone = "sinks";
    dirty();
    e.preventDefault();
  },

  onDragLeave: function(e) {
    data.dropZone = "";
    dirty();
  },

  onDrop: function(e) {
    data.dropZone = "";
    dirty();
    if(data.selection.action === "add table") {
      var table = data.selection.table;
      data.rules[data.activeRule].pipes.push({id: "pipe" + data.globalId++, table: table.id, type: "+sink"});
      dirty(true);
    }
  },

  render: function() {

    var items = [];
    var sinks = this.props.sinks;
    var sols = this.getSolutions();
    for(var i in sinks) {
      var cur = data.tables[sinks[i].table];
      //TODO: get the values for the sinks
      items.push(d.li({}, d.h2({}, cur.name), comps.grid({table: {fields: cur.fields, rows: sols[sinks[i].table]}, sinkId: sinks[i].id})));
    }

    items.push(d.li({className: "uiWatcher"}, data.uiWatcherResults));

    return d.div({className: "outputs-container container" + (data.dropZone === "sinks" ? " dropping" : ""),
        onDragOver: this.onDragOver,
        onDragLeave: this.onDragLeave,
        onDrop: this.onDrop},
        d.ul({className: "outputs"}, items));
  }
});

comps.ruleItem = React.createClass({
  render: function() {
    var props = this.props;
    var ins = [];
    var outs = [];
    props.rule.pipes.forEach(function(cur) {
      var li = d.li({}, cur.table);
      if(cur.type == "+source") {
        ins.push(li);
      } else {
        outs.push(li);
      }
    });
    return d.div({className: "rule",
                        onClick: function(e) {
                          if(!e.altKey) {
                            data.activeRule = props.id;
                            data.page = "data";
                            dirty();
                          } else {
                            delete data.rules[props.id];
                            dirty(true);
                          }
                        }},
                 d.div({className: "vbox"},
                       d.h2({}, this.props.rule.description),
                       d.div({className: "hbox"},
                             d.ul({}, ins),
                             d.ul({}, outs)))
                );
  }
});

comps.rulesList = React.createClass({
  render: function() {
    var items = [];
    var rs = this.props.rules;
    for(var i in rs) {
      var cur = rs[i];
      items.push(comps.ruleItem({id: i, rule: cur}));
    }
    return d.div({className: "rules"}, items, d.div({className: "add-rule",
                                                     onClick: function() {
                                                        var rule = "unnamed" + data.globalId++;
                                                       data.rules[rule] = ({pipes: [], valves: [], joins: [], sorts: [], groups: [], functions: [], links: [], description: "unnamed"});
                                                       data.page = "data";
                                                       data.activeRule = rule;
                                                       dirty(true);
                                                     }},
                                                     "new rule"));
  }
});

comps.tableItem = React.createClass({
  render: function() {
    var props = this.props.table;
    return d.div({className: "rule",
                        onClick: function() {
                          data.activeRule = props.id;
                          data.page = "table-view";
                          dirty();
                        }},
                 d.div({className: "vbox"},
                       d.h2({}, this.props.table.name))
                );
  }
});

comps.tablesList = React.createClass({
  render: function () {
    var items = [];
    var tables = this.props.tables;
    for(var i in tables) {
      var cur = tables[i];
      items.push(comps.tableItem({id: i, table: cur}));
    }
    return d.div({className: "tables"}, items);
  }
});

comps.tableView = React.createClass({
  render: function() {
    //TODO: replace with table API call
    var rows = data.system.memory.getTable(this.props.table.id);
    return d.div({className: "table-view"}, d.h2({}, this.props.table.name), comps.grid({table: {fields: this.props.table.fields, rows: rows}}), d.span({className: "ion-grid return-to-grid",
                         onClick: function(e) {
                           data.page = "rules";
                           dirty();
                         }
                        }));
  }
});

comps.linksList = React.createClass({
  render: function() {
    var links = this.props.rule.links;
    var valves = this.props.rule.valves;
    var valveToName = {};
    for(var i in valves) {
      valveToName[valves[i].id] = valves[i].name;
    }
    var pipes = this.props.rule.pipes;
    var pipesToName = {};
    for(var i in pipes) {
      pipesToName[pipes[i].id] = pipes[i].table;
    }
    var items = [];
    for(var i in links) {
      var cur = links[i];
      items.push(d.li({}, valveToName[cur.valve] + " -> " + pipesToName[cur.table] + " " + cur.field + " [" + cur.table + "]" ));
    }
    return d.ul({className: "links-list"}, items);
  }
});

comps.wrapper = React.createClass({

  render: function() {

    var cur = [];

    switch(data.page) {

      case "ui":
        cur.push(comps.toolbox(), comps.undoList(), comps.uiCanvas({node: data.tree}));
        break;

      case "data":
        var activeRule = {rule: data.rules[data.activeRule]};
        var ins = [];
        var outs = [];
        activeRule.rule.pipes.forEach(function(cur) {
          if(cur.type == "+source") {
            ins.push(cur);
          } else {
            outs.push(cur);
          }
        });
        cur.push(d.div({className: "hbox"},
            comps.dataSelector(),
            d.div({className: "vbox data-top"}, comps.workspace(activeRule), comps.sinks({sinks: outs})),
            d.span({className: "ion-grid return-to-grid",
                onClick: function(e) {
                    data.page = "rules";
                    dirty();
                }
            })
        ));
        break;


      case "rules":
        cur.push(d.div({className: "hbox"}, comps.dataSelector(), comps.rulesList({rules: data.rules})));
        break;

      case "table-view":
        var table = data.tables[data.activeRule];
        var ruleIds = rulesRelatedToTable(table.id);
        var rules = {};
        for(var i in ruleIds) {
            rules[ruleIds[i]] = data.rules[ruleIds[i]];
        }
        cur.push(d.div({className: "hbox table-view-container"}, comps.dataSelector(), d.div({className: "vbox"}, comps.tableView({table: table}), comps.rulesList({rules: rules}))));
        break;

    }

    return d.div({id: "wrapper"},
                 comps.toolbar(),
                 cur
                );
  }
});

//*********************************************************
// Rule rep utilities
//*********************************************************

var findField = function(table, id) {
  for(var i in table.fields) {
    if(table.fields[i].id === id) {
      return table.fields[i];
    }
  }
}

var findPipeForTable = function(rule, table) {
    for(var i in rule.pipes) {
        var cur = rule.pipes[i];
        if(cur.table === table) return cur;
    }
    return false;
}

var pipeToTable = function(rule, pipeId) {
  for(var i in rule.pipes) {
    if(rule.pipes[i].id === pipeId) {
      return data.tables[rule.pipes[i].table];
    }
  }
}

var columnToName = function(rule, col) {
  var table = data.tables[col.table] || pipeToTable(rule, col.table);
  var column = findField(table, col.field);
  return table.name + "." + column.name;
}

var rulesRelatedToTable = function(table) {
  var rules = data.rules;
  var final = [];
  for(var i in rules) {
    if(findPipeForTable(rules[i], table)) {
        final.push(i);
    }
  }
  return final;
}

var getActiveRule = function() {
  return data.rules[data.activeRule];
}

var addValveToRule = function(rule, name, ix) {
  var cols = rule.valves;
  var valveId = "valve" + data.globalId++;
  var valve = {id: valveId, name: name};
  if(ix === undefined) {
    cols.push(valve);
  } else {
    cols.splice(ix,0,valve);
  }
  return valveId;
}

var addFunctionToValve = function(rule, valve, code) {
  var funcId = "function" + data.globalId++;
  var func = {id: funcId, code: code, valve: valve, args: []};
  rule.functions.push(func);
  return funcId;
}

var getFunctionForValve = function(rule, valve) {
  for(var i in rule.functions) {
    var cur = rule.functions[i];
    if(cur.valve === valve) {
      return cur;
    }
  }
  return false;
}

var setFunctionCode = function(rule, func, code) {
  var valves = rule.valves;
  var parts = code.split(/[\s]/);
  var args = [];
  var final = [];
  for(var i in parts) {
    var cur = parts[i];
    var found = false;
    for(var i in valves) {
      var valve = valves[i];
      if(cur === valve.name) {
        found = true;
        args.push({valve: valve.id});
        final.push(valve.id);
        break;
      }
    }
    if(!found) final.push(cur);
  }
  func.userCode = code;
  func.code = final.join(" ");
  func.args = args;
  return func;
}

//*********************************************************
// Build
//*********************************************************

var updateQueue = [];
var isQueued = false;

var uiCompileRule = function(rule, ruleId) {
  var facts = [];
  var added = {};
  rule.pipes.forEach(function(cur) {
    facts.push(["pipe", cur.id, cur.table, ruleId, cur.type]);
  });
  rule.links.forEach(function(cur) {
    facts.push([cur.type, cur.valve, cur.table, cur.field]);
  });
  rule.joins.forEach(function(cur) {
    facts.push(["tableConstraint", cur.valve, cur.table, cur.field]);
  });
  rule.valves.forEach(function(cur, ix) {
    facts.push(["valve", cur.id, ruleId, ix]);
  });
  rule.functions.forEach(function(cur) {
    facts.push(["function", cur.id, cur.code, cur.valve, ruleId]);
    for(var i in cur.args) {
      var arg = cur.args[i];
      facts.push(["functionInput", arg.valve, cur.id]);
    }
  });
  return facts;
}

var updateSystem = function(things) {
  data.system.update(things, []);
  //WATCHERS GO HERE
  smsWatcher(data.system.memory);
  dirty();
}

var uiBuildSystem = function() {
  var rules = data.rules;
  var final = [];
  for(var rule in rules) {
    var facts = this.uiCompileRule(rules[rule], rule);
    var factsLen = facts.length;
    for(var i = 0; i < factsLen; i++) {
      final.push(facts[i]);
    }
  }
  var tables = data.tables;
  for(var table in tables) {
    var cur = tables[table];
    cur.fields.forEach(function(field, ix) {
      final.push(["schema", table, field.id, ix]);
    });
  }
  var prev = [];
  if(data.system) {
    prev = data.system.memory.getTable("external_events");
  }
  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(final).concat(prev)));
  try {
  system.update([["users", 0, "chris", "chris@chris.com", "555-555-5555"],
                 ["users", 1, "jamie", "jamie@jamie.com", "555-555-5555"],
                 ["users", 2, "rob", "rob", "555-555-5555"],
                 ["edges", "a", "b"],
                 ["edges", "b", "c"],
                 ["edges", "c", "d"],
                 ["edges", "d", "b"]
                ],
                []);
  } catch(e) {
    console.error(e);
  }
  return system;
}


//*********************************************************
// Watchers
//*********************************************************

var createUICallback = function(id, label, key) {
  return function(e) {
    updateSystem([["external_events", id, label, key, data.globalId++]]);
  };
}

var uiWatcher = function(memory) {
  var elem = memory.getTable("ui_elems");
  var text = memory.getTable("ui_text");
  var attrs = memory.getTable("ui_attrs");
  var styles = memory.getTable("ui_styles");
  var events = memory.getTable("ui_events");
  var children = memory.getTable("ui_child");

  var elem_id = 1;
  var elem_type = 2;

  var text_text = 2;

  var attrs_attr = 2;
  var attrs_value = 3;

  var styles_attr = 2;
  var styles_value = 3;

  var events_event = 2;
  var events_label = 3;
  var events_key = 4;

  var child_childid = 3;

  var builtEls = {};
  var roots = {};

  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    roots[cur[elem_id]] = true;
    if(React.DOM[cur[elem_type]]) {
      builtEls[cur[elem_id]] = React.DOM[cur[elem_type]]();
    } else {
      builtEls[cur[elem_id]] = React.DOM.p();
    }
  }

  var textLen = text.length;
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    builtEls[cur[elem_id]] = cur[text_text];
  }

  var attrsLen = attrs.length;
  for(var i = 0; i < attrsLen; i++) {
    var cur = attrs[i];
    builtEls[cur[elem_id]].props[cur[attrs_attr]] = cur[attrs_value];
  }

  var stylesLen = styles.length;
  for(var i = 0; i < stylesLen; i++) {
    var cur = styles[i];
    if(!builtEls[cur[attrs_id]].props.styles) {
      builtEls[cur[attrs_id]].props.styles = {};
    }
    builtEls[cur[elem_id]].props.styles[cur[styles_attr]] = cur[styles_value];
  }

  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    builtEls[cur[elem_id]].props[cur[events_event]] = createUICallback(cur[elem_id], cur[events_label], cur[events_key]);
  }

  var childrenLen = children.length;
  children.sort();
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    delete roots[cur[child_childid]];
    if(!builtEls[cur[elem_id]].props.children) {
      builtEls[cur[elem_id]].props.children = [];
    }
    builtEls[cur[elem_id]].props.children.push(child);
  }

  var final = d.div();
  final.props.children = [];
  for(var i in roots) {
    final.props.children.push(builtEls[i]);
  }

  data.uiWatcherResults = final;
}

var lastSeenSMSID = 0;

var smsWatcher = function(memory) {
  var sms = memory.getTable("sms outbox");
  var sent = [];
  for(var i in sms) {
    var cur = sms[i];
    if(cur[1] > lastSeenSMSID) {
      $.post("http://localhost:3000/text", {to: cur[2], body: cur[3]});
      console.log("Send text: ", cur[2], cur[3]);
      sent.push(["sms_pending", cur[1]]);
      lastSeenSMSID = cur[1];
    }
  }
  if(sent.length > 0) {
    data.system.update(sent, []);
  }
}

//*********************************************************
//Key Handling
//*********************************************************

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
        var entry = uiUndoEntry("remove selected elements");
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
  try {
    uiWatcher(data.system.memory);
  } catch(e) {
    console.error("UI Watcher failed");
    console.log(e);
  }
  React.renderComponent(comps.wrapper(eve.data), document.querySelector("#outer-wrapper"));
  eve.dirty = false;
}

window.eve = eve;
dirty(true);

//TODO UI:
// - undo for add
// - undo for property change
// - fix center resizing
// - center snapping?
// - selection rules? (fully contained for divs, overlapping for others)
// - src property editor
// - font property editor
// - exact size property editor
// - reaction editor?
// - custom guide lines

//TODO DATA:
// - link to output
// - calculated column
// - merge
// - group
// - filter
// - cell editor
// - create table
