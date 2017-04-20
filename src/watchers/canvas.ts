import {Watcher, RawMap, RawValue, RawEAV, RawEAVC, maybeIntern} from "./watcher";
import {HTMLWatcher} from "./html";
import {v4 as uuid} from "uuid";

function asValue(value:RawValue) {
  if(typeof value == "string") {
    if(value == "true") return true;
    if(value == "false") return false;
  }
  return value;
}

function ixComparator(idMap:{[key:string]:{ix:number}}) {
  return (a:string, b:string) => {
    return idMap[a].ix - idMap[b].ix;
  }
}

let operationFields:{[type:string]: string[]} = {
  moveTo: ["x", "y"],
  lineTo: ["x", "y"],
  bezierQuadraticCurveTo: ["cp1x", "cp1y", "cp2x", "cp2y", "x", "y"],
  quadraticCurveTo: ["cpx", "cpy", "x", "y"],
  arc: ["x", "y", "radius", "startAngle", "endAngle", "anticlockwise"],
  arcTo: ["x1", "y1", "x2", "y2", "radius"],
  ellipse: ["x", "y", "radiusX", "radiusY", "rotation", "startAngle", "endAngle", "anticlockwise"],
  rect: ["x", "y", "width", "height"],
  closePath: []
};

function isOperationType(val:RawValue): val is OperationType {
  return !!operationFields[val];
}

const EMPTY = {};

export interface Canvas extends HTMLCanvasElement { __element?: RawValue }
export type OperationType = keyof Path2D;
export interface Operation {type: OperationType, args:any, paths:RawValue[]};
// {fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter"}
export interface PathStyle {[key:string]: RawValue|undefined, fillStyle?:string, strokeStyle?:string, lineWidth?:number, lineCap?:string, lineJoin?: string };

class CanvasWatcher extends Watcher {
  html:HTMLWatcher;
  canvases:RawMap<RawValue[]|undefined> = {};
  paths:RawMap<RawValue[]|undefined> = {};
  operations:RawMap<Operation|undefined> = {};
  canvasPaths:RawMap<RawValue[]|undefined> = {};
  pathToCanvases:RawMap<RawValue[]|undefined> = {};
  pathStyles:RawMap<PathStyle|undefined> = {};
  pathCache:RawMap<Path2D|undefined> = {};
  dirty:RawMap<boolean|undefined> = {};

  // addCanvas(canvasId:RawValue, instanceId:RawValue) {
  //   if(this.canvases[id]) throw new Error(`Recreating canvas instance ${maybeIntern(id)}`);
  //   let elements = this.html.elementToInstances[id];
  //   // if(!elements || !elements.length) throw new Error(`No matching canvas instance found for ${id}.`);
  //   if(!elements || !elements.length) return; // @FIXME: Really seems like this is an error case...
  //   if(elements.length > 1) throw new Error(`Multiple canvas instances found for ${id}.`);
  //   return this.canvases[id] = this.html.getInstance(elements[0]) as HTMLCanvasElement;
  // }
  // clearCanvas(id:RawValue) {
  //   if(!this.canvases[id]) throw new Error(`Missing canvas instance ${maybeIntern(id)}`);
  //   this.canvases[id] = undefined;
  // }
  // getCanvas(id:RawValue) {
  //   let canvas = this.canvases[id];
  //   if(!canvas) throw new Error(`Missing canvas instance ${maybeIntern(id)}`);
  //   return canvas;
  // }

  addCanvasInstance(canvasId:RawValue, instanceId:RawValue) {
    let instances = this.canvases[canvasId] = this.canvases[canvasId] || [];
    instances.push(instanceId);
  }
  clearCanvasInstance(canvasId:RawValue, instanceId:RawValue) {
    let instances = this.canvases[canvasId];
    if(!instances) return; // @FIXME: Seems like an error though
    let ix = instances.indexOf(instanceId);
    if(ix !== -1) {
      instances.splice(ix, 1);
      if(!instances.length) this.canvases[canvasId] = undefined;
    }
  }
  getCanvasInstances(canvasId:RawValue) {
    let instances = this.canvases[canvasId];
    if(!instances) throw new Error(`Missing canvas instance(s) for ${maybeIntern(canvasId)}`);
    return instances;
  }
  getCanvasPaths(canvasId:RawValue) {
    return this.canvasPaths[canvasId];
  }

