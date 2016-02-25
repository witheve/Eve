import {ENV, uuid} from "./utils";

//---------------------------------------------------------
// Runtime
//---------------------------------------------------------
declare var exports;
let runtime = exports;

export var MAX_NUMBER = 9007199254740991;
export var INCREMENTAL = false;

function objectsIdentical(a:{[key:string]: any}, b:{[key:string]: any}):boolean {
  var aKeys = Object.keys(a);
  for(var key of aKeys) {
    //TODO: handle non-scalar values
    if(a[key] !== b[key]) return false;
  }
  return true;
}

function indexOfFact(haystack, needle) {
  let ix = 0;
  for(let fact of haystack) {
    if(fact.__id === needle.__id) {
      return ix;
    }
    ix++;
  }
  return -1;
}

export function removeFact(haystack, needle) {
  let ix = indexOfFact(haystack, needle);
  if(ix > -1) haystack.splice(ix, 1);
  return haystack;
}

function diffAddsAndRemoves(adds, removes) {
  let localHash = {};
  let hashToFact = {};
  let hashes = [];
  for(let add of adds) {
    let hash = add.__id;
    if(localHash[hash] === undefined) {
      localHash[hash] = 1;
      hashToFact[hash] = add;
      hashes.push(hash);
    } else {
      localHash[hash]++;
    }
    add.__id = hash;
  }
  for(let remove of removes) {
    let hash = remove.__id;
    if(localHash[hash] === undefined) {
      localHash[hash] = -1;
      hashToFact[hash] = remove;
      hashes.push(hash);
    } else {
      localHash[hash]--;
    }
    remove.__id = hash;
  }
  let realAdds = [];
  let realRemoves = [];
  for(let hash of hashes) {
    let count = localHash[hash];
    if(count > 0) {
      let fact = hashToFact[hash];
      realAdds.push(fact);
    } else if(count < 0) {
      let fact = hashToFact[hash];
      realRemoves.push(fact);
    }
  }
  return {adds:realAdds, removes:realRemoves};
}

function generateEqualityFn(keys) {
  return new Function("a", "b",  `return ${keys.map(function(key, ix) {
    if(key.constructor === Array) {
      return `a['${key[0]}']['${key[1]}'] === b['${key[0]}']['${key[1]}']`;
    } else {
      return `a["${key}"] === b["${key}"]`;
    }
  }).join(" && ")};`)
}

