import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

export class SystemWatcher extends Watcher {
  timers:{[key:string]: {timer:any, prev:Date|undefined, tick:number}} = {};

  getTime(changes:any[], timer:ID, tick:number, date?:Date) {
    let multiplicity = -1;
    if(!date) {
      multiplicity = 1;
      date = new Date();
    }
    changes.push(
      [timer, "year", date.getFullYear(), multiplicity],
      [timer, "month", date.getMonth() + 1, multiplicity],
      [timer, "day", date.getDate(), multiplicity],
      [timer, "weekday", date.getDay() + 1, multiplicity],
      [timer, "hour", date.getHours(), multiplicity],
      [timer, "minute", date.getMinutes(), multiplicity],
      [timer, "second", date.getSeconds(), multiplicity],
      [timer, "millisecond", date.getMilliseconds(), multiplicity],
      [timer, "timestamp", date.getTime(), multiplicity],
      [timer, "tick", tick, multiplicity],
    );
    return date;
  }

  setup() {
    let {program:me} = this;

    me.watch("setup timers", ({find, record}) => {
      let timer = find("system/timer");
      return [
        record({timer, resolution: timer.resolution})
      ]
    })

    me.asObjects<{timer:ID, resolution:number}>(({adds, removes}) => {
      Object.keys(adds).forEach((id) => {
        let {timer, resolution} = adds[id];
        let prev:Date;
        let timerHandle = setInterval(() => {
          let {prev, tick} = this.timers[id];
          let changes:any[] = [];
          if(prev) {
            this.getTime(changes, timer, tick, prev)
          }
          this.timers[id].tick = ++tick;
          this.timers[id].prev = this.getTime(changes, timer, tick);
          me.inputEAVs(changes);
        }, resolution);
        this.timers[id] = {timer:timerHandle, prev:undefined, tick:0};
      })
      console.log("GOT TIMER!", adds);
    })
  }
}

Watcher.register("system", SystemWatcher);
