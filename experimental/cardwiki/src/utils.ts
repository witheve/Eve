import {v4 as _uuid} from "../vendor/uuid";
export var uuid = _uuid;

export var ENV = "browser";
try {
  window
} catch(err) {
  ENV = "node";
}

export var DEBUG:any = {

};

if(ENV === "browser") window["DEBUG"] = DEBUG;

type TemplateStringTag = (strings:string[], ...values:any[]) => string
interface unpad {
  (indent:number): TemplateStringTag
  memo: {[indent:number]: TemplateStringTag}
}
export var unpad:unpad = <any>function(indent) {
  if(unpad.memo[indent]) return unpad.memo[indent];
  return unpad.memo[indent] = function(strings, ...values) {
    if(!strings.length) return;
    let res = "";
    let ix = 0;
    for(let str of strings) res += str + (values.length > ix ? values[ix++] : "");

    if(res[0] === "\n") res = res.slice(1);
    let charIx = 0;
    while(true) {
      res = res.slice(0, charIx) + res.slice(charIx + indent);
      charIx = res.indexOf("\n", charIx) + 1;
      if(!charIx) break;
    }
  return res;
  }
};
unpad.memo = {};

export function repeat(str:string, length:number) {
  let len = length / str.length;
  let res = "";
  for(let ix = 0; ix < len; ix++)  res += str;
  return (res.length > length) ? res.slice(0, length) : res;
}
export function underline(startIx, length) {
  return repeat(" ", startIx) + "^" + repeat("~", length - 1);
}

export function capitalize(word:string):string {
  return word[0].toUpperCase() + word.slice(1)
}

export function titlecase(name:string):string {
  return name.split(" ").map(capitalize).join(" ");
}

export var string = {
  unpad,
  repeat,
  underline,
  capitalize,
  titlecase
};

export function tail(arr) {
  return arr[arr.length - 1];
}

export var array = {
  tail
};

export function coerceInput(input) {
  // http://jsperf.com/regex-vs-plus-coercion
  if (!isNaN(+input)) return +input;
  else if (input === "true") return true;
  else if (input === "false") return false;
  return input;
}

// Shallow copy the given object.
export function copy(obj) {
  if(!obj || typeof obj !== "object") return obj;
  if(obj instanceof Array) return obj.slice();
  let res = {};
  for(let key in obj) res[key] = obj[key];
  return res;
}