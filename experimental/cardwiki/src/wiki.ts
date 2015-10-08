/// <reference path="app.ts" />
/// <reference path="microReact.ts" />
/// <reference path="runtime.ts" />
"use strict"

module wiki {

  declare var CodeMirror;

  //---------------------------------------------------------
  // App state
  //---------------------------------------------------------

  var eve = app.eve;
  var diff = eve.diff();
  diff.add("page", {page: "foo", text: "[pixar] movies:\n[up]\n[toy story]"});
  diff.add("page", {page: "pixar", text: "[Pixar] is an animation studio owned by disney"});
  diff.add("active page", {page: "foo"});
  eve.applyDiff(diff);

  runtime.define("page to graph", {multi: true}, function(text) {
    return articleToGraph(text).outbound;
  });

  runtime.define("search string", {multi: true}, function(text) {
    return search(text);
  });

  eve.asView(eve.query("active page content")
            .select("active page", {}, "active")
            .select("page", {page: ["active", "page"]}, "page")
            .project({content: ["page", "text"]}));

  eve.asView(eve.query("page links")
             .select("page", {}, "page")
             .calculate("page to graph", {text: ["page", "text"]}, "links")
             .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("search results")
             .select("search", {}, "search")
             .calculate("search string", {text: ["search", "search"]}, "results")
             .project({page: ["results", "page"], step: ["results", "step"]}));

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
      children.push({t: "pre", children: lineChildren});
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

  function search(searchString) {
    // search the string for entities / decks
    // TODO: this is stupidly slow
    let cleaned = searchString.toLowerCase();
    let entities = [];
    let decks = [];
    for(var entity of eve.find("entity")) {
      let id = entity.entity;
      if(cleaned.indexOf(id) > -1) {
        entities.push(id);
      }
    }
    for(var deck of eve.find("deck")) {
      let id = deck.deck;
      if(cleaned.indexOf(id) > -1) {
        decks.push(id);
      }
    }
    // TODO: handle more than two entities
    //
    let [from, to] = entities;
    if(!from) return [];
    if(!to) return [{page: from, step: 0}];

    let results = [];
    for(let path of findPath(from, to)) {
      for(let ix = 0, len = path.length; ix < len; ix++) {
        results.push({page: path[ix], step: ix})
      }
    }
    for(let path of findPath(to, from)) {
      for(let ix = 0, len = path.length; ix < len; ix++) {
        results.push({page: path[len - ix - 1], step: ix})
      }
    }
    return results;
  }

  function CodeMirrorElement(node, elem) {
    let cm = node.editor;
    if(!cm) {
      cm = node.editor = new CodeMirror(node, {
        mode: "markdown",
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

  app.handle("followLink", (result, info) => {
    let page = eve.findOne("active page")["page"];
    if(!eve.findOne("history stack", {page})) {
      let stack = eve.find("history stack");
      result.add("history stack", {page, pos: stack.length});
    }
    result.add("active page", {page: info.link});
    result.remove("active page");
    result.remove("search");
    result.add("search", {search: info.link});
  });

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
    result.add("search", {search: info.value});
    result.remove("search");
  });

  export function root() {
    let activeId = eve.findOne("active page")["page"];
    let articleView = articleUi(activeId);
    return {id: "root", c: "root", children: [
      {children: [
        {c: "search-input", t: "input", type: "text", placeholder: "search", keydown: maybeSubmitSearch},
        searchResults(),
      ]},
      {children: [
        relatedItems(),
        historyStack(),
        decks(),
      ]},
    ]};
  }

  function articleUi(articleId) {
    let article = eve.findOne("page", {page: articleId}) || {text: ""};
    let articleView;
    if(!eve.findOne("editing", {page: articleId})) {
      articleView = {c: "article", page: articleId, children: articleToHTML(article.text), dblclick: editArticle};
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

  function decks() {
    let items = [];
    for(let deck of eve.find("deck")) {
      items.push({text: deck["deck"]});
    }
    return {c: "decks", children: [
      {text: "decks:"},
      {children: items}
    ]};
  }

  function searchResults() {
    let steps = [];
    let results = eve.find("search results");
    for(let result of results) {
      let {step, page} = result;
      if(!steps[step]) {
        steps[step] = {c: "step", children: []};
      }
      let pageContent = eve.findOne("page", {page});
      let article;
      if(pageContent) {
        article = articleUi(page);
      } else {
        article = articleUi(page);
      }
      steps[step].children.push(article);
    }
    return {c: "search-results", children: steps};
  }

  function commitArticle(cm, elem) {
    app.dispatch("stopEditingArticle", {page: elem.page, value: cm.getValue()}).commit();
  }

  function editArticle(e, elem) {
    app.dispatch("startEditingArticle", {page: elem.page}).commit();
    e.preventDefault();
  }

  function followLink(e, elem) {
    app.dispatch("followLink", {link: elem.linkText}).commit();
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
      return {c: "link", text: link, linkText: link, click: followLink};
    });
    return {c: "history-stack", children: stackItems};
  }

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  app.renderRoots["wiki"] = root;

}