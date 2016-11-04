//---------------------------------------------------------------------
// System database
//---------------------------------------------------------------------

import {InsertAction, SetAction} from "../actions"
import {Evaluation, Database} from "../runtime"

//---------------------------------------------------------------------
// Agents
//---------------------------------------------------------------------

class TimeAgent {

  static attributeOrdering = ["year", "month", "day", "hours", "hours-24", "ampm", "minutes", "time-string", "seconds", "frames"];
  static updateIntervals = {
    "year": 1000 * 60 * 60,
    "month": 1000 * 60 * 60,
    "day": 1000 * 60 * 60,
    "hours": 1000 * 60 * 60,
    "hours-24": 1000 * 60 * 60,
    "ampm": 1000 * 60 * 60,
    "minutes": 1000 * 60,
    "time-string": 1000 * 60,
    "seconds": 1000,
    "timestamp": 1000,
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
    let ampm = time.getHours() >= 12 ? "PM" : "AM";
    let formattedMinutes = time.getMinutes() >= 10 ? time.getMinutes() : `0${time.getMinutes()}`;
    let formattedHours = time.getHours() % 12 === 0 ? 12 : time.getHours() % 12;
    let timeString = `${formattedHours}:${formattedMinutes} ${ampm}`;
    return [
      new InsertAction("time|tag", "time", "tag", "time"),
      new SetAction("time|year","time", "year", time.getFullYear()),
      new SetAction("time|month","time", "month", time.getMonth()),
      new SetAction("time|day","time", "day", time.getDate()),
      new SetAction("time|hours","time", "hours", time.getHours() % 12),
      new SetAction("time|hours-24","time", "hours-24", time.getHours()),
      new SetAction("time|minutes","time", "minutes", time.getMinutes()),
      new SetAction("time|time-string","time", "time-string", timeString),
      new SetAction("time|seconds","time", "seconds", time.getSeconds()),
      new SetAction("time|timestamp","time", "timestamp", time.getTime()),
      new SetAction("time|frames","time", "frames", this.frames),
      new SetAction("time|time","time", "ampm", ampm),
    ];
  }

  run(evaluation: Evaluation) {
    let self = this;
    this.timeout = setInterval(function() {
      evaluation.executeActions(self.timeActions());
      // self.run(evaluation);
    }, this.interval);
  }

  setup(evaluation: Evaluation) {
    if(this.interval !== undefined) {
      this.timeout = setTimeout(() => {
        evaluation.executeActions(this.timeActions());
        this.run(evaluation);
      }, 0)
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
      new InsertAction("memory|tag", "memory", "tag", "memory"),
      new SetAction("memory|rss","memory", "rss", rss),
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
              if(this.time) this.time.close();
              time = this.time = new TimeAgent();
              time.configure(scan);
            } else if(attribute.attribute === "tag" && attribute.value.value === "memory") {
              if(this.memory) this.memory.close();
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
