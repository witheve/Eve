//---------------------------------------------------------------------
// Runtime
//---------------------------------------------------------------------

import * as runtimePerformance from "./performance";

const capturePerformance = true;
let perf = runtimePerformance.init(capturePerformance);

//---------------------------------------------------------------------
// Setups
//---------------------------------------------------------------------

import {} from "./join"
import {MultiIndex, TripleIndex} from "./indexes"
import {Block} from "./block"
import {Changes} from "./changes"
import {Action} from "./actions"

//---------------------------------------------------------------------
// Database
//---------------------------------------------------------------------

export class Database {
  static id = 1;

  id: string;
  blocks: Block[];
  index: TripleIndex;
  evaluations: Evaluation[];

  constructor() {
    this.id = `db|${Database.id}`;
    Database.id++;
    this.evaluations = [];
    this.blocks = [];
    this.index = new TripleIndex(0);
  }

  register(evaluation: Evaluation) {
    this.evaluations.push(evaluation);
  }

  unregister(evaluation: Evaluation) {
    let evals = this.evaluations;
    let index = evals.indexOf(evaluation);
    if(index > -1) {
      evals.splice(index, 1);
    } else {
      throw new Error("Trying to unregister an evaluation that isn't registered with this database");
    }
  }

  onFixpoint(currentEvaluation: Evaluation, changes: Changes) {
    let name = currentEvaluation.databaseToName(this);
    let commit = changes.toCommitted({[name]: true});
    if(commit.length === 0) return;
    for(let evaluation of this.evaluations) {
      if(evaluation !== currentEvaluation) {
        evaluation.queue(commit);
      }
    }
  }

  analyze(e: Evaluation, d: Database) {}
}

//---------------------------------------------------------------------
// Evaluation
//---------------------------------------------------------------------

export class Evaluation {
  queued: boolean;
  commitQueue: any[];
  multiIndex: MultiIndex;
  databases: Database[];
  databaseNames: {[dbId: string]: string};

  constructor(index?) {
    this.queued = false;
    this.commitQueue = [];
    this.databases = [];
    this.databaseNames = {};
    this.multiIndex = index || new MultiIndex();
  }

  registerDatabase(name: string, db: Database) {
    for(let database of this.databases) {
      db.analyze(this, database);
      database.analyze(this, db);
    }
    this.databases.push(db);
    this.databaseNames[db.id] = name;
    this.multiIndex.register(name, db.index);
    db.register(this);
  }

  databaseToName(db: Database) {
    return this.databaseNames[db.id];
  }

  blocksFromCommit(commit) {
    let start = perf.time();
    let blocks = [];
    let index = this.multiIndex;
    for(let database of this.databases) {
      for(let block of database.blocks) {
        if(block.dormant) continue;
        let checker = block.checker;
        for(let ix = 0, len = commit.length; ix < len; ix += 6) {
          let change = commit[ix];
          let e = commit[ix + 1];
          let a = commit[ix + 2];
          let v = commit[ix + 3];
          if(checker.check(index, change, e, a, v)) {
            blocks.push(block);
            break;
          }
        }
      }
    }
    perf.blockCheck(start);
    // console.log("executing blocks", blocks.map((x) => x));
    return blocks;
  }


  getAllBlocks() {
    let blocks = [];
    for(let database of this.databases) {
      for(let block of database.blocks) {
        if(block.dormant) continue;
        blocks.push(block);
      }
    }
    return blocks;
  }

  queue(commit) {
    if(!commit.length) return;
    if(!this.queued) {
      let self = this;
      process.nextTick(() => {
        let commits = [];
        for(let queued of self.commitQueue) {
          for(let field of queued) {
            commits.push(field);
          }
        }
        this.fixpoint(new Changes(this.multiIndex), this.blocksFromCommit(commits));
      });
    }
    this.commitQueue.push(commit);
  }

  createChanges() {
    return new Changes(this.multiIndex);
  }

  executeActions(actions: Action[], changes = this.createChanges()) {
    for(let action of actions) {
      action.execute(this.multiIndex, [], changes);
    }
    let committed = changes.commit();
    return this.fixpoint(changes, this.blocksFromCommit(committed));
  }

  fixpoint(changes = new Changes(this.multiIndex), blocks = this.getAllBlocks()) {
    let start = runtimePerformance.time();
    let commit;
    changes.changed = true;
    while(changes.changed && changes.round < 10) {
      changes.nextRound();
      // console.groupCollapsed("Round" + changes.round);
      for(let block of blocks) {
        let start = perf.time();
        block.execute(this.multiIndex, changes);
        perf.block(block.name, start);
      }
      // console.log(changes);
      commit = changes.commit();
      blocks = this.blocksFromCommit(commit);
      // console.groupEnd();
    }
    perf.fixpoint(start);
    console.log("TOTAL ROUNDS", changes.round, runtimePerformance.time(start));
    for(let database of this.databases) {
      database.onFixpoint(this, changes);
    }
    return changes;
  }

  close() {
    for(let database of this.databases) {
      database.unregister(this);
    }
  }
}


