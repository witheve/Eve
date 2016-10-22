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
      updatedKey = parts.join("⦒");
    }
    let id = this._makeStringId();
    this.partsToId[origKey] = id;
    this.idToParts[origKey] = updatedKey;
    return id;
  }

  get(parts: any[]) {
    let key = parts.join("⦒");
    let id = this.partsToId[key];
    if(id) return id;
    return this._make(key, parts);
  }
}

export var ids = new IdStore();

