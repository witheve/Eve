//---------------------------------------------------------------------
// Runtime
//---------------------------------------------------------------------

import {PerformanceTracker, NoopPerformanceTracker} from "./performance";

const TRACK_PERFORMANCE = true;
const MAX_ROUNDS = 30;

//---------------------------------------------------------------------
// Setups
//---------------------------------------------------------------------

import {} from "./join"
import {MultiIndex, TripleIndex} from "./indexes"
import {Block} from "./block"
import {Changes} from "./changes"
import {Action} from "./actions"
import {ids} from "./id";

//---------------------------------------------------------------------
// Database
//---------------------------------------------------------------------

export class Database {
  static id = 1;

  id: string;
  blocks: Block[];
  index: TripleIndex;
  evaluations: Evaluation[];
  nonExecuting: boolean;

  constructor() {
    this.id = `db|${Database.id}`;
    Database.id++;
    this.evaluations = [];
    this.blocks = [];
    this.index = new TripleIndex(0);
  }

  register(evaluation: Evaluation) {
    if(this.evaluations.indexOf(evaluation) === -1) {
      this.evaluations.push(evaluation);
    }
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

  toTriples() {
    return this.index.toTriples(true);
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
  errorReporter: any;
  databaseNames: {[dbId: string]: string};
  nameToDatabase: {[name: string]: Database};
  perf: PerformanceTracker;

  constructor(index?) {
    this.queued = false;
    this.commitQueue = [];
    this.databases = [];
    this.databaseNames = {};
    this.nameToDatabase = {};
    this.multiIndex = index || new MultiIndex();
    if(TRACK_PERFORMANCE) {
      this.perf = new PerformanceTracker();
    } else {
      this.perf = new NoopPerformanceTracker();
    }
  }

  error(kind: string, error: string) {
    if(this.errorReporter) {
      this.errorReporter(kind, error);
    } else {
      console.error(kind + ":", error);
    }
  }

  unregisterDatabase(name) {
    let db = this.nameToDatabase[name];
    delete this.nameToDatabase[name];
    if(!db) return;

    this.databases.splice(this.databases.indexOf(db), 1);
    delete this.databaseNames[db.id];
    this.multiIndex.unregister(name);
    db.unregister(this);
  }

  registerDatabase(name: string, db: Database) {
    if(this.nameToDatabase[name]) {
      throw new Error("Trying to register a database name that is already registered");
    }
    for(let database of this.databases) {
      db.analyze(this, database);
      database.analyze(this, db);
    }
    this.databases.push(db);
    this.databaseNames[db.id] = name;
    this.nameToDatabase[name] = db;
    this.multiIndex.register(name, db.index);
    db.register(this);
  }

  databaseToName(db: Database) {
    return this.databaseNames[db.id];
  }

  getDatabase(name: string) {
    return this.nameToDatabase[name];
  }

  blocksFromCommit(commit) {
    let perf = this.perf;
    let start = perf.time();
    let blocks = [];
    let index = this.multiIndex;
    for(let database of this.databases) {
      if(database.nonExecuting) continue;
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
      if(database.nonExecuting) continue;
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
    let perf = this.perf;
    let start = perf.time();
    let commit;
    changes.changed = true;
    while(changes.changed && changes.round < MAX_ROUNDS) {
      changes.nextRound();
      // console.groupCollapsed("Round" + changes.round);
      for(let block of blocks) {
        let start = perf.time();
        block.execute(this.multiIndex, changes);
        perf.block(block.id, start);
      }
      // console.log(changes);
      commit = changes.commit();
      blocks = this.blocksFromCommit(commit);
      // console.groupEnd();
    }
    if(changes.round > MAX_ROUNDS) {
      this.error("Fixpoint Error", "Evaluation failed to fixpoint");
    }
    perf.fixpoint(start);
    // console.log("TOTAL ROUNDS", changes.round, perf.time(start));
    // console.log(changes);
    for(let database of this.databases) {
      database.onFixpoint(this, changes);
    }
    return changes;
  }

  save() {
    let results = {};
    for(let database of this.databases) {
      let name = this.databaseToName(database);
      let values = database.toTriples();
      for(let value of values) {
        let [e,a,v,n] = value;
        if(ids.isId(e)) value[0] = ids.parts(e);
        if(ids.isId(v)) value[2] = ids.parts(v);
      }
      results[name] = values;
    }
    return results;
  }

  load(dbs: Object) {
    let changes = this.createChanges();
    for(let databaseName of Object.keys(dbs)) {
      let facts = dbs[databaseName];
      let db = this.getDatabase(databaseName);
      let index = db.index;
      for(let fact of facts) {
        let [e,a,v,n] = fact;
        if(ids.isId(e)) e = ids.load(e);
        if(ids.isId(v)) v = ids.load(v);
        changes.store(databaseName,e,a,v,n);
      }
    }
    this.executeActions([], changes);
  }

  close() {
    for(let database of this.databases) {
      database.unregister(this);
    }
  }
}


