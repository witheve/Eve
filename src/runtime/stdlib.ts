import {makeFunction, makeMultiFunction, RawValue, AggregateNode} from "./runtime";
import * as dateformat from "dateformat";

//--------------------------------------------------------------------
// Comparisons
//--------------------------------------------------------------------

makeFunction({
  name: "compare/>",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a > b) ? [] : undefined;
  }
});

makeFunction({
  name: "compare/>=",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a >= b) ? [] : undefined;
  }
});

makeFunction({
  name: "compare/<",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a < b) ? [] : undefined;
  }
});

makeFunction({
  name: "compare/<=",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a <= b) ? [] : undefined;
  }
});

makeFunction({
  name: "compare/!=",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a != b) ? [] : undefined;
  }
});

makeFunction({
  name: "compare/==",
  args: {a: "number", b: "number"},
  returns: {},
  apply: (a:number, b:number) => {
    return (a == b) ? [] : undefined;
  }
});

//--------------------------------------------------------------------
// Math
//--------------------------------------------------------------------

makeFunction({
  name: "math/+",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a + b];
  }
});

makeFunction({
  name: "math/-",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a - b];
  }
});

makeFunction({
  name: "math/*",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a * b];
  }
});

makeFunction({
  name: "math//",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a / b];
  }
});

makeFunction({
  name: "math/floor",
  args: {value: "number"},
  returns: {result: "number"},
  apply: (value:number) => {
    return [Math.floor(value)];
  }
});

makeFunction({
  name: "math/ceiling",
  args: {value: "number"},
  returns: {result: "number"},
  apply: (value:number) => {
    return [Math.ceil(value)];
  }
});

makeFunction({
  name: "math/round",
  args: {value: "number"},
  returns: {result: "number"},
  apply: (value:number) => {
    return [Math.round(value)];
  }
});

makeFunction({
  name: "math/sin",
  args: {degrees: "number"},
  returns: {result: "number"},
  apply: (degrees:number) => {
    return [Math.sin(degrees/180 * Math.PI)];
  }
});

makeFunction({
  name: "math/cos",
  args: {degrees: "number"},
  returns: {result: "number"},
  apply: (degrees:number) => {
    return [Math.cos(degrees/180 * Math.PI)];
  }
});

makeFunction({
  name: "math/tan",
  args: {degrees: "number"},
  returns: {result: "number"},
  apply: (degrees:number) => {
    return [Math.tan(degrees/180 * Math.PI)];
  }
});

makeFunction({
  name: "math/max",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [Math.max(a, b)];
  }
});

makeFunction({
  name: "math/min",
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [Math.min(a, b)];
  }
});

makeFunction({
  name: "math/mod",
  args: {value: "number", by: "number"},
  returns: {result: "number"},
  apply: (value:number, by:number) => {
    return [value % by];
  }
});

makeFunction({
  name: "math/absolute",
  args: {value: "number"},
  returns: {result: "number"},
  apply: (value:number) => {
    return [Math.abs(value)];
  }
});

makeFunction({
  name: "math/pow",
  args: {value: "number", exponent: "number"},
  returns: {result: "number"},
  apply: (value:number, exponent:number) => {
    return [Math.pow(value, exponent)];
  }
});

makeFunction({
  name: "math/ln",
  args: {value: "number"},
  returns: {result: "number"},
  apply: (value:number) => {
    return [Math.log(value)];
  }
});

makeFunction({
  name: "math/to-fixed",
  args: {value: "number", to: "number"},
  returns: {result: "string"},
  apply: (value:number, to:number) => {
    if(typeof value === "number") {
      return [value.toFixed(to)];
    }
  }
});

makeFunction({
  name: "math/convert-base",
  args: {value: "number", to: "number"},
  returns: {result: "string"},
  apply: (value:number, to:number) => {
    if(typeof value === "number" && to > 1 && to < 37) {
      return [value.toString(to)];
    }
  }
});

