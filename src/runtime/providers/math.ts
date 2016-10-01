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

providers.provide("+", Add);
providers.provide("-", Subtract);
providers.provide("*", Multiply);
providers.provide("/", Divide);
providers.provide("sin", Sin);
providers.provide("cos", Cos);
providers.provide("floor", Floor);
providers.provide("abs", Abs);
providers.provide("mod", Mod);
providers.provide("random", Random);
