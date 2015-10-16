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
      }

      // @FIXME: Use activePage / activeComponent to determine what state to set when id is not passed in.
      localState[localState.activeKind].name = name;
      return effect;
    },
    setTags: function({tags, id}:{tags:string[], id?:string}) {
      let effect = DispatchEffect.from(this);
      console.log("setTags", tags, id);
      if(!tags) return effect;
      if(id) {
        effect.change.remove("tag", {"tag: view": id})
          .addEach("tag", tags.map((tag) => {return {"tag: view": id, "tag: tag": tag.trim()}}));
      }

      // @FIXME: Use activePage / activeComponent to determine what state to set when id is not passed in.
      localState[localState.activeKind].tags = tags;
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
    editUi: function({editing}:{editing:string}) {
      let effect = DispatchEffect.from(this);
      localState.ui.editing = editing;
      return effect;
    },
    loadQuery: function({viewId}:{viewId:string}) {
      let effect = DispatchEffect.from(this);
      localState.query.reified = localState.query.ast = localState.query.msg = undefined;
      localState.query.name = Api.get.name(viewId) || undefined;
      localState.query.tags = Api.get.tags(viewId) || [];
      localState.query.id = viewId || undefined;

      if(viewId) {
        localState.query.reified = Parsers.query.fromView(viewId);
        let ast = Api.ixer.findOne("ast cache", {"ast cache: id": viewId, "ast cache: kind": "query"});
        if(ast) localState.query.ast = JSON.parse(ast["ast cache: ast"]);
        else localState.query.ast = Parsers.query.unreify(localState.query.reified);
      }
      return effect;
    },
    parseQuery: function({query, prev}:{query:string, prev?:Parsers.QueryIR}) {
      let effect = DispatchEffect.from(this);
      localState.query.msg = undefined;
      try {
        localState.query.ast = Parsers.query.parse(query);
        localState.query.reified = Parsers.query.reify(localState.query.ast, prev);
        localState.query.id = localState.query.reified.id;

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
    compileQuery: function({query}:{query:Query}) {
      let effect = DispatchEffect.from(this);
      let reified = query.reified;
      if(!reified) throw new Error("Cannot compile unreified query.");
      if(query.id) {
        effect.change.removeWithDependents("view", {"view: view": query.id})
          .removeWithDependents("ast cache", {"ast cache: id": query.id});
      }
      effect.change.add("view", {"view: view": query.id, "view: kind": "join"})
        .add("display name", query.name || "Untitled Search");

      for(let source of reified.sources) { // Sources
        effect.change.add("source", {"source: source": source.source, "source: source view": source.sourceView});
        if(source.negated) effect.change.add("negated source");
        if(source.chunked) {
          effect.change.add("chunked source");
          for(let field of source.fields) {
            if(!field.grouped) effect.change.add("grouped field", {"grouped field: field": field.field});
          }
        }
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
      if(query.tags) effect.dispatch("setTags", {id: query.id, tags: query.tags});
      if(query.ast)
        effect.change.add("ast cache", {"ast cache: id": query.id, "ast cache: kind": "query", "ast cache: ast": JSON.stringify(query.ast)});
      return effect;
    },

    loadUi: function({elementId:elemId}:{elementId:string}) {
      let effect = DispatchEffect.from(this);
      localState.ui.reified = localState.ui.ast = localState.ui.msg = undefined;
      localState.ui.name = Api.get.name(elemId) || undefined;
      localState.ui.tags = Api.get.tags(elemId) || [];
      localState.ui.id = elemId || undefined;

      if(elemId) {
        localState.ui.reified = Parsers.ui.fromElement(elemId);
        let ast = Api.ixer.findOne("ast cache", {"ast cache: id": elemId, "ast cache: kind": "ui"});
        if(ast) localState.ui.ast = JSON.parse(ast["ast cache: ast"]);
        else localState.ui.ast = Parsers.ui.unreify(localState.ui.reified);
      }
      return effect;
    },
    parseUi: function({ui, prev}:{ui:string, prev?:Parsers.UiIR}) {
      let effect = DispatchEffect.from(this);
      localState.ui.msg = undefined;
      try {
        localState.ui.ast = Parsers.ui.parse(ui);
        localState.ui.reified = Parsers.ui.reify(localState.ui.ast, prev);
      } catch(err) {
        localState.ui.reified = undefined;
        if(err.name === "Parse Error") localState.ui.msg = `${err}`;
        else {
          console.warn(err.stack);
          throw err;
        }
      }

      return effect;
    },
    compileUi: function({ui}:{ui:Ui}) {
      let effect = DispatchEffect.from(this);
      let reified = ui.reified;
      if(!reified) throw new Error("Cannot compile unreified ui.");

      if(ui.id) {
        let prev = Parsers.ui.fromElement(ui.id);
        for(let viewId in prev.boundQueries) {
          effect.change.removeWithDependents("view", viewId).clearContext();
        }
        for(let elem of [prev.root].concat(prev.elements)) {
          effect.change.removeWithDependents("uiElement", elem.element)
            .removeWithDependents("ast cache", {"ast cache: id": elem.element}).clearContext();
        }
      }

      let ix = 0;
      for(let queryId in reified.boundQueries) {
        let query:Query = {id: queryId, name: `${ui.name} bound view ${ix++}`, reified: reified.boundQueries[queryId]};
        effect.dispatch("compileQuery", {query}).change.clearContext();
      }

      if(ui.name) reified.root.name = ui.name;

      for(let elem of [reified.root].concat(reified.elements)) {
        effect.change.add("uiElement", Api.resolve("uiElement", {"element": elem.element, "tag": elem.tag, "parent": elem.parent || "", ix: elem.ix}));
        if(elem.name) effect.change.add("display name", elem.name);
        if(elem.boundView) effect.change.add("uiElementBinding", {"uiElementBinding: view": elem.boundView});
        for(let prop in elem.attributes)
          effect.change.add("uiAttribute", {"uiAttribute: property": prop, "uiAttribute: value": elem.attributes[prop]});
        for(let prop in elem.boundAttributes)
          effect.change.add("uiAttributeBinding", {"uiAttributeBinding: property": prop, "uiAttributeBinding: field": elem.boundAttributes[prop]});
        for(let field in elem.bindings)
          effect.change.add("uiScopedBinding", {"uiScopedBinding: field": field, "uiScopedBinding: scoped field": elem.bindings[field]});
      }

      ui.id = reified.root.element;
      if(ui.tags) effect.dispatch("setTags", {id: ui.id, tags: ui.tags});
      // @TODO: Better to dice this up and store sub-asts for each sub-element as well.
      if(ui.ast)
        effect.change.add("ast cache", {"ast cache: id": ui.id, "ast cache: kind": "ui", "ast cache: ast": JSON.stringify(ui.ast)});
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
  function dispatchOnEvent(dispatches:string, commands?:string, debounce?:number) {
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
    __handlers[key] = <MicroReact.Handler<Event>>new Function("evt", "elem", code);

    if(debounce) {
      __handlers[key] = Api.debounce(debounce, __handlers[key]);
    }

    return __handlers[key];
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

  var rootPanes:Ui.Pane[] = [
    {title: "Query", id: "root-query", content: queryEditor},
    {title: "Ui", id: "root-ui", content: uiEditor},
  ];
  function root():Element {
    return {children: [
      {text: "Copperfield - " + localState.query.id},
      Ui.tabbedBox({id: "root-workspace", panes: rootPanes, tabChange: switchEditor})
    ]};
  }

  // @FIXME: Hack
  function switchEditor(evt, elem) {
    if(elem.tab === "root-query") localState.activeKind = "query";
    else if(elem.tab === "root-ui") localState.activeKind = "ui";
    else throw new Error(`Unknown kind: '${elem.tab}'`);
    dispatch("HACK HACK HACK", undefined).done();
  }

  var queryInspectorPanes:Ui.Pane[] = [
    {
      title: "AST",
      id: "result-ast",
      content: () => {return {t: "pre", c: "ast", text: JSON.stringify(localState.query.ast, null, 2)}}
    },
    {
      title: "Reified",
      id: "result-reified",
      content: () => {return {t: "pre", c: "reified", text: JSON.stringify(localState.query.reified, null, 2)}}
    }
  ];
  function queryEditor():Element {
    let queryName = localState.query.name || Api.get.name(localState.query.id);
    let queryString = localState.query.editing;
    if(queryString === undefined) queryString = Parsers.query.unparse(localState.query.ast) || "";
    let queries = {"": "New Query"};
    for(let viewId of Api.extract("view: view", Api.ixer.find("view"))) {
      queries[viewId] = Api.get.name(viewId) || `<${viewId}>`;
    }
    let tags = (localState.query.tags || []).join(", ");
    if(localState.query.id) tags = Api.get.tags(localState.query.id).join(", ");

    return Ui.row({children: [
      Ui.column({flex: 1, children: [
        Ui.row({children: [
          Ui.input({placeholder: "Untitled Search", text: queryName, view: localState.query.id,
            blur: dispatchOnEvent("setName", "info.name = evt.target.textContent; info.id = elem.view")
          }),
          Ui.input({placeholder: "tags", text: tags, view: localState.query.id,
            blur: dispatchOnEvent("setTags", "info.tags = (evt.target.textContent || '').split(', '); info.id = elem.view")
          }),
          Ui.dropdown({options: queries, defaultOption: <any>localState.query.id,
            change: dispatchOnEvent("loadQuery", "info.viewId = evt.target.value")
          }),
          Ui.button({text: "compile", click: dispatchOnEvent("compileQuery", "info.query = localState.query")}),
          Ui.button({c: "ion-close", view: localState.query.id, click: dispatchOnEvent("remove; loadQuery", "info.type = 'view'; info.id = elem.view")})
        ]}),
        Ui.codeMirrorElement({c: "code", id: "query-code-editor", value: queryString,
          change: dispatchOnEvent("parseQuery", "info.query = evt.getValue(); info.prev = localState.query.reified", 66),
          focus: dispatchOnEvent("editQuery", "info.editing = elem.value"),
          blur: dispatchOnEvent("editQuery", "info.editing = undefined"),
        }),
        {t: "pre", c: "err", text: localState.query.msg},
        localState.query.id ? Ui.factTable({view: localState.query.id}) : undefined
      ]}),
      Ui.tabbedBox({id: "query-results", flex: 1, panes: queryInspectorPanes, defaultTab: "result-reified"})
    ]});
  }

  var uiInspectorPanes:Ui.Pane[] = [
    {
      title: "AST",
      id: "result-ast",
      content: () => {return {t: "pre", c: "ast", text: JSON.stringify(localState.ui.ast, null, 2)}}
    },
    {
      title: "Reified",
      id: "result-reified",
      content: () => {return {t: "pre", c: "reified", text: JSON.stringify(localState.ui.reified, null, 2)}}
    }
  ];
  function uiEditor():Element {
    let root = localState.ui.id;
    let uiName = localState.ui.name || Api.get.name(root);
    let uiString = localState.ui.editing;
    if(uiString === undefined) uiString = Parsers.ui.unparse(localState.ui.ast) || "";

    let elems = {"": "New Ui"};
    for(let elemId of Api.extract("uiElement: element", Api.ixer.find("uiElement"))) {
      elems[elemId] = Api.get.name(elemId) || `<${elemId}>`;
    }
    let tags = (localState.ui.tags || []).join(", ");
    if(localState.ui.id) tags = Api.get.tags(localState.ui.id).join(", ");

    return Ui.row({children: [
      Ui.column({flex: 1, children: [
        Ui.row({children: [
          Ui.input({placeholder: "Untitled Ui", text: uiName, elem: root, //localState.ui.id, // @FIXME: Need a way to refer to whole ui entity.
            blur: dispatchOnEvent("setName", "info.name = evt.target.textContent; info.id = elem.elem")
          }),
          Ui.input({placeholder: "tags", text: tags, view: localState.query.id,
            blur: dispatchOnEvent("setTags", "info.tags = (evt.target.textContent || '').split(', '); info.id = elem.view")
          }),
          Ui.dropdown({options: elems, defaultOption: root,
            change: dispatchOnEvent("loadUi", "info.elementId = evt.target.value")
          }),
          Ui.button({text: "compile", click: dispatchOnEvent("compileUi", "info.ui = localState.ui")}),
          Ui.button({c: "ion-close", elem: root, click: dispatchOnEvent("remove; loadUi", "info.type = 'uiElement'; info.id = elem.elem")})
        ]}),
        Ui.codeMirrorElement({c: "code", id: "ui-code-editor", value: uiString,
          change: dispatchOnEvent("parseUi", "info.ui = evt.getValue(); info.prev = localState.ui.reified", 66),
          focus: dispatchOnEvent("editUi", "info.editing = elem.value"),
          blur: dispatchOnEvent("editUi", "info.editing = undefined"),
        }),
        {t: "pre", c: "err", text: localState.ui.msg},
        {c: "results", children: root ? renderer.compile([root]) : undefined}
      ]}),
      Ui.tabbedBox({id: "ui-results", flex: 1, panes: uiInspectorPanes, defaultTab: "result-reified"})
    ]});
  }

  //---------------------------------------------------------------------------
  // Initialization
  //---------------------------------------------------------------------------
  interface Query {
    editing?: string // If we're editing, store the last set value to prevent MicroReact from considering the element dirty.
    name?: string
    tags?: string[]
    id?: string
    ast?: Parsers.QueryAST
    reified?: Parsers.QueryIR
    msg?: string
  }
  interface Ui {
    editing?: string
    name?: string
    tags?: string[]
    id?: string
    ast?: Parsers.UiAST
    reified?: Parsers.UiIR
    msg?: string
  }
  // @FIXME: This should be moved into API once completed.
  interface LocalState {
    initialized: boolean

    activePage?: string
    activeComponent?: string
    activeKind?: string //hack

    query?: Query
    ui?: Ui
  }
  export var localState:LocalState = {
    initialized: true,
    activeKind: "query",
    query: {},
    ui: {}
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
    dispatch("parseQuery", {query: `
?view is named ?name
# ?ord by ?name descending
?ord < \`20\`
?foo $= (\`5\` * (\`3\` + \`1\`)) / \`2\``
    })
    .dispatch("parseUi", {ui: `
div view
  ~ view ?view is a ?kind
  div view-meta
    span
      - text: ?view
    span
      - text: \`is a\`
    span
      - text: ?kind
  div view-name
    ~ ?view is named ?name
    ~ \`named \` concat ?name = ?text
    - text: ?text`
    }).done();
    render();
  }

  Client.afterInit(init);
}