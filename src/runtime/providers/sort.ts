//---------------------------------------------------------------------
// Sort provider
//---------------------------------------------------------------------

import {Constraint, isVariable, resolve, toValue} from "../join";
import * as providers from "./index";

export class Sort extends Constraint {
  static isAggregate = true;
  static AttributeMapping = {
    "value": 0,
    "direction": 1,
    "per": 2,
  }

  valueVars: any[];
  directionVars: any[];
  groupVars: any[];
  resolvedGroup: any[];
  resolvedValue: any[];
  resolvedDirection: any[];
  resolvedAggregate: {group: any[], value: any[], direction: any};
  aggregateResults: any;

  constructor(args: any[], returns: any[]) {
    super(args, returns);
    let [value, direction, per] = args;
    if(value === undefined) {
      this.valueVars = [];
    } else if(isVariable(value)) {
      this.valueVars = [value];
    } else {
      this.valueVars = value;
    }
    if(direction === undefined) {
      this.directionVars = [];
    } else if(direction.constructor === Array) {
      this.directionVars = direction;
    } else {
      this.directionVars = [direction];
    }
    if(per === undefined) {
      this.groupVars = [];
    } else if(isVariable(per)) {
      this.groupVars = [per];
    } else {
      this.groupVars = per;
    }
    this.resolvedGroup = [];
    this.resolvedValue = [];
    this.resolvedDirection = [];
    this.resolvedAggregate = {group: this.resolvedGroup, value: this.resolvedValue, direction: this.resolvedDirection};
    this.aggregateResults = {};
  }

  resolveAggregate(prefix) {
    resolve(this.valueVars, prefix, this.resolvedValue)
    resolve(this.directionVars, prefix, this.resolvedDirection)
    resolve(this.groupVars, prefix, this.resolvedGroup)
    let resolved = this.resolvedAggregate;
    return resolved;
  }

  aggregate(rows: any[]) {
    let groupKeys = [];
    let groups = {};
    for(let row of rows) {
      let {group, value, direction} = this.resolveAggregate(row);
      let groupKey = "[]";
      if(group.length !== 0) {
        groupKey = JSON.stringify(group);
      }
      let groupValues = groups[groupKey];
      if(groupValues === undefined) {
        groupKeys.push(groupKey);
        groupValues = groups[groupKey] = {};
      }
      let valueKey = JSON.stringify(value);
      if(groupValues[valueKey] === undefined) {
        groupValues[valueKey] = true;
        groupValues["direction"] = direction.slice();
        this.adjustAggregate(groupValues, value, valueKey);
      }
    }
    for(let key of groupKeys) {
      this.finalizeGroup(groups[key]);
    }
    this.aggregateResults = groups;
    return groups;
  }

  resolveProposal(proposal, prefix) {
    if(proposal.index) {
      let {value} = this.resolveAggregate(prefix);
      return [proposal.index[JSON.stringify(value)]];
    }
    return [];
  }

  test(prefix) {
    let {group} = this.resolveAggregate(prefix);
    let resultGroup = this.aggregateResults[JSON.stringify(group)];
    if(resultGroup !== undefined) {
      let returns = resolve(this.returns, prefix, this.resolvedReturns);
      return returns[0] === resultGroup.result;
    }
  }

  getProposal(multiIndex, proposed, prefix) {
    let {group} = this.resolveAggregate(prefix);
    let resultGroup = this.aggregateResults[JSON.stringify(group)];
    let proposal = this.proposalObject;
    if(resultGroup) {
      proposal.index = resultGroup
      proposal.providing = proposed;
      proposal.cardinality = 1;
    } else {
      proposal.index = undefined;
      proposal.providing = proposed;
      proposal.cardinality = 0;
    }
    return proposal;
  }

  finalizeGroup(group) {
    let result = group.result;
    let direction = group.direction;
    let multi = 1;
    result.sort((a, b) => {
      let ix = -1;
      for(let aItem of a) {
        ix++;
        if(direction[ix] !== undefined) {
          if(direction[ix] === "down") {
            multi = -1;
          } else {
            multi = 1;
          }
        }
        if(aItem === b[ix]) continue;
        if(aItem > b[ix]) {
          return 1 * multi;
        } else {
          return -1 * multi;
        }
      }
      return 0;
    })
    let ix = 1;
    for(let item of result) {
      group[JSON.stringify(item)] = ix;
      ix++;
    }
  }

  adjustAggregate(group, value, key) {
    if(!group.result) {
      group.result = [];
    }
    group.result.push(value.slice());
  }
}

providers.provide("sort", Sort);
