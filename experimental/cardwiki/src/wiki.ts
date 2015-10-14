/// <reference path="app.ts" />
/// <reference path="microReact.ts" />
/// <reference path="runtime.ts" />
"use strict"

module wiki {

  declare var CodeMirror;
  declare var pluralize;

  //---------------------------------------------------------
  // App state
  //---------------------------------------------------------

  var eve = app.eve;

  function initEve() {
    let stored = localStorage["eve"];
    if(!stored) {
      var diff = eve.diff();
      diff.add("page", {page: "foo", text: "[pixar] movies:\n[up]\n[toy story]"});
      diff.add("page", {page: "pixar", text: "[Pixar] is an animation studio owned by disney"});
      diff.add("search", {search: "foo"});
      eve.applyDiff(diff);
    } else {
      eve.load(stored);
    }
  }

  runtime.define("page to graph", {multi: true}, function(text) {
    return articleToGraph(text).outbound;
  });

  runtime.define("search string", {multi: true}, function(text) {
    return search(text);
  });

  // view: view, kind[union|query]
  // action: view, action, kind[select|calculate|project|union|ununion|stateful], ix
  // action source: action, source view
  // action mapping: action, from, to source, to field
  // action mapping constant: action, from, value

  eve.addTable("view", ["view", "kind"]);
  eve.addTable("action", ["view", "action", "kind", "ix"]);
  eve.addTable("action source", ["action", "source view"]);
  eve.addTable("action mapping", ["action", "from", "to source", "to field"]);
  eve.addTable("action mapping constant", ["action", "from", "value"]);

  var diff = eve.diff();
  diff.add("view", {view: "page links 2", kind: "query"});
  diff.add("action", {view: "page links 2", action: "page links - page", kind: "select", ix: 0});
  diff.add("action source", {action: "page links - page", "source view": "page"});
  diff.add("action", {view: "page links 2", action: "page links - links", kind: "calculate", ix: 1});
  diff.add("action source", {action: "page links - links", "source view": "page to graph"});
  diff.add("action mapping", {action: "page links - links", from: "text", "to source": "page links - page", "to field": "text"});
  diff.add("action", {view: "page links 2", action: "page links - project", kind: "project", ix: 2});
  diff.add("action mapping", {action: "page links - project", from: "page", "to source": "page links - page", "to field": "page"});
  diff.add("action mapping", {action: "page links - project", from: "link", "to source": "page links - links", "to field": "link"});
  diff.add("action mapping", {action: "page links - project", from: "type", "to source": "page links - links", "to field": "type"});
  eve.applyDiff(diff);

  function compile(ixer, viewId) {
    let view = ixer.findOne("view", {view: viewId});
    if(!view) {
      throw new Error(`No view found for ${viewId}.`);
    }
    let compiled = ixer[view.kind](viewId);
    let actions = ixer.find("action", {view: viewId});
    if(!actions) {
      throw new Error(`View ${viewId} has no actions.`);
    }
    // sort actions by ix
    actions.sort((a, b) => a.ix - b.ix);
    for(let action of actions) {
      let actionKind = action.kind;
      let mappings = ixer.find("action mapping", {action: action.action});
      let mappingObject = {};
      for(let mapping of mappings) {
        let source = mapping["to source"];
        let field = mapping["to field"];
        if(actionKind === "union" || actionKind === "ununion") {
          mappingObject[mapping.from] = [field];
        } else {
          mappingObject[mapping.from] = [source, field];
        }
      }
      let constants = ixer.find("action mapping constant", {action: action.action});
      for(let constant of constants) {
        mappingObject[constant.from] = constant.value;
      }
      let source = ixer.findOne("action source", {action: action.action});
      if(!source && actionKind !== "project") {
        throw new Error(`${actionKind} action without a source in '${viewId}'`);
      }
      if(actionKind !== "project") {
        compiled[actionKind](source["source view"], mappingObject, action.action);
      } else {
        compiled[actionKind](mappingObject);
      }
    }
    return compiled;
  }


//   foo
//   .group([["", ""], ["", ""]])
//   .sort([["", "", "ascending"], ["", "", "descending"]])
//   .limit({results: 5,
//           perGroup: 5})
//   .aggregate("sum", {}, "sum");

  eve.asView(eve.query("page links")
             .select("page", {}, "page")
             .calculate("page to graph", {text: ["page", "text"]}, "links")
             .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("search results")
             .select("search", {}, "search")
             .calculate("search string", {text: ["search", "search"]}, "results")
             .project({page: ["results", "page"], to: ["results", "to"], step: ["results", "step"]}));

