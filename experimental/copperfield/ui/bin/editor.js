var Editor;
(function (Editor) {
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
    Editor.dispatch = dispatch;
    function initRenderer() {
        var raw = new MicroReact.Renderer();
        Editor.renderer = new UiRenderer.UiRenderer(raw);
        document.body.appendChild(raw.content);
        window.addEventListener("resize", render);
    }
    function render() {
        Editor.renderer.queue(root);
    }
    var script = "\n    view ?view is a `union`\n    view ?view is tagged ?tag\n    + union tag ?tag\n  ";
    "\n    I've had it with these motherfucking ? on this motherfucking ?vehicle.\n    ?a should *never* contain `snakes`\n    Jen's number is $$foo\n    + Too many ?a are on the ?vehicle\n";
    function root() {
        var parsed;
        var reified;
        var prints = [];
        try {
            var ast = Parsers.query.parse(script);
            parsed = JSON.stringify(ast, null, 2);
            for (var _i = 0, _a = ast.sources; _i < _a.length; _i++) {
                var source = _a[_i];
                prints.push(Parsers.fingerprintSource(source.structure));
            }
            reified = JSON.stringify(Parsers.query.reify(ast), null, 2);
        }
        catch (err) {
            console.warn(err.stack);
            if (err.name === "Parse Error")
                parsed = "" + err;
            else
                throw err;
        }
        return { children: [
                { text: "hello there, I am groot" },
                { t: "pre", text: script },
                { text: "==>" },
                { t: "pre", text: parsed },
                { t: "pre", c: "fingerprints", text: prints.join("\n") },
                { t: "pre", c: "reified", text: reified }
            ] };
    }
    Editor.localState = {
        initialized: true
    };
    function init() {
        if (!Api.localState.initialized) {
            Api.localState = Editor.localState;
            initRenderer();
            client.onReceive = function (changed, commands) {
                render();
            };
        }
        else {
            Editor.localState = Api.localState;
        }
        render();
    }
    Editor.init = init;
    client.afterInit(init);
})(Editor || (Editor = {}));
//# sourceMappingURL=editor.js.map