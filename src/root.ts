import {Renderer} from "./microReact"

function root() {
  return {text: "hello world"};
}

function render() {
  if(!appRenderer || appRenderer.queued) return;
  appRenderer.queued = true;
  requestAnimationFrame(function() {
    let stats:any = {};
    let start = performance.now();

    stats.root = (performance.now() - start).toFixed(2);
    let ui = root();
    if (+stats.root > 10) console.info("Slow root: " + stats.root);

    start = performance.now();
    appRenderer.render([ui]);
    stats.render = (performance.now() - start).toFixed(2);
    // stats.update = updateStat.toFixed(2);

    appRenderer.queued = false;
  });
}

var appRenderer;
function init() {
  appRenderer = new Renderer();
  document.body.appendChild(appRenderer.content);
  render();
}

init();
