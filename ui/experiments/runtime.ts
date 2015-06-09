class Chunk {
  length: number;
  keys: any[];
  values: any[];
  constructor(public size) {
    this.keys = [];
    this.values = [];
    this.length = 0;
  }
  isFull() {
    return this.size === this.length;
  }
  add(k, v) {
    if (this.length === this.size) {
      throw Error("Chunk size exceeded");
    }
    this.keys[this.length] = k;
    this.values[this.length] = v;
    this.length++;
  }
  getKeyIx(k) {
    var keys = this.keys;
    if (keys.length === 1) {
      return keys[0] === k ? 0 : -1;
    }
    if (keys[keys.length - 1] < k) {
      return -1;
    }
    var hi = keys.length;
    var lo = 0;
    var pivot;
    while (hi >= lo) {
      pivot = Math.floor((hi + lo) / 2);
      var pivotKey = keys[pivot];
      if (k === pivotKey) {
        return pivot;
      }
      if (pivotKey < k) {
        lo = pivot + 1;
      } else {
        hi = pivot - 1;
      }
    };
    return -1;
  }
  seekKeyIx(k) {
    var keys = this.keys;
    if (keys.length === 1) {
      return keys[0] >= k ? 0 : -1;
    }
    var hi = keys.length;
    var lo = 0;
    var pivot;
    var pivotKey;
    while (hi >= lo) {
      pivot = Math.floor((hi + lo) / 2);
      pivotKey = keys[pivot];
      if (k === pivotKey) {
        return pivot;
      }
      if (pivotKey < k) {
        lo = pivot + 1;
      } else {
        hi = pivot - 1;
      }
    };
    if (pivotKey > k) {
      return pivot;
    } else if (keys[pivot + 1] > k) {
      return pivot + 1;
    }
    return -1;
  }
  seekPastKeyIx(k) {
    var ix = this.seekKeyIx(k);
    if (this.keys[ix] > k) {
      return ix;
    } else if (this.keys[ix + 1] !== undefined) {
      return ix + 1;
    }
    return -1;
  }
  nextKey(k) {
    return this.keys[this.seekPastKeyIx(k)];
  }
  lookup(k) {
    var ix = this.getKeyIx(k);
    return this.values[ix];
  }
  range(from, to) {
    var start = this.seekKeyIx(from);
    if (start === -1) {
      return null;
    }
    var keys = this.keys;
    var values = this.values;
    var newChunk = new Chunk(this.size);
    for (var ix = start; keys[ix] < to; ix++) {
      newChunk.add(keys[ix], values[ix]);
    }
    return newChunk;
  }
}

function mergeChunks(a, b) {
  var aIx = 0;
  var bIx = 0;
  var aLen = a.length;
  var bLen = b.length;
  var result = new Chunk(aLen + bLen);
  var aKeys = a.keys;
  var bKeys = b.keys;
  var aValues = a.values;
  var bValues = b.values;
  //while we still have things in both lists
  //add them in sort order
  while (aIx < aLen && bIx < bLen) {
    var aKey = aKeys[aIx];
    var bKey = bKeys[bIx];
    if (aKey === bKey) {
      //if the keys are equal, the right-most value overwrites
      //the older one and we move past both keys.
      result.add(bKey, bValues[bIx]);
      aIx++;
      bIx++;
    } else if (aKey < bKey) {
      result.add(aKey, aValues[aIx]);
      aIx++;
    } else {
      result.add(bKey, bValues[aIx]);
      bIx++;
    }
  }
  if (aIx < aLen) {
  }
  //otherwise if there's still stuff in a, just add it all
  for (; aIx < aLen; aIx++) {
    result.add(aKeys[aIx], aValues[aIx]);
  }
  //or if there's stuff in b, just add that
  for (; bIx < bLen; bIx++) {
    result.add(bKeys[bIx], bValues[bIx]);
  }
  return result;
}

