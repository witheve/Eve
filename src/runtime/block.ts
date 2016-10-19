//---------------------------------------------------------------------
// Block
//---------------------------------------------------------------------

import {Variable, isVariable, Scan, NotScan, IfScan, ProposalProvider, JoinOptions, join, nextId} from "./join";
import {MultiIndex} from "./indexes";
import {Changes, ChangesIndex, ChangeType} from "./changes";
import {Action, executeActions} from "./actions";
import {Aggregate} from "./providers/aggregate"

let perf = global["perf"];

//---------------------------------------------------------------------
// DependencyChecker
//---------------------------------------------------------------------

export class DependencyChecker {
  dependencies: any;
  alwaysTrue: boolean;

  constructor(block) {
    this.alwaysTrue = block.singleRun;
    let map = this.buildVariableMap(block);
    this.dependencies = this.buildDependencies(map);
  }

  buildVariableMap(block, variableMap = {"any": {attributes: {}}}) {
    for(let level of block.strata) {
      for(let scan of level.scans) {
        if(scan instanceof Scan) {
          let {e,a,v} = scan;
          let cur;
          if(isVariable(e)) {
            cur = variableMap[e.id];
            if(cur === undefined) {
              cur = variableMap[e.id] = {attributes: {}};
            }
          } else {
            cur = variableMap["any"];
          }
          if(!isVariable(a)) {
            let attrInfo = cur.attributes[a];
            if(attrInfo === undefined) {
              attrInfo = cur.attributes[a] = {values: []};
            }
            if(!isVariable(v)) {
              cur.attributes[a].values.push(v);
            } else {
              attrInfo.any = true;
            }
          } else {
            cur.any = true;
          }
        } else if(scan instanceof NotScan) {
          // this.alwaysTrue = true;
          this.buildVariableMap(scan, variableMap);
        } else if(scan instanceof IfScan) {
          // this.alwaysTrue = true;
          for(let branch of scan.branches) {
            this.buildVariableMap(branch, variableMap);
          }
        }
      }
    }
    return variableMap;
  }

  _depsForTag(deps, attributes, tag) {
    let attributeIndex = deps[tag];
    if(!attributeIndex) {
      attributeIndex = deps[tag] = {};
    }
    for(let attribute of Object.keys(attributes)) {
      let attributeInfo = attributes[attribute];
      let vIndex = attributeIndex[attribute];
      if(!vIndex && !attributeInfo.any) {
        vIndex = attributeIndex[attribute] = {};
      } else if(attributeInfo.any || vIndex === true) {
        attributeIndex[attribute] = true;
        continue;
      }
      for(let value of attributeInfo.values) {
        vIndex[value] = true;
      }
    }
  }

  buildDependencies(variableMap) {
    let deps = {"any": {"tag": {}}};
    for(let variableId of Object.keys(variableMap)) {
      let {any, attributes} = variableMap[variableId];
      if(any) {
        this.alwaysTrue = true;
      }
      let tagAttributes = attributes["tag"];
      if(!tagAttributes || tagAttributes.any) {
        this._depsForTag(deps, attributes, "any")
      } else {
        for(let tag of tagAttributes.values) {
          if(deps["any"]["tag"] === true) break;
          deps["any"]["tag"][tag] = true;
          this._depsForTag(deps, attributes, tag);
        }
      }
    }
    return deps;
  }

  check(multiIndex: MultiIndex, change, e, a, v) {
    //multidb
    if(this.alwaysTrue) return true;
    let deps = this.dependencies;
    let tags = multiIndex.dangerousMergeLookup(e,"tag",undefined);
    if(tags.length === 0) {
      let attrIndex = deps["any"];
      if(!attrIndex) return false;
      let attr = attrIndex[a];
      if(attr === true) return true;
      if(attr === undefined) return false;
      return attr[v];
    }
    if(deps["any"]) {
      let attr = deps["any"][a];
      if(attr === true) return true;
      if(attr === true && attr[v] === true) return true
    }
    for(let tag of tags) {
      let attrIndex = deps[tag];
      if(!attrIndex) continue;
      let attr = attrIndex[a];
      if(attr === undefined) continue;
      if(attr === true || attr[v] === true) return true;
    }
    return false
  }
}

//---------------------------------------------------------------------
// Block
//---------------------------------------------------------------------

