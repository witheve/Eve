/*---------------------------------------------------------
- Infrastructure for running an eve app standalone
---------------------------------------------------------*/
var dispatcher = (function(microReact, api) {
  var renderer = window.uiEditorRenderer;
  document.body.appendChild(renderer.root);

  return {render: renderer.render,
          isApp: true};

})(microReact, api);
