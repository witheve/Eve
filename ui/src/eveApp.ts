/*---------------------------------------------------------
- Infrastructure for running an eve app standalone
---------------------------------------------------------*/
module dispatcher {
  declare var uiEditorRenderer;
  var renderer = uiEditorRenderer;
  document.body.appendChild(renderer.root);

  export var render = renderer.render;
  export var isApp = true;
}
