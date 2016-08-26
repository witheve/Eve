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

export function sortComparator(a, b) {
  return a.sort === b.sort ? 0 : (a.sort < b.sort ? -1 : 1);
}

export function debounce(fn, wait) {
  let timeout, context, args;

  let doFn = function doDebounced() {
    console.log("DO");
    timeout = undefined;
    fn.apply(context, args);
    context = undefined;
    args = undefined;
  }

  return function debounced(...argList) {
    console.log("DB");
    context = this;
    args = argList;
    if(timeout) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(doFn, wait);
  }
}
