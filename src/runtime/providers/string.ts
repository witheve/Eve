//---------------------------------------------------------------------
// String providers
//---------------------------------------------------------------------

import {Constraint} from "../join";
import * as providers from "./index";

//---------------------------------------------------------------------
// Providers
//---------------------------------------------------------------------

class Split extends Constraint {
  static AttributeMapping = {
    "text": 0,
    "by": 1,
  }
  static ReturnMapping = {
    "token": 0,
    "index": 1,
  }

  returnType: "both" | "index" | "token";

  constructor(id: string, args: any[], returns: any[]) {
    super(id, args, returns);
    if(this.returns[1] !== undefined && this.returns[0] !== undefined) {
      this.returnType = "both"
    } else if(this.returns[1] !== undefined) {
      this.returnType = "index";
    } else {
      this.returnType = "token";
    }
  }

  resolveProposal(proposal, prefix) {
    let {returns} = this.resolve(prefix);
    let tokens = proposal.index;
    let results = tokens;
    if(this.returnType === "both") {
      results = [];
      let ix = 1;
      for(let token of tokens) {
        results.push([token, ix]);
        ix++;
      }
    } else if(this.returnType === "index") {
      results = [];
      let ix = 1;
      for(let token of tokens) {
        results.push(ix);
        ix++;
      }
    }
    return results;
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    // @TODO: this is expensive, we should probably try to cache the split somehow
    return args[0].split(args[1])[returns[1]] === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let {args} = this.resolve(prefix);
    let proposal = this.proposalObject;
    if(this.returnType === "both") {
      proposal.providing = [this.returns[0], this.returns[1]];
    } else if(this.returnType == "index") {
      proposal.providing = this.returns[1];
    } else {
      proposal.providing = this.returns[0];
    }
    proposal.index = args[0].split(args[1]);
    proposal.cardinality = proposal.index.length;
    return proposal;
  }
}


// substring over the field 'text', with the base index being 1, inclusive, 'from' defaulting
// to the beginning of the string, and 'to' the end
class Substring extends Constraint {
  static AttributeMapping = {
    "text": 0,
    "from": 1,
    "to": 2,
  }
  static ReturnMapping = {
    "value": 0,
  }
  // To resolve a proposal, we concatenate our resolved args
  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    let from = 0;
    let text = args[0];
    let to = text.length;
    if (args[1] != undefined) from = args[1] - 1;
    if (args[2] != undefined) to = args[2];
    return [text.substring(from, to)];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let from = 0;
    let text = args[0];
    if(typeof text !== "string") return false;
    let to = text.length;
    if (args[1] != undefined) from = args[1] - 1;
    if (args[2] != undefined) to = args[2];
    return text.substring(from, to) === returns[0];
  }

  // substring always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    let {args} = this.resolve(prefix);
    if(typeof args[0] !== "string") {
      proposal.cardinality = 0;
    } else {
      proposal.providing = proposed;
      proposal.cardinality = 1;
    }
    return proposal;
  }
}

class Find extends Constraint {
  static AttributeMapping = {
    "text": 0,
    "subtext": 1,
    "case-sensitive": 2,
    "from": 3,
  }
  static ReturnMapping = {
    "string-position": 0,
    "result-index": 0,
  }

  returnType: "both" | "position";

  constructor(id: string, args: any[], returns: any[]) {
    super(id, args, returns);
    if(this.returns[1] !== undefined && this.returns[0] !== undefined) {
      this.returnType = "both"
    } else if(this.returns[0] !== undefined) {
      this.returnType = "position";
    }
  }

  resolveProposal(proposal, prefix) {
    return proposal.index;
  }

  getIndexes(text, subtext, from, caseSensitive, withIx) {
    let start = (from || 1) - 1;
    let currentIndex;
    let ixs = [];
    let subLength = subtext.length;
    if(!caseSensitive) {
      text = text.toLowerCase();
      subtext = subtext.toLowerCase();
    }
    if(withIx) {
      while ((currentIndex = text.indexOf(subtext, start)) > -1) {
        ixs.push([currentIndex + 1, ixs.length + 1]);
        start = currentIndex + subLength;
      }
    } else {
      while ((currentIndex = text.indexOf(subtext, start)) > -1) {
        ixs.push(currentIndex + 1);
        start = currentIndex + subLength;
      }
    }
    return ixs;
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let text = args[Find.AttributeMapping["text"]];
    let subtext = args[Find.AttributeMapping["subtext"]];
    if(typeof text !== "string"|| typeof subtext !== "string") return false;
    return text.indexOf(subtext, returns[0] - 1) === returns[0];
  }

