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
  // Runtime
  //---------------------------------------------------------

  function objectsIdentical(a:{[key:string]: any}, b:{[key:string]: any}):boolean {
    var aKeys = Object.keys(a);
    for(var key of aKeys) {
      //TODO: handle non-scalar values
      if(a[key] !== b[key]) return false;
    }
    return true;
  }

  function indexOfFact(haystack, needle, equals = objectsIdentical) {
    let ix = 0;
    for(let fact of haystack) {
      if(equals(fact, needle)) {
        return ix;
      }
      ix++;
    }
    return -1;
  }

  function removeFact(haystack, needle, equals?) {
    let ix = indexOfFact(haystack, needle, equals);
    if(ix > -1) haystack.splice(ix, 1);
    return haystack;
  }

  function generateEqualityFn(keys:string[]) {
    return new Function("a", "b",  `return ${keys.map(function(key, ix) {
      return `a["${key}"] === b["${key}"]`;
    }).join(" && ")};`);
  }

  function generateCollector(keys:string[]) {
    let code = "";
    let ix = 0;
    let checks = "";
    let removes = "var cur = index";
    for(let key of keys) {
      removes += `[remove['${key}']]`;
    }
    removes += ";\nremoveFact(cur, remove, equals);";
    for(let key of keys) {
      ix++;
      checks += `value = add['${key}']\n`;
      let path = `cursor[value]`;
      checks += `if(!${path}) ${path} = `;
      if(ix === keys.length) {
        checks += "[]\n";
      } else {
        checks += "{}\n";
      }
      checks += `cursor = ${path}\n`;
    }
    code += `
for(var remove of removes) {
  ${removes}
}
for(var add of adds) {
  var cursor = index;
  var value;
  ${checks}  cursor.push(add);
}
return index;`
    return new Function("index", "adds", "removes", "equals", code);
  }

  class Diff {
    tables;
    constructor() {
      this.tables = {};
    }
    add(table, obj) {
      let tableDiff = this.tables[table];
      if(!tableDiff) {
        tableDiff = this.tables[table] = {adds: [], removes: []};
      }
      tableDiff.adds.push(obj);
    }
    remove(table, obj) {
      let tableDiff = this.tables[table];
      if(!tableDiff) {
        tableDiff = this.tables[table] = {adds: [], removes: []};
      }
      tableDiff.removes.push(obj);
    }
    removeFound(table, query) {
      let tableDiff = this.tables[table];
      if(!tableDiff) {
        tableDiff = this.tables[table] = {adds: [], removes: []};
      }
      tableDiff.removes.push.apply(tableDiff.removes, ixer.find(table, query));
    }
  }

  class Indexer {
    tables;
    constructor() {
      this.tables = {};
    }
    addTable(name, keys) {
      let table = this.tables[name] = {table: [], factHash: {}, indexes: {}, joins: {}, fields: keys, equals: generateEqualityFn(keys)};
      return table;
    }
    updateTable(tableId, adds, removes) {
      let table = this.tables[tableId];
      if(!table) {
        let example = adds[0] || removes[0];
        table = this.addTable(tableId, Object.keys(example));
      }
      let facts = table.table;
      let factHash = table.factHash;
      let localHash = {};
      for(let add of adds) {
        let hash = JSON.stringify(add);
        if(localHash[hash] === undefined) {
          localHash[hash] = [add, 1];
        } else {
          localHash[hash][1]++;
        }
      }
      for(let remove of removes) {
        let hash = JSON.stringify(remove);
        if(localHash[hash] === undefined) {
          localHash[hash] = [remove, -1];
        } else {
          localHash[hash][1]--;
        }
      }
      let realAdds = [];
      let realRemoves = [];
      for(let hash in localHash) {
        let [fact, count] = localHash[hash];
        if(count > 0 && !factHash[hash]) {
          realAdds.push(fact);
          facts.push(fact);
          factHash[hash] = true;
        } else if(count < 0 && factHash[hash]) {
          realRemoves.push(fact);
          removeFact(facts, fact, table.equals);
          factHash[hash] = undefined;
        }
      }
      return {adds:realAdds, removes:realRemoves};
    }
    applyDiff(diff:Diff) {
      for(let tableId in diff.tables) {
        let tableDiff = diff.tables[tableId];
        let realDiff = this.updateTable(tableId, tableDiff.adds, tableDiff.removes);
      }
    }
    collector(keys) {
      return {
        index: {},
        collect: generateCollector(keys),
      }
    }
    findIndex(tableId, keys) {

    }
    factToIndex(table, fact) {
      let keys = Object.keys(fact);
      keys.sort();
      let indexName = keys.join("|");
      let index = table.indexes[indexName];
      if(!index) {
        index = table.indexes[indexName] = this.collector(keys);
        index.collect(index.index, table.table, [], table.equals);
      }
      let cursor = index.index;
      for(let key of keys) {
        cursor = cursor[fact[key]];
        if(!cursor) return [];
      }
      return cursor;
    }
    find(tableId, query?) {
      let table = this.tables[tableId];
      if(!table) {
        return [];
      } else if(!query) {
        return table.table;
      } else {
        return this.factToIndex(table, query);
      }
    }
  }

  function join(table1, table2, mappings) {
    let rows = ixer.find(table1);
    let results = [];
    for(let row of rows) {
      let query = {};
      for(let field in mappings) {
        let mapped = mappings[field];
        query[mapped] = row[field];
      }
      results.push([row, ixer.find(table2, query)]);
    }
    return results;
  }

//   var ixer = new Indexer();
//   let diff = new Diff();
//   diff.add("foo", {bar: "look", lol: "1"});
//   diff.add("foo", {bar: "look", lol: "2"});
//   diff.add("foo", {bar: "cool", lol: "3"});
//   diff.add("foo", {bar: "meh", lol: "4"});
//   diff.add("bar", {baz: "look"});
//   diff.add("bar", {baz: "cool"});
//   ixer.applyDiff(diff);

//   function setup(size) {
//     console.time("create");
//     for(var i = 0; i < size; i++) {
//       diff.add("foo", {bar: i, lol: i * 2});
//     }
//     for(var i = 0; i < size / 10; i++) {
//       diff.add("bar", {baz: i + 1});
//     }
//     ixer.applyDiff(diff);
//     console.timeEnd("create");
//     console.time("index");
//     ixer.find("foo", {bar: 0});
//     ixer.find("bar", {baz: 3});
//     console.timeEnd("index");
//   }

//   function bench(times) {
//     console.time("join");
//     for(var i = 0; i < times; i++) {
//       var result = join("bar", "foo", {"baz": "bar"})
//     }
//     console.timeEnd("join");
//     return result;
//   }

//   setup(100000);
//   bench(10)

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  app.renderRoots["wiki"] = root;

}