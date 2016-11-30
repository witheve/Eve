//---------------------------------------------------------------------
// Generic join in Typescript over triples (EAVs)
//---------------------------------------------------------------------

let perf = global["perf"];

import {MultiIndex, TripleIndex} from "./indexes";
import {Block, BlockStratum, scansToVars} from "./block";
import {Changes} from "./changes";
import {Aggregate} from "./providers/aggregate";
import {ids} from "./id";
import * as providers from "./providers/index";

//---------------------------------------------------------------------
// UUID
//---------------------------------------------------------------------

let _idArray = [];
function makeUUID(idprefix, projection) {
  _idArray[0] = idprefix;
  let ix = 1;
  for(let proj of projection) {
    _idArray[ix] = proj;
    ix++;
  }
  _idArray.length = ix;
  return ids.get(_idArray);
}

//---------------------------------------------------------------------
// Variable
//---------------------------------------------------------------------

// We'll use Variable to represent relational variables in our "queries."
// These will be values used in both scans and constraints
export class Variable {
  id: string;
  constant?: any;
  constructor(id) {
    this.id = id;
  }
}

export function isVariable(thing) {
  return thing instanceof Variable;
}

//---------------------------------------------------------------------
// Proposal
//---------------------------------------------------------------------

// In generic join, each scan/constraint proposes a variable to solve for
// and what cardinality that variable would have if you choose its proposal.
export interface Proposal {
  providing: Variable | Variable[],
  cardinality: number,
  // optional bits of information for someone trying to resolve a proposal
  index?:any, // the index to use when resolving
  indexType?: any, // type of the index used to resolve
}

// Constraints/scans/etc are providers of proposals
export interface ProposalProvider {
  vars: Variable[],
  // Given a prefix of solved variables, return a proposal for
  // solving a new variable
  propose(index: MultiIndex, prefix: any[]) : Proposal,
  // Take a proposal and resolve it into the actual values being
  // proposed
  resolveProposal(index: MultiIndex, proposal: Proposal, prefix: any[]) : any[],
  // Check if a prefix of solved variables is a valid potential solution
  // for this provider. SolvingFor is used to ignore accept calls that
  // aren't related to variables the provider is solving for.
  accept(index: MultiIndex, prefix: any[], solvingFor: Variable, force?: boolean, prejoin?: boolean): boolean
}

//---------------------------------------------------------------------
// Prefix functions
//---------------------------------------------------------------------

// Turn a "register" (either an arg or return) into a value based
// on a prefix of variables
export function toValue(register, prefix) {
  if(isVariable(register)) {
    return prefix[register.id];
  }
  return register;
}

// Resolve an array of registers based on a prefix of variables
export function resolve(toResolve, prefix, resolved = []) {
  let ix = 0;
  for(let register of toResolve) {
    resolved[ix] = toValue(register, prefix);
    ix++;
  }
  return resolved;
}

// Check if this entire array of registers has values (all variables have been
// filled in by the prefix.)
function fullyResolved(toCheck, prefix) {
  for(let register of toCheck) {
    if(register === undefined) continue;
    if(toValue(register, prefix) === undefined) return false;
  }
  return true;
}

//---------------------------------------------------------------------
// Scan
//---------------------------------------------------------------------

// Scans are structures that represent looking up eavs in the indexes.
// You specify a triple that they should look for which can have variables
// or constant values for e, a, or v that we'll attempt to solve for.
export class Scan {
  id: string;
  // array representation of the eav
  eav: any[];
  // a "bitmap" for what variables this scan is solving for
  // we use index as the key and the variable as the value
  vars: Variable[];
  // blown out eav for convenience
  e: any;
  a: any;
  v: any;
  node: any;
  proposalObject: Proposal;
  resolved: any[];
  scopes: string[];

