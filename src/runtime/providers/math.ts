//---------------------------------------------------------------------
// Math providers
//---------------------------------------------------------------------

import {Constraint} from "../join";
import * as providers from "./index";
import {deprecated} from "../util/deprecated";

abstract class TotalFunctionConstraint extends Constraint {
  abstract getReturnValue(args: any[]) : number;

  // Proposes the return value of the total function as the value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let result = this.getReturnValue(args);
    if (isNaN(result) || !(isFinite(result))) {return [];}
    return [result];
  }

  // Check if our return is equivalent to the result of the total function.
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return this.getReturnValue(args) === returns[0];
  }

  // Total functions always have a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    if(this.returns.length) {
      let proposal = this.proposalObject;
      proposal.providing = proposed;
      proposal.cardinality = 1;
      return proposal;
    }
    return;
  }
}

abstract class TrigConstraint extends TotalFunctionConstraint{
  static AttributeMapping = {
    "degrees": 0,
    "radians": 1
  }

  resolveTrigAttributes(args) : any {
    let degrees = args[0];
    let radians = args[1];

    //degrees which overrides radians. 
    if (! isNaN(degrees)){ radians = degreesToRadians(degrees);}
    return radians;
  }
}

abstract class ValueOnlyConstraint extends TotalFunctionConstraint{
  static AttributeMapping = {
      "value": 0
  }
}

function radiansToDegrees(radians:number){
  return radians * (180 / Math.PI);
}


function degreesToRadians(degrees:number){
  return degrees * (Math.PI / 180);
}

class Add extends TotalFunctionConstraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.getReturnValue(args)];
  }

  getReturnValue(args) {
    return args[0] + args[1];
  }
}

class Subtract extends TotalFunctionConstraint {
  getReturnValue(args) {
    return args[0] - args[1];
  }
}

class Multiply extends TotalFunctionConstraint {
  getReturnValue(args) {
    return args[0] * args[1];
  }
}

class Divide extends TotalFunctionConstraint {
  getReturnValue(args) {
    return args[0] / args[1];
  }
}

class Sin extends TrigConstraint {
  getReturnValue(args) {
      return Math.sin(this.resolveTrigAttributes(args));
  }
}

class Cos extends TrigConstraint {
  getReturnValue(args) {
      return Math.cos(this.resolveTrigAttributes(args));
  }
}

class Tan extends TrigConstraint {
  getReturnValue(args) {
      return Math.tan(this.resolveTrigAttributes(args));
  }
}

class ASin extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.asin(args[0]);
  }
}

class ACos extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.acos(args[0]);
  }
}

class ATan extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.atan(args[0]);
  }
}

class ATan2 extends TotalFunctionConstraint {
  static AttributeMapping = {
    "x": 0,
    "y": 1
  }
  getReturnValue(args) {
    return (Math.atan2(args[0] ,args[1]));
  }
}

//Hyperbolic Functions
class SinH extends ValueOnlyConstraint {
  sinh (x: number):number{
    var y = Math.exp(x);
    return (y - 1 / y) / 2;
  }
  getReturnValue(args) {
    return (this.sinh(args[0]));
  }
}

class CosH extends ValueOnlyConstraint {
  cosh (x: number):number{
    var y = Math.exp(x);
    return (y + 1 / y) / 2;
  }
  getReturnValue(args) {
    return (this.cosh(args[0]));
  }
}

class TanH extends ValueOnlyConstraint {
  tanh(x : number) : number {
    if (x === Infinity) {
      return 1;
    } else if (x === -Infinity) {
      return -1;
    } else {
      let y = Math.exp(2 * x);
      return (y - 1) / (y + 1);
    }
  }
  getReturnValue(args) {
    return (this.tanh(args[0]));
  }
}

//Inverse Hyperbolic
class ASinH extends ValueOnlyConstraint {
  asinh (x: number):number{
    if (x === -Infinity) {
      return x;
    } else {
      return Math.log(x + Math.sqrt(x * x + 1));
    }
  }
  getReturnValue(args) {
    return this.asinh(args[0]);
  }
}

class ACosH extends ValueOnlyConstraint {
  acosh (x: number):number{
    //How do we handle number outside of range in Eve? 
    if (x < 1) {return NaN}
    return Math.log(x + Math.sqrt(x * x - 1));
  }

  getReturnValue(args) {
    return this.acosh(args[0]);
  }
}

class ATanH extends ValueOnlyConstraint {
  atanh(x : number) : number {
    //How do we handle number outside of range in Eve? 
    if (Math.abs(x) > 1) {return NaN}
    return Math.log((1 + x) / (1 - x)) / 2;
  }

  getReturnValue(args) {
    return this.atanh(args[0]);
  }
}

class Log extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
    "base" : 1
  }

  getReturnValue(args) {
    let baselog = 1;        
    if (! (isNaN(args[1]))){
      baselog = Math.log(args[1]);
    }
    return (Math.log(args[0]) / baselog);
  }
}

