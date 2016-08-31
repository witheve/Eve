import {v4 as rawuuid} from "uuid";

//---------------------------------------------------------
// Utilities
//---------------------------------------------------------
export function clone(obj) {
  if(typeof obj !== "object") return obj;
  if(obj.constructor === Array) {
    let neue = [];
    for(let ix = 0; ix < obj.length; ix++) {
      neue[ix] = clone(obj[ix]);
    }
    return neue;
  } else {
    let neue = {};
    for(let key in obj) {
      neue[key] = clone(obj[key]);
    }
    return neue;
  }
}

export function uuid() {
  return "⦑" + rawuuid() + "⦒";
}

export function sortComparator(a, b) {
  if(!a.sort || !b.sort) return 0;
  let aSort = a.sort[0];
  let bSort = b.sort[0];
  return aSort === bSort ? 0 : (aSort < bSort ? -1 : 1);
}

export function debounce(fn, wait) {
  let timeout, context, args;

  let doFn = function doDebounced() {
    timeout = undefined;
    fn.apply(context, args);
    context = undefined;
    args = undefined;
  }

  return function debounced(...argList) {
    context = this;
    args = argList;
    if(timeout) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(doFn, wait);
  }
}