makeMultiFunction({
  name: "math/range",
  args: {start: "number", stop: "number"},
  returns: {result: "string"},
  estimate: function(context, prefix) {
    let {start, stop} = this.resolve(prefix);
    if(typeof start !== "number" || typeof stop !== "number") return 0;
    if(start > stop) {
      return start - stop;
    } else {
      return stop - start;
    }
  },
  apply: (start:number, stop:number, step:number = 1) => {
    if(typeof start !== "number" || typeof stop !== "number" || typeof step !== "number") return;
    if(start > stop) {
      [stop, start] = [start, stop];
    }

    let outputs = [];
    for(let ix = start; ix <= stop; ix += step) {
      outputs.push([ix]);
    }
    return outputs;
  }
});

//--------------------------------------------------------------------
// String
//--------------------------------------------------------------------

makeFunction({
  name: "string/replace",
  args: {text: "string", replace: "string", with: "string"},
  returns: {result: "string"},
  apply: function(text:string, replace:string, _with:string) {
    let result = text.split(replace).join(_with);
    return [result];
  }
});

makeFunction({
  name: "string/get",
  args: {text: "string", at: "number"},
  returns: {result: "string"},
  apply: function(text:string, at:number) {
    if(at > text.length) return;
    return [text[at - 1]];
  }
});

makeFunction({
  name: "string/uppercase",
  args: {text: "string"},
  returns: {result: "string"},
  apply: function(text:string) {
    return [text.toLocaleUpperCase()];
  }
});

makeFunction({
  name: "string/lowercase",
  args: {text: "string"},
  returns: {result: "string"},
  apply: function(text:string) {
    return [text.toLocaleLowerCase()];
  }
});

makeFunction({
  name: "string/index-of",
  args: {text: "string", substring: "string"},
  returns: {result: "number"},
  apply: function(text:string, substring:string) {
    let ix = (""+text).indexOf(substring);
    if(ix == -1) return;
    return [ix];
  }
});

makeFunction({
  name: "string/codepoint-length",
  args: {text: "string"},
  returns: {result: "number"},
  apply: function(text:string) {
    if(typeof text !== "string") return;
    return [text.length];
  }
});


//--------------------------------------------------------------------
// Random
//--------------------------------------------------------------------

makeFunction({
  name: "random/number",
  args: {seed: "any"},
  returns: {result: "number"},
  initialState: {},
  apply: function(seed:RawValue) {
    let state = this.state;
    let result = state[seed];
    if(result === undefined) {
      result = state[seed] = Math.random();
    }
    return [result];
  }
});

//--------------------------------------------------------------------
// Logic
//--------------------------------------------------------------------

makeFunction({
  name: "logic/toggle",
  args: {value: "string"},
  returns: {result: "string"},
  apply: (value: string) => {
    if(value === "true") return ["false"];
    if(value === "false") return ["true"];
    return [];
  }
})

//--------------------------------------------------------------------
// Date
//--------------------------------------------------------------------

makeFunction({
  name: "date/format",
  args: {timestamp: "number", format: "string"},
  returns: {result: "string"},
  apply: (timestamp: number, format: string) => {
    return [dateformat(timestamp, format)];
  }
})

//--------------------------------------------------------------------
// Eve internal
//--------------------------------------------------------------------

makeFunction({
  name: "eve/internal/gen-id",
  args: {},
  variadic: true,
  returns: {result: "string"},
  apply: (values:RawValue[]) => {
    // @FIXME: This is going to be busted in subtle cases.
    //   If a record exists with a "1" and 1 value for the same
    //   attribute, they'll collapse for gen-id, but won't join
    //   elsewhere.  This means aggregate cardinality will disagree with
    //   action node cardinality.
    return [values.join("|")];
  }
});

makeFunction({
  name: "eve/internal/concat",
  args: {},
  variadic: true,
  returns: {result: "string"},
  apply: (values:RawValue[]) => {
    return [values.join("")];
  }
});

//------------------------------------------------------------------------
// Aggregates
//------------------------------------------------------------------------

export type SumAggregateState = {total:number};
export class SumAggregate extends AggregateNode {
  name = "Sum";
  add(state:SumAggregateState, resolved:RawValue[]):any {
    state.total += resolved[0] as number;
    return state;
  }
  remove(state:SumAggregateState, resolved:RawValue[]):any {
    state.total -= resolved[0] as number;
    return state;
  }
  getResult(state:SumAggregateState):RawValue {
    return state.total;
  }
  newResultState():SumAggregateState {
    return {total: 0};
  };
}
