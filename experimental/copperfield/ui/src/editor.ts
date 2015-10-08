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
    public change = new Api.StructuredChange(Api.ixer.changeSet());
    public commands: any[][] = [];
    public dispatch = dispatch;

    public done():DispatchEffect {
      DispatchEffect.inProgress--;

      if(this.change.changeSet.length) {
        Api.ixer.applyChangeSet(this.change.changeSet);
      }
      if(this.change.changeSet.length || this.commands.length) {
        Client.sendToServer(Api.toDiffs(this.change.changeSet), this.commands);
      }

      if(this.rerender) {
        render();
      }
      return this;
    }
  }

  var dispatches:{[evt:string]: (info:any) => DispatchEffect} = {
    parse: function({query}:{query:string}) {
      let effect = DispatchEffect.from(this);
      localState.ast = localState.reified = localState.msg = undefined;
      try {
        localState.ast =  Parsers.query.parse(query);
        localState.reified = Parsers.query.reify(localState.ast);
      } catch(err) {
        if(err.name === "Parse Error") localState.msg = `${err}`;
        else {
          console.warn(err.stack);
          throw err;
        }
      }

      effect.rerender = true;
      return effect;
    },
    createViewFromQuery: function({query}:{query:Parsers.ReifiedQuery}) {
      let effect = DispatchEffect.from(this);
      effect.change.add("view", "join")
        .add("display name", "Untitled Search");

      for(let source of query.sources) { // Sources
        effect.change.add("source", {"source: source": source.source, "source: source view": source.sourceView});
        if(source.negated) effect.change.add("negated source");
        if(source.chunked) effect.change.add("chunked source");
        if(source.sort) effect.change.addEach("sorted field", Api.resolve("sorted field", source.sort));
      }

      let fieldIx = 0;
      for(let varId in query.variables) { // Variables
        let variable = query.variables[varId];
        effect.change.add("variable")
          .addEach("binding", Api.resolve("binding", variable.bindings));
        if(variable.ordinals) effect.change.addEach("ordinal binding", Api.wrap("ordinal binding: source", variable.ordinals));
        if(variable.value !== undefined) effect.change.add("constant binding", variable.value);
        if(variable.selected) effect.change.add("field", "output")
          .add("display name", variable.alias || "")
          .add("display order", fieldIx++)
          .add("select");
      }

      localState.view = effect.change.context["view: view"];
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


  var __handlers:{[key:string]: MicroReact.Handler<Event> } = {};
  function dispatchOnEvent(dispatches:string, commands?:string) {
    let key = "";
    if(commands) key += commands;
    if(dispatches) key += key ? " | " + dispatches : dispatches;
    if(__handlers[key]) return __handlers[key];

    let code = `
    var localState = Api.localState;
    var dispatch = Editor.dispatch;\n`;
    for(let cmd of commands.split(";")) {
      code += "    " + cmd.trim() + ";\n";
    }
    if(dispatches.length) {
      let names = dispatches.split(/;,/);
      let multi = false;
      for(let name of names) {
        code += multi ? "\n      ." : "\n    " + `dispatch("${name}", elem)`;
        multi = true;
      }
      code += ".done();\n";
    }

    return __handlers[key] = <MicroReact.Handler<Event>>new Function("evt", "elem", code);
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
   view ?view is a ?
   ?view is named ?name
   # ?ord by ?name descending
   ?ord < \`10\`
  `;
  //`
  // view ?view is a \`union\`
  // view ?view is tagged ??tag
  // # ? by ?view desc
  //`;
  // `
  //   I've had it with these motherfucking ?a on this motherfucking ?vehicle.
  //   A(n) ?vehicle should *never* contain \`snakes\`
  //   + Too many ?a are on the ?vehicle
  // `;

  function root():Element {
    let resultPanes:Ui.Pane[] = [
      {
        title: "AST",
        id: "result-ast",
        content: {t: "pre", c: "ast", text: JSON.stringify(localState.ast, null, 2)}
      },
      {
        title: "Reified",
        id: "result-reified",
        content: {t: "pre", c: "reified", text: JSON.stringify(localState.reified, null, 2)}
      }
    ];

    return {children: [
      {text: "Copperfield"},
      Ui.row({children: [
        Ui.column({flex: 1, children: [
          Ui.button({text: "compile", click: dispatchOnEvent("createViewFromQuery", "elem.query = localState.reified")}),
          Ui.codeMirrorElement({c: "code", value: script, change: dispatchOnEvent("parse", "elem.query = evt.getValue()")}),
          {t: "pre", c: "err", text: localState.msg},
          localState.view ? Ui.factTable({view: localState.view}) : undefined
        ]}),
        Ui.tabbedBox({flex: 1, panes: resultPanes, defaultTab: "result-reified"})
      ]})
    ]};
  }

  //---------------------------------------------------------------------------
  // Initialization
  //---------------------------------------------------------------------------
  // @FIXME: This should be moved into API once completed.
  interface LocalState {
    initialized: boolean

    activePage?: string
    activeComponent?: string
    ast?
    reified?
    msg?
    view?: string
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
    dispatch("parse", {query: script}).done();
    render();
  }

  Client.afterInit(init);
}