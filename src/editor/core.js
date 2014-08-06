var eve = {};
var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}, activeElement: {}, selection: {}};
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
    if(eve.data.activeElement.elem) {
      eve.data.activeElement.elem[eve.data.activeElement.colorType] = color.toHexString();
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
  return {x: x - parentRect.left,
          y: y - parentRect.top};
}

var mouseRelativeTo = function(e, elem) {
  return relativeTo(e.clientX, e.clientY, elem);
}

var relativeToCanvas = function(x,y) {
  return relativeTo(x,y,document.getElementById("design-frame"));
}

var canvasToGlobal = function(x,y) {
  var parentRect = document.getElementById("design-frame").getBoundingClientRect();
  return {x: x + parentRect.left + document.body.scrollLeft,
          y: y + parentRect.top + document.body.scrollTop};
}


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
    e.dataTransfer.setData("move", "move")
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";
    e.dataTransfer.setDragImage(clearPixel, 0,0);
    data.activeElement.controls = false;
    data.activeElement.positioning = true;
    picker.spectrum("container").css("display", "none");
    dirty();
    e.stopPropagation();
  },

  onDrag: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    if(e.shiftKey) { data.activeElement.modified = true; }
    else { data.activeElement.modified = false; }
    var pos = relativeToCanvas(e.clientX, e.clientY);
    this.props.node.left = pos.x - (this.props.node.width / 2);
    this.props.node.top = pos.y - (this.props.node.height / 2);
    console.log(pos, this.props.node.left, this.props.node.top);
    dirty();
    e.stopPropagation();
  },

  onDragEnd: function(e) {
    data.activeElement.controls = true;
    data.activeElement.positioning = false;
    dirty();
    e.stopPropagation();
  },

  onClick: function(e) {
    if(e.shiftKey) {
      if((!data.selection.selections || data.selection.selections.length == 0) && data.activeElement.elem) {
        data.selection.selections = [data.activeElement.elem];
        data.activeElement = {};
      }
      data.selection.selecting = true;
      data.selection.selections.push(this.props.node);
    } else {
      data.activeElement.view = this;
      data.activeElement.elem = this.props.node;
      data.activeElement.controls = true;
    }
    dirty();
    e.stopPropagation();
  },

  doubleClick: function(e) {
    data.activeElement.editing = true;
  },

  destroy: function(e) {
    var elems = data.tree.elements;
    var index = elems.indexOf(this.props.node);
    if(index > -1) {
      elems.splice(index, 1);
    }
    data.activeElement = {};
    dirty();
  },

  getStyle: function() {
    return {background: this.props.node.background, color: this.props.node.color, height: this.props.node.height, width: this.props.node.width, top: this.props.node.top || 100, left: this.props.node.left || 100};
  },

  getAttributes: function(klass) {
    var active = {};
    if(data.activeElement.view === this) {
      active = data.activeElement;
    }
    var selected = "";
    if(this.props.node.selected) {
      selected = " selected";
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
      return {type: "div", width:100, height:100, background:"#ccc"};
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
      data.activeElement = {};
      picker.spectrum("container").css("display", "none");
      dirty();
    }
  },
  onDragStart: function(e) {
    e.dataTransfer.setData("move", "move")
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";
    e.dataTransfer.setDragImage(clearPixel, 0,0);
    data.selection.selecting = true;
    data.selection.sizing = true;
    var old = data.selection.selections;
    for(var i in old) {
      old[i].selected = false;
    }
    data.selection.selections = []
    data.selection.cur = {x: e.clientX,
                          y: e.clientY};
    data.selection.start = {x: e.clientX,
                            y: e.clientY};
    dirty();
  },
  onDrag: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    if(e.clientX > data.selection.start.x) {
      data.selection.width = e.clientX - data.selection.start.x;
    } else {
      data.selection.cur.x = e.clientX;
      data.selection.width = data.selection.start.x - e.clientX;
    }

    if(e.clientY > data.selection.start.y) {
      data.selection.height = e.clientY - data.selection.start.y;
    } else {
      data.selection.cur.y = e.clientY;
      data.selection.height = data.selection.start.y - e.clientY;
    }
    var elems = data.tree.elements;
    var pos = relativeToCanvas(data.selection.cur.x, data.selection.cur.y);
    var left = pos.x;
    var right = left + data.selection.width;
    var top = pos.y;
    var bottom = top + data.selection.height;
    var selections = [];
    for(var i in elems) {
      var cur = elems[i];
      cur.selected = false;
      //if they intersect
      if(left < cur.left + cur.width //left of the right edge
         && right > cur.left //right of the left edge
         && top < cur.top + cur.height //above the bottom
         && bottom > cur.top //bottom below top
        ) {
        selections.push(cur);
        cur.selected = true;
      }
    }
    data.selection.selections = selections;
    dirty();
  },
  fitSelection: function() {
    var elems = data.selection.selections;
    var left = 10000000;
    var right = 0;
    var top = 1000000;
    var bottom = 0;
    for(var i in elems) {
      var cur = elems[i];
      cur.selected = false;
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
    data.selection.cur = pos;
    data.selection.width = right - left;
    data.selection.height = bottom - top;
  },
  onDragEnd: function(e) {
    data.selection.sizing = false;
    this.fitSelection();
    dirty();
  },
  startMovingSelection: function(e) {
    e.dataTransfer.setData("move", "move")
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";
    e.dataTransfer.setDragImage(clearPixel, 0,0);
    e.stopPropagation();
  },
  moveSelection: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    var centerY = data.selection.cur.y + data.selection.height / 2;
    var centerX = data.selection.cur.x + data.selection.width / 2;
    var dy = e.clientY - centerY;
    var dx = e.clientX - centerX;

    var elems = data.selection.selections;
    for(var i in elems) {
      elems[i].top += dy;
      elems[i].left += dx;
    }

    data.selection.cur.y += dy;
    data.selection.cur.x += dx;

    dirty();
    e.stopPropagation();
  },
  clearSelections: function(e) {
    //data.selection = {};
    //data.activeElement = {};
    //picker.spectrum("container").css("display", "none");
  },
  render: function() {
    var guides = comps.guides();
    guides.snap();

    var selectionRect;
    if(data.selection.selecting) {
      if(!data.selection.sizing) {
        this.fitSelection();
      }
     selectionRect = d.div({className: "selection-rect",
                            draggable: true,
                            onMouseDown: function(e) { e.stopPropagation(); },
                            onDragStart: this.startMovingSelection,
                            onDrag: this.moveSelection,
                            style: {top: data.selection.cur.y,
                                    left: data.selection.cur.x,
                                    width: data.selection.width,
                                    height: data.selection.height}});
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
                             comps.activeElement(data.activeElement)
                            )
                      ),
                 selectionRect
                );
  }
});