  eve.asView(eve.query("active page incoming")
             .select("active page", {}, "active")
             .select("page links", {link: ["active", "page"]}, "links")
             .project({page: ["links", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.union("deck pages")
             .union("history stack", {page: ["page"], deck: "history"})
             .union("page links", {page: ["link"], deck: ["type"]}));

  eve.asView(eve.union("entity")
             .union("page", {entity: ["page"]})
             .union("page links", {entity: ["link"]}));

  eve.asView(eve.query("deck")
             .select("deck pages", {}, "decks")
             .project({deck: ["decks", "deck"]}));

  //---------------------------------------------------------
  // Article
  //---------------------------------------------------------

  function articleToHTML(article) {
    let children = [];
    let lines = article.split(/\n/);
    for (let line of lines) {
      line = line.trim();
      let header = false;
      if(line[0] === "#") {
        header = true;
        line = line.substring(1).trim();
      }
      let lineChildren = [];
      let parts = line.split(/(\[.*?\])(?:\(.*?\))?/);
      for (var part of parts) {
        if (part[0] === "[") {
          let linkText = part.substring(1, part.length - 1).toLowerCase();
          let page = eve.findOne("page", {page: linkText});
          let found = "";
          if(page && page.text) {
            found = "found";
          };
          lineChildren.push({t: "span", c: `link ${found}`, text: part.substring(1, part.length -1), linkText, click: followLink });
        } else {
          lineChildren.push({t: "span", text: part });
        }
      }
      if(header) {
        lineChildren = [{t: "h1", children: lineChildren}];
      }
      children.push({t: "pre", c: `${header ? 'header' : ''}`, children: lineChildren});
    }
    return children;
  }


  function articleToGraph(article) {
    let outbound = [];
    let regex = /\[(.*?)\](?:\((.*?)\))?/g;
    let match = regex.exec(article);
    while(match) {
      outbound.push({link: match[1].toLowerCase(), type: (match[2] || "unknown").toLowerCase()});
      match = regex.exec(article);
    }
    return {outbound};
  }

  function findPath(from, to, depth = 0, seen = {}) {
    if(from === to) return [[to]];
    if(depth > 5) return [];
    seen[from] = true;
    let results = [];
    var outbound = eve.find("page links", {page: from});
    for(let out of outbound) {
      let cur = out["link"];
      if(!seen[cur]) {
        if(cur !== to) seen[cur] = true;
        for(var result of findPath(cur, to, depth + 1, seen)) {
          result.unshift(from);
          results.push(result);
        }
      }
    }
    var inbound = eve.find("page links", {link: from});
    for(let inb of inbound) {
      let cur = inb["page"];
      if(!seen[cur]) {
        if(cur !== to) seen[cur] = true;
        for(var result of findPath(cur, to, depth + 1, seen)) {
          result.unshift(from);
          results.push(result);
        }
      }
    }
    return results;
  }

  function stringMatches(string, index) {
    // remove all non-word non-space characters
    let cleaned = string.replace(/[^\s\w]/gi, "").toLowerCase();
    let words = cleaned.split(" ");
    let front = 0;
    let back = words.length;
    let results = [];
    while(front < words.length) {
      let str = words.slice(front, back).join(" ");
      let found = index[str];
      if(!found) {
        str = pluralize(str, 1);
        found = index[str];
        if(!found) {
          str = pluralize(str, 12);
          found = index[str];
        }
      }
      if(found) {
        results.push(str);
        front = back;
        back = words.length;
      } else if(back - 1 > front) {
        back--;
      } else {
        back = words.length;
        front++;
      }
    }
    return results;
  }

  function search(searchString) {
    // search the string for entities / decks
    // TODO: this is stupidly slow
    let cleaned = searchString.toLowerCase();
    eve.find("entity", {entity: ""});
    var index = eve.table("entity").indexes["entity"].index;
    let entities = stringMatches(searchString, index);
    eve.find("deck", {deck: ""});
    var deckIndex = eve.table("deck").indexes["deck"].index;
    let decks = stringMatches(searchString, deckIndex);
    // TODO: handle more than two entities
    //
    if(entities.length === 0 && decks.length) {
      let results = [];
      for(let deck of decks) {
        for(let page of eve.find("deck pages", {deck})) {
            results.push({page: page["page"], step: 0});
        }
      }
      return results;
    }
    let [from, to] = entities;
    if(!from) return [];
    if(!to) return [{page: from, step: 0}];

    let results = [];
    let pathIx = 0;
    for(let path of findPath(from, to)) {
      for(let ix = 0, len = path.length; ix < len; ix++) {
        results.push({to: path[ix + 1] || "", page: path[ix], step: ix})
      }
    }
    for(let path of findPath(to, from)) {
      for(let ix = 0, len = path.length; ix < len; ix++) {
        results.push({to: path[len - ix - 2] || "", page: path[len - ix - 1], step: ix})
      }
    }
    return results;
  }

  function CodeMirrorElement(node, elem) {
    let cm = node.editor;
    if(!cm) {
      cm = node.editor = new CodeMirror(node, {
        mode: "gfm",
        lineWrapping: true,
        extraKeys: {
          "Cmd-Enter": (cm) => {
            commitArticle(cm, elem);
          }
        }
      });
      if(elem.onInput) {
        cm.on("change", elem.onInput)
      }
      if(elem.keydown) {
        cm.on("keydown", (cm) => { elem.keydown(cm, elem); });
      }
      if(elem.blur) {
        cm.on("blur", (cm) => { elem.blur(cm, elem); });
      }
      cm.focus();
    }
    if(cm.getValue() !== elem.value) {
      cm.setValue(elem.value);
    }
  }

  //---------------------------------------------------------
  // Wiki
  //---------------------------------------------------------

  app.handle("startEditingArticle", (result, info) => {
    result.add("editing", {editing: true, page: info.page});
  });

  app.handle("stopEditingArticle", (result, info) => {
    if(!eve.findOne("editing")) return;
    result.remove("editing");
    let {page, value} = info;
    result.add("page", {page, text: value});
    result.remove("page", {page});
  });

  app.handle("setSearch", (result, info) => {
    let search = eve.findOne("search")["search"];
    if(search === info.value) return;

    if(!eve.findOne("history stack", {page: search})) {
      let stack = eve.find("history stack");
      result.add("history stack", {page: search, pos: stack.length});
    }
    result.remove("search");
    result.add("search", {search: info.value.trim()});
  });

  export function root() {
    let search = "";
    let searchObj = eve.findOne("search");
    if(searchObj) {
      search = searchObj["search"];
    }
    return {id: "root", c: "root", children: [
      {c: "spacer"},
      {c: "search-input", t: "input", type: "text", placeholder: "search", keydown: maybeSubmitSearch, value: search},
      searchResults(),
//       relatedItems(),
      {c: "spacer"},
      historyStack(),
    ]};
  }

  function articleUi(articleId, instance:string|number = "") {
    let article = eve.findOne("page", {page: articleId}) || {text: ""};
    let articleView;
    if(!eve.findOne("editing", {page: articleId})) {
      articleView = {id: `${articleId}${instance}`, c: "article", page: articleId, children: articleToHTML(article.text), dblclick: editArticle, enter: {display: "flex", opacity: 1, duration: 300}};
    } else {
      articleView = {id: "article editor", c: "article editor", page: articleId, postRender: CodeMirrorElement, value: article.text, blur: commitArticle};
    }
    return articleView;
  }

  function relatedItems() {
    let items = [];
    for(let inbound of eve.find("active page incoming")) {
      items.push({text: inbound["page"], linkText: inbound["page"], click: followLink});
    }
    return {children: items};
  }

  function searchResults() {
    let pathItems = [];
    let paths = eve.find("search results", {step: 0});
    let pathIx = 0;
    for(let path of paths) {
      let result = path;
      pathItems[pathIx] = {c: "path", children: []};
      while(result) {
        let {step, page, to} = result;
        let pageContent = eve.findOne("page", {page});
        let article = articleUi(page, pathIx);
        pathItems[pathIx].children.push(article, {c: "arrow ion-ios-arrow-thin-right"});
        result = eve.findOne("search results", {step: step + 1, page: to});
      }
      pathItems[pathIx].children.pop();
      pathIx++;
    }
    if(eve.find("search results").length < 2) {
      pathItems[0].c += " singleton";
    }
    if(paths.length === 0) {
      let search = eve.findOne("search") || {search: "root"};
      pathItems.push({c: "path", children: [
        articleUi(search.search)
      ]});
    }
    return {c: "search-results", children: pathItems};
  }

  function commitArticle(cm, elem) {
    app.dispatch("stopEditingArticle", {page: elem.page, value: cm.getValue()}).commit();
  }

  function editArticle(e, elem) {
    app.dispatch("startEditingArticle", {page: elem.page}).commit();
    e.preventDefault();
  }

  function followLink(e, elem) {
    app.dispatch("setSearch", {value: elem.linkText}).commit();
  }

  function maybeSubmitSearch(e, elem) {
    if(e.keyCode === 13) {
      app.dispatch("setSearch", {value: e.currentTarget.value}).commit();
    }
  }

  function historyStack() {
    let stack = eve.find("history stack");
    stack.sort((a, b) => a.pos - b.pos);
    let stackItems = stack.map((item) => {
      let link = item["page"];
      let items = link.split(" ");
      let text = "";
      if(items.length > 1) {
        text = items[0][0] + items[1][0];
      } else if(items.length) {
        text = items[0].substring(0, 2);
      }
      return {c: "link", text, linkText: link, click: followLink};
    });
    return {c: "history-stack", children: stackItems};
  }

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  app.init("wiki", function() {
    initEve();
    app.renderRoots["wiki"] = root;
  });

}