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

  eve.asView(eve.query("active page content")
            .select("active page", {}, "active")
            .select("page", {page: ["active", "page"]}, "page")
            .project({content: ["page", "text"]}));

  eve.asView(eve.query("page links")
             .select("page", {}, "page")
             .calculate("page to graph", {text: ["page", "text"]}, "links")
             .project({page: ["page", "page"], link: ["links", "link"], type: ["links", "type"]}));

  eve.asView(eve.query("active page incoming")
             .select("active page", {}, "active")
             .select("page links", {link: ["active", "page"]}, "links")
             .project({page: ["links", "page"], link: ["links", "link"], type: ["links", "type"]}));

  //---------------------------------------------------------
  // Article
  //---------------------------------------------------------

  function articleToHTML(article) {
    let children = [];
    let lines = article.split(/\n/);
    for (let line of lines) {
      let lineChildren = [];
      let parts = line.split(/(\[.*?\])/);
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
      outbound.push({link: match[1], type: match[2] || "unknown"});
      match = regex.exec(article);
    }
    return {outbound};
  }

  function search(articles, from, to) {
    let queue = [];
    let next = articles[from];
    let itemsTilNextLevel = 1;
    let level = 0;
    while (next && level < 6) {
      for(let outbound of next.outbound) {
        queue.push(articles[outbound]);
      }
      for(let inbound of next.inbound) {
        queue.push(articles[inbound]);
      }
      itemsTilNextLevel--;
      if(itemsTilNextLevel === 0) {
        itemsTilNextLevel = queue.length;
        level++;
      }
      next = queue.shift();
      if(next === articles[to]) {
        return true;
      }
    }
    return false;
  }

  function CodeMirrorElement(node, elem) {
    let cm = node.editor;
    if(!cm) {
      cm = node.editor = new CodeMirror(node, {
        mode: "markdown",
        lineWrapping: true,
        extraKeys: {
          "Cmd-Enter": (cm) => {
            commitArticle(cm);
          }
        }
      });
      if(elem.onInput) {
        cm.on("change", elem.onInput)
      }
      if(elem.keydown) {
        cm.on("keydown", elem.keydown);
      }
      if(elem.blur) {
        cm.on("blur", elem.blur);
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
      result.add("history stack", {page: page, pos: stack.length});
    }
    result.add("active page", {page: info.link});
    result.remove("active page");
  });

  app.handle("startEditingArticle", (result, info) => {
    result.add("editing", {editing: true});
  });

  app.handle("stopEditingArticle", (result, info) => {
    if(!eve.findOne("editing")) return;
    result.remove("editing");
    let page = eve.findOne("active page")["page"];
    result.add("page", {page, text: info.value});
    result.remove("page", {page});
  });

  export function root() {
    let article = eve.findOne("active page content") || {content: ""};
    let articleView;
    if(!eve.findOne("editing")) {
      articleView = {c: "article", children: articleToHTML(article.content), dblclick: editArticle};
    } else {
      articleView = {id: "article editor", c: "article editor", postRender: CodeMirrorElement, value: article.content, blur: commitArticle};
    }
    return {id: "root", c: "root", children: [
      articleView,
      relatedItems(article),
      historyStack(),
    ]};
  }

  function relatedItems(article) {
    let items = [];
    for(let inbound of eve.find("active page incoming")) {
      items.push({text: inbound["page"], linkText: inbound["page"], click: followLink});
    }
    return {children: items};
  }

  function commitArticle(cm) {
    app.dispatch("stopEditingArticle", {value: cm.getValue()}).commit();
  }

  function editArticle(e, elem) {
    app.dispatch("startEditingArticle").commit();
    e.preventDefault();
  }

   function followLink(e, elem) {
    app.dispatch("followLink", {link: elem.linkText}).commit();
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