  addPath(id:RawValue) {
    if(this.paths[id]) throw new Error(`Recreating path instance ${maybeIntern(id)}`);
    this.pathStyles[id] = {};
    return this.paths[id] = [];
  }
  clearPath(id:RawValue) {
    if(!this.paths[id]) throw new Error(`Missing path instance ${maybeIntern(id)}`);
    this.pathStyles[id] = undefined;
    this.paths[id] = undefined;
  }
  getPath(id:RawValue) {
    let path = this.paths[id];
    if(!path) throw new Error(`Missing path instance ${maybeIntern(id)}`);
    return path;
  }

  addOperation(id:RawValue, type:RawValue) {
    if(this.operations[id]) throw new Error(`Recreating operation instance ${maybeIntern(id)}`);
    if(!isOperationType(type)) throw new Error(`Invalid operation type ${type}`);
    return this.operations[id] = {type, args: {}, paths: []};
  }
  clearOperation(id:RawValue) {
    if(!this.operations[id]) throw new Error(`Missing operation instance ${maybeIntern(id)}`);
    this.operations[id] = undefined;
  }
  getOperation(id:RawValue) {
    let operation = this.operations[id];
    if(!operation) throw new Error(`Missing operation instance ${maybeIntern(id)}`);
    return operation;
  }

  getOperationArgs(operation:Operation) {
    let {type, args} = operation;
    let fields:string[] = operationFields[type as string];

    let input = [];
    for(let field of fields) {
      if(args[field] == undefined) return;
      let value = asValue(args[field]);
      input.push(value);
    }
    return input;
  }

  updateCache(dirtyPaths:RawValue[]) {
    for(let id of dirtyPaths) {
      if(!this.dirty[id]) continue;
      let path = this.paths[id];
      if(!path) continue;
      let path2d = this.pathCache[id] = new window.Path2D();
      for(let opId of path) {
        let operation = this.getOperation(opId);
        let input = this.getOperationArgs(operation);
        if(!input) {
          console.warn(`Skipping incomplete or invalid operation ${maybeIntern(opId)}`, operation.type, operation.args);
          continue;
        }
        if(!path2d[operation.type]) {
          console.warn(`Skipping unavailable operation type ${operation.type}. Check your browser's Path2D compatibility.`);
          continue;
        }
        (path2d[operation.type] as (...args:any[]) => void)(...input);
      }
    }
  }

  rerender(dirtyPaths:RawValue[]) {
    let dirtyCanvases:RawMap<boolean|undefined> = {};
    for(let id of dirtyPaths) {
      let canvasIds = this.pathToCanvases[id];
      if(!canvasIds) continue;
      for(let canvasId of canvasIds) {
        dirtyCanvases[canvasId] = true;
      }
    }

    for(let canvasId of Object.keys(dirtyCanvases)) {
      let pathIds = this.canvasPaths[canvasId];
      for(let instanceId of this.getCanvasInstances(canvasId)) {
        let canvas = this.html.getInstance(instanceId) as Canvas;
        let ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if(!pathIds) continue;

        for(let id of pathIds) {
          let cached = this.pathCache[id];
          if(!cached) continue // This thing isn't a path (yet?)

          let style = this.pathStyles[id] || EMPTY as PathStyle;
          let {fillStyle = "#000000", strokeStyle = "#000000", lineWidth = 1, lineCap = "butt", lineJoin = "miter"} = style;
          ctx.fillStyle = fillStyle;
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = lineCap;
          ctx.lineJoin = lineJoin;
          if(style.strokeStyle) ctx.stroke(cached);
          if(style.fillStyle || !style.strokeStyle) ctx.fill(cached);

        }
      }
    }
  }

