//---------------------------------------------------------------------
// Math providers
//---------------------------------------------------------------------

import {Constraint} from "../join";
import * as providers from "./index";
import {deprecated} from "../util/deprecated";

abstract class TotalFunctionConstraint extends Constraint {
  abstract getReturnValue(args: any[]) : any;

  // Proposes the return value of the total function as the value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.getReturnValue(args)];
  }

  // Check if our return is equivalent to the result of the total function.
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return this.getReturnValue(args) === returns[0];
  }

  // Total functions always have a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Add extends TotalFunctionConstraint {
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

class Sin extends TotalFunctionConstraint {
  static AttributeMapping = {
    "degrees": 0,
    "radians": 1,
    "angle": 2
  }

  getReturnValue(args) {
    let [degrees, radians, angle] = args;
    if (angle !== undefined) {
      return this.getAngle(angle);
    } else if (degrees !== undefined) {
      return Math.sin(degrees * (Math.PI / 180));
    } else {
      return Math.sin(radians);
    }
  }

  @deprecated('Please use degrees instead of angle')
  getAngle(angle) {
    return Math.sin(angle * (Math.PI / 180));
  }
}

class Cos extends TotalFunctionConstraint {
  static AttributeMapping = {
    "degrees": 0,
    "radians": 1,
    "angle": 2
  }

  getReturnValue(args) {
    let [degrees, radians, angle] = args;
    if (angle !== undefined) {
      return this.getAngle(angle);
    } else if (degrees !== undefined) {
      return Math.cos(degrees * (Math.PI / 180));
    } else {
      return Math.cos(radians);
    }
  }

  @deprecated('Please use degrees instead of angle')
  getAngle(angle) {
    return Math.cos(angle * (Math.PI / 180));
  }
}

class Log extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
  }

  getReturnValue(args) {
    return Math.log(args[0])/Math.log(10);
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

class Abs extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
  }

  getReturnValue(args) {
    return Math.abs(args[0]);
  }
}

class Floor extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
  }

  getReturnValue(args) {
    return Math.floor(args[0]);
  }
}

class Ceiling extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
  }

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
    let found = Random.cache[seed];
    if(found) return found;
    let u1 = Math.random()
    let u2 = Math.random()
    let z0 = Math.sqrt(-2.0 * Math.log(u1) ) * Math.cos (Math.PI * 2 * u2)
    let key =  "" + seed + sigma + mu
    let res =  z0 * sigma + mu;
    Random.cache[key] = res
    return res
  }
}

class Round extends TotalFunctionConstraint {
  static AttributeMapping = {
    "value": 0,
  }

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

providers.provide("+", Add);
providers.provide("-", Subtract);
providers.provide("*", Multiply);
providers.provide("/", Divide);
providers.provide("sin", Sin);
providers.provide("cos", Cos);
providers.provide("log", Log);
providers.provide("floor", Floor);
providers.provide("ceiling", Ceiling);
providers.provide("abs", Abs);
providers.provide("mod", Mod);
providers.provide("pow", Pow);
providers.provide("random", Random);
providers.provide("gaussian", Gaussian);
providers.provide("round", Round);
providers.provide("to-fixed", ToFixed);
providers.provide("range", Range);
