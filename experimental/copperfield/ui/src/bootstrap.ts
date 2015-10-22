module Bootstrap {
  var resolve = Api.resolve;
  function hoboResolve(viewId:string, fact:Api.Dict):Api.Dict {
    for(let name in fact) {
      fact[viewId + ": " + name] = fact[name];
      delete fact[name];
    }
    return fact;
  }

  let views:{[viewId:string]: string[]} = {
    "entity": ["entity"],
    "entity kind": ["entity", "kind"],
    "page": ["entity", "page", "element"],
    "block": ["page", "block", "entity", "element"],
    "selected page": ["page"],
    "selected block": ["block"],

    "default page": ["page"],
    "builtin entity": ["entity", "kind"],
    "builtin page": ["entity", "page", "element"],
    "builtin block": ["page", "block", "element"],

    "projection": ["projection", "element"],
    "default projection": ["entity", "projection"],
    "kind projection": ["kind", "projection"],
    "block projection": ["block", "projection"],
  };
  let viewKinds:{[viewId:string]: string} = {
    "default page": "table",
    "builtin entity": "table",
    "builtin page": "table",
    "builtin block": "table"
  }

  let fingerprintsRaw:{[viewId:string]: string[]} = {
    "entity": ["?entity is an entity"],
    "entity kind": ["entity ?entity is a ?kind", "entity ?entity is an ?kind"],
    "page": ["page ?page represents ?entity as ?element"],
    "block": ["block ?block represents ?entity in ?page as ?element"],
    "selected page": ["?page is the selected page"],
    "selected block": ["?block is the selected block"],

    "default page": ["?page is the default page"],
    "builtin entity": ["builtin entity ?entity is a ?kind", "builtin entity ?entity is an ?kind"],
    "builtin page": ["builtin page ?page represents ?entity as ?element"],
    "builtin block": ["builtin block ?block represents ?entity in ?page as ?element"],

    "projection": ["projection ?projection is templated as ?element"],
    "default projection": ["entity ?entity usually looks like a ?projection", "entity ?entity usually looks like an ?projection"],
    "kind projection": ["?kind entities can look like a ?projection", "?kind entities can look like an ?projection"],
    "block projection": ["block ?block looks like a ?projection", "block ?block looks like an ?projection"],
  };

  let facts:{[viewId:string]: Api.Dict[]} = {
    "default page": [{page: "homepage"}],
    "builtin entity": [
      {entity: "entities", kind: "collection"},
      {entity: "collections", kind: "collection"}
    ],
    "builtin page": [{entity: "entities", page: "homepage", element: "homepage-elem"}],
  };

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
          fieldIds.push(viewId + ": " + chunk.slice(1));
          fingerprint += "?"
        } else fingerprint += chunk;
        multi = true;
      }
      fingerprints[viewId].push(fingerprint);
      fingerprintFields[fingerprint] = fieldIds;
    }
  }

  let queries:{[viewId:string]: string} = {
    // Defaults
    "set selected page default": Parsers.unpad(6) `
      ?page is the default page
      + ?page is the selected page
    `,
    "set builtin entities": Parsers.unpad(6) `
      builtin entity ?entity is a ?kind
      + entity ?entity is a ?kind
    `,
    "set builtin pages": Parsers.unpad(6) `
      builtin page ?page represents ?entity as ?element
      + page ?page represents ?entity as ?element
    `,
    "set builtin blocks": Parsers.unpad(6) `
      builtin block ?block represents ?entity in ?page as ?element
      + block ?block represents ?entity in ?page as ?element
    `,
    "entity list": Parsers.unpad(6) `
      entity ?entity is a ?
      + ?entity is an entity
    `,
    "view entity": Parsers.unpad(6) `
      view ?entity is a ?kind
      + entity ?entity is a ?kind
    `,
    "ui entity": Parsers.unpad(6) `
      ?entity is tagged "ui-root"
      ?kind = "ui"
      + entity ?entity is a ?kind
    `,
  };
  for(let viewId in queries) queries[viewId] = queries[viewId].replace(/\"/gm, "`");

  function addView(effect, viewId, kind, fields) {
    effect.change.add("view", resolve("view", {view: viewId, kind}))
      .add("display name", viewId);

    let fieldIx = 0;
    for(let fieldName of fields)
      effect.change.add("field", resolve("field", {field: viewId + ": " + fieldName, ix: fieldIx, kind: "output"}))
        .add("display name", fieldName)
        .add("display order", fieldIx++);
    return effect;
  }

  Client.afterInit(function() {
    Api.DEBUG.SEND = 3;
    Api.DEBUG.STRUCTURED_CHANGE = true;
    // Phase 1: Create  and initialize views (tables + unions).
    console.info("BOOTSTRAP");
    if(Api.DEBUG.BOOTSTRAP) console.groupCollapsed("Phase 1: Create tables + unions");
    let effect = new Editor.DispatchEffect();
    for(var viewId in views) {
      let kind = viewKinds[viewId] || "union";
      console.log(viewId, kind);
      addView(effect, viewId, kind, views[viewId]);
      if(kind === "table" && facts[viewId])
        effect.change.changeSet.addFacts(viewId, facts[viewId].map((fact) => hoboResolve(viewId, fact)));

      for(let fingerprint of fingerprints[viewId])
        effect.dispatch("addFingerprint", {viewId, fingerprint, fieldIds: fingerprintFields[fingerprint]})
    }
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();

    // Phase 2: Create queries.
    if(Api.DEBUG.BOOTSTRAP) console.groupCollapsed("Phase 2: Create queries");
    effect = new Editor.DispatchEffect();
    var members:{[viewId:string]: number} = {};
    for(let viewId in queries) {
      let query = new Parsers.Query().loadFromView(viewId, true).parse(queries[viewId]);

      if(query.errors.length) {
        console.warn("Failed to parse: " + viewId);
        for(let error of query.errors)
          console.warn(error.toString());

        throw new Error("Invalid query");
      }

      query.name = viewId;
      query.tags = query.tags || [];
      query.tags.push("system");

      for(let action of query.reified.actions) {
        if(action.action === "+") {
          for(let viewId in fingerprints) {
            if(fingerprints[viewId].indexOf(action.fingerprint) !== -1) {
              action.memberIx = members[viewId] || 0;
              members[viewId] = action.memberIx + 1;
              break;
            }
          }
        } else throw new Error(`Unsupported action '${action.action}'`);
      }

      effect = effect.dispatch("compileQuery", {query});
    }
    effect.done();
    if(Api.DEBUG.BOOTSTRAP) console.groupEnd();

    // Phase 3: Default values
  });
}