  constructor(id: string, e,a,v,node?,scopes?) {
    this.id = id;
    this.resolved = [];
    this.eav = [e,a,v,node];
    this.e = e;
    this.a = a;
    this.v = v;
    this.node = node;
    this.proposalObject = {providing: null, index: [], cardinality: 0};
    this.scopes = scopes || ["session"];

    // check if any of the supplied params are variables and store them
    this.vars = [];
    for(let register of this.eav) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  // Return an array of the current values for all the registers
  resolve(prefix) {
    let resolved = this.resolved;
    resolved[0] = toValue(this.e, prefix);
    resolved[1] = toValue(this.a, prefix);
    resolved[2] = toValue(this.v, prefix);
    resolved[3] = toValue(this.node, prefix);
    return resolved;
  }


  _fullScanLookup(index, solving, results, resolved, solvingIx, ix, maxDepth) {
    if(index === undefined) return;
    if(ix === maxDepth) {
      return results.push(solving.slice());
    }
    let value = resolved[ix];
    if(value === undefined) {
      let curIndex = index.index;
      for(let key of Object.keys(curIndex)) {
        let v = curIndex[key];
        solving[solvingIx] = v.value !== undefined ? v.value : v;
        this._fullScanLookup(v, solving, results, resolved, solvingIx + 1, ix + 1, maxDepth);
      }
    } else {
      this._fullScanLookup(index.index[value], solving, results, resolved, solvingIx, ix + 1, maxDepth);
    }
  }

  fullScan(index, resolved, results) {
    let [e,a,v,node] = resolved;
    let solving = [];
    let solveNode = this.node !== undefined;
    let depth = solveNode ? 4 : 3;
    if(a !== undefined) {
      this._fullScanLookup(index.aveIndex, solving, results, [a,v,e,node], 0, 0, depth);
    } else  {
      this._fullScanLookup(index.eavIndex, solving, results, resolved, 0, 0, depth);
    }
    return results;
  }

  setProposal(index, toProvide, scopeIx) {
    let proposal = this.proposalObject;
    if(index) {
      proposal.providing = toProvide;
      proposal.index[scopeIx] = index.index;
      proposal.cardinality += index.cardinality;
      return true;
    }
    proposal.index[scopeIx] = undefined;
    return false;
  }

  toLookupType(resolved) {
    let [e,a,v,node] = resolved;
    let foo = [];
    if(e === undefined) foo[0] = "*"
    else foo[0] = "e";
    if(a === undefined) foo[1] = "*"
    else foo[1] = "a";
    if(v === undefined) foo[2] = "*"
    else foo[2] = "v";
    if(node === undefined) foo[3] = "*"
    else foo[3] = "n";
    return foo.join("");
  }

  // Given a resolved array of values for all the registers, find out which variable we could
  // make a proposal for, what index we'd use to get the values for it, and what the cardinality
  // of the proposal is.
  getProposal(multiIndex, resolved) {
    let [e,a,v,node] = resolved;
    const lookupType = this.toLookupType(resolved);
    let proposal = this.proposalObject;
    proposal.providing = undefined;
    proposal.indexType = undefined;
    proposal.cardinality = 0;
    let scopeIx = 0;
    for(let scope of this.scopes) {
      let curIndex = multiIndex.getIndex(scope);
      switch(lookupType) {
        case "e***":
          this.setProposal(curIndex.eavIndex.lookup(e), this.a, scopeIx);
          break;
        case "ea**":
          this.setProposal(curIndex.eavIndex.lookup(e,a), this.v, scopeIx);
          break;
        case "eav*":
          this.setProposal(curIndex.eavIndex.lookup(e,a,v), this.node, scopeIx);
          break;
        case "*a**":
          this.setProposal(curIndex.aveIndex.lookup(a), this.v, scopeIx);
          break;
        case "*av*":
          this.setProposal(curIndex.aveIndex.lookup(a,v), this.e, scopeIx);
          break;
        case "***n":
          this.setProposal(curIndex.neavIndex.lookup(node), this.e, scopeIx);
          break;
        case "e**n":
          this.setProposal(curIndex.neavIndex.lookup(node,e), this.a, scopeIx);
          break;
        case "ea*n":
          this.setProposal(curIndex.neavIndex.lookup(node,e,a), this.v, scopeIx);
          break;
        default:
          if(proposal.providing === undefined) {
            let providing = proposal.providing = [];
            if(e === undefined) providing.push(this.e);
            if(a === undefined) providing.push(this.a);
            if(v === undefined) providing.push(this.v);
            if(node === undefined && this.node !== undefined) providing.push(this.node);
          }
          // full scan
          proposal.index[scopeIx] = curIndex;
          proposal.cardinality += curIndex.cardinalityEstimate;
          proposal.indexType = "fullScan";
          break;
      }
      scopeIx++;
    }
    return proposal;
  }

  // Return a proposal or nothing based on the currently solved prefix of variables.
  propose(tripleIndex, prefix) : Proposal | undefined {
    let resolved = this.resolve(prefix);
    let [e,a,v,node] = resolved;
    // if this scan is fully resolved, then there's no variable for us to propose
    if(e !== undefined && a !== undefined && v !== undefined && (node !== undefined || this.node === undefined)) {
      return;
    }
    return this.getProposal(tripleIndex, resolved);
  }

  // Given a proposal, get the values for that proposal. There are two proposal types
  // for scans purely because of the way we wrote our indexes. Because JS will turn all
  // object keys into strings, we have to check if we're looking for real values. If we aren't
  // we can just return the string keys, otherwise we have to take the extra step of getting
  // all the actual values. If we didn't do this, we'd end up with strings instead of numbers
  // for things like someone's age.
  resolveProposal(proposal, prefix) {
    let values = [];
    let indexes = proposal.index;
    if(indexes === undefined || indexes.length == 0) {
      return values;
    }
    if(proposal.indexType !== "fullScan") {
      let ix = 0;
      for(let index of indexes) {
        if(index === undefined) continue;
        let keys = Object.keys(index);
        let node = this.node;
        for(let key of keys) {
          let value = index[key];
          values[ix] = value.value === undefined ? value : value.value;
          ix++;
        }
      }
    } else {
      let resolved = this.resolve(prefix);
      for(let index of indexes) {
        this.fullScan(index, resolved, values);
      }
    }
    return values;
  }

  // Given a prefix and a variable that we're solving for, we check if we agree with the
  // current set of values. If this scan is completely resolved, we check for the presence
  // of the value given all the filled variables. If not, we check if there's an index that
  // could provide us the rest of it.
  accept(multiIndex: MultiIndex, prefix, solvingFor, force?) {
    // we only need to check if we're solving for a variable that is actually part of our
    // scan
    if(!force && !this.vars[solvingFor.id]) return true;
    let resolved = this.resolve(prefix);
    let [e,a,v,node] = resolved;
    // check if we're fully resolved and if so lookup to see if we accept
    if(e !== undefined && a !== undefined && v !== undefined) {
      if(this.node !== undefined) {
        //multidb
        return multiIndex.contains(this.scopes,e,a,v,node) !== undefined;
      }
      return multiIndex.contains(this.scopes,e,a,v) !== undefined;
    }
    // we can check if we get a proposal with a cardinality to determine if we can
    // accept this prefix. If we don't it means there are no values for the remaining
    // vars in the indexes.
    let proposal = this.getProposal(multiIndex, resolved);
    return proposal && proposal.cardinality > 0;
  }
}

//---------------------------------------------------------------------
// Constraint
//---------------------------------------------------------------------

// Like Scan, Constraint is a structure that represents a constraint or function
// in our "queries". Constraints have both an array of args and an array of returns,
// either of which can contain variables or constants.
export abstract class Constraint {
  id: string;
  args: any[];
  returns: any[];
  proposalObject: Proposal;
  resolvedArgs: any[];
  resolvedReturns: any[];
  resolved: {args: any[], returns: any[]};
  // like in scan this is a "bitmap" of the variables this constraint
  // deals with. This includes vars from both args and returns.
  vars: Variable[];