  changed = () => {
    let dirtyPaths = Object.keys(this.dirty);
    this.updateCache(dirtyPaths);
    this.rerender(dirtyPaths);
    this.dirty = {};
  }

  setup() {
    this.html = this.program.attach("html") as HTMLWatcher;

    this.program
      .bind("Canvas roots are html elements.", ({find}) => {
        let canvas = find("canvas/root");
        return [canvas.add({tag: "html/element", tagname: "canvas"})]
      })

      // .watch("Export canvas roots.", ({find}) => {
      //   let canvas = find("canvas/root");
      //   return [canvas.add("tag", "canvas/root")]
      // })
      // .asDiffs((diffs) => {
      //   for(let [e] of diffs.adds) this.addCanvas(e);
      //   for(let [e] of diffs.removes) this.clearCanvas(e);
      //   setImmediate(this.changed);
      // })

      .watch("Export canvas instances.", ({find}) => {
        let canvas = find("canvas/root");
        let instance = find("html/instance", {element: canvas});
        return [canvas.add("instance", instance)]
      })
      .asDiffs((diffs) => {
        for(let [canvas, _, instance] of diffs.adds) this.addCanvasInstance(canvas, instance);
        for(let [canvas, _, instance] of diffs.removes) this.clearCanvasInstance(canvas, instance);
        setImmediate(this.changed);
      })

      .watch("Export canvas paths.", ({find}) => {
        let path = find("canvas/path");
        return [path.add("tag", "canvas/path")]
      })
      .asDiffs((diffs) => {
        for(let [e] of diffs.adds) {
          this.addPath(e);
          this.dirty[e] = true;
        }
        for(let [e] of diffs.removes) {
          this.clearPath(e);
          this.dirty[e] = true;
        }
        setImmediate(this.changed);
      })

      .watch("Export canvas operations.", ({find}) => {
        let path = find("canvas/path");
        let operation = path.children;
        return [operation.add("type", operation.type)]
      })
      .asDiffs((diffs) => {
        for(let [e, _, type] of diffs.adds) this.addOperation(e, type);
        for(let [e] of diffs.removes) this.clearOperation(e);
        setImmediate(this.changed);
      })


      .watch("Export paths of canvas.", ({find, gather, record}) => {
        let canvas = find("canvas/root");
        let child = canvas.children;
        // @FIXME: non-deterministic sort bug :(
        //let ix = gather(child.sort).per(canvas).sort();
        let ix = child.sort;

        return [record({canvas, child, ix})]
      })
      .asObjects<{canvas:RawValue, child:RawValue, ix:number}>((diffs) => {
        let removeIds = Object.keys(diffs.removes);
        removeIds.sort(ixComparator(diffs.removes)).reverse();
        for(let removeId of removeIds) {
          let {canvas:canvasId, child:childId, ix} = diffs.removes[removeId];
          let instances = this.canvases[canvasId];

          let paths = this.canvasPaths[canvasId];
          if(paths) paths.splice(ix - 1, 1);
          let canvases = this.pathToCanvases[childId] = this.pathToCanvases[childId];
          if(canvases) {
            let ix = canvases.indexOf(canvasId);
            if(ix !== -1) canvases.splice(ix, 1);
          }

          // @FIXME: need a proper way to indicate dirtyness when an unchanged path is added a canvas.
          // This hack just marks the path dirty, which will rerender any other canvases containing it o_o
          this.dirty[childId] = true;
        }
        let addIds = Object.keys(diffs.adds);
        addIds.sort(ixComparator(diffs.adds));
        for(let addId of addIds) {
          let {canvas:canvasId, child:childId, ix} = diffs.adds[addId];
          let paths = this.canvasPaths[canvasId] = this.canvasPaths[canvasId] || [];
          paths.splice(ix - 1, 0, childId)
          let canvases = this.pathToCanvases[childId] = this.pathToCanvases[childId] || [];
          canvases.push(canvasId);

          // @FIXME: need a proper way to indicate dirtyness when an unchanged path is added a canvas.
          // This hack just marks the path dirty, which will rerender any other canvases containing it o_o
          this.dirty[childId] = true;
        }
        setImmediate(this.changed);
      })

      .watch("Export operations of paths.", ({find, gather, record}) => {
        let path = find("canvas/path");
        let child = path.children;
        // @FIXME: non-deterministic sort bug :(
        //let ix = gather(child.sort).per(path).sort();
        let ix = child.sort;
        return [record({path, child, ix})]
      })
      .asObjects<{path:RawValue, child:RawValue, ix:number}>((diffs) => {
        let removeIds = Object.keys(diffs.removes);
        removeIds.sort(ixComparator(diffs.removes)).reverse();
        for(let removeId of removeIds) {
          let {path:pathId, child:childId, ix} = diffs.removes[removeId];
          let path = this.paths[pathId];
          if(path) path.splice(ix - 1, 1);
          let operation = this.operations[childId];
          if(operation) {
            let ix = operation.paths.indexOf(pathId);
            if(ix !== -1) operation.paths.splice(ix, 1);
          }

          this.dirty[pathId] = true;
        }

        let addIds = Object.keys(diffs.adds);
        addIds.sort(ixComparator(diffs.adds));
        for(let addId of addIds) {
          let {path:pathId, child:childId, ix} = diffs.adds[addId];
          let path = this.getPath(pathId);
          path.splice(ix - 1, 0, childId)
          let operation = this.getOperation(childId);
          operation.paths.push(pathId);

          this.dirty[pathId] = true;
        }
        setImmediate(this.changed);
      })

      .watch("Export attributes of operations.", ({find, lookup, record}) => {
        let path = find("canvas/path");
        let child = path.children;
        let {attribute, value} = lookup(child);
        return [child.add(attribute, value)];
      })
      .asDiffs((diffs) => {
        for(let [opId, attribute, value] of diffs.removes) {
          let operation = this.operations[opId];
          if(!operation) continue;
          operation.args[attribute] = undefined;
          for(let pathId of operation.paths) this.dirty[pathId] = true;
        }
        for(let [opId, attribute, value] of diffs.adds) {
          let operation = this.operations[opId];
          if(!operation) throw new Error(`Missing operation ${maybeIntern(opId)} for AV ${attribute}: $[value}`);
          if(operation.args[attribute]) throw new Error(`Attempting to overwrite existing attribute ${attribute} of ${opId}: ${operation.args[attribute]} => ${value}`);
          operation.args[attribute] = value;
          for(let pathId of operation.paths) this.dirty[pathId] = true;
        }
        setImmediate(this.changed);
      })

      .watch("Export path styles.", ({find, lookup, record}) => {
        let path = find("canvas/path");
        let {attribute, value} = lookup(path);
        attribute != "children";
        attribute != "tag";
        attribute != "sort";
        return [path.add(attribute, value)];
      })
      .asDiffs((diffs) => {
        for(let [pathId, attribute, value] of diffs.removes) {
          let pathStyle = this.pathStyles[pathId];
          if(!pathStyle) continue;
          pathStyle[attribute] = undefined;
          this.dirty[pathId] = true;
        }
        for(let [pathId, attribute, value] of diffs.adds) {
          let pathStyle = this.pathStyles[pathId];
          if(!pathStyle) throw new Error(`Missing path style for ${pathId}.`);
          // if(pathStyle[attribute]) throw new Error(`Attempting to overwrite existing attribute ${attribute} of ${pathId}: ${pathStyle[attribute]} => ${value}`);
          pathStyle[attribute] = value;
          this.dirty[pathId] = true;
        }
        setImmediate(this.changed);
      });

    console.log(this);
  }
}

Watcher.register("canvas", CanvasWatcher);

/*
 * [#canvas/root width height children:
 *  [#canvas/rect x y width height fill? stroke?]]
 */
