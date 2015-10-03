/// <reference path="app.ts" />
/// <reference path="microReact.ts" />
"use strict"

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

  function generateStringFn(keys:string[]) {
    let keyString = `a['${keys[0]}']`;
    keys.shift();
    for(let key of keys) {
      keyString += ` + "|" + a['${key}']`;
    }
    return new Function("a",  `return ${keyString};`);
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
for(var ix = 0, len = removes.length; ix < len; ix++) {
  var remove = removes[ix];
  ${removes}
}
for(var ix = 0, len = adds.length; ix < len; ix++) {
  var add = adds[ix];
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
      let table = this.tables[name] = {table: [], factHash: {}, indexes: {}, joins: {}, fields: keys, stringify: generateStringFn(keys), equals: generateEqualityFn(keys)};
      return table;
    }
    updateTable(tableId, adds, removes) {
      let table = this.tables[tableId];
      if(!table) {
        let example = adds[0] || removes[0];
        table = this.addTable(tableId, Object.keys(example));
      }
      let stringify = table.stringify;
      let facts = table.table;
      let factHash = table.factHash;
      let localHash = {};
      let hashToFact = {};
      let hashes = [];
      for(let add of adds) {
        let hash = stringify(add);
        if(localHash[hash] === undefined) {
          localHash[hash] = 1;
          hashToFact[hash] = add;
          hashes.push(hash);
        } else {
          localHash[hash]++;
        }
      }
      for(let remove of removes) {
        let hash = stringify(remove);
        if(localHash[hash] === undefined) {
          localHash[hash] = -1;
          hashToFact[hash] = remove;
          hashes.push(hash);
        } else {
          localHash[hash]--;
        }
      }
      let realAdds = [];
      let realRemoves = [];
      for(let hash of hashes) {
        let count = localHash[hash];
        if(count > 0 && !factHash[hash]) {
          let fact = hashToFact[hash];
          realAdds.push(fact);
          facts.push(fact);
          factHash[hash] = true;
        } else if(count < 0 && factHash[hash]) {
          let fact = hashToFact[hash];
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

  export var QueryFunctions = {}
  var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
  var ARGUMENT_NAMES = /([^\s,]+)/g;
  function getParamNames(func) {
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if(result === null)
      result = [];
    return result;
  }
  function define(name, opts, func) {
    let params = getParamNames(func);
    opts.name = name;
    opts.params = params;
    opts.func = func;
    QueryFunctions[name] = opts;
  }

  class Query {
    tables;
    joins;
    dirty;
    compiled;
    ixer;
    aliases;
    funcs;
    funcArgs;
    constructor(ixer) {
      this.ixer = ixer;
      this.dirty = false;
      this.tables = [];
      this.joins = [];
      this.aliases = {};
      this.funcs = [];
      this.funcArgs = [];
    }
    select(table, join, as?) {
      this.dirty = true;
      if(as) {
        this.aliases[as] = this.tables.length;
      }
      this.tables.push(table);
      this.joins.push(join);
      return this;
    }
    calculate(funcName, args, as?) {
      this.dirty = true;
      if(as) {
        this.aliases[as] = `result${this.funcs.length}`;
      }
      this.funcs.push(funcName);
      this.funcArgs.push(args);
      return this;
    }
    applyAliases(joins) {
      for(let joinMap of joins) {
        for(let field in joinMap) {
          let joinInfo = joinMap[field];
          if(joinInfo.constructor !== Array) continue;
          let joinTable = joinInfo[0];
          if(this.aliases[joinTable] !== undefined) {
            joinInfo[0] = this.aliases[joinTable];
          } else if(this.tables[joinTable] === undefined) {
            throw new Error("Invalid alias used: " + joinTable);
          }
        }
      }
      return joins;
    }
    toAST() {
      this.applyAliases(this.joins);
      this.applyAliases(this.funcArgs);
      let cursor = {type: "query",
                    children: []};
      let root = cursor;
      let results = [];
      let tableIx = 0;
      for(let table of this.tables) {
        let cur = {
          type: "select",
          table,
          ix: tableIx,
          children: [],
          join: false,
        };
        // we only want to eat the cost of dealing with indexes
        // if we are actually joining on something
        let join = this.joins[tableIx];
        if(Object.keys(join).length !== 0) {
          root.children.unshift({type: "declaration", var: `query${tableIx}`, value: "{}"});
          cur.join = join;
        }
        cursor.children.push(cur);
        results.push({type: "select", ix: tableIx});
        cursor = cur;
        tableIx++;
      }
      let funcIx = 0;
      for(let func of this.funcs) {
        let args = this.funcArgs[funcIx];
        let funcInfo = QueryFunctions[func];
        root.children.unshift({type: "functionDeclaration", ix: funcIx, info: funcInfo});
        if(funcInfo.multi || funcInfo.filter) {
          let node = {type: "functionCallMultiReturn", ix: funcIx, args, info: funcInfo, children: []};
          cursor.children.push(node);
          cursor = node;
        } else {
          cursor.children.push({type: "functionCall", ix: funcIx, args, info: funcInfo, children: []});
        }
        if(!funcInfo.noReturn && !funcInfo.filter) {
          results.push({type: "function", ix: funcIx});
        }
        funcIx++;
      }
      cursor.children.push({type: "result", results});
      root.children.unshift({type: "declaration", var: "results", value: "[]"});
      root.children.push({type: "return", var: "results"});
      return root;
    }
    compileParamString(funcInfo, args) {
      let code = "";
      for(let param of funcInfo.params) {
        let arg = args[param];
        let argCode;
        if(arg.constructor === Array) {
          if(this.tables[arg[0]] === undefined) {
            argCode = `${arg[0]}['${arg[1]}']`;
          } else {
            argCode = `row${arg[0]}['${arg[1]}']`;
          }
        } else {
          argCode = arg;
        }
        code += `${argCode}, `;
      }
      return code.substring(0,code.length - 2);
    }
    compileAST(root) {
      let code = "";
      let type = root.type;
      switch(type) {
        case "query":
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          break;
        case "declaration":
          code += `var ${root.var} = ${root.value};\n`;
          break;
        case "functionDeclaration":
          code += `var func${root.ix} = QueryFunctions['${root.info.name}'].func;\n`;
          break;
        case "functionCall":
          var ix = root.ix;
          code += `var result${ix} = func${ix}(${this.compileParamString(root.info, root.args)});\n`;
          break;
        case "functionCallMultiReturn":
          var ix = root.ix;
          code += `var results${ix} = func${ix}(${this.compileParamString(root.info, root.args)});\n`;
          code += `for(var funcResultIx${ix} = 0, funcLen${ix} = results${ix}.length; funcResultIx${ix} < funcLen${ix}; funcResultIx${ix}++) {\n`
          code += `var result${ix} = results${ix}[funcResultIx${ix}];\n`;
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          code += "}\n";
          break;
        case "select":
          var ix = root.ix;
          if(root.join) {
            for(let key in root.join) {
              let mapping = root.join[key];
              if(mapping.constructor === Array) {
                let [tableIx, value] = mapping;
                code += `query${ix}['${key}'] = row${tableIx}['${value}'];\n`;
              } else {
                code += `query${ix}['${key}'] = ${JSON.stringify(mapping)};\n`;
              }
            }
            code += `var rows${ix} = ixer.factToIndex(ixer.tables['${root.table}'], query${ix});\n`;
          } else {
            code += `var rows${ix} = ixer.tables['${root.table}'].table;\n`;
          }
          code += `for(var rowIx${ix} = 0, rowsLen${ix} = rows${ix}.length; rowIx${ix} < rowsLen${ix}; rowIx${ix}++) {\n`
          code += `var row${ix} = rows${ix}[rowIx${ix}];\n`;
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          code += "}\n";
          break;
        case "result":
          var results = [];
          for(var result of root.results) {
            let ix = result.ix;
            if(result.type === "select") {
              results.push(`row${ix}`);
            } else if(result.type === "function") {
              results.push(`result${ix}`);
            }
          }
          code += `results.push(${results.join(", ")})`;
          break;
        case "return":
          code += `return ${root.var};`;
          break;
      }
      return code;
    }
    compile() {
      let ast = this.toAST();
      let code = this.compileAST(ast);
      this.compiled = new Function("ixer", "QueryFunctions", code);
      return this;
    }
    exec() {
      if(this.dirty) {
        this.compile();
      }
      return this.compiled(this.ixer, wiki.QueryFunctions);
    }
    debug() {
      console.log(this.compileAST(this.toAST()));
      var results = this.exec();
      console.log(results);
      return results;
    }
  }

  define("add", {}, function(a, b) {
    return a + b;
  });

  const SUCCEED = [true];
  const FAIL = [];

  define("foo", {filter: true}, function(a) {
    if(a.length > 10) {
      return SUCCEED;
    }
    return FAIL;
  });

  define("articleToGraph", {multi:true}, function(article) {
    let outbound =    articleToGraph(article).outbound;
    console.log(outbound);
    return outbound;
  });

  function query(ixer: Indexer): Query {
    return new Query(ixer);
  }

  export var ixer = new Indexer();
  let diff = new Diff();
  diff.add("rel", {from: "modern family", to: "MF episode 1", type: "episode"});
  diff.add("rel", {from: "modern family", to: "MF episode 2", type: "episode"});
  diff.add("rel", {from: "modern family", to: "MF episode 3", type: "episode"});
  diff.add("rel", {from: "MF episode 2", to: "Edward Norton", type: "cast member"});
  diff.add("rel", {from: "MF episode 3", to: "Someone", type: "cast member"});
  diff.add("rel", {from: "MF episode 3", to: "Edward Norton", type: "cast member"});
  diff.add("page", {id: "pixar", text: "[up] is a [pixar] movie [no wai]"});
  ixer.applyDiff(diff);
//   query(ixer)
//     .select("rel", {from: "modern family", type: "episode"}, "mf")
//     .select("rel", {from: ["mf", "to"], to: "Edward Norton"})
//     .calculate("add", {a: ["mf", "to"], b: ["mf", "from"]})
//     .calculate("foo", {a: ["mf", "from"]})
//     .debug();
query(ixer)
    .select("page", {}, "page")
    .calculate("articleToGraph", {article: ["page", "text"]})
    .debug();

//   diff.add("foo", {bar: "look", lol: "1"});
//   diff.add("foo", {bar: "look", lol: "2"});
//   diff.add("foo", {bar: "cool", lol: "3"});
//   diff.add("foo", {bar: "meh", lol: "4"});
//   diff.add("bar", {baz: "look"});
//   diff.add("bar", {baz: "cool"});
//   ixer.applyDiff(diff);

  function setup(size) {
    console.time("create");
    for(var i = 0; i < size; i++) {
      diff.add("foo", {bar: i, lol: i * 2});
    }
    for(var i = 0; i < size / 1; i++) {
      diff.add("bar", {baz: i + 1});
    }
    ixer.applyDiff(diff);
    console.timeEnd("create");
    console.time("index");
    ixer.find("foo", {bar: 0});
    ixer.find("bar", {baz: 3});
    console.timeEnd("index");
  }

  function bench(times) {
    console.time("compile");
    var compiled = query(ixer).select("foo", {}, "foo").select("bar", {baz: ["foo", "bar"]}).compile();
    console.timeEnd("compile");
    console.time("compile join");
    for(var i = 0; i < times; i++) {
      var result = compiled.compiled(ixer, QueryFunctions);
    }
    console.timeEnd("compile join");
    return result;
  }

//   setup(1000);
//   var res = bench(1);

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------

  app.renderRoots["wiki"] = root;

}