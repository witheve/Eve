module Bootstrap {
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
    "block history": ["tick", "page", "block", "ix", "entity", "projection"],
    "block": ["page", "block", "ix", "entity", "projection"],
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
    "default page": ["page"],
    "builtin entity": ["entity", "kind"],
    "builtin collection entity": ["entity", "kind"],
    "builtin page": ["entity", "page"],
    "builtin block": ["page", "block", "ix", "entity", "projection"],
    "builtin projection": ["projection", "element"],
    "builtin default projection": ["entity", "projection"],
    "builtin kind projection": ["kind", "projection"]
  };
  var viewKinds:{[viewId:string]: string} = {
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
    "concat": ["?A concat ?B = ?result"],
    "remainder": ["?A remainder ?B = ?result"],
    "-": ["?A - ?B = ?result"],
    "+": ["?A + ?B = ?result"],
    "/": ["?A / ?B = ?result"],
    "*": ["?A * ?B = ?result"],

    "<": ["?A < ?B"],
    "<=": ["?A <= ?B"],
    "!=": ["?A != ?B"],

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
      "block ?block on layer ?ix represents ?entity in ?page as an ?projection"
    ],
    "block history": [
      "block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick",
      "block ?block on layer ?ix represents ?entity in ?page as an ?projection at tick ?tick"
    ],
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
    "builtin kind projection": []
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

    "set block state": Parsers.unpad(6) `
      block ?%block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection
    `,

    // Selected page
    "set selected page": Parsers.unpad(6) `
      ?page is the selected page at tick ?tick
      # ?ord by ?tick descending
      ?ord < "2"
      + ?page is the selected page
    `,
    "select page on index click": Parsers.unpad(6) `
      event at ?tick is a "switch page" ? with key ?entity
      page ?page represents ?entity
      + ?page is the selected page at tick ?tick
    `,

    // Create pages
    "create entity pages": Parsers.unpad(6) `
      entity ?entity is a ?
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

    "maintain handled events state": Parsers.unpad(6) `
      event at ?tick is already handled
      + event at ?tick is already handled
    `,

    "maintain block history state": Parsers.unpad(6) `
      block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
    `,


    // User page editing
    "user created blocks": Parsers.unpad(6) `
      ; @TODO: Figure out why I'm failing to fixed point. Its because these unions arent stateful...
      event at ?tick is an "add block" ? with key ?page
      ! event at ?tick is already handled
      next layer for page ?page is ?next
      ?block-id $= "manual-block-" concat ?tick
      ?projection = "search-and-replace-projection"
      + block ?block-id on layer ?next represents ?block-id in ?page as a ?projection at tick ?tick
      + event at ?tick is already handled
    `,

    // User projection switching
    "user switch projection": Parsers.unpad(6) `
      event at ?tick is a "switch block projection" ? with key ?block
      ! event at ?tick is already handled
      event at ?tick is valued ?projection
      block ?block on layer ?ix represents ?entity in ?page as a ? at tick ?
      + block ?block on layer ?ix represents ?entity in ?page as a ?projection at tick ?tick
    `
  };

  let uis:{[elemId:string]: string} = {
    "wiki root-elem": Parsers.unpad(6) `
      div; wiki root
        ~ ?page is the selected page
        ~ page ?page represents ?root_entity
        div bordered ui-row; wiki header
          ~ ?header $= "Copperfield: " concat ?page
          - flex: "none"
          span
            - flex: "none"
            - text: ?header
        div; page
          div; block
            ~ block ?%block on layer ?ix represents ?entity in ?page as a ?projection
            ~ # ?ord by ?ix ascending
            - ix: ?ix
            dropdown
              ~ entity ?entity is a ?kind
              ~ ?kind entities can look like a ??projection_opts
              - key: ?block
              - options: ?projection_opts
              - defaultOption: ?projection
              @change switch block projection: ?block
            div
              ~ projection ?projection is templated as ??element
              > ?element ?entity
          div bordered; add-block
            - text: "+"
            @click add block: ?page
        div bordered ui-row; wiki footer
          - flex: "none"
          - text: "footer"
    `
  };

  var projections:{[projection:string]: string} = {
    // Projections
    name: Parsers.unpad(6) `
      ~ ?entity is named ?name
      - c: "bordered"
      - debug: "name"
      - text: ?name
      @click switch page: ?entity
    `,
    // index projection to list related entities by name as blocks
    index: Parsers.unpad(6) `
      ~ ?entity is an entity
      - c: "bordered"
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
      - c: "bordered"
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
      - c: "bordered"
      - t: "fact-table"
      - view: ?entity
    `,
    renderer: Parsers.unpad(6) `
      ~ entity ?entity is a "ui"
      ~ ?entity != "wiki root-elem"
      ~ ?entity != "renderer-projection-elem"
      - c: "bordered"
      - t: "renderer"
      - element: ?entity
    `,
    "search-and-replace": Parsers.unpad(6) `
      - c: "bordered"
      - text: "search and replace!"
    `
  };


  //---------------------------------------------------------------------------
  // Macro-generated builtin facts.
  //---------------------------------------------------------------------------
  addCollection("collections", "collection", ["index-projection"]);
  addCollection("queries", "query");
  addCollection("unions", "union", ["fact-table-projection"]);
  addCollection("uis", "ui", ["renderer-projection"]);
  addCollection("projections", "projection");

  for(let projection in projections)
    facts["builtin projection"].push({projection: projection + "-projection", element: projection + "-projection-elem"});

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
  for(let elemId in uis) uis[elemId] = uis[elemId].replace(/\"/gm, "`");
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

    // effect.change.add("view", {"view: view": "next layer", "view: kind": "join"}) // @TODO: Finish me.
    //   .add("display name", "next layer")
    //   .add("source", {"source: source": "set next layer block source", "source: source view": "block"})
    //   .add("display order", 0)

    //   .add("variable", {"variable: variable": "set next layer page var"})
    //   .add("binding", {"binding: field": "block: page"})
    //   .add("field", {"field: field": "next layer: page", "field: kind": "output"})
    //   .add("display name",  "page")
    //   .add("display order", 0)
    //   .add("grouped field", {"grouped field: field": "block: page"})
    //   .add("select")

    //   .add("variable", {"variable: variable": "set next layer ix var"})
    //   .add("binding", {"binding: field": "block: ix"})
    //   .add("binding", {"binding: source": "set next layer + source", "binding: field": "+: A"})
    //   .add("sorted field", {"sorted field: field": "block: ix", "sorted field: ix": 0, "sorted field: direction": "descending"})

    //   .add("variable", {"variable: variable": "set next layer ord var"})
    //   .add("ordinal binding")
    //   .add("binding", {"binding: source": "set next layer < source", "binding: field": "<: A"})

    //   .add("source", {"source: source": "set next layer < source", "source: source view": "<"})
    //   .add("display order", 1)
    //   .add("variable", {"variable: variable": "set next layer < constant var"})
    //   .add("constant binding", 2)
    //   .add("binding", {"binding: field": "<: B"})

    //   .add("source", {"source: source": "set next layer + source", "source: source view": "+"})
    //   .add("display order", 1)
    //   .add("variable", {"variable: variable": "set next layer + constant var"})
    //   .add("constant binding", 1)
    //   .add("binding", {"binding: field": "+: B"})

    //   .add("variable", {"variable: variable": "set next layer + result var"})
    //   .add("binding", {"binding: field": "+: result"})
    //   .add("field", {"field: field": "next layer: ix", "field: kind": "output"})
    //   .add("display name", "ix")
    //   .add("display order", 1)
    //   .add("select")
    //   .clearContext();


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
    }
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();
    Api.DEBUG.STRUCTURED_CHANGE = true;
  });
}