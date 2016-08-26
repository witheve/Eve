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
