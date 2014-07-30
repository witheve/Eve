var eve = {};
var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: [{type: "button"}]}};
var d = React.DOM;

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
      data.activeElement = {elem: this, box: e.target.getBoundingClientRect()};
      dirty();
      e.preventDefault();
    }
  },
  onDrop: function(e) {
    if(!e.defaultPrevented) {
      var type = e.dataTransfer.getData("tool");
      var elem = {type: type};
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
  onMouseOver: function(e) {
    data.activeElement = {elem: this, box: e.target.getBoundingClientRect()};
    dirty();
  }
}

comps.elements = {
  button: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "button!"};
    },
    render: function() {
      return d.a({className: "button", onMouseOver: this.onMouseOver}, this.state.content);
    }
  }),

  text: React.createClass({
    mixins: [mix.element],
    getInitialState: function() {
      return {content: "some text"};
    },
    render: function() {
      return d.span({className: "text", onMouseOver: this.onMouseOver}, this.state.content);
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
                d.li({draggable: "true",
                      onDragStart: handler("div")}, "div"),
                d.li({draggable: "true",
                      onDragStart: handler("text")}, "text")
               );
  }
});

comps.uiCanvas = React.createClass({
  mixins: [mix.container],
  getInitialState: function() {
    return {width: "1280px",
            elements: [{type: "button"}]};
  },
  render: function() {
    return d.div({className: "ui-canvas"},
                 d.div({className: "canvas"},
                       d.div({className: "design-frame",
                              style: {width: this.state.width},
                              onDrop: this.onDrop,
                              onDragOver: this.onDragOver},
                             this.getElems()
                            )
                      )
                );
  }
});

comps.activeElement = React.createClass({
  getInitialState: function() {
    return {
      top: 0,
      left: 0,
      height: 0,
      width: 0
    };
  },
  render: function() {
    if(!this.props.box) {
      return d.div({className: "active-element-overlay", style: {display: "none"}});
    }
    return d.div({className: "active-element-overlay",
                  style: {
                          top: this.props.box.top - 4,
                          left: this.props.box.left - 4,
                          width: this.props.box.width + 8,
                          height: this.props.box.height + 8}});
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
