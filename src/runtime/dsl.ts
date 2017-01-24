declare var Proxy:new (obj:any, proxy:any) => any;
declare var Symbol:any;

function concat(...strs:string[]) {
  return {};
}

class FunctionCall {
  constructor(public path:string[], public args:any[]) {}
}

class Variable {
  constructor(public name:string) { }
}

class EveRecord {
  constructor(public groups:string[], public fields:any) {
    fields.groups = groups;
  }

  proxy() {
    return new Proxy(this, {
      get: function(obj:any, prop:string) {
        let found = obj[prop] || obj.fields[prop];
        if(prop === Symbol.toPrimitive) return () => {
          return "uh oh";
        }
        if(!found) {
          found = obj.fields[prop] = new Variable(prop);
        }
        return found;
      }
    })
  }
}

class Program {
  constructor(public name:string) {}

  transformBlockCode(code:string):string {

    let hasChanged = true;
    let infixParam = "((?:(?:[a-z0-9_\.]+(?:\\[\".*?\"\\])?)+(?:\\(.*\\))?)|\\(.*\\))";
    let stringPlaceholder = "(____[0-9]+____)";

    let strings:string[] = [];
    code = code.replace(/"(?:[^"\\]|\\.)*"/gi, function(str) {
      strings.push(str);
      return "____" + (strings.length - 1) + "____";
    })

    let stringAddition = new RegExp(`(?:${infixParam}\\s*\\+\\s*${stringPlaceholder})|(?:${stringPlaceholder}\\s*\\+\\s*${infixParam})`,"gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(stringAddition, (str, left, right, left2, right2) => {
        hasChanged = true;
        if(left === undefined) {
          left = left2;
          right = right2;
        }
        left = this.transformBlockCode(left);
        right = this.transformBlockCode(right);
        strings.push(`fn.string.concat(${left}, ${right})`);
        return "____" + (strings.length - 1) + "____";
      })
    }

    // foo(..) -> fn.foo(..)
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(/([a-z0-9\._]+\(.*\))/gi, (str, fun) => {
        if(!fun.match(/fn\.|^record\(/)) {
          hasChanged = true;
          return "fn." + fun;
        }
        return fun;
      });
    }

    let multiply = new RegExp(`${infixParam}\\s*(\\*|\\/)\\s*${infixParam}`, "gi");
    // a * b -> fn.math["*"](a, b)
    // a / b -> fn.math["/"](a, b)
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(multiply, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left);
        right = this.transformBlockCode(right);
        strings.push(`fn.math["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }
    // a + b -> fn.math["+"](a, b)
    // a - b -> fn.math["-"](a, b)
    let add = new RegExp(`${infixParam}\\s*(\\+|\\-)\\s*${infixParam}`, "gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(add, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left);
        right = this.transformBlockCode(right);
        strings.push(`fn.math["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }
    // a > b -> fn.compare[">"](a, b)
    let compare = new RegExp(`${infixParam}\\s*(>|>=|<|<=|!=|==)\\s*${infixParam}`, "gi");
    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(compare, (str, left, op, right) => {
        hasChanged = true;
        left = this.transformBlockCode(left);
        right = this.transformBlockCode(right);
        strings.push(`fn.compare["${op}"](${left}, ${right})`)
        return "____" + (strings.length - 1) + "____";
      });
    }

    let lastReturn = code.lastIndexOf("return");
    code = code.replace(/record\(/gi, (str, pos) => {
      if(pos > lastReturn) {
        return "output(";
      }
      return str;
    });

    hasChanged = true;
    while(hasChanged) {
      hasChanged = false;
      code = code.replace(/____([0-9]+)____/gi, function(str, index:string) {
        let found = strings[parseInt(index)];
        if(found) hasChanged = true;
        return found || str;
      })
    }
    return code;
  }

  block(name:string, func:any) {
    let info = {records: [] as EveRecord[], variables: [], functions: [] as FunctionCall[]};
    let recordFunc = (...args:any[]) => {
      let lastArg = args[args.length - 1];
      let proxied:any = {};
      let groups;
      if(typeof lastArg === "object") {
        proxied = lastArg;
        groups = args.slice(0, args.length - 1);
      } else {
        groups = args.slice(0, args.length);
      }
      // console.log("GROUPS", groups);
      let rec = new EveRecord(groups, proxied);
      info.records.push(rec);
      return rec.proxy();
    }
    let output = (...args:any[]) => {
      let out = recordFunc.apply(null, args);
      out.output = true;
      return out;
    }
    let fnGet = (obj:any, prop:string) => {
        let path = obj.path || [];
        path.push(prop);
        let neue:any = () => {};
        neue.path = path;
        return new Proxy(neue, {
          get: fnGet,
          apply: (target:any, targetThis:any, args:any[]) => {
            let func = new FunctionCall(path, args);
            info.functions.push(func);
            return func;
          }});
    }
    let fn = new Proxy({}, {get:fnGet});
    let code = this.transformBlockCode(func.toString());
    code = code.replace(/function.*\{/, "");
    let neueFunc = new Function("record", "fn", "output", code.substring(0, code.length - 1));

    let outputs = neueFunc(recordFunc, fn, output);
    console.log(info);
  }

  input(changes:any[]) {

  }
}

let foo = new Program("foo");

foo.block("cool story", (find:any, fn:any, record:any) => {
  let person = find("person");
  let text = `yo ${person.name} zomg ${person} ${person.age}`;
  return [
    record("html/div", {person, text, children: [
      record("html/div", {text: "yo"}),
      record("html/div", {text: "yo2"}),
      record("html/div", {text: "yo3"}),
    ]})
  ]
})