function hasDatabaseScan(strata) {
  for(let stratum of strata) {
    for(let scan of stratum.scans) {
      if(scan instanceof Scan) return true;
      if(scan instanceof IfScan) return true;
      if(scan instanceof NotScan) return true;
    }
  }
  return false;
}

export function scansToVars(scans, output = []) {
  for(let scan of scans) {
    for(let variable of scan.vars) {
      if(variable) {
        output[variable.id] = variable;
      }
    }
  }
  return output;
}

export class BlockStratum {
  solverInfo = [];
  resultCount = 0;
  results: any[];
  scans: ProposalProvider[];
  aggregates: Aggregate[];
  vars: Variable[];
  constructor(scans, aggregates = []) {
    this.scans = scans;
    this.aggregates = aggregates;
    let vars = [];
    scansToVars(scans, vars);
    this.vars = vars;
  }

  execute(multiIndex: MultiIndex, rows: any[], options: JoinOptions = {}) {
    let ix = 0;
    for(let scan of this.scans) {
      this.solverInfo[ix] = 0;
      ix++;
    }
    let results = [];
    for(let aggregate of this.aggregates) {
      aggregate.aggregate(rows);
    }
    for(let row of rows) {
      options.rows = results;
      options.solverInfo = this.solverInfo;
      results = join(multiIndex, this.scans, this.vars, row, options);
    }
    this.resultCount = results.length;
    this.results = results;
    return results;
  }
}

export class Block {
  id: number;
  strata: BlockStratum[];
  commitActions: Action[];
  bindActions: Action[];
  name: string;
  vars: Variable[];
  solvingVars: Variable[];
  dormant: boolean;
  singleRun: boolean;
  prevInserts: ChangesIndex;
  checker: DependencyChecker;
  parse: any;
  results: any[];

  constructor(name: string, strata: BlockStratum[], commitActions: Action[], bindActions: Action[], parse?: any) {
    this.id = parse.id || nextId();
    this.name = name;
    this.strata = strata;
    this.commitActions = commitActions;
    this.bindActions = bindActions;
    this.parse = parse;

    this.dormant = false;
    if(!hasDatabaseScan(strata)) {
      this.singleRun = true;
    }

    let blockVars = [];
    scansToVars(strata, blockVars);
    scansToVars(commitActions, blockVars);
    scansToVars(bindActions, blockVars);

    this.vars = blockVars;
    this.prevInserts = new ChangesIndex();
    this.checker = new DependencyChecker(this);
  }

  updateBinds(diff, changes) {
    let newPositions = diff.positions;
    let newInfo = diff.info;
    let {positions, info} = this.prevInserts;
    for(let key of Object.keys(positions)) {
      let pos = positions[key];
      // if this was added
      if(info[pos] === ChangeType.ADDED) {
        let neuePos = newPositions[key];
        // and it wasn't added in this one, we need to remove it
        if(newInfo[neuePos] !== ChangeType.ADDED) {
          let e = info[pos + 1];
          let a = info[pos + 2];
          let v = info[pos + 3];
          let node = info[pos + 4];
          let scope = info[pos + 5];
          changes.unstore(scope,e,a,v,node);
        }
      }
    }
  }

  execute(multiIndex: MultiIndex, changes: Changes) {
    if(this.dormant) {
      return changes;
    } else if(this.singleRun) {
      this.dormant = true;
    }
    // console.groupCollapsed(this.name);
    // console.log("--- " + this.name + " --------------------------------");
    let start = perf.time();
    let results = [[]];
    for(let stratum of this.strata) {
      results = stratum.execute(multiIndex, results);
      if(results.length === 0) break;
    }
    this.results = results;
    // console.log("results :: ", time(start));
    // console.log(" >>> RESULTS")
    // console.log(results);
    // console.log(" <<<< RESULTS")
    if(this.commitActions.length !== 0) {
      executeActions(multiIndex, this.commitActions, results, changes);
    }

    if(this.bindActions.length !== 0) {
      let start = perf.time();
      let diff = executeActions(multiIndex, this.bindActions, results, changes, true);
      this.updateBinds(diff, changes);
      this.prevInserts = diff;
    }

    // console.log(changes);
    // console.groupEnd();
    return changes;
  }
}
