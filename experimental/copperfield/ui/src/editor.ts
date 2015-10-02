module Editor {
  //---------------------------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------------------------

  class DispatchEffect {
    static inProgress = 0;

    static from(caller?):DispatchEffect {
      if(caller && caller instanceof DispatchEffect) return caller;
      DispatchEffect.inProgress++;
      return new DispatchEffect();
    }

    public rerender: boolean = true;
    public changes: Api.Change<any>[] = [];
    public commands: Api.Diff[] = [];
    public dispatch = dispatch;

    public done():DispatchEffect {
      DispatchEffect.inProgress--;
      let diffs = Api.toDiffs(this.changes);
      if(diffs.length) Api.ixer.handleDiffs(diffs);
      if(diffs.length || this.commands.length) {
        Client.sendToServer(diffs);
      }

      if(this.rerender) {
        render();
      }
      return this;
    }
  }

  var __handlers:{[evt:string]: MicroReact.Handler<Event> } = {};
  function dispatchOnEvent(evt) {
    return __handlers[name] || (__handlers[name] = (evt, elem) => dispatch(name, elem).done());
  }

  var dispatches:{[evt:string]: (info:{}) => DispatchEffect} = {
    createView: function({}) {
      let effect = DispatchEffect.from(this);
      return effect;
    }
  };
  export function dispatch(evt:string, info:any, rentrant?:boolean):DispatchEffect {
    if(!dispatches[evt]) {
      console.error("Unknown dispatch:", evt, info);
      return;
    }
    return dispatches[evt].call(this, info);
  }

  //---------------------------------------------------------------------------
  // Rendering
  //---------------------------------------------------------------------------
  type Element = MicroReact.Element;
  export var renderer:UiRenderer.UiRenderer;
  function initRenderer() {
    let raw = new MicroReact.Renderer();
    renderer = new UiRenderer.UiRenderer(raw);
    document.body.appendChild(raw.content);
    window.addEventListener("resize", render);
  }

  function render() {
    renderer.queue(root);
  }

  let script =
  `
   view ?view is a \`union\`
   view ?view is tagged ??tag
   + union tag ?tag.
  `;
  // `
  //   I've had it with these motherfucking ?a on this motherfucking ?vehicle.
  //   A(n) ?vehicle should *never* contain \`snakes\`
  //   + Too many ?a are on the ?vehicle
  // `;

  function root():Element {
    let parsed;
    let reified;
    let msg;
    try {
      let ast = Parsers.query.parse(script);
      parsed = JSON.stringify(ast, null, 2);
      reified = JSON.stringify(Parsers.query.reify(ast), null, 2);
    } catch(err) {
      if(err.name === "Parse Error") msg = `${err}`;
      else {
        console.warn(err.stack);
        throw err;
      }
    }

    let resultPanes:Ui.Pane[] = [
      {
        title: "AST",
        id: "result-ast",
        content: {t: "pre", c: "ast", text: parsed}
      },
      {
        title: "Reified",
        id: "result-reified",
        content: {t: "pre", c: "reified", text: reified}
      }
    ];

    return {children: [
      {text: "Copperfield"},
      Ui.row({children: [
        Ui.column({flex: 1, children: [
          Ui.button({text: "compile", click: recompile}),
          Ui.input({t: "pre", c: "code", flex: 1, text: script}),
          {t: "pre", c: "err", text: msg}
        ]}),
        Ui.tabbedBox({flex: 1, panes: resultPanes, defaultTab: "result-reified"})
      ]})
    ]};
  }

  function recompile(evt, elem) {
    script = document.querySelector(".code").textContent;
    render();
  }

  //---------------------------------------------------------------------------
  // Initialization
  //---------------------------------------------------------------------------
  // @FIXME: This should be moved into API once completed.
  interface LocalState {
    initialized: boolean
  }
  export var localState:LocalState = {
    initialized: true
  };

  export function init() {
    if(!Api.localState.initialized) {
      Api.localState = localState;
      initRenderer();
      Client.onReceive = function(changed, commands) {
        render();
      }
      Ui.onChange = render;
    } else {
      localState = Api.localState;
    }
    render();
  }

  Client.afterInit(init);
}