var App;
(function (App) {
    var dispatches = {};
    function dispatch(evt, info, rentrant) {
        if (!dispatches[evt]) {
            console.error("Unknown dispatch:", event, info);
            return;
        }
        else {
            var _a = dispatches[evt](info), _b = _a.rerender, rerender = _b === void 0 ? true : _b, changes = _a.changes, commands = _a.commands;
            if (rerender && !rentrant) {
                render();
            }
            return { rerender: rerender, changes: changes, commands: commands };
        }
    }
    App.dispatch = dispatch;
    function initRenderer() {
        var raw = new MicroReact.Renderer();
        App.renderer = new UiRenderer.UiRenderer(raw);
        document.body.appendChild(raw.content);
        window.addEventListener("resize", render);
    }
    function render() {
        App.renderer.queue(root);
    }
    function root() {
        return { text: "hello there, I am groot" };
    }
    App.localState = {
        initialized: true
    };
    function init() {
        if (!Api.localState.initialized) {
            Api.localState = App.localState;
            initRenderer();
            client.onReceive = function (changed, commands) {
                render();
            };
        }
        else {
            App.localState = Api.localState;
        }
        render();
    }
    App.init = init;
    client.afterInit(init);
})(App || (App = {}));
//# sourceMappingURL=app.js.map