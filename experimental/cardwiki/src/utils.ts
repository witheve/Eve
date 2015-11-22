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