function generateStringFn(keys) {
  let keyStrings = [];
  for(let key of keys) {
    if(key.constructor === Array) {
      keyStrings.push(`a['${key[0]}']['${key[1]}']`);
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
  let code = `var runtime = this;\n`;
  let ix = 0;
  let checks = "";
  let removes = "var cur = index";
  for(let key of keys) {
    if(key.constructor === Array) {
      removes += `[remove['${key[0]}']['${key[1]}']]`;
    } else {
      removes += `[remove['${key}']]`;
    }
  }
  removes += ";\nruntime.removeFact(cur, remove);";
  for(let key of keys) {
    ix++;
    if(key.constructor === Array) {
      checks += `value = add['${key[0]}']['${key[1]}']\n`;
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
  return (new Function("index", "adds", "removes", code)).bind(runtime);
}

function generateCollector2(keys) {
  let hashParts = [];
  for(let key of keys) {
    if(key.constructor === Array) {
      hashParts.push(`add['${key[0]}']['${key[1]}']`);
    } else {
      hashParts.push(`add['${key}']`);
    }
  }
  let code = `
    var ixCache = cache.ix;
    var idCache = cache.id;
    for(var ix = 0, len = removes.length; ix < len; ix++) {
      var remove = removes[ix];
      var id = remove.__id;
      var key = idCache[id];
      var factIx = ixCache[id];
      var facts = index[key];
      //swap the last fact with this one to prevent holes
      var lastFact = facts.pop();
      if(lastFact && lastFact.__id !== remove.__id) {
        facts[factIx] = lastFact;
        ixCache[lastFact.__id] = factIx;
      } else if(facts.length === 0) {
        delete index[key];
      }
      delete idCache[id];
      delete ixCache[id];
    }
    for(var ix = 0, len = adds.length; ix < len; ix++) {
      var add = adds[ix];
      var id = add.__id;
      var key = idCache[id] = ${hashParts.join(" + '|' + ")};
      if(index[key] === undefined) index[key] = [];
      var arr = index[key];
      ixCache[id] = arr.length;
      arr.push(add);
    }
    return index;`;
    return new Function("index", "adds", "removes", "cache", code);
}

function mergeArrays(as, bs) {
  let ix = as.length;
  let start = ix;
  for(let b of bs) {
    as[ix] = bs[ix - start];
    ix++;
  }
  return as;
}

export class Diff {
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
    return this;
  }
  addMany(table, objs) {
    let tableDiff = this.ensureTable(table);
    this.length += objs.length;
    mergeArrays(tableDiff.adds, objs);
    return this;
  }
  removeFacts(table, objs) {
    let tableDiff = this.ensureTable(table);
    this.length += objs.length;
    mergeArrays(tableDiff.removes, objs);
    return this;
  }
  remove(table, query?) {
    let tableDiff = this.ensureTable(table);
    let found = this.ixer.find(table, query);
    this.length += found.length;
    mergeArrays(tableDiff.removes, found);
    return this;
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

export class Indexer {
  tables;
  globalCount;
  edbTables;
  constructor() {
    this.tables = {};
    this.globalCount = 0;
    this.edbTables = {};
  }
  addTable(name, keys = []) {
    let table = this.tables[name];
    keys = keys.filter((key) => key !== "__id");
    if(table && keys.length) {
      table.fields = keys;
      table.stringify = generateStringFn(keys);
    } else {
      table = this.tables[name] = {table: [], hashToIx: {}, factHash: {}, indexes: {}, triggers: {}, fields: keys, stringify: generateStringFn(keys), keyLookup: {}};
      this.edbTables[name] = true;
    }
    for(let key of keys) {
      if(key.constructor === Array) {
        table.keyLookup[key[0]] = key;
      } else {
        table.keyLookup[key] = key;
      }
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
      table.indexes[indexName].cache = {id: {}, ix: {}};
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
    let hashToIx = table.hashToIx;
    let localHash = {};
    let hashToFact = {};
    let hashes = [];
    for(let add of adds) {
      let hash = add.__id || stringify(add);
      if(localHash[hash] === undefined) {
        localHash[hash] = 1;
        hashToFact[hash] = add;
        hashes.push(hash);
      } else {
        localHash[hash]++;
      }
      add.__id = hash;
    }
    for(let remove of removes) {
      let hash = remove.__id || stringify(remove);
      if(localHash[hash] === undefined) {
        localHash[hash] = -1;
        hashToFact[hash] = remove;
        hashes.push(hash);
      } else {
        localHash[hash]--;
      }
      remove.__id = hash;
    }
    let realAdds = [];
    let realRemoves = [];
    for(let hash of hashes) {
      let count = localHash[hash];
      if(count > 0 && !factHash[hash]) {
        let fact = hashToFact[hash];
        realAdds.push(fact);
        facts.push(fact);
        factHash[hash] = fact;
        hashToIx[hash] = facts.length - 1;
      } else if(count < 0 && factHash[hash]) {
        let fact = hashToFact[hash];
        let ix = hashToIx[hash];
        //swap the last fact with this one to prevent holes
        let lastFact = facts.pop();
        if(lastFact && lastFact.__id !== fact.__id) {
          facts[ix] = lastFact;
          hashToIx[lastFact.__id] = ix;
        }
        realRemoves.push(fact);
        delete factHash[hash];
        delete hashToIx[hash];
      }
    }
    return {adds:realAdds, removes:realRemoves};
  }

  collector(keys) {
    return {
      index: {},
      cache: {id: {}, ix: {}},
      hasher: generateStringFn(keys),
      collect: generateCollector2(keys),
    }
  }
  factToIndex(table, fact) {
    let keys = Object.keys(fact);
    if(!keys.length) return table.table.slice();
    let index = this.index(table, keys);
    let result = index.index[index.hasher(fact)];
    if(result) {
      return result.slice();
    }
    return [];
  }
  execDiff(diff: Diff): {triggers: any, realDiffs: any} {
    let triggers = {};
    let realDiffs = {};
    let tableIds = Object.keys(diff.tables);
    for(let tableId of tableIds) {
      let tableDiff = diff.tables[tableId];
      if(tableDiff.adds.length === 0 && tableDiff.removes.length === 0) continue;
      let realDiff = this.updateTable(tableId, tableDiff.adds, tableDiff.removes);
      // go through all the indexes and update them.
      let table = this.tables[tableId];
      let indexes = Object.keys(table.indexes);
      for(let indexName of indexes) {
        let index = table.indexes[indexName];
        index.collect(index.index, realDiff.adds, realDiff.removes, index.cache);
      }
      let curTriggers = Object.keys(table.triggers);
      for(let triggerName of curTriggers) {
        let trigger = table.triggers[triggerName];
        triggers[triggerName] = trigger;
      }
      realDiffs[tableId] = realDiff;
    }
    return {triggers, realDiffs};
  }
  execTrigger(trigger) {
    let table = this.table(trigger.name)
    // since views might be changed during the triggering process, we want to favor
    // just using the view itself as the trigger if it is one. Otherwise, we use the
    // trigger's exec function. This ensures that if a view is recompiled and added
    // that any already queued triggers will use the updated version of the view instead
    // of the old queued one.
    let {results = undefined, unprojected = undefined} = (table.view ? table.view.exec() : trigger.exec(this)) || {};
    if(!results) return;
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
  transitivelyClearTriggers(startingTriggers) {
    let cleared = {};
    let remaining = Object.keys(startingTriggers);

    for(let ix = 0; ix < remaining.length; ix++) {
      let trigger = remaining[ix];
      if(cleared[trigger]) continue;
      this.clearTable(trigger);
      cleared[trigger] = true;
      remaining.push.apply(remaining, Object.keys(this.table(trigger).triggers));
      // console.log("CLEARED: ", trigger);
    }
    return cleared;
  }
  execTriggers(triggers) {
    let newTriggers = {};
    let retrigger = false;
    for(let triggerName in triggers) {
      // console.log("Calling:", triggerName);
      let trigger = triggers[triggerName];
      let nextRound = this.execTrigger(trigger);
      if(nextRound) {
        retrigger = true;
        for(let trigger in nextRound) {
          // console.log("Queuing:", trigger);
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
  deleteDB() {
    for(let table in this.tables) {
      this.removeView(table);
      this.clearTable(table);
    }
  }
  serialize(asObject?) {
    let dump = {};
    for(let tableName in this.tables) {
      let table = this.tables[tableName];
      if(!table.isView) {
        dump[tableName] = table.table;
      }
    }
    if(asObject) {
      return dump;
    }
    return JSON.stringify(dump);
  }
  load(serialized) {
    let dump = JSON.parse(serialized);
    let diff = this.diff();
    for(let tableName in dump) {
      diff.addMany(tableName, dump[tableName]);
    }
    if(INCREMENTAL) {
      this.applyDiffIncremental(diff);
    } else {
      this.applyDiff(diff);
    }
  }
  diff() {
    return new Diff(this);
  }
  applyDiff(diff:Diff) {
    if(INCREMENTAL) {
      return this.applyDiffIncremental(diff);
    }
    let {triggers, realDiffs} = this.execDiff(diff);
    let cleared;
    let round = 0;
    if(triggers) cleared = this.transitivelyClearTriggers(triggers);
    while(triggers) {
      for(let trigger in triggers) {
        cleared[trigger] = false;
      }
      // console.group(`ROUND ${round}`);
      triggers = this.execTriggers(triggers);
      round++;
      // console.groupEnd();
    }
    for(let trigger of Object.keys(cleared)) {
      if(!cleared[trigger]) continue;
      let view = this.table(trigger).view;
      if(view) {
        this.execTrigger(view);
      }
    }
  }
  table(tableId) {
    let table = this.tables[tableId];
    if(table) return table;
    return this.addTable(tableId);
  }
  index(tableOrId:string|{}, keys:any[]) {
    let table;
    if(typeof tableOrId === "string") table = this.table(tableOrId);
    else table = tableOrId;
    keys.sort();
    let indexName = keys.filter((key) => key !== "__id").join("|");
    let index = table.indexes[indexName];
    if(!index) {
      let tableKeys = [];
      for(let key of keys) {
        tableKeys.push(table.keyLookup[key] || key);
      }
      index = table.indexes[indexName] = this.collector(tableKeys);
      index.collect(index.index, table.table, [], index.cache);
    }
    return index;
  }
  find(tableId, query?) {
    let table = this.tables[tableId];
    if(!table) {
      return [];
    } else if(!query) {
      return table.table.slice();
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
  trigger(name:string, table:string|string[], exec:(ixer:Indexer) => void, execIncremental?:(changes:any) => any) {
    let tables = (typeof table === "string") ? [table] : table;
    let trigger = {name, tables, exec, execIncremental};
    for(let tableId of tables) {
      let table = this.table(tableId);
      table.triggers[name] = trigger;
    }
    if(!INCREMENTAL) {
      let nextRound = this.execTrigger(trigger);
      while(nextRound) {
        nextRound = this.execTriggers(nextRound);
      };
    } else {
      if(!tables.length) { return exec(this); }
      let initial = {[tables[0]]: {adds: this.tables[tables[0]].table, removes: []}};
      let {triggers, changes} = this.execTriggerIncremental(trigger, initial);
      while(triggers) {
        let results = this.execTriggersIncremental(triggers, changes);
        if(!results) break
        triggers = results.triggers;
        changes = results.changes;
      }
    }
  }

  asView(query:Query|Union) {
    let name = query.name;
    if(this.tables[name]) {
      this.removeView(name);
    }
    let view = this.table(name);
    this.edbTables[name] = false;
    view.view = query;
    view.isView = true;
    this.trigger(name, query.tables, query.exec.bind(query), query.execIncremental.bind(query));
  }
  removeView(id:string) {
    for(let table of this.tables) {
      delete table.triggers[id];
    }
  }
  totalFacts() {
    let total = 0;
    for(let tableName in this.tables) {
      total += this.tables[tableName].table.length;
    }
    return total;
  }
  factsPerTable() {
    let info = {};
    for(let tableName in this.tables) {
      info[tableName] = this.tables[tableName].table.length;
    }
    return info;
  }

  applyDiffIncremental(diff:Diff) {
    if(diff.length === 0) return;
    // console.log("DIFF SIZE: ", diff.length, diff);
		let {triggers, realDiffs} = this.execDiff(diff);
		let round = 0;
    let changes = realDiffs;
		while(triggers) {
		  // console.group(`ROUND ${round}`);
      // console.log("CHANGES: ", changes);
		  let results = this.execTriggersIncremental(triggers, changes);
      // console.groupEnd();
      if(!results) break
      triggers = results.triggers;
      changes = results.changes
		  round++;
		}
	}

  execTriggerIncremental(trigger, changes):any {
    let table = this.table(trigger.name);
    let adds, provenance, removes, info;
    if(trigger.execIncremental) {
      info = trigger.execIncremental(changes, table) || {};
      adds = info.adds;
      removes = info.removes;
    } else {
      trigger.exec();
      return;
    }
    let diff = new runtime.Diff(this);
    if(adds.length) {
      diff.addMany(trigger.name, adds);
    }
    if(removes.length) {
      diff.removeFacts(trigger.name, removes);
    }
    let updated = this.execDiff(diff);
    let {realDiffs} = updated;
    if(realDiffs[trigger.name] && (realDiffs[trigger.name].adds.length || realDiffs[trigger.name].removes)) {
      return {changes: realDiffs[trigger.name], triggers: updated.triggers};
    } else {
      return {};
    }
  }

  execTriggersIncremental(triggers, changes) {
    let newTriggers = {};
    let nextChanges = {};
    let retrigger = false;
    let triggerKeys = Object.keys(triggers);
    for(let triggerName of triggerKeys) {
      // console.log("Calling:", triggerName);
      let trigger = triggers[triggerName];
      let nextRound = this.execTriggerIncremental(trigger, changes);
      if(nextRound && nextRound.changes) {
        nextChanges[triggerName] = nextRound.changes;
        if(nextRound.triggers) {

          let nextRoundKeys = Object.keys(nextRound.triggers);
          for(let trigger of nextRoundKeys) {
            if(trigger && nextRound.triggers[trigger]) {
              retrigger = true;
              // console.log("Queuing:", trigger);
              newTriggers[trigger] = nextRound.triggers[trigger];
            }
          }
        }
      }
    }
    if(retrigger) {
      return {changes: nextChanges, triggers: newTriggers};
    }
  }
}

export function addProvenanceTable(ixer) {
  let table = ixer.addTable("provenance", ["table", ["row", "__id"], "row instance", "source", ["source row", "__id"]]);
  // generate some indexes that we know we're going to need upfront
  ixer.index("provenance", ["table", "row"]);
  ixer.index("provenance", ["table", "row instance"]);
  ixer.index("provenance", ["table", "source", "source row"]);
  ixer.index("provenance", ["table"]);
  return ixer;
}

function mappingToDiff(diff, action, mapping, aliases, reverseLookup) {
  for(let from in mapping) {
    let to = mapping[from];
    if(to.constructor === Array) {
      let source = to[0];
      if(typeof source === "number") {
        source = aliases[reverseLookup[source]];
      } else {
        source = aliases[source];
      }
      diff.add("action mapping", {action, from, "to source": source, "to field": to[1]});
    } else {
      diff.add("action mapping constant", {action, from, value: to});
    }
  }
  return diff;
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

export class Query {
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
  hasOrdinal;
  incrementalRowFinder;

  static remove(view: string, ixer:Indexer) {
    let diff = ixer.diff();
    diff.remove("view", {view});
    for(let actionItem of ixer.find("action", {view})) {
      let action = actionItem.action;
      diff.remove("action", {action});
      diff.remove("action source", {action});
      diff.remove("action mapping", {action});
      diff.remove("action mapping constant", {action});
      diff.remove("action mapping sorted", {action});
      diff.remove("action mapping limit", {action});
    }
    return diff;
  }

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
    this.hasOrdinal = false;
  }
  changeset(ixer:Indexer) {
    let diff = ixer.diff();
    let aliases = {};
    let reverseLookup = {};
    for(let alias in this.aliases) {
      reverseLookup[this.aliases[alias]] = alias;
    }
    let view = this.name;
    diff.add("view", {view, kind: "query"});
    //joins
    for(let join of this.joins) {
      let action = uuid();
      aliases[join.as] = action;
      if(!join.negated) {
        diff.add("action", {view, action, kind: "select", ix: join.ix});
      } else {
        diff.add("action", {view, action, kind: "deselect", ix: join.ix});
      }
      diff.add("action source", {action, "source view": join.table});
      mappingToDiff(diff, action, join.join, aliases, reverseLookup);
    }
    //functions
    for(let func of this.funcs) {
      let action = uuid();
      aliases[func.as] = action;
      diff.add("action", {view, action, kind: "calculate", ix: func.ix});
      diff.add("action source", {action, "source view": func.name});
      mappingToDiff(diff, action, func.args, aliases, reverseLookup);
    }
    //aggregates
    for(let agg of this.aggregates) {
      let action = uuid();
      aliases[agg.as] = action;
      diff.add("action", {view, action, kind: "aggregate", ix: agg.ix});
      diff.add("action source", {action, "source view": agg.name});
      mappingToDiff(diff, action, agg.args, aliases, reverseLookup);
    }
    //sort
    if(this.sorts) {
      let action = uuid();
      diff.add("action", {view, action, kind: "sort", ix: MAX_NUMBER});
      let ix = 0;
      for(let sort of this.sorts) {
        let [source, field, direction] = sort;
        if(typeof source === "number") {
          source = aliases[reverseLookup[source]];
        } else {
          source = aliases[source];
        }
        diff.add("action mapping sorted", {action, ix, source, field, direction});
        ix++;
      }
    }
    //group
    if(this.groups) {
      let action = uuid();
      diff.add("action", {view, action, kind: "group", ix: MAX_NUMBER});
      let ix = 0;
      for(let group of this.groups) {
        let [source, field] = group;
        if(typeof source === "number") {
          source = aliases[reverseLookup[source]];
        } else {
          source = aliases[source];
        }
        diff.add("action mapping sorted", {action, ix, source, field, direction: "ascending"});
        ix++;
      }
    }
    //limit
    if(this.limitInfo) {
      let action = uuid();
      diff.add("action", {view, action, kind: "limit", ix: MAX_NUMBER});
      for(let limitType in this.limitInfo) {
        diff.add("action mapping limit", {action, "limit type": limitType, value: this.limitInfo[limitType]});
      }
    }
    //projection
    if(this.projectionMap) {
      let action = uuid();
      diff.add("action", {view, action, kind: "project", ix: MAX_NUMBER});
      mappingToDiff(diff, action, this.projectionMap, aliases, reverseLookup);
    }
    return diff;
  }
  validateFields(tableName, joinObject) {
    let table = this.ixer.table(tableName);
    for (let field in joinObject) {
      if (table.fields.length && !table.keyLookup[field]) {
        throw new Error(`Table '${tableName}' doesn't have a field '${field}'.\n\nAvailable fields: ${table.fields.join(", ")}`);
      }
      let joinInfo = joinObject[field];
      if(joinInfo.constructor === Array) {
        let [joinNumber, referencedField] = joinInfo;
        if (typeof joinNumber !== "number") {
          joinNumber = this.aliases[joinNumber];
        }
        let join = this.joins[joinNumber];
        if (join && join.ix === joinNumber) {
          let referencedTable = this.ixer.table(join.table);
          if (!referencedTable.fields.length) continue;
          if (!referencedTable.keyLookup[referencedField]) {
            throw new Error(`Table '${join.table}' doesn't have a field '${referencedField}'.\n\nAvailable fields: ${referencedTable.fields.join(", ")}`);
          }
        }
      }
    }
  }
  select(table, join, as?) {
    this.dirty = true;
    if(as) {
      this.aliases[as] = Object.keys(this.aliases).length;
    }
    this.unprojectedSize++;
    this.tables.push(table);
    this.validateFields(table, join);
    this.joins.push({negated: false, table, join, as, ix: this.aliases[as]});
    return this;
  }
  deselect(table, join) {
    this.dirty = true;
    this.tables.push(table);
    this.validateFields(table, join);
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
    this.validateFields(undefined, projectionMap);
    return this;
  }
  group(groups) {
    this.dirty = true;
    if(groups[0] && groups[0].constructor === Array) {
      this.groups = groups;
    } else {
      if(!this.groups) this.groups = [];
      this.groups.push(groups);
    }
    return this;
  }
  sort(sorts) {
    this.dirty = true;
    if(sorts[0] && sorts[0].constructor === Array) {
      this.sorts = sorts;
    } else {
      if(!this.sorts) this.sorts = [];
      this.sorts.push(sorts);
    }
    return this;
  }
  limit(limitInfo:any) {
    this.dirty = true;
    if(!this.limitInfo) {
      this.limitInfo = {};
    }
    for(let key in limitInfo) {
      this.limitInfo[key] = limitInfo[key];
    }
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
  ordinal() {
    this.dirty = true;
    this.hasOrdinal = true;
    this.unprojectedSize++;
    return this;
  }
  applyAliases(joinMap) {
    for(let field in joinMap) {
      let joinInfo = joinMap[field];
      if(joinInfo.constructor !== Array || typeof joinInfo[0] === "number") continue;
      let joinTable = joinInfo[0];
      if(joinTable === "ordinal") {
        joinInfo[0] = this.unprojectedSize - 1;
      } else if(this.aliases[joinTable] !== undefined) {
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
    let returns = ["unprojected", "provenance"];

    // we need an array to store our unprojected results
    root.children.push({type: "declaration", var: "unprojected", value: "[]"});
    root.children.push({type: "declaration", var: "provenance", value: "[]"});
    root.children.push({type: "declaration", var: "projected", value: "{}"});

    // run through each table nested in the order they were given doing pairwise
    // joins along the way.
    for(let join of this.joins) {
      let {table, ix, negated} = join;
      let cur = {
        type: "select",
        table,
        passed: ix === 0,
        ix,
        negated,
        children: [],
        join: false,
      };
      // we only want to eat the cost of dealing with indexes
      // if we are actually joining on something
      let joinMap = join.join;
      this.applyAliases(joinMap);
      if(joinMap && Object.keys(joinMap).length !== 0) {
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
    if(this.aggregates.length || sorts.length || this.limitInfo || this.hasOrdinal) {
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
      if(this.hasOrdinal === true) {
        aggregateChildren.push({type: "ordinal"});
        results.push({type: "placeholder"});
      }
      let aggregate = {type: "aggregate loop", groups: this.groups, limit: this.limitInfo, size, children: aggregateChildren};
      root.children.push(aggregate);
      cursor = aggregate;
    }


    if(this.projectionMap) {
      this.applyAliases(this.projectionMap);
      root.children.unshift({type: "declaration", var: "results", value: "[]"});
      if(INCREMENTAL) {
        cursor.children.push({type: "provenance"});
      }
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
        let property = "";
        if(arg[1]) {
          property = `['${arg[1]}']`;
        }
        if(!unprojected) {
          argCode = `row${arg[0]}${property}`;
        } else {
          argCode = `unprojected[ix + ${arg[0]}]${property}`;
        }
      } else {
        argCode = JSON.stringify(arg);
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
        if(root.passed) {
          code += `var rows${ix} = rootRows;\n`;
        } else if(root.join) {
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
        var projection = "";
        var aggregateCalls = [];
        var aggregateStates = [];
        var aggregateResets = [];
        var unprojected = {};
        var ordinal:string|boolean = false;
        var provenanceCode;
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
          } else if(agg.type === "ordinal") {
            ordinal = `unprojected[ix+${this.unprojectedSize - 1}] = resultCount;\n`;
          } else if(agg.type === "provenance") {
            provenanceCode = this.compileAST(agg);
          }
        }
        var aggregateCallsCode = aggregateCalls.join("");

        var differentGroupChecks = [];
        var groupCheck = `false`;
        if(root.groups) {
          for(let group of root.groups) {
            let [table, field] = group;
            differentGroupChecks.push(`unprojected[nextIx + ${table}]['${field}'] !== unprojected[ix + ${table}]['${field}']`);
          }
          groupCheck = `(${differentGroupChecks.join(" || ")})`;
        }

        var resultsCheck = "";
        if(root.limit && root.limit.results) {
          let limitValue = root.limit.results;
          let offset = root.limit.offset;
          if(offset) {
            limitValue += offset;
            projection = `if(resultCount >= ${offset}) {
              ${projection}
            }`;
          }
          resultsCheck = `if(resultCount === ${limitValue}) break;`;
        }
        var groupLimitCheck = "";
        if(root.limit && root.limit.perGroup && root.groups) {
          let limitValue = root.limit.perGroup;
          let offset = root.limit.offset;
          if(offset) {
            limitValue += offset;
            aggregateCallsCode = `if(perGroupCount >= ${offset}) {
              ${aggregateCallsCode}
            }`;
          }
          groupLimitCheck = `if(perGroupCount === ${limitValue}) {
            while(!differentGroup) {
              nextIx += ${root.size};
              if(nextIx >= len) break;
              groupInfo[nextIx] = undefined;
              differentGroup = ${groupCheck};
            }
          }`;
        }
        var groupDifference = "";
        var groupInfo = "";
        if(this.groups) {
          groupInfo = "groupInfo[ix] = resultCount;";
          let groupProjection = `${projection}resultCount++;`
          if(root.limit && root.limit.offset) {
            groupProjection = `if(perGroupCount > ${root.limit.offset}) {
              ${groupProjection}
            }`;
            groupInfo = `if(perGroupCount >= ${root.limit.offset}) {
              ${groupInfo}
            }`;
          }
          groupDifference = `
          perGroupCount++
          var differentGroup = ${groupCheck};
          ${groupLimitCheck}
          if(differentGroup) {
            ${groupProjection}
            ${aggregateResets.join("\n")}
            perGroupCount = 0;
          }\n`;
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
                    ${ordinal || ""}
                    ${provenanceCode}
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
                  ${aggregateCallsCode}
                  ${groupInfo}
                  ${ordinal || ""}
                  ${provenanceCode}
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
        var idStringParts = [];
        for(let newField in root.projectionMap) {
          let mapping = root.projectionMap[newField];
          let value = "";
          if(mapping.constructor === Array) {
            if(mapping[1] === undefined) {
              value = `unprojected[ix + ${mapping[0]}]`;
            } else if(!root.unprojected || root.unprojected[mapping[0]]) {
              value = `row${mapping[0]}['${mapping[1]}']`;
            } else {
              value = `unprojected[ix + ${mapping[0]}]['${mapping[1]}']`;
            }
          } else {
            value = JSON.stringify(mapping);
          }
          projectedVars.push(`projected['${newField.replace(/'/g, "\\'")}'] = ${value}`);
          idStringParts.push(value);
        }
        code += projectedVars.join(";\n") + "\n";
        code += `projected.__id = ${idStringParts.join(` + "|" + `)};\n`;
        code += `results.push(projected);\n`;
        code += `projected = {};\n`;
        break;
      case "provenance":
        var provenance = "var provenance__id = '';\n";
        var ids = [];
        for(let join of this.joins) {
          if(join.negated) continue;
          provenance += `provenance__id = tableId + '|' + projected.__id + '|' + rowInstance + '|${join.table}|' + row${join.ix}.__id; \n`;
          provenance += `provenance.push({table: tableId, row: projected, "row instance": rowInstance, source: "${join.table}", "source row": row${join.ix}});\n`;
          ids.push(`row${join.ix}.__id`);
        }
        code = `var rowInstance = ${ids.join(" + '|' + ")};
        ${provenance}`;
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
  // given a set of changes and a join order, determine the root facts that need
  // to be joined again to cover all the adds
  reverseJoin(joins) {
    let changed = joins[0];
    let reverseJoinMap = {};
    // collect all the constraints and reverse them
    for (let join of joins) {
      for (let key in join.join) {
        let [source, field] = join.join[key];
        if (source <= changed.ix) {
          if (!reverseJoinMap[source]) {
            reverseJoinMap[source] = {};
          }
          if(!reverseJoinMap[source][field]) reverseJoinMap[source][field] = [join.ix, key];
        }
      }
    }
    var recurse = (joins, joinIx) => {
      var code = "";
      if (joinIx >= joins.length) {
        return "others.push(row0)";
      }
      let {table, ix, negated} = joins[joinIx];
      let joinMap = joins[joinIx].join;
      // we only care about this guy if he's joined with at least one thing
      if (!reverseJoinMap[ix] && joinIx < joins.length - 1) return recurse(joins, joinIx + 1);
      else if(!reverseJoinMap) return "";
      let mappings = [];
      for (let key in reverseJoinMap[ix]) {
        let [sourceIx, field] = reverseJoinMap[ix][key];
        if(sourceIx === changed.ix || reverseJoinMap[sourceIx] !== undefined) {
          mappings.push(`'${key}': row${sourceIx}['${field}']`);
        }
      }
      for(let key in joinMap) {
        let value = joinMap[key];
        if(value.constructor !== Array) {
          mappings.push(`'${key}': ${JSON.stringify(value)}`);
        }
      }
      if (negated) {
        //@TODO: deal with negation;
      }
      code += `
            var rows${ix} = eve.find('${table}', {${mappings.join(", ") }});
            for(var rowsIx${ix} = 0, rowsLen${ix} = rows${ix}.length; rowsIx${ix} < rowsLen${ix}; rowsIx${ix}++) {
                var row${ix} = rows${ix}[rowsIx${ix}];
                ${recurse(joins, joinIx + 1) }
            }
            `;
      return code;
    }
    return recurse(joins, 1);
	}
  compileIncrementalRowFinderCode() {
      let code = "var others = [];\n";
      let reversed = this.joins.slice().reverse();
      let checks = [];
      let ix = 0;
      for (let join of reversed) {
          // we don't want to do this for the root
          if (ix === reversed.length - 1) break;
          checks.push(`
			if(changes["${join.table}"] && changes["${join.table}"].adds) {
                var curChanges${join.ix} = changes["${join.table}"].adds;
                for(var changeIx${join.ix} = 0, changeLen${join.ix} = curChanges${join.ix}.length; changeIx${join.ix} < changeLen${join.ix}; changeIx${join.ix}++) {
                    var row${join.ix} = curChanges${join.ix}[changeIx${join.ix}];
					${this.reverseJoin(reversed.slice(ix))}
				}
			}`);
          ix++;
      }
      code += checks.join(" else");
      var last = reversed[ix];
      code += `
			if(changes["${last.table}"] && changes["${last.table}"].adds) {
                var curChanges = changes["${last.table}"].adds;
				for(var changeIx = 0, changeLen = curChanges.length; changeIx < changeLen; changeIx++) {
					others.push(curChanges[changeIx]);
				}
			}
			return others;`;
      return code;
  }
  incrementalRemove(changes) {
    let ixer = this.ixer;
    let rowsToPostCheck = [];
    let provenanceDiff = this.ixer.diff();
    let removes = [];
    let indexes = ixer.table("provenance").indexes;
    let sourceRowLookup = indexes["source|source row|table"].index;
    let rowInstanceLookup = indexes["row instance|table"].index;
    let tableRowLookup = indexes["row|table"].index;
    let provenanceRemoves = [];
    let visited = {}
    for(let join of this.joins) {
      let change = changes[join.table];
      if(!visited[join.table] && change && change.removes.length) {
        visited[join.table] = true;
        for(let remove of change.removes) {
          let provenances = sourceRowLookup[join.table + '|' + remove.__id + '|' + this.name]
          if(provenances) {
            for(let provenance of provenances) {
              if(!visited[provenance["row instance"]]) {
                visited[provenance["row instance"]] = true;
                let relatedProvenance = rowInstanceLookup[provenance["row instance"] + '|' + provenance.table];
                for(let related of relatedProvenance) {
                  provenanceRemoves.push(related);
                }
              }
              rowsToPostCheck.push(provenance);
            }
          }
        }
      }
    }
    provenanceDiff.removeFacts("provenance", provenanceRemoves);
    ixer.applyDiffIncremental(provenanceDiff);
    let isEdb = ixer.edbTables;
    for(let row of rowsToPostCheck) {
      let supports = tableRowLookup[row.row.__id + '|' + row.table];
      if(!supports || supports.length === 0) {
        removes.push(row.row);
      }
    }
    return removes;
  }
  canBeIncremental() {
    if(this.aggregates.length) return false;
    if(this.sorts) return false;
    if(this.groups) return false;
    if(this.limitInfo) return false;
    for(let join of this.joins) {
      if(join.negated) return false;
    }
    if(!this.joins.length) return false;
    return true;
  }
  compile() {
    let ast = this.toAST();
    let code = this.compileAST(ast);
    this.compiled = new Function("ixer", "QueryFunctions", "tableId", "rootRows", code);
    if(this.canBeIncremental()) {
      this.incrementalRowFinder = new Function("changes", this.compileIncrementalRowFinderCode());
    } else {
      this.incrementalRowFinder = undefined;
    }
    this.dirty = false;
    return this;
  }
  exec() {
    if(this.dirty) {
      this.compile();
    }
    let root = this.joins[0];
    let rows;
    if(root) {
      rows = this.ixer.find(root.table, root.join);
    } else {
      rows = [];
    }
    return this.compiled(this.ixer, QueryFunctions, this.name, rows);
  }
  execIncremental(changes, table): {provenance: any[], adds: any[], removes: any[]} {
    if(this.dirty) {
      this.compile();
    }
    if(this.incrementalRowFinder) {
      let potentialRows = this.incrementalRowFinder(changes);
      // if the root select has some constant filters, then
      // the above rows need to be filtered down to only those that
      // match.
      let rows = [];
      let root = this.joins[0];
      let rootKeys = Object.keys(root.join);
      if(rootKeys.length > 0) {
        rowLoop: for(let row of potentialRows) {
          for(let key of rootKeys) {
            if(row[key] !== root.join[key]) continue rowLoop;
          }
          rows.push(row);
        }
      } else {
        rows = potentialRows;
      }
      let results = this.compiled(this.ixer, QueryFunctions, this.name, rows);
      let adds = [];
      let prevHashes = table.factHash;
      let prevKeys = Object.keys(prevHashes);
      let suggestedRemoves = this.incrementalRemove(changes);
      let realDiff = diffAddsAndRemoves(results.results, suggestedRemoves);
      for(let result of realDiff.adds) {
        let id = result.__id;
        if(prevHashes[id] === undefined) {
          adds.push(result);
        }
      }
      let diff = this.ixer.diff();
      diff.addMany("provenance", results.provenance);
      this.ixer.applyDiffIncremental(diff);
      // console.log("INC PROV DIFF", this.name, diff.length);
      return {provenance: results.provenance, adds, removes: realDiff.removes};
    } else {
      let results = this.exec();
      let adds = [];
      let removes = [];
      let prevHashes = table.factHash;
      let prevKeys = Object.keys(prevHashes);
      let newHashes = {};
      for(let result of results.results) {
        let id = result.__id;
        newHashes[id] = result;
        if(prevHashes[id] === undefined) {
          adds.push(result);
        }
      }
      for(let hash of prevKeys) {
        let value = newHashes[hash];
        if(value === undefined) {
           removes.push(prevHashes[hash]);
        }
      }
      let realDiff = diffAddsAndRemoves(adds, removes);
      let diff = this.ixer.diff();
      diff.remove("provenance", {table: this.name});
      diff.addMany("provenance", results.provenance);
      this.ixer.applyDiffIncremental(diff);
      // console.log("FULL PROV SIZE", this.name, diff.length);
      return {provenance: results.provenance, adds: realDiff.adds, removes: realDiff.removes};
    }
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

export class Union {
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
  changeset(ixer:Indexer) {
    let diff = ixer.diff();
    diff.add("view", {view: this.name, kind: "union"});
    for(let source of this.sources) {
      if(source.type === "+") {
        let action = uuid();
        diff.add("action", {view: this.name, action, kind: "union",  ix: 0});
        diff.add("action source", {action, "source view": source.table});
        for(let field in source.mapping) {
          let mapped = source.mapping[field];
          if(mapped.constructor === Array) diff.add("action mapping", {action, from: field, "to source": source.table, "to field": mapped[0]})
          else diff.add("action mapping constant", {action, from: field, value: mapped});
        }

      } else throw new Error(`Unknown source type: '${source.type}'`);
    }
    return diff;
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
  toAST() {
    let root = {type: "union", children: []};
    root.children.push({type: "declaration", var: "results", value: "[]"});
    root.children.push({type: "declaration", var: "provenance", value: "[]"});

    let hashesValue = "{}";
    if(this.isStateful) {
        hashesValue = "prevHashes";
    }
    root.children.push({type: "declaration", var: "hashes", value: hashesValue});

    let ix = 0;
    for(let source of this.sources) {
      let action;
      if(source.type === "+") {
        action = {type: "result", ix, children: [{type: "provenance", source, ix}]};
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
    root.children.push({type: "return", vars: ["results", "hashes", "provenance"]});
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
        code += `var sourceRows${ix} = changes['${root.table.replace(/'/g, "\\'")}'];\n`;
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
        code += `var hash${ix} = hasher(mappedRow${ix});\n`;
        code += `mappedRow${ix}.__id = hash${ix};\n`;
        code += `hashes[hash${ix}] = mappedRow${ix};\n`;
        for(var child of root.children) {
          code += this.compileAST(child);
        }
        break;
      case "removeResult":
        var ix = root.ix;
        code += `hashes[hasher(mappedRow${ix})] = false;\n`;
        break;
      case "hashesToResults":
        code += "var hashKeys = Object.keys(hashes);\n";
        code += "for(var hashKeyIx = 0, hashKeyLen = hashKeys.length; hashKeyIx < hashKeyLen; hashKeyIx++) {\n";
        code += "var curHashKey = hashKeys[hashKeyIx];"
        code += "var value = hashes[curHashKey];\n";
        code += "if(value !== false) {\n";
        code += "value.__id = curHashKey;\n";
        code += "results.push(value);\n";
        code += "}\n";
        code += "}\n";
        break;
      case "provenance":
        var source = root.source.table;
        var ix = root.ix;
        var provenance = "var provenance__id = '';\n";
        provenance += `provenance__id = '${this.name.replace(/'/g, "\\'")}|' + mappedRow${ix}.__id + '|' + rowInstance + '|${source.replace(/'/g, "\\'")}|' + sourceRow${ix}.__id; \n`;
        provenance += `provenance.push({table: '${this.name.replace(/'/g, "\\'")}', row: mappedRow${ix}, "row instance": rowInstance, source: "${source.replace(/'/g, "\\'")}", "source row": sourceRow${ix}});\n`;
        code = `var rowInstance = "${source.replace(/'/g, "\\'")}|" + mappedRow${ix}.__id;
        ${provenance}`;
        break;
      case "return":
        code += `return {${root.vars.map((name) => `${name}: ${name}`).join(", ")}};`;
        break;
    }
    return code;
  }
  compile() {
    let ast = this.toAST();
    let code = this.compileAST(ast);
    this.compiled = new Function("ixer", "hasher", "changes", code);
    this.dirty = false;
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
    let changes = {}
    for(let source of this.sources) {
      changes[source.table] = this.ixer.table(source.table).table;
    }
    let results = this.compiled(this.ixer, this.hasher, changes);
    return results;
  }
  incrementalRemove(changes) {
    let ixer = this.ixer;
    let rowsToPostCheck = [];
    let provenanceDiff = this.ixer.diff();
    let removes = [];
    let indexes = ixer.table("provenance").indexes;
    let sourceRowLookup = indexes["source|source row|table"].index;
    let rowInstanceLookup = indexes["row instance|table"].index;
    let tableRowLookup = indexes["row|table"].index;
    let provenanceRemoves = [];
    let visited = {}
    for(let source of this.sources) {
      let change = changes[source.table];
      if(!visited[source.table] && change && change.removes.length) {
        visited[source.table] = true;
        for(let remove of change.removes) {
          let provenances = sourceRowLookup[source.table + '|' + remove.__id + '|' + this.name]
          if(provenances) {
            for(let provenance of provenances) {
              if(!visited[provenance["row instance"]]) {
                visited[provenance["row instance"]] = true;
                let relatedProvenance = rowInstanceLookup[provenance["row instance"] + '|' + provenance.table];
                for(let related of relatedProvenance) {
                  provenanceRemoves.push(related);
                }
              }
              rowsToPostCheck.push(provenance);
            }
          }
        }
      }
    }
    provenanceDiff.removeFacts("provenance", provenanceRemoves);
    ixer.applyDiffIncremental(provenanceDiff);
    let isEdb = ixer.edbTables;
    for(let row of rowsToPostCheck) {
      let supports = tableRowLookup[row.row.__id + '|' + row.table];
      if(!supports || supports.length === 0) {
        removes.push(row.row);
      } else if(this.sources.length > 2) {
        let supportsToRemove = [];
        // otherwise if there are supports, then we need to walk the support
        // graph backwards and make sure every supporting row terminates at an
        // edb value. If not, then that support also needs to be removed
        for(let support of supports) {
          // if the support is already an edb, we're good to go.
          if(isEdb[support.source]) continue;
          if(!tableRowLookup[support["source row"].__id + '|' + support.source]) {
            supportsToRemove.push(support);
            continue;
          }
          // get all the supports for this support
          let nodes = tableRowLookup[support["source row"].__id + '|' + support.source].slice();
          let nodeIx = 0;
          // iterate through all the nodes, if they have further supports then
          // assume this node is ok and add those supports to the list of nodes to
          // check. If we run into a node with no supports it must either be an edb
          // or it's unsupported and this row instance needs to be removed.
          while(nodeIx < nodes.length) {
            let node = nodes[nodeIx];
            if(isEdb[node.source]) {
              nodeIx++;
              continue;
            }
            let nodeSupports = tableRowLookup[node["source row"].__id + '|' + node.source];
            if(!nodeSupports || nodeSupports.length === 0) {
              supportsToRemove.push(support);
              break;
            } else {
              for(let nodeSupport of nodeSupports) {
                nodes.push(nodeSupport);
              }
              nodeIx++;
            }
          }
        }
        if(supportsToRemove.length) {
          // we need to remove all the supports
          let provenanceRemoves = [];
          for(let support of supportsToRemove) {
            let relatedProvenance = rowInstanceLookup[support["row instance"] + '|' + support.table];
            for(let related of relatedProvenance) {
              provenanceRemoves.push(related);
            }
          }
          let diff = ixer.diff();
          diff.removeFacts("provenance", provenanceRemoves);
          ixer.applyDiffIncremental(diff);
          // now that all the unsupported provenances have been removed, check if there's anything
          // left.
          if(!tableRowLookup[row.row.__id + '|' + row.table] || tableRowLookup[row.row.__id + '|' + row.table].length === 0) {
            removes.push(row.row);
          }
        }
      }
    }
    return removes;
  }
  execIncremental(changes, table): {provenance: any[], adds: any[], removes: any[]} {
    if(this.dirty) {
      this.compile();
    }

    let sourceChanges = {}
    for(let source of this.sources) {
      let value;
      if(!changes[source.table]) {
        value = [];
      } else {
        value = changes[source.table].adds;
      }
      sourceChanges[source.table] = value;
    }
    let results = this.compiled(this.ixer, this.hasher, sourceChanges);
    let adds = [];
    let prevHashes = table.factHash;
    let prevKeys = Object.keys(prevHashes);
    let suggestedRemoves = this.incrementalRemove(changes);
    let realDiff = diffAddsAndRemoves(results.results, suggestedRemoves);
    for(let result of realDiff.adds) {
      let id = result.__id;
      if(prevHashes[id] === undefined) {
        adds.push(result);
      }
    }
    let diff = this.ixer.diff();
    diff.addMany("provenance", results.provenance);
    this.ixer.applyDiffIncremental(diff);
    return {provenance: results.provenance, adds, removes: realDiff.removes};
  }
}

//---------------------------------------------------------
// Builtin Primitives
//---------------------------------------------------------

runtime.define("count", {aggregate: true, result: "count"}, function(prev) {
  if(!prev.count) {
    prev.count = 0;
  }
  prev.count++;
  return prev;
});

runtime.define("sum", {aggregate: true, result: "sum"}, function(prev, value) {
  if(!prev.sum) {
    prev.sum = 0;
  }
  prev.sum += value;
  return prev;
});

runtime.define("average", {aggregate: true, result: "average"}, function(prev, value) {
  if(!prev.sum) {
    prev.sum = 0;
    prev.count = 0;
  }
  prev.count++;
  prev.sum += value;
  prev.average = prev.sum / prev.count;
  return prev;
});

runtime.define("lowercase", {result: "result"}, function(text) {
  if(typeof text === "string") {
    return {result: text.toLowerCase()};
  }
  return {result: text};
})

runtime.define("=", {filter: true, inverse: "!="}, function(a, b) {
  return a === b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define("!=", {filter: true, inverse: "="}, function(a, b) {
  return a !== b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define(">", {filter: true, inverse: "<="}, function(a, b) {
  return a > b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define("<", {filter: true, inverse: ">="}, function(a, b) {
  return a < b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define(">=", {filter: true, inverse: "<"}, function(a, b) {
  return a >= b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define("<=", {filter: true, inverse: ">"}, function(a, b) {
  return a <= b ? runtime.SUCCEED : runtime.FAIL;
});

runtime.define("+", {result: "result"}, function(a, b) {
  return {result: a + b};
});

runtime.define("-", {result: "result"}, function(a, b) {
  return {result: a - b};
});

runtime.define("*", {result: "result"}, function(a, b) {
  return {result: a * b};
});

runtime.define("/", {result: "result"}, function(a, b) {
  return {result: a / b};
});

runtime.define("^", {result: "result"}, function(a, b) {
  return {result: Math.pow(a,b)};
});

//---------------------------------------------------------
// AST and compiler
//---------------------------------------------------------

// view: view, kind[union|query|table]
// action: view, action, kind[select|calculate|project|union|ununion|stateful|limit|sort|group|aggregate], ix
// action source: action, source view
// action mapping: action, from, to source, to field
// action mapping constant: action, from, value

function addRecompileTriggers(eve) {

  var recompileTrigger = {
    exec: (ixer) => {
      for(let view of ixer.find("view")) {
        if(view.kind === "table") continue;
        try {
          let query = compile(ixer, view.view);
          ixer.asView(query);
        } catch(e) {
          console.error("BAD QUERY IN THE DB :(");
          console.error("View Id: " + view.view);
          console.log(e.stack);
          ixer.applyDiff(Query.remove(view.view, ixer));
        }
      }
      return {};
    }
  }

  eve.addTable("view", ["view", "kind"]);
  eve.addTable("action", ["view", "action", "kind", "ix"]);
  eve.addTable("action source", ["action", "source view"]);
  eve.addTable("action mapping", ["action", "from", "to source", "to field"]);
  eve.addTable("action mapping constant", ["action", "from", "value"]);
  eve.addTable("action mapping sorted", ["action", "ix", "source", "field", "direction"]);
  eve.addTable("action mapping limit", ["action", "limit type", "value"]);

  eve.table("view").triggers["recompile"] = recompileTrigger;
  eve.table("action").triggers["recompile"] = recompileTrigger;
  eve.table("action source").triggers["recompile"] = recompileTrigger;
  eve.table("action mapping").triggers["recompile"] = recompileTrigger;
  eve.table("action mapping constant").triggers["recompile"] = recompileTrigger;
  eve.table("action mapping sorted").triggers["recompile"] = recompileTrigger;
  eve.table("action mapping limit").triggers["recompile"] = recompileTrigger;

  return eve;
}

export function compile(ixer, viewId) {
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
    if(actionKind === "limit") {
      let limit = {};
      for(let limitMapping of ixer.find("action mapping limit", {action: action.action})) {
        limit[limitMapping["limit type"]] = limitMapping["value"];
      }
      compiled.limit(limit);
    } else if(actionKind === "sort" || actionKind === "group") {
      let sorted = [];
      let mappings = ixer.find("action mapping sorted", {action: action.action});
      mappings.sort((a, b) => a.ix - b.ix);
      for(let mapping of mappings) {
        sorted.push([mapping["source"], mapping["field"], mapping["direction"]]);
      }
      if(sorted.length) {
        compiled[actionKind](sorted);
      } else {
        throw new Error(`${actionKind} without any mappings: ${action.action}`)
      }
    } else {
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
  }
  return compiled;
}

//---------------------------------------------------------
// Public API
//---------------------------------------------------------

export const SUCCEED = [{success: true}];
export const FAIL = [];

export function indexer() {
  let ixer = new Indexer();
  addProvenanceTable(ixer);
  addRecompileTriggers(ixer);
  return ixer;
}

export function clearAllQueries(eve) {
  let finalDiff = eve.diff();
  for(let query of eve.find("query to id")) {
    finalDiff.merge(Query.remove(query.id, eve));
  }
  finalDiff.remove("query to id", {});
  eve.applyDiff(finalDiff);
}

if(ENV === "browser") window["runtime"] = exports;