  constructor(id: string, args: any[], returns: any[]) {
    this.id = id;
    this.args = args;
    this.returns = returns;
    this.proposalObject = {providing: null, cardinality: 0}
    this.resolvedArgs = [];
    this.resolvedReturns = [];
    this.resolved = {args: null, returns: null};
    this.vars = [];
    // capture our variables
    for(let register of this.args) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
    for(let register of this.returns) {
      if(isVariable(register)) {
        this.vars[register.id] = register;
      }
    }
  }

  resolve(prefix) {
    let resolved = this.resolved;
    resolved.args = resolve(this.args, prefix, this.resolvedArgs);
    resolved.returns = resolve(this.returns, prefix, this.resolvedReturns);
    return resolved;
  }

  // In the case of a constraint, it only makes sense to propose an extension
  // to the prefix if either our args are fully resolved, but our returns aren't.
  // If that's the case, then our proposal will be to fill in our returns.
  propose(tripleIndex, prefix) {
    // if either our inputs aren't resolved or our returns are all filled
    // in, then we don't have anything to propose
    if(!fullyResolved(this.args, prefix)
       || fullyResolved(this.returns, prefix)) return;

     // find out which of our returns we could propose a value for
     let proposed;
     for(let ret of this.returns) {
       if(toValue(ret, prefix) === undefined) {
         proposed = ret;
         break;
       }
     }

     // Each implementation of a constraint has to provide what its potential
     // cardinality will be. Raw constraints like >, for example, will never
     // make a proposal, while something like + might return cardinality 1, and
     // split some approximation.
     return this.getProposal(tripleIndex, proposed, prefix);
  }

