import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class SystemWatcher extends Watcher {
  timers:{[key:string]: {timer:any, prev:Date|undefined, frame:number}} = {};

  getTime(changes:any[], timer:ID, frame:number, date?:Date) {
    let multiplicity = -1;
    if(!date) {
      multiplicity = 1;
      date = new Date();
    }
    changes.push(
      [timer, "seconds", date.getSeconds(), multiplicity],
      [timer, "minutes", date.getMinutes(), multiplicity],
      [timer, "hours", date.getHours(), multiplicity],
      [timer, "frame", frame, multiplicity],
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
          let {prev, frame} = this.timers[id];
          let changes:any[] = [];
          if(prev) {
            this.getTime(changes, timer, frame, prev)
          }
          this.timers[id].frame = ++frame;
          this.timers[id].prev = this.getTime(changes, timer, frame);
          me.inputEavs(changes);
        }, resolution);
        this.timers[id] = {timer:timerHandle, prev:undefined, frame:0};
      })
      console.log("GOT TIMER!", adds);
    })
  }
}

Watcher.register("system", SystemWatcher);
