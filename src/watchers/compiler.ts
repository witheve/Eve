import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class CompilerWatcher extends Watcher {

  setup() {
    let {program:me} = this;

    me.watch("get blocks", ({find, record}) => {
      let block = find("eve/compiler/block");
      let {constraint, name} = block;
      return [
        record({block}).add({constraint, name})
      ]
    })

    me.asDiffs(({adds, removes}) => {
      console.log("GOT BLOCKS!", adds);
    })
  }
}

Watcher.register("compiler", CompilerWatcher);
