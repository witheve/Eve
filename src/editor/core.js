var eve = {};
var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}};
var d = React.DOM;

var clearPixel = document.createElement("img");
clearPixel.src = document.querySelector("#clear-pixel").toDataURL();
clearPixel.width = 10;
clearPixel.height = 10;

var dirty = function() {
  if(!eve.dirty) {
    eve.dirty = true;
    window.requestAnimationFrame(eve.start);
  }
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

      var elem = {type: type,
                  top: e.clientY,
                  left: e.clientX};
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
  onDragStart: function(e) {
    e.dataTransfer.setData("move", "move")
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.dropEffect = "move";
    e.dataTransfer.setDragImage(clearPixel, 0,0);
    data.activeElement = {};
    dirty();
  },

  onDrag: function(e) {
    var rect = e.target.getBoundingClientRect();
    this.props.node.left = e.clientX - (rect.width / 2);
    this.props.node.top = e.clientY - (rect.height / 2);
    dirty();
  },

  toBox: function(elem) {
    var rect = elem.getBoundingClientRect();
    return {top: rect.top, left: rect.left, width: rect.width, height: rect.height};
  },

  onDragEnd: function(e) {
    data.activeElement = {elem: this.props.node, box: this.toBox(e.target)};
    dirty();
  },

  onClick: function(e) {
    data.activeElement = {elem: this.props.node, box: this.toBox(e.target)};
    dirty();
    e.stopPropagation();
  }
}

comps.elements = {
  button: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "button!"};
    },
    render: function() {
      return d.a({className: "button elem", draggable: "true", onMouseDown: this.onClick, onDragEnd: this.onDragEnd, onDragStart: this.onDragStart, onDrag: this.onDrag, style: {height: this.props.node.height, width: this.props.node.width, top: this.props.node.top || 100, left: this.props.node.left || 100}}, this.state.content);
    }
  }),

  text: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "some text"};
    },
    render: function() {
      return d.span({className: "text elem", draggable: "true", onMouseDown: this.onClick, onDragEnd: this.onDragEnd, onDragStart: this.onDragStart, onDrag: this.onDrag, style: {height: this.props.node.height, width: this.props.node.width, top: this.props.node.top || 100, left: this.props.node.left || 100}}, this.state.content);
    }
  }),

  image: React.createClass({
    mixins: [mix.element],
    render: function() {
      return d.img({className: "image elem", src: "http://www.palantir.net/sites/default/files/styles/blogpost-mainimage/public/blog/images/Rubber_duck_meme.jpg?itok=fm9xZ0tw", draggable: "true", onMouseDown: this.onClick, onDragEnd: this.onDragEnd, onDragStart: this.onDragStart, onDrag: this.onDrag, style: {height: this.props.node.height, width: this.props.node.width, top: this.props.node.top || 100, left: this.props.node.left || 100}});
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
  onClick: function(e) {
    data.activeElement = {};
    dirty();
  },
  render: function() {
    return d.div({className: "ui-canvas"},
                 d.div({className: "canvas"},
                       d.div({className: "design-frame",
                              style: {width: this.state.width},
                              onMouseDown: this.onClick,
                              onDrop: this.onDrop,
                              onDragOver: this.onDragOver},
                             this.getElems()
                            )
                      )
                );
  }
});

comps.activeElement = React.createClass({
  render: function() {
    if(!this.props.box) {
      return d.div({className: "active-element-overlay", style: {display: "none"}});
    }
    var box = this.props.box;
    var top = this.props.box.top;
    var left = this.props.box.left;
    var width = this.props.box.width;
    var height = this.props.box.height;
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

      box.height = elem.height;
      box.width = elem.width;
      box.left = elem.left;
      box.top = elem.top;
    };

    return d.div({className: "active-element-overlay",
                  style: {top: top,
                          left: left,
                          width: width,
                          height: height}},
                 //top left
                 d.div({className: "grip grip-down-diagonal",
                        draggable: "true",
                        onDragStart: dragStart,
                        onDrag: function(e) {
                          if(e.clientX == 0 && e.clientY == 0) return;
                          elem.height = height + top - e.clientY;
                          elem.top = e.clientY;
                          elem.left = e.clientX;
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
                          elem.height = height + top - e.clientY;
                          elem.top = e.clientY;
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
                          elem.height = height + top - e.clientY;
                          elem.top = e.clientY;
                          elem.width = e.clientX - left;
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
                          elem.width = e.clientX - left;
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
                          elem.height = e.clientY - top;
                          elem.width = e.clientX - left;
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
                          elem.height = e.clientY - top;
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
                          elem.height = e.clientY - top;
                          box.height = elem.height;
                          elem.left = e.clientX;
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
                          box.height = elem.height;
                          elem.left = e.clientX;
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
                 comps.activeElement(data.activeElement),
                 comps.toolbar(),
                 comps.toolbox(),
                 comps.uiCanvas({node: data.tree})
                );
  }
});


eve.start = function() {
  React.renderComponent(comps.wrapper(eve.data), document.querySelector("#outer-wrapper"));
  eve.dirty = false;
}

window.eve = eve;
window.eve.start();