  // Constraints accept a prefix if either we're solving for something unrelated,
  // if their args aren't fully resolved yet (we can't compute yet!) or if their
  // returns aren't fully resolved (what would we check against?)
  accept(tripleIndex, prefix, solvingFor, force?) {
    if(!force &&
       !this.vars[solvingFor.id]
       || !fullyResolved(this.args, prefix)
       || !fullyResolved(this.returns, prefix)) return true;

     // otherwise we leave it to the constraint to implement an acceptance test
     return this.test(prefix);
  }

  // Given a variable to solve for and a prefix of solved variables, return
  // a proposal for that variable
  abstract getProposal(tripleIndex: TripleIndex, proposed: Variable, prefix: any) : Proposal | undefined;

  // Resolve a proposal you provided into the actual values for a variable
  abstract resolveProposal(proposal: Proposal, prefix: any[]) : any[];

  // Test if a prefix adheres to the constraint being implemented
  abstract test(prefix: any) : boolean;
}

//---------------------------------------------------------------------
// Some constraint implementations
//---------------------------------------------------------------------

class GenerateId extends Constraint {
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [makeUUID(this.id, args)];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return returns[0] === makeUUID(this.id, args);
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

providers.provide("generateId", GenerateId);

//---------------------------------------------------------------------
// NotScan
//---------------------------------------------------------------------

export class NotScan {
  id: string;
  strata: BlockStratum[];
  vars: Variable[];
  args: Variable[];
  internalVars: Variable[];
  resolved: any[];

  constructor(id: string, args: Variable[], strata: BlockStratum[]) {
    this.id = id;
    this.strata = strata;
    this.resolved = [];
    let blockVars = [];
    scansToVars(strata, blockVars);
    this.vars = args;
    this.args = args;
    this.internalVars = blockVars;
  }

  resolve(prefix) {
    return resolve(this.args, prefix, this.resolved);
  }

  propose() { return; }
  resolveProposal() { throw new Error("Resolving a not proposal"); }

