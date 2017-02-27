//---------------------------------------------------------------------
// Performance
//---------------------------------------------------------------------
import {v4 as uuid} from "node-uuid";
// import {Program} from "./dsl2";

var globalsToTrack = ["transaction"];
var propertiesToTrack = ["block", "PresolveCheck", "GenericJoin"];

type TimeReturn = number;
export class NoopPerformanceTracker {

  getTime: (start?:TimeReturn) => TimeReturn;

  constructor() {
    this.getTime = () => 0;
  }
  reset() { }

  time(property:string) {}
  timeEnd(property:string) {}

  block(name:string) { }
  blockEnd(name:string) {  }

  blockTime(property:string) {}
  blockTimeEnd(property:string) {}
}

export class PerformanceTracker extends NoopPerformanceTracker {

  getTime: (start?:TimeReturn) => TimeReturn;
  blocks:{[block:string]: {
    times: {[property:string]: number},
    counts: {[property:string]: number},
  }};
  activeBlock:string;
  activeProperties:{[property:string]: TimeReturn};
  times: {[property:string]: number};
  counts: {[property:string]: number};

  _makePropertyHolder(props = propertiesToTrack) {
    let neue:any = {};
    for(let property of props) {
      neue[property] = 0;
    }
    return neue;
  }

  constructor() {
    super();
    this.reset();
    this.getTime = time;
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
    this.activeProperties["block"] = this.getTime();
    found.counts["block"]++;
  }

  blockEnd(name:string) {
    let {blocks, activeBlock} = this;
    blocks[activeBlock].times["block"] += this.getTime(this.activeProperties["block"])
    this.activeBlock = "";
  }

  blockTime(property:string) {
    let {blocks, activeBlock} = this;
    let found = blocks[activeBlock];
    this.activeProperties[property] = this.getTime();
    found.counts[property]++;
  }

  blockTimeEnd(property:string) {
    let {blocks, activeBlock} = this;
    let found = blocks[activeBlock];
    found.times[property] += this.getTime(this.activeProperties[property]);
  }

  time(property:string) {
    let {counts} = this;
    this.activeProperties[property] = this.getTime();
    counts[property]++;
  }
  timeEnd(property:string) {
    let {times} = this;
    times[property] += this.getTime(this.activeProperties[property]);
  }

  serialize() {
    return JSON.stringify({
      times: this.times,
      counts: this.counts,
      blocks: this.blocks
    })
  }
}

export var time: (start?:any) => any;
if(global.process) {
  time = function(start?): any {
    if ( !start ) return process.hrtime();
    let end = process.hrtime(start);
    return ((end[0]*1000) + (end[1]/1000000));
  }
} else {
  time = function(start?): any {
    if ( !start ) return performance.now();
    let end = performance.now();
    return end - start;
  }
}
