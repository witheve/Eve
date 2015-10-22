module Editor {
  //---------------------------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------------------------

  export class DispatchEffect {
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
    addEvent: function({elem, kind, key = ""}:{elem: string, kind: string, key: any}) {
      let effect = DispatchEffect.from(this);
      effect.change.add("event", {"event: event": localState.eventId++, "event: element": elem, "event: kind": kind, "event: key": key});
      return effect;
    },
    setEditing: function({editing}:{editing:string}) {
      let effect = DispatchEffect.from(this);
      localState.editing = editing;
      return effect;
    },
    addFingerprint: function({viewId, fingerprint, fieldIds}:{viewId:string, fingerprint:string, fieldIds: string[]}) {
      let effect = DispatchEffect.from(this);
      effect.change.add("view fingerprint", {"view fingerprint: view": viewId, "view fingerprint: fingerprint": fingerprint})
        .addEach("fingerprint field", fieldIds.map((fieldId, ix) => {return {"fingerprint field: field": fieldId, "fingerprint field: ix": ix}}));
      return effect;
    },
    loadQuery: function({viewId}:{viewId:string}) {
      let effect = DispatchEffect.from(this);
      if(viewId) {
        let ast = Api.ixer.findOne("ast cache", {"ast cache: id": viewId, "ast cache: kind": "query"});
        if(ast) localState.query.loadFromAST(JSON.parse(ast["ast cache: ast"]), viewId);
        else localState.query.loadFromView(viewId);
      } else {
        localState.query = new Parsers.Query();
      }
      return effect;
    },
    parseQuery: function({query:queryString, prev}:{query:string, prev?:Parsers.QueryIR}) {
      let effect = DispatchEffect.from(this);
      localState.query.parse(queryString);
      window["qs"] = queryString;
      return effect;
    },
    compileQuery: function({query}:{query:Parsers.Query}) {
      let effect = DispatchEffect.from(this);
      let reified = query.reified;
      if(!reified) throw new Error("Cannot compile unreified query.");
      if(query.id) {
        effect.change.removeWithDependents("view", {"view: view": query.id})
          .removeWithDependents("ast cache", {"ast cache: id": query.id})
      }
      effect.change.add("view", {"view: view": query.id, "view: kind": "join"})
        .add("display name", query.name || "Untitled Search");

      let sourceIx = 0;
      for(let source of reified.sources) { // Sources
        effect.change.add("source", {"source: source": source.source, "source: source view": source.sourceView})
          .add("display order", sourceIx++);
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

      for(let action of reified.actions) { // Actions
        if(action.action === "+") {
          let {"view fingerprint: view":viewId} = Api.ixer.findOne("view fingerprint", {"view fingerprint: fingerprint": action.fingerprint}) || {};
          let fieldIds = [];
          if(!viewId) {
            for(let ix = 0; ix < action.mappings.length; ix++) fieldIds.push(Api.uuid());
            effect.change.add("view", "union")
              .add("display name", action.fingerprint);
            let ix = 0;
            for(let fieldId of fieldIds) {
              effect.change.add("field", {"field: field": fieldId, "field: kind": "output"})
                .add("display name", reified.variables[action.mappings[ix]].alias)
                .add("display order", ix++)
            }
            effect.dispatch("addFingerprint", {viewId, fingerprint: action.fingerprint, fieldIds});
          } else {
            let fingerprintFields = Api.ixer.find("fingerprint field", {"fingerprint field: fingerprint": action.fingerprint});
            if(!fingerprintFields) throw new Error("WUT DO");
            fingerprintFields.sort(function(a, b) {
              return a["fingerprint field: ix"] - b["fingerprint field: ix"];
            });
            fieldIds = Api.extract("fingerprint field: field", fingerprintFields);
          }

          let member = Api.ixer.findOne("member", {"member: view": viewId, "member: member view": query.id});
          if(member) {
            effect.change.add("member", Api.resolve("member",
              {member: member["member: member"], view: viewId, ix: member["member: ix"], "member view": query.id})
            );
          } else {
            let memberIx = action.memberIx;
            if(memberIx === undefined) {
              memberIx = Math.max.apply(Math, Api.extract("member: ix", Api.ixer.find("member", {"member: view": viewId})));
              memberIx = memberIx > -Infinity ? memberIx + 1 : 0;
            }
            effect.change.add("member", Api.resolve("member", {view: viewId, ix: memberIx, "member view": query.id}));
          }

          let ix = 0;
          for(let fieldId of fieldIds) {
            let variable = reified.variables[action.mappings[ix++]];
            effect.change.add("mapping", Api.resolve("mapping", {"view field": fieldId, "member field": variable.selected}));
          }

          // @TODO: Add support for negation (requires ordering across multiple children...)
        } else {
          throw new Error(`Unknown action '${action.action}':` + JSON.stringify(action));
        }
      }

      if(query.tags) effect.dispatch("setTags", {id: query.id, tags: query.tags});
      if(query.ast)
        effect.change.add("ast cache", {"ast cache: id": query.id, "ast cache: kind": "query", "ast cache: ast": JSON.stringify(query.ast)});
      return effect;
    },

    loadUi: function({elementId:elemId}:{elementId:string}) {
      let effect = DispatchEffect.from(this);

      if(elemId) {
        let ast = Api.ixer.findOne("ast cache", {"ast cache: id": elemId, "ast cache: kind": "ui"});
        if(ast) localState.ui.loadFromAST(JSON.parse(ast["ast cache: ast"]), elemId);
        else localState.ui.loadFromElement(elemId);
      } else {
        localState.ui = new Parsers.Ui();
      }
      return effect;
    },
    parseUi: function({ui:uiString}:{ui:string}) {
      let effect = DispatchEffect.from(this);
      localState.ui.parse(uiString)
      return effect;
    },
    compileUi: function({ui}:{ui:Parsers.Ui}) {
      let effect = DispatchEffect.from(this);
      let reified = ui.reified;
      if(!reified) throw new Error("Cannot compile unreified ui.");

      if(ui.id) {
        try {
          let prev = new Parsers.Ui().loadFromElement(ui.id);
          for(let viewId in prev.reified.boundQueries) {
            effect.change.removeWithDependents("view", viewId).clearContext();
          }
          for(let elem of [prev.reified.root].concat(prev.reified.elements)) {
            effect.change.removeWithDependents("uiElement", elem.element)
              .removeWithDependents("ast cache", {"ast cache: id": elem.element}).clearContext();
          }
        } catch (err) {}
      }

      let ix = 0;
      for(let queryId in reified.boundQueries) {
        let query:Parsers.Query = reified.boundQueries[queryId];
        query.name = `${ui.name} bound view ${ix++}`;
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
        effect.change.addEach("ui event", elem.events.map((kind) => {return {"ui event: kind": kind}}));
        for(let event in elem.boundEvents)
          effect.change.add("ui event binding", {"ui event binding: kind": event, "ui event binding: field": elem.boundEvents[event]});
      }

      ui.id = reified.root.element;
      ui.tags = ui.tags || [];
      if(ui.tags.indexOf("ui-root") === -1) ui.tags.push("ui-root");
      effect.dispatch("setTags", {id: ui.id, tags: ui.tags});
      if(ui.ast)
        effect.change.add("ast cache", {"ast cache: id": ui.id, "ast cache: kind": "ui", "ast cache: ast": JSON.stringify(ui.ast)});
      return effect;
    }
  };
  export function dispatch(evt:string, info:any, rentrant?:boolean):DispatchEffect {
    if(Api.DEBUG.DISPATCH) {
      console.log(evt, info);
    }
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
    if(debounce) key += key ? " | " + debounce : debounce;
    if(__handlers[key]) return __handlers[key];

    let code = `
    var localState = Api.localState;
    var dispatch = Editor.dispatch;
    var info = Api.clone(elem);
    info.id = undefined;\n`;
    if(commands) {
      for(let cmd of commands.split(";")) code += "    " + cmd.trim() + ";\n";
    }
    if(dispatches) {
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
    renderer = new UiRenderer.UiRenderer(raw, handleEvent);
    document.body.appendChild(raw.content);
    window.addEventListener("resize", render);
  }

  function handleEvent(elem:string, kind: string, key?:any) {
    dispatch("addEvent", {elem, kind, key}).done();
  }

  function render() {
    renderer.queue(root);
  }

  var rootPanes:Ui.Pane[] = [
    {title: "Query", pane: "root-query", content: queryEditor},
    {title: "Ui", pane: "root-ui", content: uiEditor},
  ];
  function root():Element {
    return {children: [
      {text: "Copperfield - " + localState.query.id},
      Ui.tabbedBox({container: "root-workspace", panes: rootPanes, paneChange: switchEditor})
    ]};
  }

  // @FIXME: Hack
  function switchEditor(evt, elem) {
    if(elem.pane === "root-query") localState.activeKind = "query";
    else if(elem.pane === "root-ui") localState.activeKind = "ui";
    else throw new Error(`Unknown kind: '${elem.tab}'`);
    dispatch("HACK HACK HACK", undefined).done();
  }

  function queryEditor():Element {
    let query = localState.query;
    let queryName = query.name || Api.get.name(query.id);
    let queryString = localState.editing;
    if(queryString === undefined) queryString = query.raw || "";
    let queries = {"": "New Query"};
    for(let viewId of Api.extract("view: view", Api.ixer.find("view"))) {
      queries[viewId] = Api.get.name(viewId) || `<${viewId}>`;
    }
    let tags = (query.tags || []).join(", ");
    if(query.id) tags = Api.get.tags(query.id).join(", ");


    var queryInspectorPanes:Ui.Pane[] = [
      {
        title: "AST",
        pane: "result-ast",
        content: [{t: "pre", c: "ast", text: JSON.stringify(query.ast, null, 2)}]
      },
      {
        title: "Reified",
        pane: "result-reified",
        content: [{t: "pre", c: "reified", text: JSON.stringify(query.reified, null, 2)}]
      }
    ];


    let warnings;
    if(query.id) {
      warnings = Api.ixer.find("disabled view", {"disabled view: view": query.id}).map(function(warning) {
        let explanation;
        let warningView = warning["disabled view: warning view"];
        let row = Api.humanize(warningView, Client.factToMap(warningView, warning["disabled view: warning row"]));
        if(warningView === "unschedulable source") {
          let sourceIR = query.getSourceIR(row.source);
          let sourceAST = sourceIR ? query.getSourceAST(sourceIR) : undefined;
          let line = Parsers.tokenToString(sourceAST);
          explanation = {children: [
            {text: `Source: '${row.source}'`},
            sourceAST ? {text: `on line ${sourceAST.lineIx + 1}:0`} : undefined,
            sourceAST ? {text: line} : undefined
          ]};
        }
        return {c: "warning-row", children: [
          {text: warningView + " error: \n" + warning["disabled view: warning"] + "\n" + JSON.stringify(row)},
          explanation
        ]};
      });
    }

    return Ui.row({children: [
      Ui.column({flex: 1, children: [
        Ui.row({children: [
          Ui.input({placeholder: "Untitled Search", text: queryName, view: query.id,
            blur: dispatchOnEvent("setName", "info.name = evt.target.textContent; info.id = elem.view")
          }),
          Ui.input({placeholder: "tags", text: tags, view: query.id,
            blur: dispatchOnEvent("setTags", "info.tags = (evt.target.textContent || '').split(', '); info.id = elem.view")
          }),
          Ui.dropdown({options: queries, defaultOption: <any>query.id,
            change: dispatchOnEvent("loadQuery", "info.viewId = evt.target.value")
          }),
          Ui.button({text: "compile", query, click: dispatchOnEvent("compileQuery")}),
          Ui.button({c: "ion-close", view: query.id, click: dispatchOnEvent("remove; loadQuery", "info.type = 'view'; info.id = elem.view")})
        ]}),
        Ui.codeMirrorElement({c: "code", id: "query-code-editor", value: queryString, prev: query.reified, query,
          change: dispatchOnEvent("parseQuery", "info.query = evt.getValue()", 66),
          submit: dispatchOnEvent("compileQuery"),
          focus: dispatchOnEvent("setEditing", "info.editing = elem.value"),
          blur: dispatchOnEvent("setEditing", "info.editing = undefined"),
        }),
        {t: "pre", c: "err", children: query.errors.map((err) => { return {text: err.toString()}})},
        {t: "pre", c: "warn", children: warnings},
        query.id ? Ui.factTable({view: query.id}) : undefined
      ]}),
      Ui.tabbedBox({container: "query-results", flex: 1, panes: queryInspectorPanes, defaultPane: "result-reified"})
    ]});
  }

  function uiEditor():Element {
    let ui = localState.ui;
    let root = localState.ui.id;
    let uiName = localState.ui.name || Api.get.name(root);
    let uiString = localState.editing;
    if(uiString === undefined) uiString = ui.raw || "";

    let elems = {"": "New Ui"};
    for(let elemId of Api.extract("tag: view", Api.ixer.find("tag", {"tag: tag": "ui-root"}))) {
      elems[elemId] = Api.get.name(elemId) || `<${elemId}>`;
    }
    let tags = (localState.ui.tags || []).join(", ");
    if(localState.ui.id) tags = Api.get.tags(localState.ui.id).join(", ");


    var uiInspectorPanes:Ui.Pane[] = [
      {
        title: "AST",
        pane: "result-ast",
        content: [{t: "pre", c: "ast", text: JSON.stringify(ui.ast, null, 2)}]
      },
      {
        title: "Reified",
        pane: "result-reified",
        content: [{t: "pre", c: "reified", text: JSON.stringify(ui.reified, null, 2)}]
      }
    ];


    return Ui.row({children: [
      Ui.column({flex: 1, children: [
        Ui.row({children: [
          Ui.input({placeholder: "Untitled Ui", text: uiName, elem: root,
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
          change: dispatchOnEvent("parseUi", "info.ui = evt.getValue()", 66),
          submit: dispatchOnEvent("compileUi", "info.ui = localState.ui"),
          focus: dispatchOnEvent("setEditing", "info.editing = elem.value"),
          blur: dispatchOnEvent("setEditing", "info.editing = undefined"),
        }),
        {t: "pre", c: "err", children: ui.errors.map((err) => { return {text: err.toString()}})},

        {c: "results", children: root ? renderer.compile([root]) : undefined}
      ]}),
      Ui.tabbedBox({container: "ui-results", flex: 1, panes: uiInspectorPanes, defaultPane: "result-reified"})
    ]});
  }

  //---------------------------------------------------------------------------
  // Initialization
  //---------------------------------------------------------------------------
  // @FIXME: This should be moved into API once completed.
  interface LocalState {
    initialized: boolean
    eventId: number

    activePage?: string
    activeComponent?: string
    activeKind?: string //hack

    editing?: string
    query?: Parsers.Query
    ui?: Parsers.Ui
  }
  export var localState:LocalState = {
    initialized: true,
    eventId: 0,
    activeKind: "query",
    query: new Parsers.Query(),
    ui: new Parsers.Ui()
  };

  export function init() {
    if(!Api.localState.initialized) {
      Api.localState = localState;
      initRenderer();
      Client.onReceive = function(changed, commands) {
        render();
      }
      Ui.onChange = render;

      let eids = Api.extract("event: event", Api.ixer.find("event"));
      if(eids.length) localState.eventId = Math.max.apply(Math, eids) + 1; // Ensure eids are monotonic across sessions.
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