  accept(multiIndex: MultiIndex, prefix, solvingFor, force?, prejoin?) {
    // if we're in the prejoin phase and this not has no args, then we need
    // to evaluate the not to see if we should run. If we didn't do this, arg-less
    // nots won't get evaluated during Generic Join since we're never solving for a
    // variable that this scan cares about.
    if((!prejoin || this.args.length)
       // if we are forcing and not solving for the current variable, then we just accept
       // as it is
       && (!force && !this.internalVars[solvingFor.id] && this.internalVars.length)
       // we also blind accept if we have args that haven't been filled in yet, as we don't
       // have the dependencies necessary to make a decision
       || !fullyResolved(this.args, prefix)) return true;
    let resolved = this.resolve(prefix);
    let notPrefix = [];
    let ix = 0;
    for(let arg of this.args) {
      notPrefix[arg.id] = resolved[ix];
      ix++;
    }
    // console.log("checking not", notPrefix, this.internalVars);
    let results = [notPrefix];
    if(this.strata.length === 1) {
      results = this.strata[0].execute(multiIndex, results, {single: true});
    } else {
      for(let stratum of this.strata) {
        results = stratum.execute(multiIndex, results);
        if(results.length === 0) break;
      }
    }
    // console.log("checked not!", results.length);
    return !results.length;
  }

}

//---------------------------------------------------------------------
// IfScan
//---------------------------------------------------------------------

export class IfBranch {
  id: string;
  outputs: any[];
  strata: BlockStratum[];
  prefix: any[];
  variables: any[];
  exclusive: boolean;
  constantReturn: boolean;
  constructor(id: string, strata: BlockStratum[], outputs: any[], exclusive?: boolean) {
    this.id = id;
    this.strata = strata;
    this.outputs = outputs;
    this.exclusive = exclusive;
    this.variables = [];
    this.constantReturn = true;
    scansToVars(strata, this.variables);
    for(let output of outputs) {
      if(isVariable(output)) {
        this.constantReturn = false;
        this.variables[output.id] = output;
      }
    }
    this.prefix = [];
  }
  resolve(prefix) {
    return resolve(this.variables, prefix, this.prefix);
  }

  execute(multiIndex: MultiIndex, result) {
    if(this.constantReturn && this.strata.length === 1) {
      result = this.strata[0].execute(multiIndex, result, {single: true});
    } else {
      for(let stratum of this.strata) {
        result = stratum.execute(multiIndex, result);
        if(result.length === 0) break;
      }
    }
    return result;
  }
}

export class IfScan implements ProposalProvider {
  id: string;
  branches: IfBranch[];
  vars: Variable[];
  args: Variable[];
  outputs: Variable[];
  internalVars: Variable[];
  resolved: any[];
  resolvedOutputs: any[];
  exclusive: boolean;
  hasAggregate: boolean;
  hasResolvedOutputs: boolean;
  proposalObject: Proposal;

  constructor(id: string, args: Variable[], outputs: Variable[], branches: IfBranch[], hasAggregate = false) {
    this.id = id;
    this.branches = branches;
    this.outputs = outputs;
    this.hasAggregate = hasAggregate;
    this.resolved = [];
    this.resolvedOutputs = [];
    this.hasResolvedOutputs = false;
    let blockVars = [];
    this.vars = args.slice();
    for(let branch of branches) {
      if(branch.exclusive) this.exclusive = true;
    }
    for(let output of outputs) {
      if(output !== undefined && isVariable(output)) {
        this.vars[output.id] = output;
        blockVars[output.id] = output;
      }
    }
    for(let arg of args) {
      if(isVariable(arg)) {
        blockVars[arg.id] = arg;
      }
    }
    this.args = args;
    this.internalVars = blockVars;
    this.proposalObject = {providing: null, index: null, cardinality: 0};
  }

  resolve(prefix) {
    return resolve(this.args, prefix, this.resolved);
  }

  resolveOutputs(prefix) {
    this.hasResolvedOutputs = false;
    let resolved = resolve(this.outputs, prefix, this.resolvedOutputs);
    for(let item of resolved) {
      if(item !== undefined) {
        this.hasResolvedOutputs = true;
        break;
      }
    }
    return resolved;
  }

  checkOutputs(resolved, row) {
    if(!this.hasResolvedOutputs) return true;
    let ix = 0;
    for(let item of resolved) {
      if(item !== undefined && item !== row[ix]) {
        return false;
      }
    }
    return true;
  }