  // substring always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    let {args} = this.resolve(prefix);
    let text = args[Find.AttributeMapping["text"]];
    let subtext = args[Find.AttributeMapping["subtext"]];
    let caseSensitive = args[Find.AttributeMapping["case-sensitive"]];
    let from = args[Find.AttributeMapping["from"]];
    if(typeof text !== "string"|| typeof subtext !== "string") {
      proposal.cardinality = 0;
      return;
    }
    let both = this.returnType === "both";
    let indexes = this.getIndexes(text, subtext, from, caseSensitive, both);
    if(both) {
      proposal.providing = [this.returns[0], this.returns[1]];
    } else {
      proposal.providing = this.returns[0];
    }
    proposal.cardinality = indexes.length;
    proposal.index = indexes;
    return proposal;
  }
}


class Convert extends Constraint {
  static AttributeMapping = {
    "value": 0,
    "to": 1,
  }
  static ReturnMapping = {
    "converted": 0,
  }

  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    let from = 0;
    let value = args[0];
    let to = args[1];
    let converted;
    if(to === "number") {
      converted = +value;
      if(isNaN(converted)) throw new Error("Unable to deal with NaN in the proposal stage.");
    } else if(to === "string") {
      converted = ""+value;
    }
    return [converted];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let value = args[0];
    let to = args[1];

    let converted;
    if(to === "number") {
      converted = +value;
      if(isNaN(converted)) return false;
      if(converted === "") return false;
      return
    } else if(to === "string") {
      converted = ""+value;
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
    } else {
      proposal.cardinality = 0;
    }

    return proposal;
  }
}

// Urlencode a string
class Urlencode extends Constraint {
  static AttributeMapping = {
    "text": 0
  }
  static ReturnMapping = {
    "value": 0,
  }

  // To resolve a proposal, we urlencode a text
  resolveProposal(proposal, prefix) {
    let {args, returns} = this.resolve(prefix);
    let value = args[0];
    let converted;
    converted = encodeURIComponent(value);
    return [converted];
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let value = args[0];

    let converted = encodeURIComponent(value);

    return converted === returns[0];
  }

  // Urlencode always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    let {args} = this.resolve(prefix);
    let value = args[0];
    proposal.cardinality = 1;
    proposal.providing = proposed;
    return proposal;
  }
}

class Length extends Constraint {
  static AttributeMapping = {
    "text": 0,
    "as": 1,
  }

  validAsOption(az) {
    if (az === undefined || az === "symbols" || az === "code-points") {
      return true;
    } else {
      return false;
    }
  }

  getLength(text, az) {
    if (az === "symbols") {
      return [this.countSymbols(text)];
    } else if (az === "code-points") {
      return [text.length];
    }
    return undefined;
  }

  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    let [text, az] = args;
    if (az === undefined) {
      az = "symbols"
    }
    return this.getLength(text, az);
  }

  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    let [text, az] = args;
    if(!this.validAsOption(az)) return false;
    if(typeof text !== "string") return false;
    return this.getLength(text, az) === returns[0];
  }

  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    let {args} = this.resolve(prefix);
    let [text, az] = args;
    if(typeof args[0] !== "string") {
      proposal.cardinality = 0;
    } else if (!this.validAsOption(az)) {
      proposal.cardinality = 0;
    } else {
      proposal.providing = proposed;
      proposal.cardinality = 1;
    }
    return proposal;
  }

  // Adapted from: https://mathiasbynens.be/notes/javascript-unicode
  countSymbols(string) {
    let index;
    let symbolCount = 0;
    for (index = 0; index < string.length - 1; ++index) {
      var charCode = string.charCodeAt(index);
      if (charCode >= 0xD800 && charCode <= 0xDBFF) {
        charCode = string.charCodeAt(index + 1);
        if (charCode >= 0xDC00 && charCode <= 0xDFFF) {
          index++;
          symbolCount++;
          continue;
        }
      }
      symbolCount++;
    }
    if (string.charAt(index) !== "") {
      symbolCount++;
    }
    return symbolCount;
  }
}

//---------------------------------------------------------------------
// Internal providers
//---------------------------------------------------------------------

// InternalConcat is used for the implementation of string embedding, e.g.
// "foo {{name}}". Args expects a set of variables/string constants
// to concatenate together and an array with a single return variable
class InternalConcat extends Constraint {
  // To resolve a proposal, we concatenate our resolved args
  resolveProposal(proposal, prefix) {
    let {args} = this.resolve(prefix);
    return [args.join("")];
  }

  // We accept a prefix if the return is equivalent to concatentating
  // all the args
  test(prefix) {
    let {args, returns} = this.resolve(prefix);
    return args.join("") === returns[0];
  }

  // concat always returns cardinality 1
  getProposal(tripleIndex, proposed, prefix) {
    let proposal = this.proposalObject;
    proposal.providing = proposed;
    proposal.cardinality = 1;
    return proposal;
  }
}

//---------------------------------------------------------------------
// Mappings
//---------------------------------------------------------------------

providers.provide("split", Split);
providers.provide("substring", Substring);
providers.provide("convert", Convert);
providers.provide("urlencode", Urlencode);
providers.provide("length", Length);
providers.provide("find", Find);

providers.provide("eve-internal/concat", InternalConcat);
