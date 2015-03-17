var Drag = (function(document) {
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
        if(opts.onDragStart) { opts.onDragStart(evt); }
        this.setState({dragging: true});
      },
      _endDrag: function(evt) {
        console.log("endDrag");
        var opts = this._dragOpts;
        if(opts.onDragEnd) {
          opts.onDragEnd(evt);
        }
        this.setState({dragging: false});
      },
      wrapDraggable: function(attrs, opts) {
        opts = opts || {};
        if(attrs.onDragStart) { opts.onDragStart = attrs.onDragStart; }
        if(attrs.onDragEnd) { opts.onDragEnd = attrs.onDragEnd; }
        this._dragOpts = opts;
        attrs.draggable = true;
        attrs.onDragStart = this._startDrag;
        attrs.onDragEnd = this._endDrag;
        // attrs.onDrop = this._drop;
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
    }
  };

  // Initialize
  var clearPixel = document.createElement("canvas");
  clearPixel.id = "clearPixel";
  clearPixel.width = 1; clearPixel.height = 1;
  document.body.appendChild(clearPixel);
  console.log('hi');
  return {
    mixins: mixins
  };
})(window.document);
