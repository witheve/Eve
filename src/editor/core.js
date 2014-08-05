var eve = {};
var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}, activeElement: {}};
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

var mouseRelativeTo = function(e, elem) {
  var parentRect = elem.getBoundingClientRect();
  return {x: e.clientX - parentRect.left - document.body.scrollLeft,
          y: e.clientY - parentRect.top - document.body.scrollTop};
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

      var elem = {type: type,
                  top: pos.y,
                  left: pos.x};
      if(type === "div") {
        elem.elements = [];
      }
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
    picker.spectrum("container").css("display", "none");
    dirty();
  },

  onDrag: function(e) {
    if(e.clientX == 0 && e.clientY == 0) return;
    if(e.shiftKey) { data.activeElement.modified = true; }
    else { data.activeElement.modified = false; }
    var rect = e.target.getBoundingClientRect();
    var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
    this.props.node.left = pos.x - (rect.width / 2);
    this.props.node.top = pos.y - (rect.height / 2);
    dirty();
  },

  onDragEnd: function(e) {
    data.activeElement.controls = true;
    dirty();
  },

  onClick: function(e) {
    data.activeElement.view = this;;
    data.activeElement.elem = this.props.node;
    data.activeElement.controls = true;
    dirty();
    e.stopPropagation();
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
    return {className: klass + " elem", draggable: "true", onMouseDown: this.onClick, onDragEnd: this.onDragEnd, onDragStart: this.onDragStart, onDrag: this.onDrag, style: this.getStyle()}
  }
}

comps.elements = {
  button: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "button!"};
    },
    controls: {background: true, color: true},
    render: function() {
      return d.a(this.getAttributes("button"), this.state.content);
    }
  }),

  text: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "some text"};
    },
    controls: {background: true, color: true},
    render: function() {
      return d.span(this.getAttributes("text"), this.state.content);
    }
  }),

  image: React.createClass({
    mixins: [mix.element],
    controls: {background: false, color: false},
    render: function() {
      var attrs = this.getAttributes("image");
      attrs.src = "http://www.palantir.net/sites/default/files/styles/blogpost-mainimage/public/blog/images/Rubber_duck_meme.jpg?itok=fm9xZ0tw";
      return d.img(attrs);
    }
  }),

  div: React.createClass({
    mixins: [mix.element, mix.container],
    render: function() {
      return d.div({className: "box", onDrop: this.onDrop, onDragOver: this.onDragOver, onMouseOver: this.onMouseOver}, this.getElems());
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
                //                 d.li({draggable: "true",
                //                       onDragStart: handler("div")}, "div"),
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
  render: function() {
    var guides = comps.guides();
    guides.snap();

    return d.div({className: "ui-canvas"},
                 d.div({className: "canvas"},
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
                      )
                );
  }
});


comps.guides = React.createClass({
  snap: function() {
    if(!data.activeElement || !data.activeElement.elem || data.activeElement.modified) return;
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
        elem.left = cur.left;
      }
      if(elem.left + elem.width >= cur.left + cur.width - snapThreshold && elem.left + elem.width <= cur.left + cur.width) {
        elem.left = cur.left + cur.width - elem.width;
      }

      if(elem.top <= snapThreshold + cur.top && elem.top >= cur.top) {
        elem.top = cur.top;
      }

      if(elem.top + elem.height >= cur.top + cur.height - snapThreshold && elem.top + elem.height <= cur.top + cur.height) {
        elem.top = cur.top + cur.height - elem.height;
      }
    }

  },
  render: function() {
    if(!data.activeElement || !data.activeElement.elem) return d.div();
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
    };

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
                                  picker.spectrum("container").css({top: top - 100, left: left + width + 30, display:"inline-block"});
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
                             picker.spectrum("container").css({top: top - 100, left: left + width + 30, display:"inline-block"});
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
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: -gripSize,
                                left: -gripSize}}),
                 //top
                 d.div({className: "grip grip-vertical",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: -gripSize,
                                left: (width / 2) - gripSize}}),
                 //top right
                 d.div({className: "grip grip-up-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = height + top - pos.y;
                          elem.top = pos.y;
                          elem.width = pos.x - left;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: -gripSize,
                                left: width - gripSize}}),
                 //right
                 d.div({className: "grip grip-horizontal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.width = pos.x - left;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: (height / 2) - gripSize,
                                left: width - gripSize}}),
                 //bottom right
                 d.div({className: "grip grip-down-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = pos.y - top;
                          elem.width = pos.x - left;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: height - gripSize,
                                left: width - gripSize}}),
                 //bottom
                 d.div({className: "grip grip-vertical",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = pos.y - top;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: height - gripSize,
                                left: (width / 2) - gripSize}}),
                 //bottom left
                 d.div({className: "grip grip-up-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          elem.height = pos.y - top;
                          box.height = elem.height;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
                          dirty();
                        },
                        style: {top: height - gripSize,
                                left: -gripSize}}),
                 //left
                 d.div({className: "grip grip-horizontal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          var pos = mouseRelativeTo(e, document.getElementById("design-frame"));
                          box.height = elem.height;
                          elem.left = pos.x;
                          elem.width = width + left - elem.left;
                          setBox(elem);
                          dirty();
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
      if(data.activeElement.view) {
        handled = true;
        data.activeElement.view.destroy();
      }
      break;

    case keys.left:
      if(data.activeElement.elem) {
        handled = true;
        data.activeElement.elem.left -= shift ? 10 : 1;
      }
      break;
    case keys.right:
      if(data.activeElement.elem) {
        handled = true;
        data.activeElement.elem.left += shift ? 10 : 1;
      }
      break;
    case keys.up:
      if(data.activeElement.elem) {
        handled = true;
        data.activeElement.elem.top -= shift ? 10 : 1;
      }
      break;
    case keys.down:
      if(data.activeElement.elem) {
        handled = true;
        data.activeElement.elem.top += shift ? 10 : 1;
      }
      break;
    case keys.shift:
      if(data.activeElement.elem) {
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
