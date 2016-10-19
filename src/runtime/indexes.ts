//---------------------------------------------------------------------
// Indexes
//---------------------------------------------------------------------

let perf = global["perf"];

export class MultiIndex {
  indexes: {[name: string]: TripleIndex};
  scopes: string[];
  constructor() {
    this.indexes = {};
    this.scopes = [];
  }

  register(name, index = new TripleIndex(0)) {
    this.indexes[name] = index;
    if(this.scopes.indexOf(name) === -1) {
      this.scopes.push(name);
    }
    return index;
  }

  unregister(name) {
    this.indexes[name] = undefined;
    this.scopes.splice(this.scopes.indexOf(name), 1);
  }

  getIndex(name) {
    let index = this.indexes[name];
    if(!index) return this.register(name);
    return index;
  }

  dangerousMergeLookup(e,a?,v?,node?) {
    let results = [];
    let indexes = this.indexes;
    for(let scope of this.scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      let found = index.lookup(e,a,v,node);
      if(found) {
        let foundIndex = found.index;
        for(let key of Object.keys(foundIndex)) {
          results.push(foundIndex[key].value);
        }
      }
    }
    return results;
  }

  contains(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      if(index.lookup(e,a,v,node) !== undefined) return true;
    }
    return;
  }

  store(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) {
        index = this.register(scope);
      }
      index.store(e,a,v,node)
    }
  }

  unstore(scopes, e, a?, v?, node?) {
    let indexes = this.indexes;
    for(let scope of scopes) {
      let index = indexes[scope];
      if(index === undefined) continue;
      index.unstore(e,a,v,node)
    }
  }
}

export class TripleIndex {
  cardinalityEstimate: number;
  version: number;
  eavIndex: IndexLevel;
  aveIndex: IndexLevel;
  neavIndex: IndexLevel;
  constructor(version: number, eavIndex?: IndexLevel, aveIndex?: IndexLevel, neavIndex?: IndexLevel) {
    this.cardinalityEstimate = 0;
    this.version = version;
    this.eavIndex = eavIndex !== undefined ? eavIndex : new IndexLevel(0, "eavRoot");
    this.aveIndex = aveIndex !== undefined ? aveIndex : new IndexLevel(0, "aveRoot");
    this.neavIndex = neavIndex !== undefined ? neavIndex : new IndexLevel(0, "neavRoot");
  }

  store(e,a,v,node = "user") {
    this.cardinalityEstimate++;
    this.eavIndex = this.eavIndex.store(this.version, e,a,v,node);
    this.aveIndex = this.aveIndex.store(this.version, a,v,e,node);
    this.neavIndex = this.neavIndex.store(this.version, node,e,a,v);
  }

  unstore(e,a,v,node?) {
    let changed = this.eavIndex.unstore(this.version,e,a,v,node);
    if(changed) {
      this.cardinalityEstimate--;
      this.eavIndex = changed;
      this.aveIndex = this.aveIndex.unstore(this.version,a,v,e,node);
      this.neavIndex = this.neavIndex.unstore(this.version,node,e,a,v);
    }
  }

  asValues(e, a?, v?, node?, recursive = false, singleAttributes = false) {
    let level = this.eavIndex.lookup(e,a,v,node);
    if(level) {
      let index = level.index;
      let values = [];
      for(let key of Object.keys(index)) {
        let value = index[key].value;
        if(!recursive || this.eavIndex.lookup(value) === undefined) {
          values.push(value);
        } else {
          values.push(this.asObject(value, recursive));
        }
        if(singleAttributes) return values[0];
      }
      return values;
    }
    return;
  }

  asObject(e, recursive = false, singleAttributes = false) : any {
    let obj = {};
    let attributes = this.asValues(e);
    if(attributes) {
      for(let attribute of attributes) {
        obj[attribute] = this.asValues(e, attribute, undefined, undefined, recursive, singleAttributes);
      }
    }
    return obj;
  }

