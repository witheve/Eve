module immutable {

    var eve = app.eve;

    function bench2(size, offset = 0) {
        var items = [];
        console.time("create");
        var set = new ImmutableSet((v) => `${v.entity}|${v.attribute}|${v.value}`);
        for (var i = 0; i < size; i++) {
            set._dangerouslyAdd({ entity: `entity${i}`, attribute: "name", value: i });
        }
        //     var set = new ImmutableSet((v) => `${v.entity}|${v.attribute}|${v.value}`).addMany(items);
        console.timeEnd("create");
        return set;
    }

    function bench3(size, offset = 0) {
        var items = [];
        console.time("create");
        let diff = eve.diff();
        for (var i = 0; i < size; i++) {
            items[i] = { entity: `entity${i}`, attribute: "name", value: i };
        }
        diff.addMany("foo", items);
        eve.applyDiff(diff);
        console.timeEnd("create");
        return items;
    }

    class ImmutableSet {
        keys;
        map;
        values;
        toKey;
        size;
        constructor(toKey) {
            this.keys = [];
            this.values = [];
            this.map = {};
            this.toKey = toKey;
            this.size = 0;
        }
        _create(keys, values, map) {
            let set = new ImmutableSet(this.toKey);
            set.map = map;
            set.keys = keys;
            set.values = values;
            set.size = keys.length;
            return set;
        }
        dupMap() {
            let map = this.map;
            let keys = this.keys;
            let sub = {};
            for (let key of keys) {
                sub[key] = map[key];
            }
            return sub;
        }
        add(v) {
            let map = this.map;
            let k = this.toKey(v);
            if (map[k] !== undefined) {
                return this;
            } else {
                let map = this.dupMap();
                let keys = this.keys.slice();
                let values = this.values.slice();
                keys.push(k);
                values.push(v);
                map[k] = v;
                return this._create(keys, values, map);
            }
        }
        _dangerouslyAdd(v) {
            let map = this.map;
            let k = this.toKey(v);
            if (map[k] !== undefined) {
                return this;
            } else {
                let keys = this.keys;
                let values = this.values;
                keys.push(k);
                values.push(v);
                map[k] = v;
                this.size++;
                return this;
            }
        }
        remove(v) {
            let map = this.map;
            let k = this.toKey(v);
            if (map[k] === undefined) {
                return this;
            } else {
                let map = this.dupMap();
                let curKeys = this.keys;
                let curValues = this.values;
                let keys = [];
                let values = [];
                let newIx = 0;
                for (let keyIx = 0, len = this.size; keyIx < len; keyIx++) {
                    let curKey = curKeys[keyIx];
                    if (curKey !== k) {
                        keys[newIx] = curKey;
                        values[newIx] = curValues[keyIx];
                        newIx++;
                    }
                }
                map[k] === undefined;
                return this._create(keys, values, map);
            }
        }
        addMany(vs) {
            let curMap = this.map;
            let map;
            let keys;
            let values;
            let changed = false;
            for (let v of vs) {
                let k = this.toKey(v);
                if (curMap[k] !== undefined) {
                    continue;
                } else {
                    if (changed === false) {
                        changed = true;
                        map = this.dupMap();
                        keys = this.keys.slice();
                        values = this.values.slice();
                    }
                    keys.push(k);
                    values.push(v);
                    map[k] = v;
                }
            }
            if (!changed) return this;
            return this._create(keys, values, map);
        }
        removeMany(vs) {
            let curMap = this.map;
            let toRemove = {};
            let map;
            let changed = false;
            for (let v of vs) {
                let k = this.toKey(v);
                if (curMap[k] === undefined) {
                    continue;
                } else {
                    if (changed === false) {
                        changed = true;
                        map = this.dupMap();
                    }
                    map[k] === undefined;
                }
            }
            if (changed === false) return this;
            let curKeys = this.keys;
            let curValues = this.values;
            let keys = [];
            let values = [];
            let newIx = 0;
            for (let keyIx = 0, len = this.size; keyIx < len; keyIx++) {
                let curKey = curKeys[keyIx];
                if (toRemove[curKey] === undefined) {
                    keys[newIx] = curKey;
                    values[newIx] = curValues[keyIx];
                    newIx++;
                }
            }
            return this._create(keys, values, map);
        }
        equal(set) {
            if (set === this) return true;
            if (set.size !== this.size) return false;
            let map = set.map;
            for (let key of this.keys) {
                if (map[key] === undefined) {
                    return false;
                }
            }
            return true;
        }
        diff(set) {
            let adds = [];
            let removes = [];
            let diff = { adds, removes };
            if (set === this) return diff;
            let curMap = this.map;
            let map = set.map;
            // what was removed
            for (let key of this.keys) {
                if (map[key] === undefined) {
                    removes.push(curMap[key]);
                }
            }
            // what was added
            for (let key of set.keys) {
                if (curMap[key] === undefined) {
                    adds.push(map[key]);
                }
            }
            return diff;
        }
    }

    //   var set = bench2(10000);
    //   console.time("set2");
    //   var set2 = set.add({entity: "foo", attribute: "name", value: "bar"});
    //   console.timeEnd("set2");
    //   console.time("diff");
    //   console.log(set.diff(set2));
    //   console.timeEnd("diff");
    //   bench3(10000)

}