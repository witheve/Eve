//--------------------------------------------------------------------
// Flappy
//--------------------------------------------------------------------

import {Program} from "../runtime/dsl2";
import "../watchers/system";
import {v4 as uuid} from "node-uuid";

//--------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------

function toEAVs(eavs:any[], obj:any) {
  let record = uuid();
  for(let attribute in obj) {
    let values = obj[attribute];
    if(values.constructor === Array) {
      for(let value of values) {
        eavs.push([record, attribute, value]);
      }
    } else {
      eavs.push([record, attribute, values]);
    }
  }
  return eavs;
}

//--------------------------------------------------------------------
// Program
//--------------------------------------------------------------------

let prog = new Program("flappy");
prog.attach("system");
//--------------------------------------------------------------------
// Start the game
//--------------------------------------------------------------------

prog.commit("clicking starts the game", ({find, record, lib, choose}) => {
  let {math} = lib;
  let world = find("world");
  // let svg = find("game-window");
  // find("html/event/click", {element:svg});
  find("html/event/click");

  choose(() => { world.screen == "menu" },
         () => { world.screen == "game over"});

  let bestScore = world.best;
  let player = find("player");
  return [
    world.remove("screen").add("screen", "game"),
    //      .remove("distance").add("distance", 0)
    //      .remove("best").add("best", bestScore),
    player//.remove("x").add("x", 25)
    //       .remove("y").add("y", 50)
          .remove("velocity").add("velocity", 0)
  ]
});

//--------------------------------------------------------------------
// Flapping the player
//--------------------------------------------------------------------

prog.commit("apply a velocity when you click", ({find}) => {
  let world = find("world", {screen:"game"})
  find("html/event/click")
  let player = find("player", "self");
  return [
    player.remove("velocity").add("velocity", 1.17)
  ]
})

//--------------------------------------------------------------------
// Scroll the world
//--------------------------------------------------------------------

prog.commit("scroll the world", ({find, not}) => {
  let {frame} = find("frames");
  let world = find("world", {screen:"game"});
  frame != world.frame
  let player = find("player");
  world.distance
  let adjust = 1 / 60;
  not(() => { find("html/event/click") })

  return [
    world.remove("frame").add("frame", frame)
         .remove("distance").add("distance", world.distance + adjust),
    player.remove("y").add("y", player.y - player.velocity)
          .remove("velocity").add("velocity", player.velocity + world.gravity)
  ]
});

//--------------------------------------------------------------------
// svg/html translation
//--------------------------------------------------------------------

prog.commit("Remove click events!", ({find}) => {
        let click = find("html/event/click");
        return [
          //click.remove("tag")
          click.remove("tag"),
        ];
      })

//--------------------------------------------------------------------
// Go!
//--------------------------------------------------------------------

let changes:any[] = [];
// toEAVs(changes, {tag:["frames", "system/timer"], resolution:1000})
toEAVs(changes, {tag:["player", "self"], name:"eve", x:25, y:50, velocity:0})
toEAVs(changes, {tag:"world", screen:"menu", frame:0, distance:0, best:0, gravity:-0.061})

console.groupCollapsed("start");
prog.inputEavs(changes);
console.groupEnd();

console.groupCollapsed("add frames");
prog.inputEavs([["meep", "tag", "frames"], ["meep", "frame", 1]])
console.groupEnd();

console.groupCollapsed("click");
prog.inputEavs(toEAVs([], {tag: "html/event/click"}));
console.groupEnd();

console.groupCollapsed("frame tick 2")
prog.inputEavs([["meep", "frame", 2], ["meep", "frame", 1, -1]])
console.groupEnd();
// prog.inputEavs([["meep", "frame", 3], ["meep", "frame", 2, -1]])
// prog.inputEavs(toEAVs([], {tag: "html/event/click"}));
// prog.inputEavs([["meep", "frame", 4], ["meep", "frame", 3, -1]])
// prog.inputEavs([["meep", "frame", 5], ["meep", "frame", 4, -1]])

// console.log(prog);