  toTriples(withNode?, startIndex?) {
    let triples = [];
    let eavIndex = startIndex || this.eavIndex.index;
    let current = [];
    for(let eKey of Object.keys(eavIndex)) {
      let eInfo = eavIndex[eKey] as IndexLevel;
      current[0] = eInfo.value;
      let aIndex = eInfo.index
      for(let aKey of Object.keys(aIndex)) {
        let aInfo = aIndex[aKey] as IndexLevel;
        current[1] = aInfo.value;
        let vIndex = aInfo.index;
        for(let vKey of Object.keys(vIndex)) {
          let vInfo = vIndex[vKey] as IndexLevel;
          if(vInfo.value !== undefined) {
            current[2] = vInfo.value;
          } else {
            current[2] = vInfo;
          }
          if(withNode) {
            let nIndex = vInfo.index;
            for(let nKey of Object.keys(nIndex)) {
              let nInfo = nIndex[nKey];
              current[3] = nInfo;
              triples.push(current.slice());
            }
          } else {
            triples.push(current.slice());
          }
        }
      }
    }
    return triples;
  }

  // find an eav in the indexes
  lookup(e,a?,v?,node?) {
    // let start = perf.time();
    let result = this.eavIndex.lookup(e,a,v,node)
    // perf.lookup(start);
    return result;
  }

  // find an ave in the indexes
  alookup(a?,v?,e?,node?) {
    // let start = perf.time();
    let result = this.aveIndex.lookup(a,v,e,node)
    // perf.lookup(start);
    return result;
  }

  nodeLookup(node?,e?,a?,v?) {
    let result = this.neavIndex.lookup(node,e,a,v);
    return result;
  }

  nextVersion() {
    return new TripleIndex(this.version + 1, this.eavIndex, this.aveIndex);
  }
}

class IndexLevel {
  version: number;
  value: any;
  cardinality: number;
  index: {[key: string]: IndexLevel | string};
  constructor(version: number, value: any) {
    this.version = version;
    this.value = value;
    this.cardinality = 0;
    this.index = {};
  }

  store(version, a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    let newChild = a;
    if(child === undefined && b !== undefined) {
      newChild = new IndexLevel(version, a);
      newChild.store(version, b,c,d,e,f,g,h,i,j);
    } else if(b !== undefined) {
      newChild = (child as IndexLevel).store(version, b,c,d,e,f,g,h,i,j);
    }
    let updated : IndexLevel = this;
    if(newChild.version > this.version) {
      // updated = this.clone(version)
    }
    if(child === undefined) { updated.cardinality++; }
    updated.index[a] = newChild;
    return updated;
  }

  unstore(version, a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    if(child === undefined) return;

    let updated: IndexLevel = this;

    if(child instanceof IndexLevel) {
      let updatedChild = child.unstore(version, b,c,d,e,f,g,h,i,j);
      if(updatedChild === undefined) {
        // updated = this.clone(version);
        delete updated.index[a];
        updated.cardinality--;
      } else {
        // updated = this.clone(version);
        updated.index[a] = updatedChild;
      }
    } else {
      // updated = this.clone(version);
      delete updated.index[a];
      updated.cardinality--;
    }
    if(updated.cardinality <= 0) {
      return;
    }
    return updated;
  }

  toValues() {
    let values = [];
    for(let key of Object.keys(this.index)) {
      let value: any = this.index[key];
      values.push(value.value || value);
    }
    return values;
  }

  lookup(a,b?,c?,d?,e?,f?,g?,h?,i?,j?) {
    let child = this.index[a];
    if(child === undefined) return;
    if(b !== undefined && child instanceof IndexLevel) {
      return child.lookup(b,c,d,e,f,g,h,i,j);
    }
    return child;
  }

  clone(version) {
    let next = new IndexLevel(version, this.value);
    next.cardinality = this.cardinality;
    let index = next.index;
    let originalIndex = this.index;
    let keys = Object.keys(originalIndex);
    for(let key of keys) {
      index[key] = originalIndex[key];
    }
    return next;
  }
}
