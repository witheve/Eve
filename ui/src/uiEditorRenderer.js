var uiEditorRenderer = (function uiRenderer(document, api, microReact) {

  var ixer = api.ixer;

  /*-------------------------------------------------------
  - UI Editor Renderer
  - this renderer is a bit of a hack until we can easily
  - translate ui editor facts into views that generate
  - uiRenderedFactors
  -------------------------------------------------------*/

  var renderer = new microReact.Renderer();
  renderer.content.classList.add("rendered-program");
  document.body.appendChild(renderer.content);

  renderer.queued = false;
  function render() {
    if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        renderer.queued = false;
        renderer.render(rendererRoot());
      });
    }
  }

  function rendererRoot() {
    var layers = ixer.facts("uiComponentLayer");
    var layerItems = layers.map(function(layer) {
      var elements = ixer.index("uiLayerToElements")[layer[1]];
      var elementItems;
      if(elements) {
        var attrsIndex = ixer.index("uiStyleToAttrs");
        var stylesIndex = ixer.index("uiElementToStyles");
        elementItems = elements.map(function(element) {
          var elementId = element[1];
          var type = element[4];
          var left = element[5];
          var top = element[6];
          var right = element[7];
          var bottom = element[8];
          var elem = {c: "absolute", text: type, left: left, top: top, width: right - left, height: bottom - top};

          var attrs = [];
          var styles = stylesIndex[elementId] || [];
          for(var ix = 0, len = styles.length; ix < len; ix++) {
            var style = styles[ix];
            attrs.push.apply(attrs, attrsIndex[style[1]]);
          }

          if(attrs.length) {
            for(var i = 0, len = attrs.length; i < len; i++) {
              var curAttr = attrs[i];
              var name = curAttr[2];
              elem[name] = curAttr[3];
            }
          }
          return elem;
        });
      }
      return {c: "layer", children: elementItems};
    });
    return {children: layerItems};
  }

  return {
    render: render,
    root: renderer.content
  };
})(window.document, api, microReact);
