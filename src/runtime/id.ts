class IdStore {
  currentId = 0;
  partsToId: Object = Object.create(null);
  idToParts: Object = Object.create(null);

  _makeStringId() {
    return `⦑${this.currentId++}⦒`;
  }

  _make(origKey: string, parts: any[]) {
    let ix = 0;
    let changed = false;
    for(let part of parts) {
      let found = this.idToParts[part]
      if(found !== undefined) {
        parts[ix] = found;
        changed = true;
      }
      ix++;
    }
    let updatedKey = origKey;
    if(changed) {
      updatedKey = `⦑${parts.join("⦒")}`;
    }
    let id = this._makeStringId();
    let loadedValue = this.partsToId[updatedKey];
    if(loadedValue) {
      this.partsToId[origKey] = loadedValue;
      this.idToParts[loadedValue] = updatedKey;
    } else {
      this.partsToId[origKey] = id;
      this.idToParts[id] = updatedKey;
    }
    return id;
  }

  isId(id: any) {
    return id.substring && id[0] === "⦑";
  }

  load(id: string) {
    let found = this.partsToId[id];
    if(found) return found;
    let neue = this._makeStringId();
    this.partsToId[id] = neue;
    this.idToParts[neue] = id;
    return neue;
  }

  get(parts: any[]) {
    let key = `⦑${parts.join("⦒")}`;
    let id = this.partsToId[key];
    if(id) return id;
    return this._make(key, parts);
  }

  parts(id: string) {
    return this.idToParts[id];
  }
}

export var ids = new IdStore();

