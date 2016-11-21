import {Constraint} from "../join";
import * as providers from "./index";

class Convert extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "to": 1,
    "from": 2
  }
  static ReturnMapping = {
    "converted": 0,
  }

  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    let value = args[0];
    let to = args[1];
    let from = args[2];
    let converted;

    if(to === "number") {
      converted = +value;
      if(isNaN(converted)) throw new Error("Unable to deal with NaN in the proposal stage.");
    } else if(to === "string") {
      converted = ""+value;
    } else if(to === "feets") {
      converted = +value;
      if(isNaN(converted)) throw new Error("Unable to deal with NaN in the proposal stage.");
      converted = value * 3.281;
    } else if(to === "meters") {
      converted = +value;
      if(isNaN(converted)) throw new Error("Unable to deal with NaN in the proposal stage.");
      converted = value / 3.281;
    }

    return [converted];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let value = args[0];
    let to = args[1];
    let from = args[2];
    let converted;

    if(to === "number") {
      converted = +value;
      if(isNaN(converted)) return false;
      return
    } else if(to === "string") {
      converted = ""+value;
    } else if(to === "feets") {
      converted = value * 3.281;
    } else if(to === "meters") {
      converted = value / 3.281;
    } else {
      return false;
    }

    return converted === returns[0];
  }

  // 1 if valid, 0 otherwise
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    let {args} = this.resolve(prefix);
    let value = args[0];
    let to = args[1];

    proposal.cardinality = 1;
    proposal.providing = proposed;

    if(to === "number") {
      if(isNaN(+value) || value === "") proposal.cardinality = 0;
    } else if(to === "string") {
    } else if(to === "feets") {
    } else if(to === "meters") {
    } else {
      proposal.cardinality = 0;
    }

    return proposal;
  }
}

providers.provide("convert", Convert);