  getProposal(multiIndex: MultiIndex, proposed, proposedIx, prefix) {
    let proposalValues = [];
    let cardinality = 0;
    let resolvedOutputs = this.resolveOutputs(prefix);
    let projection = {};
    for(let branch of this.branches) {
      let branchPrefix = branch.resolve(prefix);
      let result = [branchPrefix];
      result = branch.execute(multiIndex, result);
      if(result.length) {
        for(let row of result) {
          let outputRow = [];
          for(let output of branch.outputs) {
            let value = toValue(output, row);
            outputRow.push(value);
          }
          if(!this.checkOutputs(resolvedOutputs, outputRow)) {
            continue;
          }
          let key = outputRow.join("|");
          if(projection[key] === undefined) {
            projection[key] = true;
            proposalValues.push(outputRow);
            cardinality++;
          }
        }
        if(this.exclusive) break;
      }
    }
    let proposal = this.proposalObject;
    proposal.providing = this.outputs;
    proposal.index = proposalValues;
    proposal.cardinality = cardinality;
    return proposal;
  }

  propose(multiIndex: MultiIndex, prefix) {
    // if either our inputs aren't resolved or our outputs are all filled
    // in, then we don't have anything to propose
    if(!fullyResolved(this.args, prefix)
       || fullyResolved(this.outputs, prefix)) return;

     // find out which of our outputs we could propose a value for
     let proposed;
     let proposedIx = 0;
     for(let ret of this.outputs) {
       if(toValue(ret, prefix) === undefined) {
         proposed = ret;
         break;
       }
       proposedIx++;
     }

     return this.getProposal(multiIndex, proposed, proposedIx, prefix);
  }

  resolveProposal(proposal, prefix) {
    return proposal.index;
  }

