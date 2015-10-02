module Editor {
  //---------------------------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------------------------
  interface DispatchEffects {
    rerender?:boolean,
    changes?:Api.Change<any>[],
    commands?:Api.Diff[]
  }
  var dispatches:{[evt:string]: (info:{}) => DispatchEffects} = {

  };
  export function dispatch(evt:string, info:any, rentrant?:boolean):DispatchEffects {
    if(!dispatches[evt]) {
      console.error("Unknown dispatch:", event, info);
      return;
    } else {
      let {rerender = true, changes, commands} = dispatches[evt](info);
      if(rerender && !rentrant) {
        render();
      }
      return {rerender, changes, commands};
    }
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

  let script = `
    view ?view is a \`union\`
    view ?view is tagged ?tag
    + union tag ?tag
  `;
  `
    I've had it with these motherfucking ? on this motherfucking ?vehicle.
    ?a should *never* contain \`snakes\`
    Jen's number is $$foo
    + Too many ?a are on the ?vehicle
`;

  function root():Element {
    let parsed;
    let reified;
    let prints = [];
    try {
      let ast = Parsers.query.parse(script);
      parsed = JSON.stringify(ast, null, 2);
      for(let source of ast.sources) {
        prints.push(Parsers.fingerprintSource(source.structure));
      }
      reified = JSON.stringify(Parsers.query.reify(ast), null, 2);
    } catch(err) {
      console.warn(err.stack);
      if(err.name === "Parse Error") parsed = `${err}`;
      else throw err;
    }

    return {children: [
      {text: "hello there, I am groot"},
      {t: "pre", text: script},
      {text: "==>"},
      {t: "pre", text: parsed},
      {t: "pre", c: "fingerprints", text: prints.join("\n")},
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
      client.onReceive = function(changed, commands) {
        render();
      }
    } else {
      localState = Api.localState;
    }
    render();
  }

  client.afterInit(init);
}