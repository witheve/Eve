/// <reference path="app.ts" />
/// <reference path="microReact.ts" />

module wiki {

  declare var CodeMirror;

  //---------------------------------------------------------
  // App state
  //---------------------------------------------------------

  app.state = {
    articles: {
      "foo": {text: "[pixar] movies:\n[up]\n[toy story]", outbound: [], inbound: []},
      "pixar": {text: "[Pixar] is an animation studio owned by disney", outbound: [], inbound: []}
    },
    activeArticle: "foo",
    historyStack: [],
  }
  var state:any = app.state;

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
          let found = "";
          if(state.articles[linkText] && state.articles[linkText].text) {
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
    let lines = article.split(/\n/);
    for (let line of lines) {
      let lineChildren = [];
      let parts = line.split(/(\[.*?\])/);
      for (var part of parts) {
        if (part[0] === "[") {
          let linkText = part.substring(1, part.length - 1).toLowerCase();
          outbound.push(linkText);
        }
      }
    }
    return {outbound};
  }

  function followLink(e, elem) {
    app.dispatch("followLink", {link: elem.linkText}).commit();
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
          "Cmd-Enter": () => {
            commitArticle({}, elem);
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

  app.handle("updateArticle", (result, info) => {
    if(!state.articles[state.activeArticle]) {
      state.articles[state.activeArticle] = {text: "", outbound: [], inbound: []};
    }
    state.articles[state.activeArticle].text = info.value;
    //parse this into links and update the links in the graph
  });

  app.handle("followLink", (result, info) => {
    if(state.historyStack.indexOf(state.activeArticle) === -1) {
      state.historyStack.push(state.activeArticle);
    }
    state.activeArticle = info.link;
  });

  app.handle("startEditingArticle", (result, info) => {
    state.editing = true;
  });

  app.handle("stopEditingArticle", (result, info) => {
    if(!state.editing) return;
    state.editing = false;
    let article = state.articles[state.activeArticle];
    updateGraph({[state.activeArticle]: articleToGraph(article.text)});
      console.log(search(state.articles, "pixar", "foo"))

  });

  function diffArrays(arrayA, arrayB) {
    let adds = [];
    let removes = [];
    for(var a of arrayA) {
      if(arrayB.indexOf(a) === -1) {
        removes.push(a);
      }
    }
    for(var b of arrayB) {
      if(arrayA.indexOf(b) === -1) {
        adds.push(b);
      }
    }
    return {adds, removes};
  }

  function updateGraph(graphChanges) {
    for(let nodeId in graphChanges) {
      let cur = state.articles[nodeId];
      let diffs = diffArrays(cur.outbound, graphChanges[nodeId].outbound);
      for(let remove of diffs.removes) {
        let inboundRemove = state.articles[remove].inbound;
        inboundRemove.splice(inboundRemove.indexOf(nodeId), 1);
      }
      for(let add of diffs.adds) {
        if(!state.articles[add]) {
          state.articles[add] = {text: "", inbound: [], outbound: []};
        }
        if(state.articles[add].inbound.indexOf(nodeId) === -1) {
          state.articles[add].inbound.push(nodeId);
        }
      }
      cur.outbound = graphChanges[nodeId].outbound;
    }
    console.log(state.articles);
  }

  export function root() {
    let article = state.articles[state.activeArticle] || {text: ""};
    let articleView;
    if(!state.editing) {
      articleView = {c: "article", children: articleToHTML(article.text), dblclick: editArticle};
    } else {
      articleView = {id: "article editor", c: "article editor", postRender: CodeMirrorElement, value: article.text, onInput: updateArticle, blur: commitArticle};
    }
    return {id: "root", c: "root", children: [
      articleView,
      relatedItems(article),
      historyStack(),
    ]};
  }

  function relatedItems(article) {
    let items = [];
    for(let inbound of article.inbound) {
      items.push({text: inbound, linkText: inbound, click: followLink});
    }
    return {children: items};
  }

  function commitArticle(e, elem) {
    app.dispatch("stopEditingArticle").commit();
  }

  function editArticle(e, elem) {
    app.dispatch("startEditingArticle").commit();
    e.preventDefault();
  }

  function historyStack() {
    let stack = state.historyStack.map((link) => {
      return {c: "link", text: link, linkText: link, click: followLink};
    });
    return {c: "history-stack", children: stack};
  }

  function updateArticle(cm) {
    app.dispatch("updateArticle", {value: cm.getValue()}).commit();
  }

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  app.renderRoots["wiki"] = root;

}