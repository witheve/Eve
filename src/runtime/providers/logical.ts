//---------------------------------------------------------------------
// Logical providers
//---------------------------------------------------------------------

import {Constraint} from "../join";
import * as providers from "./index";

abstract class BooleanOperation extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [this.compare(args[0], args[1])];
  }

  getProposal(tripleIndex, proposed, prefix) {
    if(this.returns.length) {
      let proposal = this.proposalObject;
      proposal.providing = proposed;
      proposal.cardinality = 1;
      return proposal;
    }
    return;
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = this.compare(args[0], args[1]);
    if(returns.length) {
      return result === returns[0];
    }
    return result;
  }

  abstract compare(a,b): boolean;
}

class Equal extends BooleanOperation {
  compare(a, b) { return a === b; }
}

class NotEqual extends BooleanOperation {
  compare(a, b) { return a !== b; }
}

class GreaterThan extends BooleanOperation {
  compare(a, b) { return a > b; }
}

class LessThan extends BooleanOperation {
  compare(a, b) { return a < b; }
}

class GreaterThanEqualTo extends BooleanOperation {
  compare(a, b) { return a >= b; }
}

class LessThanEqualTo extends BooleanOperation {
  compare(a, b) { return a <= b; }
}

class AssertValue extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    return [args[0]];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args[0] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

class And extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let result = true;
    for(let arg of args) {
      if(arg === false) {
        result = false;
        break;
      }
    }
    return [result];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = true;
    for(let arg of args) {
      if(arg === false) {
        result = false;
        break;
      }
    }
    return result === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Or extends Constraint {
  // To resolve a proposal, we concatenate our resolved args
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let result = false;
    for(let arg of args) {
      if(arg !== false) {
        result = true;
        break;
      }
    }
    return [result];
  }

  // We accept a prefix if the return is equivalent to concatentating
  // all the args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let result = false;
    for(let arg of args) {
      if(arg !== false) {
        result = true;
        break;
      }
    }
    return result === returns[0];
  }

  // concat always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}


class Toggle extends Constraint {
  static AttributeMapping = {
    "value": 0,
  }
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [!(args[0] === true)];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return !(args[0] === true) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

providers.provide(">", GreaterThan);
providers.provide("<", LessThan);
providers.provide("<=", LessThanEqualTo);
providers.provide(">=", GreaterThanEqualTo);
providers.provide("!=", NotEqual);
providers.provide("=", Equal);
providers.provide("and", And);
providers.provide("or", Or);
providers.provide("toggle", Toggle);
