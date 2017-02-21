import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class SystemWatcher extends Watcher {
  timers:{[key:string]:any} = {};

  getTime(changes:any[], timer:ID, date?:Date) {
    let multiplicity = -1;
    if(!date) {
      multiplicity = 1;
      date = new Date();
    }
    changes.push(
      [timer, "seconds", date.getSeconds(), multiplicity],
      [timer, "minutes", date.getMinutes(), multiplicity],
      [timer, "hours", date.getHours(), multiplicity],
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
      for(let id of Object.keys(adds)) {
        let {timer, resolution} = adds[id];
        let prev:Date;
        this.timers[id] = setInterval(() => {
          let changes:any[] = [];
          if(prev) {
            this.getTime(changes, timer, prev)
          }
          prev = this.getTime(changes, timer);
          me.inputEavs(changes);
        }, resolution);
      }
      console.log("GOT TIMER!", adds);
    })
  }
}

Watcher.register("system", SystemWatcher);
