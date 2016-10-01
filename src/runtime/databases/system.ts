//---------------------------------------------------------------------
// System database
//---------------------------------------------------------------------

import {InsertAction, SetAction} from "../actions"
import {Evaluation, Database} from "../runtime"

//---------------------------------------------------------------------
// Agents
//---------------------------------------------------------------------

class TimeAgent {

  static attributeOrdering = ["year", "month", "day", "hours", "minutes", "seconds", "frames"];
  static updateIntervals = {
    "year": 1000 * 60 * 60,
    "month": 1000 * 60 * 60,
    "day": 1000 * 60 * 60,
    "hours": 1000 * 60 * 60,
    "minutes": 1000 * 60,
    "seconds": 1000,
    "frames": 16,
  };

  timeout: any;
  interval: number;
  frames: number;
  constructor() {
    this.frames = 0;
  }

  configure(record) {
    let max = this.interval || -1;
    let interval = TimeAgent.updateIntervals["year"];
    for(let attribute of record.attributes) {
      let attr = attribute.attribute;
      let index = TimeAgent.attributeOrdering.indexOf(attr)
      if(index > max) {
        max = index;
        interval = TimeAgent.updateIntervals[attr];
      }
    }
    this.interval = interval;
  }

  timeActions() {
    let time = new Date();
    this.frames++;
    return [
      new InsertAction("time", "tag", "time"),
      new SetAction("time", "hours", time.getHours() % 12),
      new SetAction("time", "minutes", time.getMinutes()),
      new SetAction("time", "seconds", time.getSeconds()),
      new SetAction("time", "frames", this.frames),
    ];
  }

  setup(evaluation: Evaluation) {
    let self = this;
    if(this.interval !== undefined) {
      evaluation.executeActions(this.timeActions());
      this.timeout = setInterval(function() {
        evaluation.executeActions(self.timeActions());
      }, this.interval);
    }
  }

  close() {
    clearTimeout(this.timeout);
  }
}

class MemoryAgent {

  timeout: any;
  interval: number;
  os: any;
  process: any;

  configure(record) {
    // this.os = require("os");
    this.interval = 1000;
  }

  memoryActions() {

    let {rss} = process.memoryUsage();
    return [
      new InsertAction("memory", "tag", "memory"),
      new SetAction("memory", "rss", rss),
    ];
  }

  setup(evaluation: Evaluation) {
    let self = this;
    if(this.interval !== undefined) {
      evaluation.executeActions(this.memoryActions());
      this.timeout = setInterval(function() {
        evaluation.executeActions(self.memoryActions());
      }, this.interval);
    }
  }

  close() {
    clearTimeout(this.timeout);
  }
}

class BrowserMemoryAgent {
  timeout: any;
  interval: number;
  configure(record) { }
  setup(evaluation: Evaluation) { }
  close() { }
}


export class SystemDatabase extends Database {
  time: any;
  memory: any;

  analyze(evaluation: Evaluation, db: Database) {
    let time;
    let memory;
    for(let block of db.blocks) {
      for(let scan of block.parse.scanLike) {
        if(scan.type === "record") {
          for(let attribute of scan.attributes) {
            if(attribute.attribute === "tag" && attribute.value.value === "time") {
              time = this.time = new TimeAgent();
              time.configure(scan);
            } else if(attribute.attribute === "tag" && attribute.value.value === "memory") {
              if(global["browser"]) {
                memory = this.memory = new BrowserMemoryAgent();
              } else {
                memory = this.memory = new MemoryAgent();
              }
              memory.configure(scan);
            }
          }
        }
      }
    }
    if(time) {
      time.setup(evaluation)
    }
    if(memory) {
      memory.setup(evaluation);
    }
  }

  unregister() {
    if(this.time) this.time.close();
    if(this.memory) this.memory.close();
  }

}

export var instance = new SystemDatabase();
