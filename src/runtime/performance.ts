//---------------------------------------------------------------------
// Performance
//---------------------------------------------------------------------
import {v4 as uuid} from "node-uuid";
// import {Program} from "./dsl2";

var globalsToTrack = ["transaction"];
var propertiesToTrack = ["block", "PresolveCheck", "GenericJoin"];

type TimeReturn = number;

export class PerformanceTracker {

  blocks:{[block:string]: {
    times: {[property:string]: number},
    counts: {[property:string]: number},
  }};
  activeBlock:string;
  activeProperties:{[property:string]: TimeReturn};
  times: {[property:string]: number};
  counts: {[property:string]: number};

  now: () => TimeReturn;
  elapsed: (start:TimeReturn) => TimeReturn;

  _makePropertyHolder(props = propertiesToTrack) {
    let neue:any = {};
    for(let property of props) {
      neue[property] = 0;
    }
    return neue;
  }

  constructor() {
    this.reset();
    this.now = now;
    this.elapsed = elapsed;
  }

  reset() {
    this.activeBlock = "";
    this.activeProperties = {};
    this.times = this._makePropertyHolder(globalsToTrack);
    this.counts = this._makePropertyHolder(globalsToTrack);
    this.blocks = {};
  }

  block(name:string) {
    let {blocks} = this;
    let found = blocks[name];
    if(!found) {
      found = blocks[name] = {counts: this._makePropertyHolder(), times: this._makePropertyHolder()};
    }
    this.activeBlock = name;
    this.activeProperties["block"] = this.now();
    found.counts["block"]++;
  }

  blockEnd(name:string) {
    let {blocks, activeBlock} = this;
    blocks[activeBlock].times["block"] += this.elapsed(this.activeProperties["block"])
    this.activeBlock = "";
  }

  blockTime(property:string) {
    let {blocks, activeBlock} = this;
    let found = blocks[activeBlock];
    this.activeProperties[property] = this.now();
    found.counts[property]++;
  }

  blockTimeEnd(property:string) {
    let {blocks, activeBlock} = this;
    let found = blocks[activeBlock];
    found.times[property] += this.elapsed(this.activeProperties[property]);
  }

  time(property:string) {
    let {counts} = this;
    this.activeProperties[property] = this.now();
    counts[property]++;
  }
  timeEnd(property:string) {
    let {times} = this;
    times[property] += this.elapsed(this.activeProperties[property]);
  }

  serialize() {
    return JSON.stringify({
      times: this.times,
      counts: this.counts,
      blocks: this.blocks
    })
  }
}

export class NoopPerformanceTracker extends PerformanceTracker {
  blocks:{[block:string]: {
    times: {[property:string]: number},
    counts: {[property:string]: number},
  }};
  times: {[property:string]: number};
  counts: {[property:string]: number};

  now: () => TimeReturn;
  elapsed: (start:TimeReturn) => TimeReturn;

  constructor() {
    super();
    this.now = () => 0;
    this.elapsed = (start:any) => 0;
  }
  reset() { }

  time(property:string) {}
  timeEnd(property:string) {}

  block(name:string) {  this.activeBlock = name; }
  blockEnd(name:string) { this.activeBlock = "";  }

  blockTime(property:string) {}
  blockTimeEnd(property:string) {}
}

export var now: () => any;
export var elapsed: (start:any) => any;
if(global.process) {
  now = function(start?): any {
    return process.hrtime();
  }
  elapsed = function(start:any): any {
    let end = process.hrtime(start);
    return ((end[0]*1000) + (end[1]/1000000));
  }
} else {
  now = function(start?): any {
    return performance.now();
  }
  elapsed = function(start:any): any {
    let end = performance.now();
    return end - start;
  }
}
