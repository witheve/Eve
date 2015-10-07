module Indexer {
  export type Dict = {[key:string]: any}|{[key:number]: any}
  interface Diff<T> { adds: T[], removes: T[] }
  type Diffs<T> = {[viewId:string]: Diff<T>}
  type Index<T> = IndexPath<T>|T[]
  interface IndexPath<T> { [key:string]: Index<T> }
  interface CollectorIndex<T> {
    index: Index<T>
    collect: CollectorFn<T>
  }
  type TriggerExec = (ixer:Indexer) => void
  interface Trigger {
    name: string
    tables: string[]
    exec: TriggerExec
  }
  interface Table<T> {
    facts: T[]
    diff?: Diff<T> // Most recent diff, for incremental triggers.
    factHash: {[hash:string]: boolean}
    indexes: {[key:string]: CollectorIndex<T>}
    triggers: {[name:string]: Trigger}
    fields: Keys
    stringify: StringFn<T>
    equals: EqualityFn<T>
  }
  type Keys = (number|string|[string, string])[]
  interface EqualityFn<T> { (a:T, b:T): boolean }
  interface StringFn<T> { (a:T): string }
  interface CollectorFn<T> { (index:Index<T>, adds:T[], removes:T[], equals:EqualityFn<T>): Index<T> }
  export interface MappingFn {
    (a:Dict): Dict
    (a:Dict[]): Dict[]
  }
  export interface MappingArrayFn {
    (a:Dict): any[]
    (a:Dict[]): any[][]
  }


  //---------------------------------------------------------------------------
  // Macros
  //---------------------------------------------------------------------------
  function generateEqualityFn<T>(keys:Keys): EqualityFn<T> {
    return <EqualityFn<T>>new Function("a", "b",  `return ${keys.map(function(key, ix) {
      if(key.constructor === Array) {
        return `a[${key[0]}]['${key[1]}'] === b[${key[0]}]['${key[1]}']`;
      } else {
        return `a["${key}"] === b["${key}"]`;
      }
    }).join(" && ")};`);
  }

  function generateStringFn<T>(keys:Keys): StringFn<T> {
    let keyStrings = [];
    for(let key of keys) {
      if(key.constructor === Array) {
        keyStrings.push(`a[${key[0]}]['${key[1]}']`);
      } else {
        keyStrings.push(`a['${key}']`);
      }
    }
    let final = keyStrings.join(' + "|" + ');
    return <StringFn<T>>new Function("a",  `return ${final};`);
  }

  function generateCollector<T>(keys:Keys): CollectorFn<T> {
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
    return <CollectorFn<T>>new Function("index", "adds", "removes", "equals", code);
  }

  export function generateMappingFn(fromKeys:string[]):MappingArrayFn
  export function generateMappingFn(fromKeys:string[], toKeys:string[]):MappingFn
  export function generateMappingFn(fromKeys:string[], toKeys?:string[]):(a:any) => any {
    let mapping;
    if(!toKeys) { // Map to an array
      mapping = "[";
      for(let from of fromKeys) mapping += `fact["${from}"], `;
      mapping += "]";
    } else { // Map to an object
      mapping = "{";
      let ix = 0;
      let toCounts = {};
      for(let from of fromKeys) {
        let to = toKeys[ix++] || from;
        toCounts[to] = (toCounts[to] || 0) + 1;
        if(toCounts[to] > 1) to += ` (${toCounts[to]})`;
        mapping += `"${to}": fact["${from}"], `;
      }
      mapping += "}";
    }
    return <MappingFn>new Function("factOrFacts", `
      if(!factOrFacts) return factOrFacts;
      if(factOrFacts instanceof Array) {
        var res = [];
        for(var ix = 0, len = factOrFacts.length; ix < len; ix++) {
          var fact = factOrFacts[ix];
          res[res.length] = ${mapping};
        }
        return res;
      }
      var fact = factOrFacts;
      return ${mapping};
    `);
  }

  //---------------------------------------------------------------------------
  // Utilities
  //---------------------------------------------------------------------------
  export function arraysIdentical(a:any[], b:any[]):boolean {
    var i = a.length;
    if (!b || i != b.length) return false;
    while (i--) {
      if(a[i] && a[i].constructor === Array) {
        if(!arraysIdentical(a[i], b[i])) return false;
        continue;
      }
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  export function identical(a:Dict, b:Dict): boolean {
    if(typeof a !== typeof b) { return false; }
    if(typeof a !== "object") { return a === b; }
    var aKeys = Object.keys(a);
    if(!arraysIdentical(aKeys, Object.keys(b))) { return false; }
    for(var key of aKeys) {
      if(typeof a[key] !== "object" && a[key] !== b[key]) { return false; }
      else if(a[key].constructor === Array) { console.log(a[key], b[key], arraysIdentical(a[key], b[key])); return arraysIdentical(a[key], b[key]); }
      else if(!identical(a[key], b[key])) { return false; }
    }
    return true;
  }

  function indexOfFact<T>(haystack:T[], needle:T, equals:EqualityFn<Dict> = identical) {
    let ix = 0;
    for(let fact of haystack) {
      if(equals(fact, needle)) {
        return ix;
      }
      ix++;
    }
    return -1;
  }

  export function removeFact<T>(haystack:T[], needle:T, equals?:EqualityFn<Dict>) {
    let ix = indexOfFact(haystack, needle, equals);
    if(ix > -1) haystack.splice(ix, 1);
    return haystack;
  }

  //---------------------------------------------------------------------------
  // ChangeSet
  //---------------------------------------------------------------------------
  export class ChangeSet {
    tables:{[id:string]: Diff<Dict>} = {};
    length: number = 0;
    meta = {};
    ixer:Indexer;

    constructor(ixer:Indexer) {
      this.ixer = ixer;
    }
    ensureTable(table:string) {
      let tableDiff:Diff<Dict> = this.tables[table];
      if(!tableDiff) {
        tableDiff = this.tables[table] = {adds: [], removes: []};
      }
      return tableDiff;
    }
    add(table:string, obj):ChangeSet {
      let tableDiff = this.ensureTable(table);
      this.length++;
      tableDiff.adds.push(obj);
      return this;
    }
    remove(table:string, query):ChangeSet {
      let tableDiff = this.ensureTable(table);
      let found = this.ixer.find(table, query);
      this.length += found.length;
      tableDiff.removes.push.apply(tableDiff.removes, found);
      return this;
    }
    addFacts(table:string, objs):ChangeSet {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.adds.push.apply(tableDiff.adds, objs);
      return this;
    }
    removeFacts(table:string, objs):ChangeSet {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.removes.push(tableDiff.removes, objs);
      return this;
    }
    reverse():ChangeSet {
      for(let tableId in this.tables) {
        let table = this.tables[tableId];
        let {removes:adds, adds:removes} = table;
        table.adds = adds;
        table.removes = removes;
      }
      return this;
    }
  }

  //---------------------------------------------------------------------------
  // Indexer
  //---------------------------------------------------------------------------
  export class Indexer {
    tables:{[table:string]: Table<Dict>} = {};

    addTable(name:string, keys:Keys = []) {
      let table = this.tables[name];
      if(table && keys.length) {
        table.fields = keys;
        table.stringify = generateStringFn(keys);
        table.equals = generateEqualityFn(keys);
      } else {
        table = this.tables[name] = {facts: [], factHash: {}, indexes: {}, triggers: {}, fields: keys, stringify: generateStringFn(keys), equals: generateEqualityFn(keys)};
      }
      return table;
    }
    clearTable(name:string) {
      let table = this.tables[name];
      if(!table) return;

      table.facts = [];
      table.factHash = {};
      for(let indexName in table.indexes) {
        table.indexes[indexName].index = {};
      }
    }
    updateTable<T>(tableId:string, adds:T[], removes:T[]) {
      let table = this.tables[tableId];
      if(!table || !table.fields.length) {
        let example = adds[0] || removes[0];
        table = this.addTable(tableId, Object.keys(example));
      }
      let stringify = table.stringify;
      let facts = table.facts;
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
      return {adds: realAdds, removes: realRemoves};
    }

    collector(keys:Keys) {
      return {
        index: {},
        collect: generateCollector(keys),
      }
    }
    factToIndex<T>(table:Table<T>, fact:T):T[] {
      let keys = Object.keys(fact);
      keys.sort();
      let indexName = keys.join("|");
      let index = table.indexes[indexName];
      if(!index) {
        index = table.indexes[indexName] = <any>this.collector(keys);
        index.collect(index.index, table.facts, [], table.equals);
      }
      let cursor = index.index;
      for(let key of keys) {
        cursor = cursor[fact[key]];
        if(!cursor) return [];
      }
      return <T[]>cursor;
    }
    execTrigger(trigger:Trigger) {
      trigger.exec(this);
    }
    //---------------------------------------------------------
    // Indexer Public API
    //---------------------------------------------------------
    changeSet() {
      return new ChangeSet(this);
    }
    table(tableId:string) {
      let table = this.tables[tableId];
      if(table) return table;
      return this.addTable(tableId);
    }
    index(tableId:string, keys:Keys) {
      let table = this.table(tableId);
      if(!table) {
        table = this.addTable(tableId);
      }
      keys.sort();
      let indexName = keys.join("|");
      let index = table.indexes[indexName];
      if(!index) {
        index = table.indexes[indexName] = <any>this.collector(keys);
        if(table.fields.length) index.collect(index.index, table.facts, [], table.equals);
      }
      return index.index;
    }
    applyChangeSet(changeSet:ChangeSet) {
      let triggers = {};
      for(let tableId in changeSet.tables) {
        let tableDiff = changeSet.tables[tableId];
        if(!tableDiff.adds.length && !tableDiff.removes.length) continue;
        let realDiff = this.updateTable(tableId, tableDiff.adds, tableDiff.removes);
        // go through all the indexes and update them.
        let table = this.tables[tableId];
        table.diff = realDiff;
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
    trigger(name:string, table:string|string[], exec:TriggerExec) {
      let tables = (typeof table === "string") ? [table] : table;
      let trigger = {name, tables, exec};
      let dirty = false;
      for(let tableId of tables) {
        let table = this.table(tableId);
        table.triggers[name] = trigger;
        if(table.fields.length) dirty = true;
      }
      if(dirty) this.execTrigger(trigger);
    }
    find<T>(tableId:string, query?:T|Dict):(T|Dict)[] {
      let table = this.tables[tableId];
      if(!table) {
        return [];
      } else if(!query) {
        return table.facts;
      } else {
        return this.factToIndex(table, query);
      }
    }
    findOne(tableId, query?) {
      return this.find(tableId, query)[0];
    }

  }
}