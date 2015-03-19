var Drag = (function(document) {
  function reactFactory(obj) {
    return React.createFactory(React.createClass(obj));
  }

  var mixins = {
    draggable: {
      _startDrag: function(evt) {
        var opts = this._dragOpts;

        for(var dataType in opts.data) {
          if(!opts.data.hasOwnProperty(dataType)) { continue; }
          evt.dataTransfer.setData(dataType, opts.data[dataType]);
        }
        if(opts.image === null || opts.image === false) {
          document.body.appendChild(clearPixel);
          opts.image = clearPixel;
        }
        if(opts.image) { evt.dataTransfer.setDragImage(clearPixel, 0, 0); }
        if(opts.effect) { evt.dataTransfer.effectAllowed = opts.effect; }

        var el = this.getDOMNode();
        var top = parseFloat(el.style.top);
        var left = parseFloat(el.style.left);
        var offset = [evt.clientX - left, evt.clientY - top];
        if(opts.onDragStart) { opts.onDragStart(evt, offset); }
        this.setState({dragging: true, dragOffset: offset});
      },
      _endDrag: function(evt) {
        var opts = this._dragOpts;
        if(opts.onDragEnd) {
          opts.onDragEnd(evt, this.state.dragOffset);
        }
        this.setState({dragging: false, dragOffset: undefined});
      },
      _dragging: function(evt) {
        var opts = this._dragOpts;
        if(opts.onDrag) {
          opts.onDrag(evt, this.state.dragOffset);
        }
      },
      wrapDraggable: function(attrs, opts) {
        opts = opts || {};
        if(attrs.onDragStart) { opts.onDragStart = attrs.onDragStart; }
        if(attrs.onDragEnd) { opts.onDragEnd = attrs.onDragEnd; }
        if(attrs.onDrag) { opts.onDrag = attrs.onDrag; }
        this._dragOpts = opts;
        attrs.draggable = true;
        attrs.onDragStart = this._startDrag;
        attrs.onDragEnd = this._endDrag;
        attrs.onDrag = this._dragging;
        return attrs;
      }
    },
    dropzone: {
      _getBestType: function(types, accepts) {
        for(var ix in types) {
          var type = types[ix];
          if(accepts.indexOf(type) !== -1) {
            return type;
          }
        }
      },
      _onDragOver: function(evt) {
        var opts = this._dropzoneOpts;
        var dT = evt.dataTransfer;
        var type = this._getBestType(dT.types, opts.accepts);
        if(!type) { return; }
        evt.preventDefault();
        if(opts.onDragOver) { opts.onDragOver(evt, type); }
      },
      _onDrop: function(evt) {
        var opts = this._dropzoneOpts;
        var type = this._getBestType(dT.types, opts.accepts);
        if(!type) { return; }
        evt.preventDefault();
        if(opts.onDrop) { opts.onDrop(evt, type); }
      },
      wrapDropzone: function(attrs, opts) {
        opts = opts || {};
        if(!opts.accepts) { throw new Error("Must specify list of draggable types for the dropzone to accept."); }
        if(attrs.onDragOver) { opts.onDragOver = attrs.onDragOver; }
        if(attrs.onDrop) { opts.onDrop = attrs.onDrop; }
        this._dropzoneOpts = opts;
        attrs.onDragOver = this._onDragOver;
        return attrs;
      }
    },
    resizable: {
      _handles: {
        //n: {axis: "y", pos: [0.5, 0], dir: "n"},
        //ne: {axis: "xy", pos: [1, 0], dir: "ne"},
        //e: {axis: "x", pos: [1, 0.5], dir: "e"},
        se: {axis: "xy", pos: [1, 1], dir: "se"},
        //s: {axis: "y", pos: [0.5, 1], dir: "s"},
        //sw: {axis: "xy", pos: [0, 1], dir: "sw"},
        //w: {axis: "x", pos: [0, 0.5], dir: "w"},
        //nw: {axis: "xy", pos: [0, 0], dir: "nw"}
      },
      _startResize: function(evt) {
        var rect = this.getDOMNode().getBoundingClientRect();
        this.setState({resizing: true, _initialSize: [rect.width, rect.height]});
      },
      _resizing: function(dir, axis, delta) {
        var opts = this._resizeOpts;
        var initial = this.state._initialSize;
        var size = [initial[0] + delta[0], initial[1] + delta[1]];
        if(opts.onResize) {
          opts.onResize(size, dir, axis, delta);
        }
      },
      _endResize: function(evt) {
        this.setState({resizing: false, _initialSize: undefined});
      },
      wrapResizableJsml: function(el, opts) {
        if(el.constructor !== Array) { throw new Error("wrapResizableJsml() needs a JSML node to inject  handles into."); }
        opts = opts || {};
        this._resizeOpts = opts;
        var attrs = {};
        if(typeof el[1] === "object" && el[1].constructor === Object) {
          attrs = el[1];
        } else {
          el.splice(1, 0, attrs);
        }
        if(attrs.onResize) {
          opts.onResize = attrs.onResize;
        }
        for(var h in this._handles) {
          if(!this._handles.hasOwnProperty(h)) { continue; }
          var handle = this._handles[h];
          handle.parent = this;
          handle.onDrag = this._resizing;
          handle.onDragStart = this._startResize;
          handle.onDragEnd = this._endResize;
          handle.component = dragHandle(handle);
          el.push(handle.component);

        }

        return el;
      }
    }
  };

  var dragHandle = reactFactory({
    mixins: [mixins.draggable],
    getInitialState: function() {
      return {parentRect: this.props.parent.getDOMNode().getBoundingClientRect()};
    },
    dragStart: function(evt) {
      this.props.onDragStart(this.props.dir, this.props.axis);
      this.setState({parentRect: this.props.parent.getDOMNode().getBoundingClientRect()});
      //evt.stopPropagation();
    },
    dragEnd: function(evt) {
      this.props.onDragEnd(this.props.dir, this.props.axis);
      //evt.stopPropagation();
    },
    dragging: function(evt) {
      var delta = [0, 0];
      var rect = evt.target.getBoundingClientRect();
      if(this.props.axis.indexOf("x") !== -1) { delta[0] = evt.clientX - rect.left; } // @TODO: + 1/2 size?
      if(this.props.axis.indexOf("y") !== -1) { delta[1] = evt.clientY - rect.top; } // @TODO: + 1/2 size?
      if(this.props.dir.indexOf("w") !== -1) { delta[0] = -delta[0] }
      if(this.props.dir.indexOf("n") !== -1) { delta[1] = -delta[1] }

      this.props.onDrag(this.props.dir, this.props.axis, delta);
      evt.stopPropagation();
    },
    render: function() {
      var size = 8;
      var style = {};
      var rect = this.state.parentRect;
      var centerX = "50%"; //rect.width / 2 - size / 2;
      var centerY = "50%"; //rect.height / 2 - size / 2;
      var pos = this.props.pos;
      if(pos[0] === 0) { style.left = -size; }
      if(pos[0] === 0.5) { style.left = centerX; }
      if(pos[0] === 1) {style.right = -size;}

      if(pos[1] === 0) { style.top = -size; }
      if(pos[1] === 0.5) { style.top = centerY; }
      if(pos[1] === 1) {style.bottom = -size;}

      // @TODO: Most recently hovered tile should have higher z-index while editing.
      // @TODO: Only hovered tiles should be resizable
      var attrs = {
        className: "drag-handle " + this.props.dir,
        key: this.props.dir,
        style: style,
        onDrag: this.dragging,
        onDragStart: this.dragStart,
        onDragEnd: this.dragEnd
      };
      attrs = this.wrapDraggable(attrs);
      return JSML(
        ["div", attrs]
      );
    }
  });

  // Initialize
  var clearPixel = document.createElement("canvas");
  clearPixel.id = "clearPixel";
  clearPixel.width = clearPixel.height = 1;
  return {
    mixins: mixins
  };
})(window.document);
