module runtime {
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

  export function removeFact(haystack, needle, equals?) {
    let ix = indexOfFact(haystack, needle, equals);
    if(ix > -1) haystack.splice(ix, 1);
    return haystack;
  }

  function generateEqualityFn(keys) {
    return new Function("a", "b",  `return ${keys.map(function(key, ix) {
      if(key.constructor === Array) {
        return `a[${key[0]}]['${key[1]}'] === b[${key[0]}]['${key[1]}']`;
      } else {
        return `a["${key}"] === b["${key}"]`;
      }
    }).join(" && ")};`);
  }

  function generateStringFn(keys) {
    let keyStrings = [];
    for(let key of keys) {
      if(key.constructor === Array) {
        keyStrings.push(`a[${key[0]}]['${key[1]}']`);
      } else {
        keyStrings.push(`a['${key}']`);
      }
    }
    let final = keyStrings.join(' + "|" + ');
    return new Function("a",  `return ${final};`);
  }

  function generateCollector(keys) {
    let code = "";
    let ix = 0;
    let checks = "";
    let removes = "var cur = index";
    for(let key of keys) {
      if(key.constructor === Array) {
        removes += `[remove[${key[0]}]['${key[1]}']]`;
      } else {
        removes += `[remove['${key}']]`;
      }
    }
    removes += ";\nruntime.removeFact(cur, remove, equals);";
    for(let key of keys) {
      ix++;
      if(key.constructor === Array) {
        checks += `value = add[${key[0]}]['${key[1]}']\n`;
      } else {
        checks += `value = add['${key}']\n`;
      }
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
    length;
    ixer;
    meta;
    constructor(ixer) {
      this.ixer = ixer;
      this.tables = {};
      this.length = 0;
      this.meta = {};
    }
    ensureTable(table) {
      let tableDiff = this.tables[table];
      if(!tableDiff) {
        tableDiff = this.tables[table] = {adds: [], removes: []};
      }
      return tableDiff;
    }
    add(table, obj) {
      let tableDiff = this.ensureTable(table);
      this.length++;
      tableDiff.adds.push(obj);
    }
    addMany(table, objs) {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.adds.push.apply(tableDiff.adds, objs);
    }
    removeFacts(table, objs) {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.removes.push(tableDiff.removes, objs);
    }
    remove(table, query) {
      let tableDiff = this.ensureTable(table);
      let found = this.ixer.find(table, query);
      this.length += found.length;
      tableDiff.removes.push.apply(tableDiff.removes, found);
    }
  }
  
  class Indexer {
    tables;
    constructor() {
      this.tables = {};
    }
    addTable(name, keys = []) {
      let table = this.tables[name];
      if(table && keys.length) {
        table.fields = keys;
        table.stringify = generateStringFn(keys);
        table.equals = generateEqualityFn(keys);
      } else {
        table = this.tables[name] = {table: [], factHash: {}, indexes: {}, triggers: {}, fields: keys, stringify: generateStringFn(keys), equals: generateEqualityFn(keys)};  
      }
      return table;
    }
    clearTable(name) {
      let table = this.tables[name];
      if(!table) return;

      table.table = [];
      table.factHash = {};
      for(let indexName in table.indexes) {
        table.indexes[indexName].index = {};
      }
    }
    updateTable(tableId, adds, removes) {
      let table = this.tables[tableId];
      if(!table || !table.fields.length) {
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
    execTrigger(trigger) {
      let {results} = trigger.exec();
      if(results) {
        let diff = new Diff(this);
        this.clearTable(trigger.name);
        diff.addMany(trigger.name, results);
        this.applyDiff(diff);
      }
    }
    //---------------------------------------------------------
    // Indexer Public API
    //---------------------------------------------------------
    serialize() {
      let dump = {};
      for(let tableName in this.tables) {
        let table = this.tables[tableName];
        dump[tableName] = table.table;
      }
      return JSON.stringify(dump);
    }
    load(serialized) {
      let dump = JSON.parse(serialized);
      let diff = this.diff();
      for(let tableName in dump) {
        diff.addMany(tableName, dump[tableName]);
      }
      this.applyDiff(diff);
    }
    diff() {
      return new Diff(this);
    }
    applyDiff(diff:Diff) {
      let triggers = {};
      for(let tableId in diff.tables) {
        let tableDiff = diff.tables[tableId];
        if(!tableDiff.adds.length && !tableDiff.removes.length) continue;
        let realDiff = this.updateTable(tableId, tableDiff.adds, tableDiff.removes);
        // go through all the indexes and update them.
        let table = this.tables[tableId];
        for(let indexName in table.indexes) {
          let index = table.indexes[indexName];
          index.collect(index.index, realDiff.adds, realDiff.removes, table.equals);
        }
        //TODO: apply triggers
        for(let triggerName in table.triggers) {
          let trigger = table.triggers[triggerName];
          triggers[triggerName] = trigger;
        }
      }
      for(let triggerName in triggers) {
        let trigger = triggers[triggerName];
        this.execTrigger(trigger);
      }
    }
    table(tableId) {
      let table = this.tables[tableId];
      if(table) return table;
      return this.addTable(tableId);
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
    findOne(tableId, query?) {
      return this.find(tableId, query)[0];
    }
    query(name) {
      return new Query(this, name);
    }
    union(name) {
      return new Union(this, name);
    }
    asView(query:Query|Union) {
      let name = query.name;
      let view = this.table(name);
      view.isView = true;
      for(let tableName of query.tables) {
        let table = this.table(tableName);
        table.triggers[name] = query;
      }
      this.execTrigger(query);
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
  export function define(name, opts, func) {
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
    name;
    projectionMap;
    constructor(ixer, name = "unknown") {
      this.name = name;
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
        this.aliases[`result${this.funcs.length}`] = `result${this.funcs.length}`;
      }
      this.funcs.push(funcName);
      this.funcArgs.push(args);
      return this;
    }
    project(projectionMap) {
      this.projectionMap = projectionMap;
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
      let returns = ["unprojected"];
      if(this.projectionMap) {
        this.applyAliases([this.projectionMap]);
        root.children.unshift({type: "declaration", var: "results", value: "[]"});
        cursor.children.push({type: "projection", projectionMap: this.projectionMap});
        returns.push("results");
      }
      cursor.children.push({type: "result", results});
      root.children.unshift({type: "declaration", var: "unprojected", value: "[]"});
      root.children.push({type: "return", vars: returns});
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
            code += `var rows${ix} = ixer.factToIndex(ixer.table('${root.table}'), query${ix});\n`;
          } else {
            code += `var rows${ix} = ixer.table('${root.table}').table;\n`;
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
          code += `unprojected.push(${results.join(", ")})`;
          break;
        case "projection":
          var projectedVars = [];
          for(let newField in root.projectionMap) {
            let mapping = root.projectionMap[newField];
            let value = "";
            if(mapping.constructor === Array) {
              if(typeof mapping[0] === "string") {
                value = `${mapping[0]}`;
                if(mapping[1] !== undefined) {
                  value += `['${mapping[1]}']`;
                }
              } else {
                value = `row${mapping[0]}['${mapping[1]}']`;
              }
            } else {
              value = JSON.stringify(mapping);
            }
            projectedVars.push(`'${newField}': ${value}`);
          }
          code += `results.push({ ${projectedVars.join(", ")} });\n`;
          break;
        case "return":
          code += `return {${root.vars.join(", ")}};`;
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
      return this.compiled(this.ixer, QueryFunctions);
    }
    debug() {
      console.log(this.compileAST(this.toAST()));
      console.time("exec");
      var results = this.exec();
      console.timeEnd("exec");
      console.log(results);
      return results;
    }
  }
  
  class Union {
    name;
    tables;
    sources;
    isStateful;
    hasher;
    dirty;
    prev;
    compiled;
    ixer;
    constructor(ixer, name = "unknown") {
      this.name = name;
      this.ixer = ixer;
      this.tables = [];
      this.sources = [];
      this.isStateful = false;
      this.prev = {results: [], hashes: {}};
    }
    stateful() {
      this.dirty = true;
      this.isStateful = true;
      return this;
    }
    ensureHasher(mapping) {
      if(!this.hasher) {
        this.hasher = generateStringFn(Object.keys(mapping));
      }
    }
    union(tableName, mapping) {
      this.dirty = true;
      this.ensureHasher(mapping);
      this.tables.push(tableName);
      this.sources.push({type: "+", table: tableName, mapping});
      return this;
    }
    ununion(tableName, mapping) {
      this.dirty = true;
      this.ensureHasher(mapping);
      this.tables.push(tableName);
      this.sources.push({type: "-", table: tableName, mapping});
      return this;
    }
    toAST() {
      let root = {type: "union", children: []};
      root.children.push({type: "declaration", var: "results", value: "[]"});
      
      let hashesValue = "{}";
      if(this.isStateful) {
         hashesValue = "prevHashes";  
      }
      root.children.push({type: "declaration", var: "hashes", value: hashesValue});

      let ix = 0;
      for(let source of this.sources) {
        let action;
        if(source.type === "+") {
          action = {type: "result", ix};
        } else {
          action = {type: "removeResult", ix};
        }
        root.children.push({
          type: "source",
          ix, 
          table: source.table, 
          mapping: source.mapping,
          children: [action],
        });
        ix++;
      }
      root.children.push({type: "hashesToResults"});
      root.children.push({type: "return", vars: ["results", "hashes"]});
      return root;
    }
    compileAST(root) {
      let code = "";
      let type = root.type;
      switch(type) {
        case "union":
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          break;
        case "declaration":
          code += `var ${root.var} = ${root.value};\n`;
          break;
        case "source":
          var ix = root.ix;
          let mappingItems = [];
          for(let key in root.mapping) {
            let mapping = root.mapping[key];
            let value;
            if(mapping.constructor === Array) {
              let [field] = mapping;
              value = `sourceRow${ix}['${field}']`;
            } else {
              value = JSON.stringify(mapping);
            }
            mappingItems.push(`'${key}': ${value}`)
          }
          code += `var sourceRows${ix} = ixer.table('${root.table}').table;\n`;
          code += `for(var rowIx${ix} = 0, rowsLen${ix} = sourceRows${ix}.length; rowIx${ix} < rowsLen${ix}; rowIx${ix}++) {\n`
          code += `var sourceRow${ix} = sourceRows${ix}[rowIx${ix}];\n`;
          code += `var mappedRow${ix} = {${mappingItems.join(", ")}};\n`
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          code += "}\n";
          break;
        case "result":
          var ix = root.ix;
          code += `hashes[hasher(mappedRow${ix})] = mappedRow${ix};\n`;
          break;  
        case "removeResult":
          var ix = root.ix;
          code += `hashes[hasher(mappedRow${ix})] = false;\n`;
          break;
        case "hashesToResults":
          code += "var hashKeys = Object.keys(hashes);\n";
          code += "for(var hashKeyIx = 0, hashKeyLen = hashKeys.length; hashKeyIx < hashKeyLen; hashKeyIx++) {\n";
          code += "var value = hashes[hashKeys[hashKeyIx]];\n";
          code += "if(value !== false) {\n";
          code += "results.push(value);\n"
          code += "}\n"
          code += "}\n"
          break;
        case "return":
          code += `return {${root.vars.join(", ")}};`;
          break;
      }
      return code;
    }
    compile() {
      let ast = this.toAST();
      let code = this.compileAST(ast);
      this.compiled = new Function("ixer", "hasher", "prevHashes", code);
      return this;
    }
    debug() {
      let code = this.compileAST(this.toAST());
      console.log(code);
      return code;
    }
    exec() {
      if(this.dirty) {
        this.compile();
      }
      let results = this.compiled(this.ixer, this.hasher, this.prev.hashes);
      this.prev = results; 
      return results;
    }
    
  }
  
  //---------------------------------------------------------
  // Public API
  //---------------------------------------------------------

  export const SUCCEED = [{success: true}];
  export const FAIL = [];
  
  export function indexer() {
	 return new Indexer();
  }
  
}