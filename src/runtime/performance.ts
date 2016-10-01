//---------------------------------------------------------------------
// Performance
//---------------------------------------------------------------------

class NoopPerformanceTracker {
  constructor() { }
  reset() { }
  time(start?): number | number[] | string { return 0; }
  lookup(start) { }
  store(start) { }
  block(name, start) { }
  send(start) { }
  blockCheck(start) { }
  fixpoint(start) { }
  report() { }
}

class PerformanceTracker {

  storeTime: number;
  storeCalls: number;

  lookupTime: number;
  lookupCalls: number;

  blockTime: any;
  blockCalls: any;

  sendTime: number;
  sendCalls: number;

  fixpointTime: number;
  fixpointCalls: number;

  blockCheckTime: number;
  blockCheckCalls: number;

  time: (start?) => number | number[] | string;

  constructor() {
    this.reset();
    this.time = time;
  }

  reset() {
    this.storeTime = 0;
    this.storeCalls = 0;
    this.lookupTime = 0;
    this.lookupCalls = 0;
    this.sendTime = 0;
    this.sendCalls = 0;
    this.fixpointTime = 0;
    this.fixpointCalls = 0;
    this.blockCheckTime = 0;
    this.blockCheckCalls = 0;
    this.blockTime = {};
    this.blockCalls = {};
  }

  lookup(start) {
    this.lookupTime += time(start) as number;
    this.lookupCalls++;
  }

  store(start) {
    this.storeTime += time(start) as number;
    this.storeCalls++;
  }

  block(name, start) {
    if(this.blockTime[name] === undefined) {
      this.blockTime[name] = 0;
      this.blockCalls[name] = 0;
    }
    this.blockTime[name] += time(start) as number;
    this.blockCalls[name]++;
  }

  send(start) {
    this.sendTime += time(start) as number;
    this.sendCalls++;
  }

  blockCheck(start) {
    this.blockCheckTime += time(start) as number;
    this.blockCheckCalls++;
  }

  fixpoint(start) {
    this.fixpointTime += time(start) as number;
    this.fixpointCalls++;
  }

  report() {
    console.log("------------------ Performance --------------------------")
    console.log("%cFixpoint", "font-size:14pt; margin:10px 0;");
    console.log("");
    console.log(`    Time: ${this.fixpointTime}`)
    console.log(`    Count: ${this.fixpointCalls}`)
    console.log(`    Average time: ${this.fixpointTime / this.fixpointCalls}`)
    console.log("");
    console.log("%cBlocks", "font-size:16pt;");
    console.log("");
    let blocks = Object.keys(this.blockTime);
    blocks.sort((a,b) => {
     return this.blockTime[b] - this.blockTime[a];
    });
    for(let name of blocks) {
      let time = this.blockTime[name];
      let calls = this.blockCalls[name];
      let avg = time / calls;
      let color = avg > 5 ? "red" : (avg > 1 ? "orange" : "green");
      console.log(`    %c${name.substring(0,40)}`, "font-weight:bold;");
      console.log(`        Time: ${time}`);
      console.log(`        Calls: ${calls}`);
      console.log(`        Average: %c${avg}`, `color:${color};`);
      console.log(`        Fixpoint: %c${(time * 100 / this.fixpointTime).toFixed(1)}%`, `color:${color};`);
      console.log("");
    }
    console.log("");
    console.log("Block check")
    console.log("");
    console.log(`    Time: ${this.blockCheckTime}`)
    console.log(`    Count: ${this.blockCheckCalls}`)
    console.log(`    Average time: ${this.blockCheckTime / this.blockCheckCalls}`)
    console.log("");
    console.log("Lookup")
    console.log("");
    console.log(`    Time: ${this.lookupTime}`)
    console.log(`    Count: ${this.lookupCalls}`)
    console.log(`    Average time: ${this.lookupTime / this.lookupCalls}`)
    console.log("");
    console.log("Store")
    console.log("");
    console.log(`    Time: ${this.storeTime}`)
    console.log(`    Count: ${this.storeCalls}`)
    console.log(`    Average store: ${this.storeTime / this.storeCalls}`)
    console.log("");
    console.log("send");
    console.log("");
    console.log(`    Time: ${this.sendTime}`)
    console.log(`    Count: ${this.sendCalls}`)
    console.log(`    Average time: ${this.sendTime / this.sendCalls}`)
  }
}

export var time;
if(global.process) {
  time = function(start?): number | number[] | string {
    if ( !start ) return process.hrtime();
    let end = process.hrtime(start);
    return ((end[0]*1000) + (end[1]/1000000)).toFixed(3);
  }
} else {
  time = function(start?): number | number[] | string {
    if ( !start ) return performance.now();
    let end = performance.now();
    return end - start;
  }
}

export function init(TRACK) {
  let perf;
  if(TRACK) {
    perf = global["perf"] = new PerformanceTracker();
  } else {
    perf = global["perf"] = new NoopPerformanceTracker();
  }
  return perf;
}

