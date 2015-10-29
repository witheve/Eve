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

  function generateUnprojectedSorterCode(unprojectedSize, sorts) {
    let conditions = [];
    let path = [];
    let distance = unprojectedSize;
    for(let sort of sorts) {
      let condition = "";
      for(let prev of path) {
        let [table, key] = prev;
        condition += `unprojected[j-${distance - table}]['${key}'] === item${table}['${key}'] && `;
      }
      let [table, key, dir] = sort;
      let op = ">";
      if(dir === "descending") {
        op = "<";
      }
      condition += `unprojected[j-${distance - table}]['${key}'] ${op} item${table}['${key}']`;
      conditions.push(condition);
      path.push(sort);
    }
    let items = [];
    let repositioned = [];
    let itemAssignments = [];
    for(let ix = 0; ix < distance; ix++) {
      items.push(`item${ix} = unprojected[j+${ix}]`);
      repositioned.push(`unprojected[j+${ix}] = unprojected[j - ${distance - ix}]`);
      itemAssignments.push((`unprojected[j+${ix}] = item${ix}`));
    }
    return `for (var i = 0, len = unprojected.length; i < len; i += ${distance}) {
        var j = i, ${items.join(", ")};
        for(; j > ${distance - 1} && (${conditions.join(" || ")}); j -= ${distance}) {
          ${repositioned.join(";\n")}
        }
        ${itemAssignments.join(";\n")}
    }`;
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
      tableDiff.removes.push.apply(tableDiff.removes, objs);
    }
    remove(table, query?) {
      let tableDiff = this.ensureTable(table);
      let found = this.ixer.find(table, query);
      this.length += found.length;
      tableDiff.removes.push.apply(tableDiff.removes, found);
    }
    merge(diff) {
      for(let table in diff.tables) {
        let tableDiff = diff.tables[table];
        this.addMany(table, tableDiff.adds);
        this.removeFacts(table, tableDiff.removes);
      }
      return this;
    }
    reverse() {
      let reversed = new Diff(this.ixer);
      for(let table in this.tables) {
        let diff = this.tables[table];
        reversed.addMany(table, diff.removes);
        reversed.removeFacts(table, diff.adds);
      }
      return reversed;
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
    execDiff(diff) {
      let triggers = {};
      let realDiffs = {};
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
        for(let triggerName in table.triggers) {
          let trigger = table.triggers[triggerName];
          triggers[triggerName] = trigger;
        }
        realDiffs[tableId] = realDiff;
      }
      return {triggers, realDiffs};
    }
    execTrigger(trigger) {
      let {results, unprojected} = trigger.exec();
      let table = this.table(trigger.name);
      let prevResults = table.factHash;
      let prevHashes = Object.keys(prevResults);
      table.unprojected = unprojected;
      if(results) {
        let diff = new Diff(this);
        this.clearTable(trigger.name);
        diff.addMany(trigger.name, results);
        let {triggers} = this.execDiff(diff);
        let newHashes = table.factHash;
        if(prevHashes.length === Object.keys(newHashes).length) {
          let same = true;
          for(let hash of prevHashes) {
            if(!newHashes[hash]) {
              same = false;
              break;
            }
          }
          return same ? undefined : triggers;
        } else {
          return triggers;
        }
      }
      return;
    }
    execTriggers(triggers) {
      let newTriggers = {};
      let retrigger = false;
      for(let triggerName in triggers) {
        let trigger = triggers[triggerName];
        let nextRound = this.execTrigger(trigger);
        if(nextRound) {
          retrigger = true;
          for(let trigger in nextRound) {
            newTriggers[trigger] = nextRound[trigger];
          }
        }
      }
      if(retrigger) {
        return newTriggers;
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
      let {triggers, realDiffs} = this.execDiff(diff);
      while(triggers) {
        triggers = this.execTriggers(triggers);
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
    query(name = "unknown") {
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
      let nextRound = this.execTrigger(query);
      while(nextRound) {
        nextRound = this.execTriggers(nextRound);
      };
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
    name;
    projectionMap;
    limitInfo;
    groups;
    sorts;
    aggregates;
    unprojectedSize;
    constructor(ixer, name = "unknown") {
      this.name = name;
      this.ixer = ixer;
      this.dirty = true;
      this.tables = [];
      this.joins = [];
      this.aliases = {};
      this.funcs = [];
      this.aggregates = [];
      this.unprojectedSize = 0;
    }
    select(table, join, as?) {
      this.dirty = true;
      if(as) {
        this.aliases[as] = Object.keys(this.aliases).length;
      }
      this.unprojectedSize++;
      this.tables.push(table);
      this.joins.push({negated: false, table, join, as, ix: this.aliases[as]});
      return this;
    }
    deselect(table, join) {
      this.dirty = true;
      this.tables.push(table);
      this.joins.push({negated: true, table, join, ix: this.joins.length * 1000});
      return this;
    }
    calculate(funcName, args, as?) {
      this.dirty = true;
      if(as) {
        this.aliases[as] = Object.keys(this.aliases).length;
      }
      if(!QueryFunctions[funcName].filter) {
        this.unprojectedSize++;
      }
      this.funcs.push({name: funcName, args, as, ix: this.aliases[as]});
      return this;
    }
    project(projectionMap) {
      this.projectionMap = projectionMap;
      return this;
    }
    group(groups) {
      this.dirty = true;
      this.groups = groups;
      return this;
    }
    sort(sorts) {
      this.dirty = true;
      this.sorts = sorts;
      return this;
    }
    limit(limitInfo:any) {
      this.dirty = true;
      this.limitInfo = limitInfo;
      return this;
    }
    aggregate(funcName, args, as?) {
      this.dirty = true;
      if(as) {
        this.aliases[as] = Object.keys(this.aliases).length;
      }
      this.unprojectedSize++;
      this.aggregates.push({name: funcName, args, as, ix: this.aliases[as]});
      return this;
    }
    applyAliases(joinMap) {
      for(let field in joinMap) {
        let joinInfo = joinMap[field];
        if(joinInfo.constructor !== Array || typeof joinInfo[0] === "number") continue;
        let joinTable = joinInfo[0];
        if(this.aliases[joinTable] !== undefined) {
          joinInfo[0] = this.aliases[joinTable];
        } else {
          throw new Error("Invalid alias used: " + joinTable);
        }
      }
    }
    toAST() {
      let cursor = {type: "query",
                    children: []};
      let root = cursor;
      let results = [];
      // by default the only thing we return are the unprojected results
      let returns = ["unprojected"];

      // we need an array to store our unprojected results
      root.children.push({type: "declaration", var: "unprojected", value: "[]"});

      // run through each table nested in the order they were given doing pairwise
      // joins along the way.
      for(let join of this.joins) {
        let {table, ix, negated} = join;
        let cur = {
          type: "select",
          table,
          ix,
          negated,
          children: [],
          join: false,
        };
        // we only want to eat the cost of dealing with indexes
        // if we are actually joining on something
        let joinMap = join.join;
        this.applyAliases(joinMap);
        if(Object.keys(joinMap).length !== 0) {
          root.children.unshift({type: "declaration", var: `query${ix}`, value: "{}"});
          cur.join = joinMap;
        }
        cursor.children.push(cur);
        if(!negated) {
          results.push({type: "select", ix});
        }

        cursor = cur;
      }
      // at the bottom of the joins, we calculate all the functions based on the values
      // collected
      for(let func of this.funcs) {
        let {args, name, ix} = func;
        let funcInfo = QueryFunctions[name];
        this.applyAliases(args);
        root.children.unshift({type: "functionDeclaration", ix, info: funcInfo});
        if(funcInfo.multi || funcInfo.filter) {
          let node = {type: "functionCallMultiReturn", ix, args, info: funcInfo, children: []};
          cursor.children.push(node);
          cursor = node;
        } else {
          cursor.children.push({type: "functionCall", ix, args, info: funcInfo, children: []});
        }
        if(!funcInfo.noReturn && !funcInfo.filter) {
          results.push({type: "function", ix});
        }
      }

      // now that we're at the bottom of the join, store the unprojected result
      cursor.children.push({type: "result", results});

      //Aggregation
      //sort the unprojected results based on groupings and the given sorts
      let sorts = [];
      let alreadySorted = {};
      if(this.groups) {
        this.applyAliases(this.groups);
        for(let group of this.groups) {
          let [table, field] = group;
          sorts.push(group);
          alreadySorted[`${table}|${field}`] = true;
        }
      }
      if(this.sorts) {
        this.applyAliases(this.sorts);
        for(let sort of this.sorts) {
          let [table, field] = sort;
          if(!alreadySorted[`${table}|${field}`]) {
            sorts.push(sort);
          }
        }
      }
      var size = this.unprojectedSize;
      if(sorts.length) {
        root.children.push({type: "sort", sorts, size, children: []});
      }
      //then we need to run through the sorted items and do the aggregate as a fold.
      if(this.aggregates.length || sorts.length || this.limitInfo) {
        // we need to store group info for post processing of the unprojected results
        // this will indicate what group number, if any, that each unprojected result belongs to
        root.children.unshift({type: "declaration", var: "groupInfo", value: "[]"});
        returns.push("groupInfo");
        let aggregateChildren = [];
        for(let func of this.aggregates) {
          let {args, name, ix} = func;
          let funcInfo = QueryFunctions[name];
          this.applyAliases(args);
          root.children.unshift({type: "functionDeclaration", ix, info: funcInfo});
          aggregateChildren.push({type: "functionCall", ix, resultsIx: results.length, args, info: funcInfo, unprojected: true, children: []});
          results.push({type: "placeholder"});
        }
        let aggregate = {type: "aggregate loop", groups: this.groups, limit: this.limitInfo, size, children: aggregateChildren};
        root.children.push(aggregate);
        cursor = aggregate;
      }


      if(this.projectionMap) {
        this.applyAliases(this.projectionMap);
        root.children.unshift({type: "declaration", var: "results", value: "[]"});
        cursor.children.push({type: "projection", projectionMap: this.projectionMap, unprojected: this.aggregates.length});
        returns.push("results");
      }

      root.children.push({type: "return", vars: returns});
      return root;
    }
    compileParamString(funcInfo, args, unprojected = false) {
      let code = "";
      let params = funcInfo.params;
      if(unprojected) params = params.slice(1);
      for(let param of params) {
        let arg = args[param];
        let argCode;
        if(arg.constructor === Array) {
          if(!unprojected) {
            argCode = `row${arg[0]}['${arg[1]}']`;
          } else {
            argCode = `unprojected[ix + ${arg[0]}]['${arg[1]}']`;
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
          var prev = "";
          if(root.unprojected) {
            prev = `row${ix}`;
            if(root.info.params.length > 1) prev += ","
          }
          code += `var row${ix} = func${ix}(${prev}${this.compileParamString(root.info, root.args, root.unprojected)});\n`;
          break;
        case "functionCallMultiReturn":
          var ix = root.ix;
          code += `var rows${ix} = func${ix}(${this.compileParamString(root.info, root.args)});\n`;
          code += `for(var funcResultIx${ix} = 0, funcLen${ix} = rows${ix}.length; funcResultIx${ix} < funcLen${ix}; funcResultIx${ix}++) {\n`
          code += `var row${ix} = rows${ix}[funcResultIx${ix}];\n`;
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
          if(!root.negated) {
            code += `for(var rowIx${ix} = 0, rowsLen${ix} = rows${ix}.length; rowIx${ix} < rowsLen${ix}; rowIx${ix}++) {\n`
            code += `var row${ix} = rows${ix}[rowIx${ix}];\n`;
          } else {
            code += `if(!rows${ix}.length) {\n`
          }
          for(var child of root.children) {
            code += this.compileAST(child);
          }
          code += "}\n";
          break;
        case "result":
          var results = [];
          for(var result of root.results) {
            if(result.type === "placeholder") {
              results.push("undefined");
            } else {
              let ix = result.ix;
              results.push(`row${ix}`);
            }
          }
          code += `unprojected.push(${results.join(", ")});\n`;
          break;
        case "sort":
          code += generateUnprojectedSorterCode(root.size, root.sorts)+"\n";
          break;
        case "aggregate loop":
          let projection = "";
          let aggregateCalls = [];
          let aggregateStates = [];
          let aggregateResets = [];
          let unprojected = {};
          for(let agg of root.children) {
            if(agg.type === "functionCall") {
              unprojected[agg.ix] = true;
              let compiled = this.compileAST(agg);
              compiled += `\nunprojected[ix + ${agg.resultsIx}] = row${agg.ix};\n`;
              aggregateCalls.push(compiled);
              aggregateStates.push(`var row${agg.ix} = {};`);
              aggregateResets.push(`row${agg.ix} = {};`);
            } else if(agg.type === "projection") {
              agg.unprojected = unprojected;
              projection = this.compileAST(agg);
            }
          }
          let differentGroupChecks = [];
          let groupCheck = `false`;
          if(root.groups) {
            for(let group of root.groups) {
              let [table, field] = group;
              differentGroupChecks.push(`unprojected[nextIx + ${table}]['${field}'] !== unprojected[ix + ${table}]['${field}']`);
            }
            groupCheck = `(${differentGroupChecks.join(" || ")})`;
          }

          let resultsCheck = "";
          if(root.limit && root.limit.results) {
            resultsCheck = `if(resultCount === ${root.limit.results}) break;`;
          }
          let groupLimitCheck = "";
          if(root.limit && root.limit.perGroup && root.groups) {
            groupLimitCheck = `if(perGroupCount === ${root.limit.perGroup}) {
              while(!differentGroup) {
                nextIx += ${root.size};
                if(nextIx >= len) break;
                groupInfo[nextIx] = undefined;
                differentGroup = ${groupCheck};
              }
            }`;
          }
          let groupDifference = "";
          let groupInfo = "";
          if(this.groups) {
            groupDifference = `
            perGroupCount++
            var differentGroup = ${groupCheck};
            ${groupLimitCheck}
            if(differentGroup) {
              ${projection}
              ${aggregateResets.join("\n")}
              perGroupCount = 0;
              resultCount++;
            }\n`;
            groupInfo = "groupInfo[ix] = resultCount;";
          } else {
            groupDifference = "resultCount++;\n";
            groupInfo = "groupInfo[ix] = 0;"
          }
          // if there are neither aggregates to calculate nor groups to build,
          // then we just need to worry about limiting
          if(!this.groups && aggregateCalls.length === 0) {
            code = `var ix = 0;
                    var resultCount = 0;
                    var len = unprojected.length;
                    while(ix < len) {
                      ${resultsCheck}
                      ${projection}
                      groupInfo[ix] = resultCount;
                      resultCount++;
                      ix += ${root.size};
                    }\n`;
            break;
          }
          code = `var resultCount = 0;
                  var perGroupCount = 0;
                  var ix = 0;
                  var nextIx = 0;
                  var len = unprojected.length;
                  ${aggregateStates.join("\n")}
                  while(ix < len) {
                    ${aggregateCalls.join("")}
                    ${groupInfo}
                    if(ix + ${root.size} === len) {
                      ${projection}

                      break;
                    }
                    nextIx += ${root.size};
                    ${groupDifference}
                    ${resultsCheck}
                    ix = nextIx;
                  }\n`;
          break;
        case "projection":
          var projectedVars = [];
          for(let newField in root.projectionMap) {
            let mapping = root.projectionMap[newField];
            let value = "";
            if(mapping.constructor === Array) {
              if(!root.unprojected || root.unprojected[mapping[0]]) {
                value = `row${mapping[0]}['${mapping[1]}']`;
              } else {
                value = `unprojected[ix + ${mapping[0]}]['${mapping[1]}']`;
              }
            } else {
              value = JSON.stringify(mapping);
            }
            projectedVars.push(`'${newField}': ${value}`);
          }
          code += `results.push({ ${projectedVars.join(", ")} });\n`;
          break;
        case "return":
          var returns = [];
          for(let curVar of root.vars) {
            returns.push(`${curVar}: ${curVar}`);
          }
          code += `return {${returns.join(", ")}};`;
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
      this.dirty = true;
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
            if(mapping.constructor === Array && mapping.length === 1) {
              let [field] = mapping;
              value = `sourceRow${ix}['${field}']`;
            } else if(mapping.constructor === Array && mapping.length === 2) {
              let [_, field] = mapping;
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