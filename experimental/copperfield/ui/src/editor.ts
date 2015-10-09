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

      let diffs;
      if(this.change.changeSet.length) {
        diffs = Api.ixer.applyChangeSet(this.change.changeSet);
      }
      if(this.change.changeSet.length || this.commands.length) {
        Client.sendToServer(Api.toDiffs(diffs || {}), this.commands);
      }

      if(this.rerender) {
        render();
      }
      return this;
    }
  }

  var dispatches:{[evt:string]: (info:any) => DispatchEffect} = {
    setName: function({name, id}:{name:string, id?:string}) {
      let effect = DispatchEffect.from(this);
      if(id) {
        effect.change.remove("display name", {"display name: id": id})
          .add("display name", {"display name: id": id, "display name: name": name});
      } else {
        // @FIXME: Use activePage / activeComponent to determine what state to set when id is not passed in.
        localState.query.name = name;
      }
      return effect;
    },
    remove: function({type, id}:{type: string, id: string}) {
      let effect = DispatchEffect.from(this);
      if(id && type) effect.change.removeWithDependents(type, id);
      return effect;
    },
    editQuery: function({editing}:{editing:string}) {
      let effect = DispatchEffect.from(this);
      localState.query.editing = editing;
      return effect;
    },
    queryFromView: function({viewId}:{viewId:string}) {
      let effect = DispatchEffect.from(this);
      localState.query.reified = localState.query.ast = localState.query.msg = undefined;
      localState.query.name = Api.get.name(viewId) || "Untitled Search";
      localState.query.id = viewId || undefined;

      if(viewId) {
        localState.query.reified = Parsers.query.fromView(viewId);
        // @FIXME: Check Query AST table. If it exists and reifying it matches reified in structure use that instead.
        localState.query.ast = Parsers.query.unreify(localState.query.reified);
      }
      return effect;
    },
    parseQuery: function({query, prev}:{query:string, prev?:Parsers.QueryIR}) {
      let effect = DispatchEffect.from(this);
      localState.query.msg = undefined;
      try {
        localState.query.ast = Parsers.query.parse(query);
        localState.query.reified = Parsers.query.reify(localState.query.ast, prev);
      } catch(err) {
        localState.query.reified = undefined;
        if(err.name === "Parse Error") localState.query.msg = `${err}`;
        else {
          console.warn(err.stack);
          throw err;
        }
      }

      effect.rerender = true;
      return effect;
    },
    viewFromQuery: function({query}:{query:Query}) {
      let effect = DispatchEffect.from(this);
      let reified = query.reified;
      if(query.id) effect.change.removeWithDependents("view", {"view: view": query.id})
      effect.change.add("view", {"view: view": query.id, "view: kind": "join"})
        .add("display name", query.name || "Untitled Search");

      for(let source of reified.sources) { // Sources
        effect.change.add("source", {"source: source": source.source, "source: source view": source.sourceView});
        if(source.negated) effect.change.add("negated source");
        if(source.chunked) effect.change.add("chunked source");
        if(source.sort) effect.change.addEach("sorted field", Api.resolve("sorted field", source.sort));
      }

      let fieldIx = 0;
      for(let varId in reified.variables) { // Variables
        let variable = reified.variables[varId];
        effect.change.add("variable", {"variable: variable": varId})
          .addEach("binding", Api.resolve("binding", variable.bindings));
        if(variable.ordinals) effect.change.addEach("ordinal binding", Api.wrap("ordinal binding: source", variable.ordinals));
        if(variable.value !== undefined) effect.change.add("constant binding", variable.value);
        if(variable.selected) effect.change.add("field", {"field: field": variable.selected, "field: kind": "output"})
          .add("display name", variable.alias || "")
          .add("display order", fieldIx++)
          .add("select");
      }

      query.id = effect.change.context["view: view"];
      return effect;
    }
  };
  export function dispatch(evt:string, info:any, rentrant?:boolean):DispatchEffect {
    if(!dispatches[evt]) {
      console.error("Unknown dispatch:", evt, info);
      return new DispatchEffect();
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
    var dispatch = Editor.dispatch;
    var info = Api.clone(elem);
    info.id = undefined;\n`;
    for(let cmd of commands.split(";")) {
      code += "    " + cmd.trim() + ";\n";
    }
    if(dispatches.length) {
      let names = dispatches.split(/[;|,]/);
      let multi = false;
      for(let name of names) {
        code += (multi ? "\n      ." : "\n    ") + `dispatch("${name.trim()}", info)`;
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
   ?view is named ?name
   # ?ord by ?name descending
   ?ord < \`20\`
  `;

  function root():Element {
    let resultPanes:Ui.Pane[] = [
      {
        title: "AST",
        id: "result-ast",
        content: {t: "pre", c: "ast", text: JSON.stringify(localState.query.ast, null, 2)}
      },
      {
        title: "Reified",
        id: "result-reified",
        content: {t: "pre", c: "reified", text: JSON.stringify(localState.query.reified, null, 2)}
      }
    ];

    let queryString = localState.query.editing;
    if(queryString === undefined) queryString = Parsers.query.unparse(localState.query.ast) || "";
    let queries = {"": "New Query"};
    for(let viewId of Api.extract("view: view", Api.ixer.find("view"))) {
      queries[viewId] = Api.get.name(viewId) || `<${viewId}>`;
    }

    return {children: [
      {text: "Copperfield - " + localState.query.id},
      Ui.row({children: [
        Ui.column({flex: 1, children: [
          Ui.row({children: [
            Ui.input({placeholder: "Untitled Search", text: localState.query.name, view: localState.query.id,
              blur: dispatchOnEvent("setName", "info.name = evt.target.textContent; info.id = elem.view")
            }),
            Ui.dropdown({options: queries, defaultOption: <any>localState.query.id,
              change: dispatchOnEvent("queryFromView", "info.viewId = evt.target.value")
            }),
            Ui.button({text: "compile", click: dispatchOnEvent("viewFromQuery", "info.query = localState.query")}),
            Ui.button({c: "ion-close", view: localState.query.id, click: dispatchOnEvent("remove; queryFromView", "info.type = 'view'; info.id = elem.view")})
          ]}),
          Ui.codeMirrorElement({c: "code", key: queryString, value: queryString,
            change: dispatchOnEvent("parseQuery", "info.query = evt.getValue(); info.prev = localState.query.reified"),
            focus: dispatchOnEvent("editQuery", "info.editing = elem.value"),
            blur: dispatchOnEvent("editQuery", "info.editing = undefined"),
          }),
          {t: "pre", c: "err", text: localState.query.msg},
          localState.query.id ? Ui.factTable({view: localState.query.id}) : undefined
        ]}),
        Ui.tabbedBox({flex: 1, panes: resultPanes, defaultTab: "result-reified"})
      ]})
    ]};
  }

  //---------------------------------------------------------------------------
  // Initialization
  //---------------------------------------------------------------------------
  interface Query {
    editing?: string // If we're editing, store the last set value to prevent MicroReact from considering the element dirty.
    name?: string
    id?: string
    ast?: Parsers.QueryAST
    reified?: Parsers.QueryIR
    msg?: string
  }
  // @FIXME: This should be moved into API once completed.
  interface LocalState {
    initialized: boolean

    activePage?: string
    activeComponent?: string

    query?: Query
  }
  export var localState:LocalState = {
    initialized: true,
    query: {name: "Untitled Query"}
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
    dispatch("parseQuery", {query: script}).done();
    render();
  }

  Client.afterInit(init);
}