  accept(multiIndex: MultiIndex, prefix, solvingFor, force?) {
    if(!force && !this.internalVars[solvingFor.id] || !fullyResolved(this.args, prefix)) return true;
    for(let branch of this.branches) {
      for(let stratum of branch.strata) {
        let result = preJoinAccept(multiIndex, stratum.scans, stratum.vars, prefix);
        if(result.accepted) {
          return true;
        }
      }
    }
    return false;
  }

}

//---------------------------------------------------------------------
// Generic Join
//---------------------------------------------------------------------

// Generic join functions by going through proposals for each variable being
// solved for. This happens in "rounds" where we solve an individual variable
// at a time. Unlike most join algorithms, no ordering is fixed here. Instead,
// proposals are issued and the best, based on lowest cardinality, is selected
// and used as the current variable to solve for. It's important to note that this
// happens based on the values of the currently solved "prefix" - a partially filled
// row of values - which means that generic join chooses an order for each unique
// set of values it comes into contact with. This implementation uses recursion to
// do subsequent rounds for a given prefix and only allocates a row when a fully
// validated result has been found.
//
// A join round takes a set of providers, the current prefix, how many rounds are remaining,
// and an array to hold accepted rows.
function joinRound(multiIndex: MultiIndex, providers: ProposalProvider[], prefix: any[], rounds: number, rows: any[], options: any) {
  let {solverInfo} = options;
  // To start out we need to find the best proposal given the providers we have. We'll
  // start our bestProposal out at some horrible cardinality
  let bestProposal: Proposal = {providing: undefined, cardinality: Infinity};
  let bestProvider, bestProviderIx;
  let ix = 0;
  // Walk through the providers and ask for proposals
  for(let provider of providers) {
    let proposed = provider.propose(multiIndex, prefix);
    // if we've found a lower cardinality, we want to keep track of that provider
    if(proposed !== undefined && proposed.cardinality < bestProposal.cardinality) {
      bestProposal = proposed;
      bestProvider = provider;
      bestProviderIx = ix;
    }
    ix++;
  }

  // console.log("Best provider", rounds, bestProvider, bestProposal);
  // if we never found a provider that means we have no more valid solutions
  // and we have nothing more to do
  if(bestProvider === undefined || bestProposal.cardinality === 0) {
    if(bestProviderIx !== undefined) solverInfo[bestProviderIx]++;
    return;
  }

  // Otherwise, we ask the provider to resolve their proposal into values that
  // we then need to see if the other providers accept.
  let values = bestProvider.resolveProposal(bestProposal, prefix);
  let providing:any = bestProposal.providing;
  let providingOne = providing.constructor !== Array;
  if(providingOne) {
    providing = [providing];
  }
  let providingLength = providing.length;
  for(let value of values) {
    // Set the current value in our prefix of solved variables
    let providingIx = 0;
    for(let currentProvide of providing) {
      if(providingOne) {
        prefix[currentProvide.id] = value;
      } else {
        prefix[currentProvide.id] = value[providingIx];
      }
      providingIx++;
    }
    // Unless someone tells us otherwise, we'll assume that we can accept
    // this proposal and continue solving
    let accepted = true;
    let providerIx = 0;
    for(let provider of providers) {
      // we don't need to check this prefix against ourselves since we're the ones
      // who proposed it
      if(provider !== bestProvider) {
        for(let currentProvide of providing) {
          if(!provider.accept(multiIndex, prefix, currentProvide)) {
            // console.log("bailing", provider);
            solverInfo[providerIx]++;
            accepted = false;
            break;
          }
        }
      }
      providerIx++;
    }

    // if we accepted this prefix and we're not on our final round, then
    // we continue on to the next round by recursing with this prefix
    if(accepted && rounds - providingLength > 0) {
      joinRound(multiIndex, providers, prefix, rounds - providingLength, rows, options);
    } else if(accepted) {
      // otherwise if we're accepted, we have a valid result and we add it
      // to our list of rows
      rows.push(prefix.slice());
    }
    // if we are only looking for a single result, e.g. for a NotScan, and we have
    // a row, bail out of the evaluation
    if(options.single && rows.length) return;
    // since we're using the same prefix in our recursions, we have to clean
    // up after ourselves so that parent rounds don't see our solved variables
    // in their prefix.
    for(let currentProvide of providing) {
      prefix[currentProvide.id] = undefined;
    }
  }
}

function preJoinAccept(multiIndex: MultiIndex, providers : ProposalProvider[], vars : Variable[], prefix: any[] = []) {
  let ix = 0;
  let presolved = 0;
  for(let value of prefix) {
    let solvingFor = vars[ix];
    if(value !== undefined && vars[ix] !== undefined) {
      presolved++;
      for(let provider of providers) {
        if(!provider.accept(multiIndex, prefix, solvingFor, false, true)) {
          return {accepted: false, presolved};
        }
      }
    }
    ix++;
  }
  // we still need to do a single prejoin pass to make sure that any nots
  // that may have no external dependencies are given a chance to end this
  // evaluation
  let fakeVar = new Variable(0);
  for(let provider of providers) {
    if(provider instanceof NotScan && !provider.accept(multiIndex, prefix, fakeVar, false, true)) {
      return {accepted: false, presolved};
    }
  }
  return {accepted: true, presolved};
}

export interface JoinOptions {
  single?: boolean,
  acceptOnly?: boolean,
  rows?: any[],
  solverInfo?: any[]
}

// Convenient function to kick off a join. We only care about vars here
// to determine how may rounds of generic join we need to do. Since we solve
// for one variable each round, it's the number of vars in the query.
export function join(multiIndex: MultiIndex, providers : ProposalProvider[], vars : Variable[], prefix: any[] = [], options: JoinOptions = {}) {
  let rows = options.rows || [];
  let {presolved, accepted} = preJoinAccept(multiIndex, providers, vars, prefix);
  if(!accepted) return rows;
  let rounds = 0;
  for(let variable of vars) {
    if(variable !== undefined) rounds++;
  }
  rounds = rounds - presolved;
  if(presolved > 0 && rounds === 0) {
    rows.push(prefix.slice());
  } else if(rounds === 0) {
    for(let provider of providers) {
      if(!provider.accept(multiIndex, prefix, null, true)) {
        return rows;
      }
    }
    rows.push(prefix.slice());
  } else {
    joinRound(multiIndex, providers, prefix, rounds, rows, options);
  }
  return rows;
}



