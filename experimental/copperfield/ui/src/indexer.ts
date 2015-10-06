module Indexer {
  type Dict = {[key:string]: any}|{[key:number]: any}
  interface Diff<T> { adds: T[], removes: T[] }
  type Index<T> = IndexPath<T>|T[]
  interface IndexPath<T> { [key:string]: Index<T> }
  interface CollectorIndex<T> {
    index: Index<T>
    collect: CollectorFn<T>
  }
  interface Trigger {
    name: string
    exec: () => void
  }
  interface Table<T> {
    facts: T[]
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

  export function objectsIdentical(a:{}, b:{}): boolean {
    if(typeof a !== typeof b) { return false; }
    if(typeof a !== "object") { return a === b; }
    var aKeys = Object.keys(a);
    if(!arraysIdentical(aKeys, Object.keys(b))) { return false; }
    for(var key of aKeys) {
      if(typeof a[key] !== "object" && a[key] !== b[key]) { return false; }
      else if(a[key].constructor === Array) { console.log(a[key], b[key], arraysIdentical(a[key], b[key])); return arraysIdentical(a[key], b[key]); }
      else if(!objectsIdentical(a[key], b[key])) { return false; }
    }
    return true;
  }

  function indexOfFact<T>(haystack:T[], needle:T, equals:EqualityFn<Dict> = objectsIdentical) {
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
  class ChangeSet {
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
    add(table:string, obj) {
      let tableDiff = this.ensureTable(table);
      this.length++;
      tableDiff.adds.push(obj);
    }
    remove(table:string, query) {
      let tableDiff = this.ensureTable(table);
      let found = this.ixer.find(table, query);
      this.length += found.length;
      tableDiff.removes.push.apply(tableDiff.removes, found);
    }
    addFacts(table:string, objs) {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.adds.push.apply(tableDiff.adds, objs);
    }
    removeFacts(table:string, objs) {
      let tableDiff = this.ensureTable(table);
      this.length += objs.length;
      tableDiff.removes.push(tableDiff.removes, objs);
    }
  }

  //---------------------------------------------------------------------------
  // Indexer
  //---------------------------------------------------------------------------
  export class Indexer {
    tables:{[table:string]: Table<Dict>};
    constructor() {
      this.tables = {};
    }
    addTable(name:string, keys:Keys) {
      let table = this.tables[name] = {facts: [], factHash: {}, indexes: {}, triggers: {}, fields: keys, stringify: generateStringFn(keys), equals: generateEqualityFn(keys)};
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
      if(!table) {
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
      return {adds:realAdds, removes:realRemoves};
    }

    collector(keys:Keys) {
      return {
        index: {},
        collect: generateCollector(keys),
      }
    }
    index(tableId:string, keys:Keys) {
      let table = this.tables[tableId];
      if(!table) {
        table = this.addTable(tableId, keys);
      }
      keys.sort();
      let indexName = keys.join("|");
      let index = table.indexes[indexName];
      if(!index) {
        index = table.indexes[indexName] = <any>this.collector(keys);
        index.collect(index.index, table.facts, [], table.equals);
      }
      return index.index;
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
    execTrigger(trigger) {
      let {results, projected} = trigger.exec();
      if(projected) {
        let changeSet = new ChangeSet(this);
        this.clearTable(trigger.name);
        changeSet.addFacts(trigger.name, projected);
        this.applyChangeSet(changeSet);
      }
    }
    //---------------------------------------------------------
    // Indexer Public API
    //---------------------------------------------------------
    changeSet() {
      return new ChangeSet(this);
    }
    applyChangeSet(changeSet:ChangeSet) {
      let triggers = {};
      for(let tableId in changeSet.tables) {
        let tableDiff = changeSet.tables[tableId];
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