comps.guides = React.createClass({
  snap: function() {
    if(!data.activeElement.elem
       || data.activeElement.modified
       || (!data.activeElement.snapable && !data.activeElement.positioning && !data.activeElement.resizing)) {
      data.activeElement.snapable = false;
      return;
    }
    data.activeElement.snapable = data.activeElement.positioning || data.activeElement.resizing;
    var active = data.activeElement;
    var elem = data.activeElement.elem;
    var elemCenterX = elem.left + elem.width / 2;

    var snapVisibleThreshold = 30;
    var snapThreshold = 10;
    var centerCanvas = 1280 / 2;

    var centerGuide;
    if(elemCenterX <= snapThreshold + centerCanvas && elemCenterX >= centerCanvas - snapThreshold) {
      elem.left = centerCanvas - elem.width / 2;
    };

    var els = data.tree.elements;
    for(var i in els) {
      var cur = els[i];
      if(cur == elem) continue;

      if(elem.left <= snapThreshold + cur.left && elem.left > cur.left - snapThreshold) {
        if(active.resizing && active.resizing.left) {
          elem.width = elem.left - cur.left + elem.width;
        }
        elem.left = cur.left;
      }
      if(elem.left + elem.width >= cur.left + cur.width - snapThreshold && elem.left + elem.width <= cur.left + cur.width) {
        if(active.resizing && active.resizing.right) {
          elem.width = cur.left + cur.width - elem.left;
        }
        elem.left = cur.left + cur.width - elem.width;
      }

      if(elem.top <= snapThreshold + cur.top && elem.top >= cur.top) {
        if(active.resizing && active.resizing.top) {
          elem.height = elem.top - cur.top + elem.height
        }
        elem.top = cur.top;
      }

      if(elem.top + elem.height >= cur.top + cur.height - snapThreshold && elem.top + elem.height <= cur.top + cur.height) {
        if(active.resizing && active.resizing.bottom) {
          elem.height = cur.top + cur.height - elem.top;
        }
        elem.top = cur.top + cur.height - elem.height;
      }
    }

  },
  render: function() {
    if(!data.activeElement.elem) return d.div();
    var elem = data.activeElement.elem;
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
      if(cur == elem) continue;

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
    if(!this.props.elem || !this.props.controls) {
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
      e.dataTransfer.setData("move", "move")
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.dropEffect = "move";
      e.dataTransfer.setDragImage(clearPixel, 0,0);
      data.activeElement.resizing = {};
      e.stopPropagation();
    };

    var dragEnd = function(e) {
      data.activeElement.resizing = false;
      e.stopPropagation();
    };

    var modified = function(e) {
      if(e.shiftKey) { data.activeElement.modified = true; }
      else { data.activeElement.modified = false; }
    }

    var setBox = function(elem) {
      if(elem.width < 1) {
        elem.width = 1;
      }
      if(elem.height < 1) {
        elem.height = 1;
      }
      if(elem.top >= top + height) {
        elem.top = top + height - elem.height;
      }
      if(elem.left >= left + width) {
        elem.left = left + width - elem.width;
      }
    };

    var view = this.props.view;
    var colorPicker, backgroundPicker;
    if(view.controls.background) {
      backgroundPicker = d.div({className: "control color-picker control-background-color",
                                type: "color",
                                onClick: function(e) {
                                  eve.data.activeElement.colorType = "background";
                                  picker.spectrum("set", elem.background);
                                  picker.spectrum("container").css({top: e.clientY - 100, left: e.clientX + 15, display:"inline-block"});
                                },
                                style: {top: 0,
                                        left: width + 15,
                                        background: elem.background}});
    }
    if(view.controls.color) {
      colorPicker = d.div({className: "control color-picker control-background-color",
                           type: "color",
                           onClick: function(e) {
                             eve.data.activeElement.colorType = "color";
                             picker.spectrum("set", elem.color);
                             picker.spectrum("container").css({top: e.clientY - 15, left: e.clientX + 15, display:"inline-block"});
                           },
                           style: {top: 16,
                                   left: width + 15,
                                   background: elem.color}});
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
                          data.activeElement.resizing.top = true;
                          data.activeElement.resizing.left = true;
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
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
                          data.activeElement.resizing.top = true;
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          setBox(elem);
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
                          data.activeElement.resizing.top = true;
                          data.activeElement.resizing.right = true;
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          elem.width = pos.x - left;
                          setBox(elem);
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
                          data.activeElement.resizing.right = true;
                          elem.width = pos.x - left;
                          setBox(elem);
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
                          data.activeElement.resizing.right = true;
                          data.activeElement.resizing.bottom = true;
                          elem.height = pos.y - top;
                          elem.width = pos.x - left;
                          setBox(elem);
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
                          data.activeElement.resizing.bottom = true;
                          elem.height = pos.y - top;
                          setBox(elem);
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
                          data.activeElement.resizing.bottom = true;
                          data.activeElement.resizing.left = true;
                          elem.height = pos.y - top;
                          box.height = elem.height;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
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
                          data.activeElement.resizing.left = true;
                          box.height = elem.height;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
                          dirty();
                          e.stopPropagation();
                        },
                        style: {top: (height / 2) - gripSize,
                                left: -gripSize}})

                );
  }
});

