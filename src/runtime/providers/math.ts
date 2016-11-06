//---------------------------------------------------------------------
// Math providers
//---------------------------------------------------------------------

import {Constraint} from "../join";
import * as providers from "./index";

class Add extends Constraint {
  // Add proposes the addition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] + args[1]];
  }

  // Check if our return is equivalent to adding our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] + args[1] === returns[0];
  }

  // Add always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Subtract extends Constraint {
  // subtract proposes the subtractition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] - args[1]];
  }

  // Check if our return is equivalent to subtracting our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] - args[1] === returns[0];
  }

  // subtract always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Multiply extends Constraint {
  // multiply proposes the multiplyition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] * args[1]];
  }

  // Check if our return is equivalent to multiplying our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] * args[1] === returns[0];
  }

  // multiply always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Divide extends Constraint {
  // divide proposes the divideition of its args as its value for the
  // proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] / args[1]];
  }

  // Check if our return is equivalent to divideing our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] / args[1] === returns[0];
  }

  // divide always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Sin extends Constraint {
  static AttributeMapping = {
    "angle": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.sin(args[0] * (Math.PI / 180))];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.sin(args[0] * (Math.PI / 180)) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Log extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  // log proposes the log of its arg as its value for the proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.log(args[0])/Math.log(10)];
  }

  // Check if our return is equivalent to multiplying our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.log(args[0])/Math.log(10) === returns[0];
  }

  // multiply always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Pow extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "by": 1,
  }
  // log proposes the log of its arg as its value for the proposed variable.
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.pow(args[0], args[1])];
  }

  // Check if our return is equivalent to multiplying our args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.pow(args[0], args[1]) === returns[0];
  }

  // multiply always has a cardinality of 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Mod extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "by": 1,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0] % args[1]];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] % args[1] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Abs extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.abs(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.abs(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Floor extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.floor(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.floor(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Ceiling extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.ceil(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.ceil(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Cos extends Constraint {
  static AttributeMapping = {
    "angle": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.cos(args[0] * (Math.PI / 180))];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.cos(args[0] * (Math.PI / 180)) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class Random extends Constraint {
  static AttributeMapping = {
    "seed": 0,
  }

  static cache = {};

  getRandom(seed) {
    let found = Random.cache[seed];
    if(found) return found;
    return Random.cache[seed] = Math.random();
  }

  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.getRandom(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return this.getRandom(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Gaussian extends Constraint {
  static AttributeMapping = {
    "seed": 0,
    "σ": 1,
    "μ": 2
  }

  static cache = {};

  getRandom(seed, sigma, mu) {
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

  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.getRandom(args[0], args[1], args[2])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return this.getRandom(args[0], args[1], args[2]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
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

class Round extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [Math.round(args[0])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return Math.round(args[0]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class ToFixed extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "places": 1,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args[0].toFixed(args[1])];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0].toFixed(args[1]) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


providers.provide("+", Add);
providers.provide("-", Subtract);
providers.provide("*", Multiply);
providers.provide("/", Divide);
providers.provide("sin", Sin);
providers.provide("log", Log);
providers.provide("cos", Cos);
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
