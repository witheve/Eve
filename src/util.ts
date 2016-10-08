import {v4 as rawuuid} from "uuid";

//---------------------------------------------------------
// Misc. Utilities
//---------------------------------------------------------
export function clone<T>(obj:T):T {
  if(typeof obj !== "object") return obj;
  if(obj.constructor === Array) {
    let neue:T = [] as any;
    for(let ix = 0; ix < (obj as any).length; ix++) {
      neue[ix] = clone(obj[ix]);
    }
    return neue;
  } else {
    let neue:T = {} as any;
    for(let key in obj) {
      neue[key] = clone(obj[key]);
    }
    return neue;
  }
}

export function uuid() {
  let raw:string = rawuuid();
  let mangled = raw.slice(0, 8) + raw.slice(9, 9 + 4) + raw.slice(-12);
  return "⦑" + mangled + "⦒";
}

export function sortComparator(a, b) {
  if(!a.sort || !b.sort) return 0;
  let aSort = a.sort;
  let bSort = b.sort;
  return aSort === bSort ? 0 : (aSort < bSort ? -1 : 1);
}

export function debounce<CB extends Function>(fn:CB, wait:number, leading?:boolean) {
  let timeout, context, args;

  let doFn = function doDebounced() {
    timeout = undefined;
    fn.apply(context, args);
    context = undefined;
    args = undefined;
  }

  let debounced:CB;
  if(!leading) {
    debounced = function(...argList) {
      context = this;
      args = argList;
      if(timeout) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(doFn, wait);
    } as any;
  } else {
    debounced = function(...argList) {
      context = this;
      args = argList;
      if(!timeout) {
        timeout = window.setTimeout(doFn, wait);
      }
    } as any;
  }

  return debounced;
}

export function unpad(str:string):string {
  if(!str) return str;
  let indent = 0;
  let neue = "";
  let lines = str.split("\n");
  if(lines[0] == "") lines.shift();
  while(lines[0][indent] == " ") indent++;
  let multi = false;
  for(let line of lines) {
    if(multi) neue += "\n";
    neue += line.substring(indent);
    multi = true;
  }
  return neue;
}

var _wordChars = {};
function setupWordChars(_wordChars) {
  for(let i = "0".charCodeAt(0); i < "9".charCodeAt(0); i++)
    _wordChars[String.fromCharCode(i)] = true;
  for(let i = "a".charCodeAt(0); i < "z".charCodeAt(0); i++)
    _wordChars[String.fromCharCode(i)] = true;
  for(let i = "A".charCodeAt(0); i < "Z".charCodeAt(0); i++)
    _wordChars[String.fromCharCode(i)] = true;
}
setupWordChars(_wordChars);

export function expandToWordBoundary(ch:number, line:string, direction:"left"|"right"):number {
  if(direction === "left") {
    while(ch > 0) {
      // We check the next character since the start of a range is inclusive.
      if(!_wordChars[line[ch - 1]]) break;
      ch--;
    }
  } else {
    while(ch < line.length) {
      if(!_wordChars[line[ch]]) break;
      ch++;
    }
  }
  return ch;
}

//---------------------------------------------------------
// CodeMirror utilities
//---------------------------------------------------------


export type Range = CodeMirror.Range;
export type Position = CodeMirror.Position;

export function isRange(loc:any): loc is Range {
  return loc.from !== undefined || loc.to !== undefined;
}

export function comparePositions(a:Position, b:Position) {
  if(a.line === b.line && a.ch === b.ch) return 0;
  if(a.line > b.line) return 1;
  if(a.line === b.line && a.ch > b.ch) return 1;
  return -1;
}

export function samePosition(a:Position, b:Position) {
  return comparePositions(a, b) === 0;
}

export function whollyEnclosed(inner:Range, outer:Range) {
  let left = comparePositions(inner.from, outer.from);
  let right = comparePositions(inner.to, outer.to);
  return (left === 1 || left === 0) && (right === -1 || right === 0);
}
