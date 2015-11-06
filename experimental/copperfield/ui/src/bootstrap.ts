module Bootstrap {
  declare var marked;

  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------

  var resolve = Api.resolve;
  function hoboResolve(viewId:string, fact:Api.Dict):Api.Dict {
    for(let name in fact) {
      fact[viewId + ": " + name] = fact[name];
      delete fact[name];
    }
    return fact;
  }

  function addView(effect, viewId, kind, fields) {
    effect.change.add("view", resolve("view", {view: viewId, kind}))
      .add("display name", viewId);
      if(kind === "table") effect.change.add("tag", {"tag: tag": "editor"});

    let fieldIx = 0;
    for(let fieldName of fields)
      effect.change.add("field", resolve("field", {field: viewId + ": " + fieldName, ix: fieldIx, kind: "output"}))
        .add("display name", fieldName)
        .add("display order", fieldIx++);
    return effect;
  }

  var blocks:{[page:string]: number} = {};
  function addBlock(page:string, entity:string, projection:string) {
    let ix = (blocks[page] || -1) + 1;
    facts["builtin block"].push({page, block: entity + "-block." + ix, ix, entity, projection});
    blocks[page] = ix + 1;
  }

  function addEntity(entity:string, kind:string, name:string = entity) {
    let page = entity + "-page";
    facts["builtin entity"].push({entity, kind});
    facts["display name"].push({id: entity, name});
  }

  function addCollection(entity, kind, projections = []) {
    let page = entity + "-page";
    addEntity(entity, "collection");
    facts["builtin collection entity"].push({entity, kind});
    facts["builtin default projection"].push({entity, projection: "index-projection"});
    if(projections.indexOf("name-projection") === -1) projections.unshift("name-projection");
    if(projections.indexOf("kinds-projection") === -1) projections.unshift("kinds-projection");
    for(let projection of projections) {
      facts["builtin kind projection"].push({kind, projection});
    }
  }

  function assertValid(parser:Parsers.Query|Parsers.Ui):Parsers.Query|Parsers.Ui {
    if(parser.errors.length) {
      console.warn("Failed to parse: " + parser.id);
      for(let error of parser.errors)
        console.warn(error.toString());
      throw new Error("Invalid builtin");
    }
    return parser;
  }

  function getFingerprintAliases(fingerprint:string):string[] {
    return fingerprint.split(" ").filter((token) => token[0] === "?").map((field) => field.slice(1));
  }

  //---------------------------------------------------------------------------
  // Static setup
  //---------------------------------------------------------------------------

  var views:{[viewId:string]: string[]} = {
    "ui binding constraint": ["parent", "alias", "field"],
    "handled event": ["tick"],
    "event value": ["tick", "value"],

    // Entities
    "entity": ["entity"],
    "entity kind": ["entity", "kind"],
    "collection entity": ["entity", "kind"],
    "related entity": ["entity", "related entity"],

    // Rendering
    "page": ["entity", "page"],
    "block removed": ["block", "tick"],
    "block history": ["tick", "page", "block", "ix", "entity", "projection"],
    "block": ["page", "block", "ix", "entity", "projection"],
    "block scratch": ["block", "scratch"],
    "block scratch history": ["block", "scratch", "tick"],
    "block editing": ["block", "editing"],
    "block editing history": ["block", "editing", "tick"],
    "projection": ["projection", "element"],
    "default projection": ["entity", "projection"],
    "kind projection": ["kind", "projection"],

    // Interaction
    "selected page history": ["page", "tick"],
    "selected page": ["page"],
    "selected block history": ["block", "tick"],
    "selected block": ["block"],
    "next layer": ["page", "ix"],

    // Builtins/defaults
    "boolean string": ["value", "string"],
    "single": [],
    "default page": ["page"],
    "builtin entity": ["entity", "kind"],
    "builtin collection entity": ["entity", "kind"],
    "builtin page": ["entity", "page"],
    "builtin block": ["page", "block", "ix", "entity", "projection"],
    "builtin projection": ["projection", "element"],
    "builtin default projection": ["entity", "projection"],
    "builtin kind projection": ["kind", "projection"],

    // maybe hacks
    "maybe entity": ["entity"],
    "maybe projection": ["projection"],
  };
  var viewKinds:{[viewId:string]: string} = {
    "boolean string": "table",
    "single": "table",
    "ui binding constraint": "table",
    "event value": "table",

    "default page": "table",
    "builtin entity": "table",
    "builtin collection entity": "table",
    "builtin page": "table",
    "builtin block": "table",
    "builtin projection": "table",
    "builtin default projection": "table",
    "builtin kind projection": "table"
  }

  var fingerprintsRaw:{[viewId:string]: string[]} = {
    "<": ["?A < ?B"],
    "<=": ["?A <= ?B"],
    "!=": ["?A != ?B"],

    "==": ["?A == ?B = ?result"],
    "-": ["?A - ?B = ?result"],
    "+": ["?A + ?B = ?result"],
    "/": ["?A / ?B = ?result"],
    "*": ["?A * ?B = ?result"],
    "concat": ["?A concat ?B = ?result"],
    "remainder": ["?A remainder ?B = ?result"],

    "boolean string": ["boolean ?value = ?string"],
    "single": ["single"],

    "view": ["view ?view is a ?kind"],
    "display name": ["?id is named ?name"],
    "display order": ["?id is ordered ?priority"],
    "tag": ["?view is tagged ?tag"],
    "event": ["event at ?tick is a ?kind ?event with key ?key", "event at ?tick is an ?kind ?event with key ?key"],
    "handled event": ["event at ?tick is already handled"],
    "event value": ["event at ?tick is valued ?value"],
    "ui binding constraint": ["?parent field ?field constraints alias ?alias"],

    // Entities
    "entity": ["?entity is an entity"],
    "entity kind": ["entity ?entity is a ?kind", "entity ?entity is an ?kind"],
    "collection entity": ["entity ?entity contains each ?kind"],
    "related entity": ["entity ?entity is related to ?related_entity"],

    // Rendering
    "page": ["page ?page represents ?entity"],
    "block": [
      "block ?block on layer ?ix represents ?entity in ?page as a ?projection",
      "block ?block on layer ?ix represents ?entity in ?page as an ?projection",
      "?block is a block"
    ],
    "block history": [
      "block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick",
      "block ?block on layer ?ix represents ?entity in ?page as an ?projection at tick ?tick"
    ],
    "block removed": ["block ?block was removed at ?tick"],
    "block scratch": ["block ?block contains ?scratch"],
    "block scratch history": ["block ?block contains ?scratch at tick ?tick"],
    "block editing": ["?block is being edited ?editing"],
    "block editing history": ["?block is being edited ?editing at tick ?tick"],

    "projection": ["projection ?projection is templated as ?element"],
    "default projection": ["entity ?entity usually looks like a ?projection", "entity ?entity usually looks like an ?projection"],
    "kind projection": ["?kind entities can look like a ?projection", "?kind entities can look like an ?projection"],

    // Interaction
    "selected page history": ["?page is the selected page at tick ?tick"],
    "selected page": ["?page is the selected page"],
    "selected block history": ["?block is the selected block at tick ?tick"],
    "selected block": ["?block is the selected block"],
    "next layer": ["next layer for page ?page is ?ix"],

    // Builtins/defaults
    "default page": ["?page is the default page"],
    "builtin entity": ["builtin entity ?entity is a ?kind", "builtin entity ?entity is an ?kind"],
    "builtin collection entity": ["builtin entity ?entity contains each ?kind"],
    "builtin page": ["builtin page ?page represents ?entity"],
    "builtin block": [
      "builtin block ?block on layer ?ix represents ?entity in ?page as a ?projection",
      "builtin block ?block on layer ?ix represents ?entity in ?page as an ?projection"
    ],
    "builtin projection": ["builtin projection ?projection is templated as ?element"],
    "builtin kind projection": ["builtin ?kind entities can look like a ?projection", "builtin ?kind entities can look like an ?projection"],
    "builtin default projection": [
      "builtin entity ?entity usually looks like a ?projection",
      "builtin entity ?entity usually looks like an ?projection"
    ],

    // Maybe hacks
    "maybe entity": ["maybe ?entity is an entity"],
    "maybe projection": ["maybe ?projection is a projection"],
  };

  var facts:{[viewId:string]: Api.Dict[]} = {
    "display name": [],
    "display order": [],
    "tag": [],
    "builtin entity": [],
    "builtin collection entity": [],
    "default page": [{page: "collections-page"}],
    "builtin page": [{page: "dummy-page", entity: "dummy"}],
    "builtin block": [],
    "builtin projection": [],
    "builtin default projection": [],
    "builtin kind projection": [],
    "boolean string": [{value: true, string: "true"}, {value: false, string: ""}],
    "single": [[]]
  };

  //---------------------------------------------------------------------------
  // Live Queries and UI
  //---------------------------------------------------------------------------

  var queries:{[viewId:string]: string} = {
    // Builtins/defaults
    "set selected page default": Parsers.unpad(6) `
      ?page is the default page
      ?tick = "-1"
      + ?page is the selected page at tick ?tick
    `,
    "set builtin entities": Parsers.unpad(6) `
      builtin entity ?entity is a ?kind
      + entity ?entity is a ?kind
    `,
    "set builtin collection entities": Parsers.unpad(6) `
      builtin entity ?entity contains each ?kind
      + entity ?entity contains each ?kind
    `,
    "set builtin pages": Parsers.unpad(6) `
      builtin page ?page represents ?entity
      + page ?page represents ?entity
    `,
    "set builtin blocks": Parsers.unpad(6) `
      builtin block ?block on layer ?ix represents ?entity in ?page as a ?projection
      ?tick = "-1"
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
    `,
    "set builtin projections": Parsers.unpad(6) `
      builtin projection ?projection is templated as ?element
      + projection ?projection is templated as ?element
    `,
    "set builtin default projections": Parsers.unpad(6) `
      builtin entity ?entity usually looks like a ?projection
      + entity ?entity usually looks like a ?projection
    `,
    "set builtin kind projections": Parsers.unpad(6) `
      builtin ?kind entities can look like a ?projection
      + ?kind entities can look like a ?projection
    `,
    "set default block scratch": Parsers.unpad(6) `
      ?block is a block
      ?scratch = ""
      ?tick = "-1"
      + block ?block contains ?scratch at tick ?tick
    `,
    "set default block editing": Parsers.unpad(6) `
      ?block is a block
      ?editing = "false"
      ?tick = "-1"
      + ?block is being edited ?editing at tick ?tick
    `,

    // Basic derivations
    "entity list": Parsers.unpad(6) `
      entity ?entity is a ?
      + ?entity is an entity
    `,
    "query entity": Parsers.unpad(6) `
      view ?entity is a "join"
      ?kind = "query"
      ?projection = "fact-table-projection"
      + entity ?entity is a ?kind
      + entity ?entity usually looks like a ?projection
    `,
    "union entity": Parsers.unpad(6) `
      view ?entity is a "union"
      ?kind = "union"
      ?projection = "fact-table-projection"
      + entity ?entity is a ?kind
      + entity ?entity usually looks like a ?projection
    `,
    "ui entity": Parsers.unpad(6) `
      ?entity is tagged "ui-root"
      ?kind = "ui"
      ?projection = "renderer-projection"
      + entity ?entity is a ?kind
      + entity ?entity usually looks like a ?projection
    `,
    "projection entity": Parsers.unpad(6) `
      ?entity is tagged "projection"
      ?kind = "projection"
      + entity ?entity is a ?kind
    `,

    // Utilities
    "set next layer": Parsers.unpad(6) `
      block ? on layer ?ix represents ? in ?%page as a ?
      # ?ord by ?ix descending
      ?ord < "2"
      ?next $= ?ix + "1"
      + next layer for page ?page is ?next
    `,
    "set next layer default": Parsers.unpad(6) `
      page ?page represents ?
      ! block ? on layer ? represents ? in ?page as a ?
      ?next = "0"
      + next layer for page ?page is ?next
    `,

    // Generate derived facts
    "create entity pages": Parsers.unpad(6) `
      ?entity is an entity
      ?tick = "-1"
      ?page $= ?entity concat "-page"
      ?block-title $= ?page concat "-block.0"
      ?block-title-ix = "0"
      ?block-title-projection = "name-projection"

      ?block-nav $= ?page concat "-block.1"
      ?block-nav-ix = "1"
      ?block-nav-projection = "kinds-projection"

      ?block-self $= ?page concat "-block.2"
      ?block-self-ix = "2"
      entity ?entity usually looks like a ?block-self-projection

      + page ?page represents ?entity
      + block ?block-title on layer ?block-title-ix represents ?entity in ?page as a ?block-title-projection at tick ?tick
      + block ?block-nav on layer ?block-nav-ix represents ?entity in ?page as a ?block-nav-projection at tick ?tick
      + block ?block-self on layer ?block-self-ix represents ?entity in ?page as a ?block-self-projection at tick ?tick
    `,

    // State
    "set selected page state": Parsers.unpad(6) `
      ?page is the selected page at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      + ?page is the selected page
    `,
    "set block state": Parsers.unpad(6) `
      block ?%block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      ! block ?block was removed at ?
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection
    `,
    "set block scratch state": Parsers.unpad(6) `
      block ?%block contains ?scratch at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      + block ?block contains ?scratch
    `,
    "set block editing state": Parsers.unpad(6) `
      ?%block is being edited ?editing at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      + ?block is being edited ?editing
    `,

    "parse scratch": Parsers.unpad(6) `
      block ?block contains ?scratch
      + marked ?scratch
    `,

    // Stateful union maintenance
    "maintain handled events": Parsers.unpad(6) `
      event at ?tick is already handled
      + event at ?tick is already handled
    `,
    "maintain block history": Parsers.unpad(6) `
      block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
    `,
    "maintain block removed": Parsers.unpad(6) `
      block ?block was removed at ?tick
      + block ?block was removed at ?tick
    `,
    "maintain block scratch history": Parsers.unpad(6) `
      block ?block contains ?scratch at tick ?tick
      + block ?block contains ?scratch at tick ?tick
    `,
    "maintain block editing history": Parsers.unpad(6) `
      ?block is being edited ?editing at tick ?tick
      + ?block is being edited ?editing at tick ?tick
    `,

    // User page navigation
    "select page on index click": Parsers.unpad(6) `
      event at ?tick is a "switch page" ? with key ?entity
      page ?page represents ?entity
      + ?page is the selected page at tick ?tick
    `,

    // User page editing
    "user switch projection": Parsers.unpad(6) `
      event at ?tick is a "switch block projection" ? with key ?block
      ! event at ?tick is already handled
      event at ?tick is valued ?projection
      block ?block on layer ?ix represents ?entity in ?page as a ?
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      + event at ?tick is already handled
    `,
    "user switch entity": Parsers.unpad(6) `
      event at ?tick is a "switch block entity" ? with key ?block
      ! event at ?tick is already handled
      event at ?tick is valued ?entity
      block ?block on layer ?ix represents ? in ?page as a ?projection
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      + event at ?tick is already handled
    `,
    "user switch scratch": Parsers.unpad(6) `
      event at ?tick is a "switch block scratch" ? with key ?block
      ! event at ?tick is already handled
      event at ?tick is valued ?scratch
      + block ?block contains ?scratch at tick ?tick
      + event at ?tick is already handled
    `,
    "user add block": Parsers.unpad(6) `
      ; @TODO: Figure out why I'm failing to fixed point. Its because these unions arent stateful...
      event at ?tick is an "add block" ? with key ?page
      ! event at ?tick is already handled
      next layer for page ?page is ?next
      ?block $= "manual-block-" concat ?tick
      ?empty = ""
      ?editing = "true"
      + block ?block on layer ?next represents ?empty in ?page as a ?empty at tick ?tick
      + ?block is being edited ?editing at tick ?tick
      + event at ?tick is already handled
    `,
    "user delete block": Parsers.unpad(6) `
      event at ?tick is a "delete block" ? with key ?block
      ! event at ?tick is already handled
      ?block is a block
      + block ?block was removed at ?tick
      + event at ?tick is already handled
    `,
    "user edit block": Parsers.unpad(6) `
      event at ?tick is a "edit block" ? with key ?block
      ! event at ?tick is already handled
      ?block is a block
      ?editing = "true"
      + ?block is being edited ?editing at tick ?tick
      + event at ?tick is already handled
    `,
    "user stop edit block": Parsers.unpad(6) `
      event at ?tick is a "stop edit block" ? with key ?block
      ! event at ?tick is already handled
      ?block is a block
      ?editing = "false"
      + ?block is being edited ?editing at tick ?tick
      + event at ?tick is already handled
    `,

    // Maybe hacks
    "maybe entity list": Parsers.unpad(6) `
      ?entity is an entity
      + maybe ?entity is an entity
    `,
    "maybe entity list default": Parsers.unpad(6) `
      single
      ?entity = ""
      + maybe ?entity is an entity
    `,
    "maybe projection list": Parsers.unpad(6) `
      projection ?projection is templated as ?
      + maybe ?projection is a projection
    `,
    "maybe projection list default": Parsers.unpad(6) `
      single
      ?projection = ""
      + maybe ?projection is a projection
    `,
  };

  let uis:{[elemId:string]: string} = {
    "wiki root-elem": Parsers.unpad(6) `
      div wiki-root; wiki root
        ~ ?page is the selected page
        ~ page ?page represents ?root_entity
        row bordered; wiki header
          ~ ?header $= "Copperfield: " concat ?page
          - text: ?header
        div wiki-page; wiki page
          div wiki-blocks; wiki blocks
            div wiki-block; wiki block
              ~ block ?block on layer ?ix represents ?entity in ?%page as a ?projection
              ~ # ?ord by ?ix ascending
              - ix: ?ix
              - debug: ?block
              - key: ?block
              row block-controls justify-end; block controls
                - ix: "-1"
                span
                  - text: ?block
                span
                  - text: ?ix
                select; entity switcher
                  @change switch block entity: ?block
                  - key: ?entity
                  - autocomplete: "off"
                  option
                    - text: "---"
                    - ix: "-1"
                  option
                    ~ maybe ?entity is an entity
                    ~ ?entity_opt is an entity
                    ~ ?entity_opt is named ?entity_opt_text
                    ~ # ?opt_ord by ?entity_opt_text ascending
                    ~ ?entity_selected $= ?entity_opt == ?entity
                    - key: ?entity_opt
                    - ix: ?opt_ord
                    - text: ?entity_opt_text
                    - value: ?entity_opt
                    - selected: ?entity_selected
                    - debug: ?entity_selected
                select; projection switcher
                  @change switch block projection: ?block
                  - key: ?projection
                  - autocomplete: "off"
                  option
                    - text: "---"
                    - ix: "-1"
                  option
                    ~ entity ?entity is a ?_kind
                    ~ maybe ?projection is a projection
                    ~ ?_kind entities can look like a ?projection_opt
                    ~ ?projection_opt is named ?projection_opt_text
                    ~ # ?opt_ord by ?projection_opt_text ascending
                    ~ ?projection_selected $= ?projection_opt == ?projection
                    - key: ?projection_opt
                    - ix: ?opt_ord
                    - text: ?projection_opt_text
                    - value: ?projection_opt
                    - selected: ?projection_selected
                    - debug: ?projection_selected
                button delete-button ion-close; delete block button
                  @click delete block: ?block
              div block-content; block content
                ~ projection ?projection is templated as ??element
                > ?element ?entity ?block ?page
              div block-empty; block empty
                ~ block ?block on layer ?ix represents ?entity in ?page as a ""
                ~ projection "scratch-projection" is templated as ??element
                - ix: "1"
                > ?element ?block ?page
          div wiki-block add-button ion-plus; add-block
            @click add block: ?page
        row bordered; wiki footer
          - flex: "none"
          - text: "footer"
    `
  };

  var projections:{[projection:string]: string} = {
    // Projections
    name: Parsers.unpad(6) `
      ~ ?entity is named ?name
      - debug: "name"
      - text: ?name
      @click switch page: ?entity
    `,
    // index projection to list related entities by name as blocks
    index: Parsers.unpad(6) `
      ~ ?entity is an entity
      ; Hack since alias bindings arent deep yet.
      div
        ~ entity ?entity contains each ?kind
        ~ entity ?related is a ?kind
        ~ ?related is named ?name
        - text: ?name
        @click switch page: ?related
    `,
    kinds: Parsers.unpad(6) `
      ~ ?entity is an entity
      ; Hack since alias bindings arent deep yet.
      row
        ~ entity ?entity is a ?kind
        ~ entity ?collection contains each ?kind
        ~ ?collection is named ?name
        - text: ?name
        @click switch page: ?collection
    `,
    "fact-table": Parsers.unpad(6) `
      ~ view ?entity is a ?
      - t: "fact-table"
      - view: ?entity
    `,
    renderer: Parsers.unpad(6) `
      ~ entity ?entity is a "ui"
      ~ ?entity != "wiki root-elem"
      ~ ?entity != "renderer-projection-elem"
      - t: "renderer"
      - element: ?entity
    `,
    scratch: Parsers.unpad(6) `
      ~ ?block is a block
      ~ block ?block contains ?scratch
      - c: "block-scratch"
      @dblclick edit block: ?block
      textarea
        ~ ?block is being edited "true"
        - t: "textarea"
        - value: ?scratch
        - placeholder: "Start typing anything..."
        - autofocus: "true"
        - height: "10em"
        @change switch block scratch: ?block
        @blur stop edit block: ?block
      div document-flow
        ~ ?block is being edited "false"
        ~ marked ?scratch = ?html
        - key: ?scratch
        - dangerouslySetInnerHTML: ?html
    `
  };

  interface Action {
    input: string
    outputs: {[id: string]: string}
    trigger: (effect:Editor.DispatchEffect, diff:Indexer.Diff<Api.Dict>, ixer:Indexer.Indexer) => void
  }
  var actions:{[action:string]: Action} = {
    marked: {
      input: "marked ?md",
      outputs: {
        marked: "marked ?md = ?html"
      },
      trigger: function(effect, diff, ixer) {
        effect.change.removeEach("marked", Api.resolve("marked", Api.humanize("marked input", diff.removes)));
        for(let add of Api.humanize("marked input", diff.adds)) {
          let {md} = add;
          let html = marked(md);
          effect.change.add("marked", Api.resolve("marked", {md, html}));
        }
        console.log("marked", effect);
        setTimeout(() => effect.done(), 50);
      }
    }
  };

  //---------------------------------------------------------------------------
  // Macro-generated builtin facts.
  //---------------------------------------------------------------------------
  addCollection("collections", "collection", ["index-projection"]);
  addCollection("queries", "query");
  addCollection("unions", "union", ["fact-table-projection"]);
  addCollection("uis", "ui", ["renderer-projection"]);
  addCollection("projections", "projection");
  addCollection("actions", "action");

  for(let projection in projections)
    facts["builtin projection"].push({projection: projection + "-projection", element: projection + "-projection-elem"});

  (function() {
    for(var actionId in actions) {
      var action = actions[actionId];
      var inputId = actionId + " input";
      fingerprintsRaw[inputId] = [action.input];
      views[inputId] = getFingerprintAliases(action.input);
      facts["builtin entity"].push({entity: actionId + "-action", kind: "action"});
      facts["display name"].push({id: actionId + "-action", name: actionId});
      // @NOTE: Ensure action is closed over properly here when less sleep deprived.
      Api.ixer.trigger(inputId, inputId, function(ixer) {
        action.trigger(new Editor.DispatchEffect(), ixer.table(inputId).diff, ixer);
      });

      for(var output in action.outputs) {
        fingerprintsRaw[output] = [action.outputs[output]];
        views[output] = getFingerprintAliases(action.outputs[output]);
        viewKinds[output] = "table";
      }
    }
  })();

  //---------------------------------------------------------------------------
  // Resolve raw (humanized) bootstrap facts for compiling.
  //---------------------------------------------------------------------------
  let fingerprints:{[viewId:string]: string[]} = {};
  let fingerprintFields:{[viewId:string]: string[]} = {};
  for(let viewId in fingerprintsRaw) {
    fingerprints[viewId] = [];
    for(let fingerprintRaw of fingerprintsRaw[viewId]) {
      let fingerprint = "";
      let fieldIds = [];
      let multi = false;
      for(let chunk of fingerprintRaw.split(" ")) {
        if(multi) fingerprint += " "
        if(chunk[0] === "?") {
          fieldIds.push(viewId + ": " + chunk.slice(1).replace(/_/gm, " "));
          fingerprint += "?"
        } else fingerprint += chunk;
        multi = true;
      }
      fingerprints[viewId].push(fingerprint);
      fingerprintFields[fingerprint] = fieldIds;
    }
  }

  // Replace " with ` to make writing dsl in template strings easier.
  for(let viewId in queries) queries[viewId] = queries[viewId].replace(/\"/gm, "`");
  for(let elemId in uis) uis[elemId] = uis[elemId].replace(/\"/gm, "`").replace(/''/gm, "\"");
  for(let elemId in projections) projections[elemId] = projections[elemId].replace(/\"/gm, "`");


  //---------------------------------------------------------------------------
  // Initialize once connected.
  // @NOTE: We are currently relying on compilation idempotence to not conditionally bootstrap.
  //---------------------------------------------------------------------------
  Client.afterInit(function() {
    Api.DEBUG.SEND = 3;
    Api.DEBUG.RECEIVE = 3;
    //Api.DEBUG.STRUCTURED_CHANGE = true;
    // Phase 1: Create views, fingerprints, and initial facts.
    if(Api.DEBUG.BOOTSTRAP) console.groupCollapsed("Phase 1: Create views, fingerprints, and initial facts");
    let effect = new Editor.DispatchEffect();
    for(var viewId in views)
      addView(effect, viewId, viewKinds[viewId] || "union", views[viewId]);

    for(var viewId in fingerprints) {
      for(let fingerprint of fingerprints[viewId])
        effect.dispatch("addFingerprint", {viewId, fingerprint, fieldIds: fingerprintFields[fingerprint]})
    }
    for(var viewId in facts)
        effect.change.changeSet.addFacts(viewId, facts[viewId].map((fact) => hoboResolve(viewId, fact)));
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();

    // Phase 2: Create queries.
    if(Api.DEBUG.BOOTSTRAP) console.groupCollapsed("Phase 2: Create queries");
    effect = new Editor.DispatchEffect();
    var members:{[viewId:string]: number} = {};
    for(let viewId in queries) {
      let query = <Parsers.Query>assertValid(new Parsers.Query().loadFromView(viewId, true).parse(queries[viewId]));

      query.name = viewId;
      query.tags.push("system");

      for(let action of query.reified.actions) {
        if(action.action === "+") {
          let {"view fingerprint: view": viewId} = Api.ixer.findOne("view fingerprint", {"view fingerprint: fingerprint": action.fingerprint}) || {};
          if(!viewId) throw new Error(`Unknown fingerprint: '${action.fingerprint}'`);
          action.memberIx = members[viewId] || 0;
          members[viewId] = action.memberIx + 1;

        } else throw new Error(`Unsupported action '${action.action}'`);
      }

      effect.dispatch("compileQuery", {query});
    }
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();

    // Phase 3: Create uis.
    if(Api.DEBUG.BOOTSTRAP) console.groupCollapsed("Phase 3: Create uis");
    effect = new Editor.DispatchEffect();

    for(let elemId in uis) {
      let ui = <Parsers.Ui>assertValid(new Parsers.Ui().loadFromElement(elemId, true).parse(uis[elemId]));
      ui.name = elemId;
      ui.tags.push("system", "ui-root");
      effect.dispatch("compileUi", {ui});
    }
    for(let projection in projections) {
      let ui = <Parsers.Ui>assertValid(new Parsers.Ui().loadFromElement(projection + "-projection-elem", true).parse(projections[projection]));
      ui.name = projection;
      ui.tags.push("system", "projection", "ui-root");
      effect.dispatch("compileUi", {ui});
      effect.change.add("display name", {"display name: id": projection + "-projection", "display name: name": projection});
    }
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();
  });
}
