import {Multiplicity, RawValue, Register, IntermediateIndex, ID, Prefix,
        copyArray, isRegister, GlobalInterner, EvaluationContext, Change,
        Iterator, Transaction, copyHash, createArray, AggregateNode} from "./runtime"
import {TraceNode} from "./trace";

//------------------------------------------------------------------------
// Sum
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

//------------------------------------------------------------------------
// Sort
//------------------------------------------------------------------------

type SortState = {total:number};
export class SortAggregate extends AggregateNode {
  add(state:SortState, resolved:RawValue[]):any {
    state.total += resolved[0] as number;
    return state;
  }
  remove(state:SortState, resolved:RawValue[]):any {
    state.total -= resolved[0] as number;
    return state;
  }
  getResult(state:SortState):RawValue {
    return state.total;
  }
  newResultState():SortState {
    return {total: 0};
  };
}