class Exp extends ValueOnlyConstraint {
  getReturnValue(args) {
    return (Math.exp(args[0]));
  }
}

class Pow extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
    "by": 1,
  }

  getReturnValue(args) {
    return Math.pow(args[0], args[1]);
  }
}

class Mod extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
    "by": 1,
  }

  getReturnValue(args) {
    return args[0] % args[1];
  }
}

class Abs extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.abs(args[0]);
  }
}

class Floor extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.floor(args[0]);
  }
}

class Ceiling extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.ceil(args[0]);
  }
}

class Random extends TotalFunctionConstraint {
  static AttributeMapping = {
    "seed": 0,
  }

  static cache = {};

  getReturnValue(args) {
    let [seed] = args;
    let found = Random.cache[seed];
    if(found) return found;
    return Random.cache[seed] = Math.random();
  }
}

class Gaussian extends TotalFunctionConstraint {
  static AttributeMapping = {
    "seed": 0,
    "σ": 1,
    "μ": 2
  }

  static cache = {};

  getReturnValue(args) {
    let [seed, sigma, mu] = args;
    if (sigma === undefined) sigma = 1.0
    if (mu === undefined) mu = 0.0
    let found = Gaussian.cache[seed];
    if(found) return found;
    let u1 = Math.random()
    let u2 = Math.random()
    let z0 = Math.sqrt(-2.0 * Math.log(u1) ) * Math.cos (Math.PI * 2 * u2)
    let key =  "" + seed + sigma + mu
    let res =  z0 * sigma + mu;
    Gaussian.cache[key] = res
    return res
  }
}

class Round extends ValueOnlyConstraint {
  getReturnValue(args) {
    return Math.round(args[0]);
  }
}

class ToFixed extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
    "places": 1,
  }

  getReturnValue(args) {
    return args[0].toFixed(args[1]);
  }
}

class Range extends Constraint {
  static AttributeMapping = {
    "from": 0,
    "to": 1,
    "increment": 2,
  }

  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let [from, to, increment] = args;
    increment = increment || 1;
    let results = [];
    if(from <= to) {
      for (let val = from; val <= to; val += increment) {
        results.push(val);
      }
    } else {
      for (let val = from; val >= to; val += increment) {
        results.push(val);
      }
    }
    return results;
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let [from, to, increment] = args;
    increment = increment || 1;
    let val = returns[0];
    let member = from <= val && val <= to &&
                 ((val - from) % increment) == 0
    return member;
  }

  getProposal(tripleIndex, proposed, prefix) {
    let {args} = this.resolve(prefix);
    let [from, to, increment] = args;
    increment = args[2] || 1;
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    if(from <= to && increment < 0) {
      proposal.cardinality = 0;
      return proposal;
    } else if(from > to && increment > 0) {
      proposal.cardinality = 0;
      return proposal;
    }
    proposal.cardinality = Math.ceil(Math.abs((to - from + 1) / increment));
    return proposal;
  }
}

//Constants
class PI extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.PI;
  }
}

class E extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.E;
  }
}

class LN2 extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.LN2;
  }
}

class LN10 extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.LN10;
  }
}

class LOG2E extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.LOG2E;
  }
}

class LOG10E extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.LOG10E;
  }
}

class SQRT1_2 extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.SQRT1_2;
  }
}

class SQRT2 extends TotalFunctionConstraint {
  getReturnValue(args) {
    return Math.SQRT2;
  }
}

providers.provide("+", Add);
providers.provide("-", Subtract);
providers.provide("*", Multiply);
providers.provide("/", Divide);

providers.provide("log", Log);
providers.provide("exp", Exp);

//Trig and Inverse Trig
providers.provide("sin", Sin);
providers.provide("cos", Cos);
providers.provide("tan", Tan);

providers.provide("asin", ASin);
providers.provide("acos", ACos);
providers.provide("atan", ATan);

providers.provide("atan2", ATan2);

//Hyperbolic Functions.
providers.provide("sinh", SinH);
providers.provide("cosh", CosH);
providers.provide("tanh", TanH);
providers.provide("asinh", ASinH);
providers.provide("acosh", ACosH);
providers.provide("atanh", ATanH);

providers.provide("floor", Floor);
providers.provide("ceiling", Ceiling);

providers.provide("abs", Abs);
providers.provide("mod", Mod);
providers.provide("pow", Pow);
providers.provide("random", Random);
providers.provide("range", Range);
providers.provide("round", Round);
providers.provide("gaussian", Gaussian);
providers.provide("to-fixed", ToFixed);

//Constants
providers.provide("pi", PI);
providers.provide("e", E);
providers.provide("ln2", LN2);
providers.provide("ln10", LN10);
providers.provide("log2e",LOG2E );
providers.provide("log10e",LOG10E );
providers.provide("sqrt1/2", SQRT1_2);
providers.provide("sqrt2", SQRT2);