class MergeTree {
  chunks: { [level: number]: Chunk[] };
  sizes: number[];
  maxLevelSize: number;
  count: number;
  constructor() {
    this.chunks = { 1: [] };
    this.sizes = [1];
    this.maxLevelSize = 4;
    this.count = 0;
  }
  add(k, v) {
    var newTree = this.clone();
    var newChunk = new Chunk(1);
    newChunk.add(k, v);
    newTree.chunks[1].push(newChunk)
    newTree.dangerouslyCascade();
    return newTree;
  }
  addBulk(ks, vs) {
    var newTree = this.clone();
    for (var ix = 0, len = ks.length; ix < len; ix++) {
      var newChunk = new Chunk(1);
      newChunk.add(ks[ix], vs[ix]);
      newTree.chunks[1].push(newChunk);
    }
    newTree.dangerouslyCascade();
    return newTree;
  }
  lookup(k) {
    var curLevel;
    for (var sizeIx = 0, sizeLen = this.sizes.length; sizeIx < sizeLen; sizeIx++) {
      curLevel = this.chunks[this.sizes[sizeIx]];
      //we have to iterate backwards here to make sure we see the latest values first
      for (var chunkIx = curLevel.length - 1; chunkIx > -1; chunkIx--) {
        var found = curLevel[chunkIx].lookup(k);
        if (found !== undefined) {
          return found;
        }
      }
    }
  }
  next(k) {

  }
  range(fromInclusive, toExclusive) {
    var finalRange = new Chunk(1);
    var curLevel;
    //we have to start at the bottom of the tree to make sure we end up with the newest values
    //first.
    for (var sizeIx = this.sizes.length - 1; sizeIx > -1; sizeIx--) {
      curLevel = this.chunks[this.sizes[sizeIx]];
      for (var chunkIx = 0, levelLen = curLevel.length; chunkIx < levelLen; chunkIx++) {
        var found = curLevel[chunkIx].range(fromInclusive, toExclusive);
        if (found !== false) {
          finalRange = mergeChunks(finalRange, found);
        }
      }
    }
    return finalRange;
  }
  dangerouslyCascade() {
    var curSize = 1;
    var chunksAtLevel = this.chunks[curSize];
    var levelLen, nextSize, nextLevel;
    while (chunksAtLevel !== undefined) {
      levelLen = chunksAtLevel.length;
      //if we still have space on this level then there's nothing to do.
      if (levelLen <= this.maxLevelSize) break;

      nextSize = curSize * 2;
      nextLevel = this.chunks[nextSize];

      if (nextLevel === undefined) {
        nextLevel = this.chunks[nextSize] = [];
        this.sizes.push(nextSize);
      }

      while (chunksAtLevel.length > this.maxLevelSize) {
        var neueChunk = mergeChunks(chunksAtLevel[0], chunksAtLevel[1]);
        //remove the just merged chunks as they're now repesented in the next level
        chunksAtLevel.splice(0, 2);
        nextLevel.push(neueChunk);
      }

      chunksAtLevel = nextLevel;
      curSize = nextSize;

    }
  }
  clone() {
    var newTree = new MergeTree();
    var curChunks = this.chunks;
    var sizes = this.sizes;
    for (var sizeIx = 0, sizesLen = this.sizes.length; sizeIx < sizesLen; sizeIx++) {
      var size = sizes[sizeIx];
      newTree.chunks[size] = curChunks[size].slice();
    }
    newTree.sizes = this.sizes.slice();
    return newTree;
  }
}

class Column {
  tree: MergeTree;
  constructor() {
    this.tree = new MergeTree();
  }
  insert(value, rowId) {
    var tree = this.tree;
    var prev = tree.lookup(value);
    if (prev) {
      this.tree = tree.add(value, prev.add(rowId, true));
    } else {
      var rowIdTree = new MergeTree();
      this.tree = tree.add(value, rowIdTree.add(rowId, true));
    }
  }
  remove(value, rowId) {
    var tree = this.tree;
    var prev = tree.lookup(value);
    if (prev) {
      this.tree.add(value, prev.add(rowId, undefined));
    }
  }
  lookup(k) {
    return this.tree.lookup(k);
  }
  range(fromInclusive, toExclusive) {
    return this.tree.range(fromInclusive, toExclusive);
  }
}

type Row = any[];

class Relation {
  cols: Column[];
  rowIdToRow: { [rowId: string]: Row };
  constructor(public numColumns) {
    var cols = [];
    for (var ix = 0; ix < numColumns; ix++) {
      cols.push(new Column());
    }
    this.cols = cols;
    this.rowIdToRow = {};
  }
  insert(row: Row) {
    var id = JSON.stringify(row);
    this.rowIdToRow[id] = row;
    for (var colIx = 0, colLen = this.cols.length; colIx < colLen; colIx++) {
      this.cols[colIx].insert(row[colIx], id);
    }
  }
  remove(row: Row) {
    throw new Error("Not implemented yet");
  }
  getColumn(ix: number) {
    return this.cols[ix];
  }
}

var rel = new Relation(1);
rel.insert([0]);
rel.insert([1]);
rel.insert([2]);
rel.getColumn(4)

var rel2 = new Relation(1);
rel.insert([2]);

rel2.getColumn(0);
rel.getColumn(0);

function joinColumns(a, b) {
  var aRange = a.range(-Infinity, Infinity);
  var aKeys = aRange.keys;
}

class PersistentArray {
  array: any[];
  constructor() {
    this.array = [];
  }
  field(key: string) {

  }
  ix(key: number) {

  }
  put() {

  }
  static fromArray(arr): PersistentArray {
    var neue = new PersistentArray();
    neue.array = arr;
    return neue;
  }
}

function bench(size) {
  var start = performance.now();
  var ks = [];
  var t = new MergeTree();
  for (var i = 0; i < size; i++) {
    ks.push(i * 2);
  }
  t = t.addBulk(ks, ks);
  var end = performance.now();
  console.log("mergetree", end - start);
  return t;
}

function benchObject(size) {
  var start = performance.now();
  var t = {};
  var results = [];
  for (var i = 0; i < size; i++) {
    t[i] = i;
  }
  var end = performance.now();
  console.log("object", end - start);
  return t;
}

// var foo = bench(100000);
// var bar = benchObject(100000);
