import {makeFunction, RawValue, AggregateNode} from "./runtime";

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
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.floor(a)];
  }
});

makeFunction({
  name: "math/ceil",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.ceil(a)];
  }
});

makeFunction({
  name: "math/round",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.round(a)];
  }
});

makeFunction({
  name: "math/sin",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.sin(a/180 * Math.PI)];
  }
});

makeFunction({
  name: "math/cos",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.cos(a/180 * Math.PI)];
  }
});

makeFunction({
  name: "math/tan",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.tan(a/180 * Math.PI)];
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
  args: {a: "number", b: "number"},
  returns: {result: "number"},
  apply: (a:number, b:number) => {
    return [a % b];
  }
});

makeFunction({
  name: "math/abs",
  args: {a: "number"},
  returns: {result: "number"},
  apply: (a:number) => {
    return [Math.abs(a)];
  }
});

makeFunction({
  name: "math/toFixed",
  args: {a: "number", b: "number"},
  returns: {result: "string"},
  apply: (a:number, b:number) => {
    return [a.toFixed(b)];
  }
});

// makeFunction({
//   name: "math/range",
//   args: {start: "number", stop: "number"},
//   returns: {result: "string"},
//   apply: (start:number, stop:number) => {
//     if(start > stop) {
//       [stop, start] = [start, stop];
//     }

//     for(let ix = start; ix < stop; ix += 1) {
//     }
//     return [a.toFixed(b)];
//   }
// });

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
  name: "string/index_of",
  args: {text: "string", substring: "string"},
  returns: {result: "number"},
  apply: function(text:string, substring:string) {
    let ix = (""+text).indexOf(substring);
    if(ix == -1) return;
    return [ix];
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

type SumAggregateState = {total:number};
export class SumAggregate extends AggregateNode {
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