comps.wrapper = React.createClass({
  render: function() {
    return d.div({id: "wrapper"},
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
            down: 40};

document.addEventListener("keydown", function(e) {
  var handled = false;
  var shift = e.shiftKey;
  switch(e.keyCode) {
    case keys.backspace:
      if(data.activeElement.view && !data.activeElement.editing) {
        handled = true;
        data.activeElement.view.destroy();
      }
      break;

    case keys.left:
      if(data.activeElement.elem && !data.activeElement.editing) {
        handled = true;
        data.activeElement.elem.left -= shift ? 10 : 1;
      }
      break;
    case keys.right:
      if(data.activeElement.elem && !data.activeElement.editing) {
        handled = true;
        data.activeElement.elem.left += shift ? 10 : 1;
      }
      break;
    case keys.up:
      if(data.activeElement.elem && !data.activeElement.editing) {
        handled = true;
        data.activeElement.elem.top -= shift ? 10 : 1;
      }
      break;
    case keys.down:
      if(data.activeElement.elem && !data.activeElement.editing) {
        handled = true;
        data.activeElement.elem.top += shift ? 10 : 1;
      }
      break;
    case keys.shift:
      if(data.activeElement.elem && !data.activeElement.editing) {
        handled = true;
        data.activeElement.modified = true;
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
      if(data.activeElement.elem) {
        handled = true;
        data.activeElement.modified = false;
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
// - better selection model? (only multiple?)
// - selection highlighting is hard to see
// - selection rules (fully contained for divs, overlapping for others)
// - copy
// - paste
// - fix center resizing
// - center snapping?
// - src property editor
// - font property editor
// - exact size property editor
// - reaction editor?
// - custom guide lines
