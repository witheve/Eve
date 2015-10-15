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
            eve.query("page links 3")
             .select("page", {}, "page")
             .calculate("page to graph", {text: ["page", "text"], page: ["page", "page"]}, "links")
             .sort([["page", "page"], ["page", "text"]])
//              .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]})
            .debug();
    }
  }

  runtime.define("page to graph", {multi: true}, function(page, text) {
    return articleToGraph(page, text);
  });

  runtime.define("parse eavs", {multi: true}, function(page, text) {
    return parsePage(page, text).eavs;
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
  diff.add("action mapping", {action: "page links - links", from: "page", "to source": "page links - page", "to field": "page"});
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
             .calculate("page to graph", {text: ["page", "text"], page: ["page", "page"]}, "links")
             .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("search results")
             .select("search", {}, "search")
             .calculate("search string", {text: ["search", "search"]}, "results")
             .project({page: ["results", "page"], to: ["results", "to"], step: ["results", "step"]}));

  eve.asView(eve.query("active page incoming")
             .select("active page", {}, "active")
             .select("page links", {link: ["active", "page"]}, "links")
             .project({page: ["links", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("collection links")
             .select("page links", {type: "collection"}, "links")
             .project({page: ["links", "page"], deck: ["links", "link"]}));

  eve.asView(eve.query("page eavs")
             .select("page", {}, "page")
             .calculate("parse eavs", {page: ["page", "page"], text: ["page", "text"]}, "parsed")
             .project({page: ["page", "page"], attribute: ["parsed", "attribute"], value: ["parsed", "value"]}));

  eve.asView(eve.union("deck pages")
             .union("collection links", {page: ["page"], deck: ["deck"]})
             .union("history stack", {page: ["page"], deck: "history"})
             .union("page links", {page: ["link"], deck: ["type"]}));

  eve.asView(eve.union("entity")
             .union("page", {entity: ["page"]}));

  eve.asView(eve.query("deck")
             .select("deck pages", {}, "decks")
             .project({deck: ["decks", "deck"]}));

  //---------------------------------------------------------
  // Article
  //---------------------------------------------------------

  export function coerceInput(input) {
    if (input.match(/^-?[\d]+$/gim)) {
      return parseInt(input);
    }
    else if (input.match(/^-?[\d]+\.[\d]+$/gim)) {
      return parseFloat(input);
    }
    else if (input === "true") {
      return true;
    }
    else if (input === "false") {
      return false;
    }
    return input;
  }

  var breaks = /[\[\]\|=\n#]/;
  var types = {
    "#": "header",
    "[": "link open",
    "]": "link close",
    "[[": "collection open",
    "]]": "collection close",
    "|": "link separator",
    "=": "assignment",
  }
  function tokenize(article) {
    let line = 0;
    let ix = 0;
    let len = article.length;
    let tokens = [];
    let cur = {ix, line, type: "text", text: ""};
    for(; ix < len; ix++) {
      let ch = article[ix];
      if(ch.match(breaks)) {
        let type = types[ch];
        if(ch === "\n") line++;
        if(cur.text !== "" || cur.line !== line) {
          tokens.push(cur);
        }
        if(ch === "\n") {
          cur = {ix: ix+1, line, type: "text", text: ""};
          continue;
        }
        cur = {ix, line, type, text: ch};
        tokens.push(cur);
        while(ch === article[ix + 1]) {
          ix++;
          ch = article[ix];
          cur.text += ch;
        }
        if(types[cur.text]) {
          cur.type = types[cur.text];
        }
        if(type === "header") {
          //trim the next character if it's a space between the header indicator
          //and the text;
          if(article[ix+1] === " ") ix++;
        }
        cur = {ix: ix+1, line, type: "text", text: ""};
      } else {
        cur.text += ch;
      }
    }
    tokens.push(cur);
    return tokens;
  }

  function parse(tokens) {
    let links = [];
    let eavs = [];
    let collections = [];
    let state:any = {items: []};
    let lines = [];
    let line;
    let lineIx = -1;
    for(let token of tokens) {
      if(token.line !== lineIx) {
        // this accounts for blank lines.
        while(lineIx < token.line) {
          line = {ix: token.line, header: false, items: []};
          lines.push(line);
          lineIx++;
        }
      }
      let {type} = token;
      switch(type) {
        case "header":
          line.header = true;
          break;
        case "link open":
          state.capturing = true;
          state.mode = "link";
          state.items.push(token);
          break;
        case "link close":
          state.items.push(token);
          state.type = "link";
          if(state.mode === "assignment") {
            state.type = "eav";
            eavs.push(state);
          } else {
            links.push(state);
          }
          line.items.push(state);
          state = {items: []};
          break;
        case "collection open":
          state.capturing = true;
          state.mode = "collection";
          state.items.push(token);
          break;
        case "collection close":
          state.items.push(token);
          state.type = "collection";
          line.items.push(state);
          collections.push(state);
          state = {items: []};
          break;
        case "link separator":
          state.mode = "link type";
          state.items.push(token);
          break;
        case "assignment":
          state.mode = "assignment";
          state.attribute = state.link;
          break;
        case "text":
          if(!state.capturing) {
            line.items.push(token);
          } else if(state.mode === "link") {
            state.link = token.text.trim();
            state.items.push(token);
          } else if(state.mode === "link type") {
            state.linkType = token.text.trim();
            state.items.push(token);
          } else if(state.mode === "collection") {
            state.link = token.text.trim();
            state.items.push(token);
          } else if(state.mode === "assignment") {
            state.value = coerceInput(token.text.trim());
            state.items.push(token);
          }
          break;
      }
    }
    return {lines, links, collections, eavs};
  }

  var parseCache = {};
  function parsePage(pageId, content) {
    let cached = parseCache[pageId];
    if(!cached || cached[0] !== content) {
      cached = parseCache[pageId] = [content, parse(tokenize(content))];
    }
    return cached[1];
  }

  function articleToHTML(lines) {
    let children = [];
    for (let line of lines) {
      let lineChildren = [];
      let items = line.items;
      for (var item of items) {
        if(item.type === "text") {
          lineChildren.push({t: "span", text: item.text});
          continue;
        }
        if(item.type === "eav") {
          lineChildren.push({t: "span", c: `${item.type}`, text: item.value});
          continue;
        }
        let link = item.link.toLowerCase();
        let found = eve.findOne("page", {page: link}) || eve.findOne("deck", {page: link});
        lineChildren.push({t: "span", c: `${item.type} ${found ? 'found' : ""}`, text: item.link, linkText: link, click: followLink});
      }
      if(line.header) {
        lineChildren = [{t: "h1", children: lineChildren}];
      }
      children.push({t: "pre", c: `${line.header ? 'header' : ''}`, children: lineChildren});
    }
    return children;
  }

  function articleToGraph(pageId, content) {
    let parsed = parsePage(pageId, content);
    let links = [];
    for(let link of parsed.links) {
      links.push({link: link.link.toLowerCase(), type: (link.linkType || "unknown").toLowerCase()});
    }
    for(let collection of parsed.collections) {
      links.push({link: collection.link.toLowerCase(), type: "collection"});
    }
    return links;
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
      articleView = {id: `${articleId}${instance}`, c: "article", page: articleId, children: articleToHTML(parsePage(articleId, article.text).lines), dblclick: editArticle, enter: {display: "flex", opacity: 1, duration: 300}};
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
    if(eve.find("search results").length === 1) {
      pathItems[0].c += " singleton";
    }
    if(paths.length === 0) {
      let search = eve.findOne("search") || {search: "root"};
      pathItems.push({c: "path singleton", children: [
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