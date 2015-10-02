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
  //`
  //  view ?view is a \`union\`
  //  view ?view is tagged ?
  //  + union tag ?tag.
  //`;
  `
    I've had it with these motherfucking ?a on this motherfucking ?vehicle.
    A(n) ?vehicle should *never* contain \`snakes\`
    + Too many ?a are on the ?vehicle
`;

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

    return {children: [
      {text: "hello there, I am groot"},
      {t: "pre", text: script},
      {text: "==>"},
      {t: "pre", c: "err", text: msg},
      {t: "pre", c: "ast", text: parsed},
      {t: "pre", c: "reified", text: reified}

    ]};
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
    } else {
      localState = Api.localState;
    }
    render();
  }

  Client.afterInit(init);
}