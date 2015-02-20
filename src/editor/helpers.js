import macros from "../macros.sjs";

// Plucks the given index out of the arrays or objects in an array.
function pluck(arr, field) {
  var results = Array(arr.length);
  foreach(ix, item of arr) {
    results[ix] = item[field];
  }
  return results;
}
module.exports.pluck = pluck;

// Return the facts where the given field index contains value.
function select(view, ix, value) {
  var results = [];
  foreach(row of view) {
    if(row[ix] == value) {
      results.push(row);
    }
  }

  return results;
}
module.exports.select = select;

// Return the facts where the given field index contains a matching value.
function contains(view, ix, values) {
  var results = [];
  foreach(row of view) {
    if(values.indexOf(row[ix]) !== -1) {
      results.push(row);
    }
  }
  return results;
}
module.exports.contains = contains;

// Gets the given `keys` recursively in `obj`, optionally creating intermediates if `create` is true.
function aget(obj, keys, create) {
  var cur = obj;
  foreach(key of keys) {
    if(!cur[key]) {
      if(!create) { return undefined; }
      cur[key] = {};
    }
    cur = cur[key];
  }
  return cur;
}
module.exports.aget = aget;

// Deeply clones an array given it only contains arrays and primitives.
function cloneArray(arr) {
  var result = [];
  foreach(item of arr) {
    if(item instanceof Array) {
      item = cloneArray(item);
    }
    result.push(item);
  }
  return result;
}
module.exports.cloneArray = cloneArray;

// Shallow clones arrays and objects.
function cloneShallow(obj) {
  if(obj instanceof Array) {
    var result = new Array(obj.length);
    foreach(ix, v of obj) {
      result[ix] = v;
    }
    return result;
  } else if(typeof obj === "object") {
    var result = {};
    forattr(k, v of obj) {
      result[k] = v;
    }
    return result;
  }

  return obj;
}
module.exports.cloneShallow = cloneShallow;

// Merge objects [`src`...] into `dest` destructively, overwriting unmergeable properties.
function merge(dest) {
  var srcs = [].slice.call(arguments, 1);
  if(!srcs.length) { return dest; }
  foreach(src of srcs) {
    forattr(key, val of src) {
      if(dest[key] !== undefined && typeof dest[key] === typeof val) {
        if(val instanceof Array) {
          dest[key].push.apply(dest[key], cloneArray(val));
          continue;
        } else if(typeof val === "object") {
          dest[key] = merge(dest[key], val);
          continue;
        }
      }

      // Fallback case overwrites.
      dest[key] = val;
    }
  }

  return dest;
}
module.exports.merge = merge;
