/// <reference path="../vendor/cola.d.ts" />
module MicroReactStyleLayoutAdapter {
  interface MicroReactLayoutAdaptorSettings {
    animate: boolean
    msPerTick: number
    stepsPerTick: number
    ticksPerFrame: number 
  }
 
  export var defaultSettings = {
    animate: false,    // Continuously render graph during layout process.
    msPerTick: 0,    // Milliseconds per simulation tick.
    stepsPerTick: 8,  // Iterations per simulation tick. 
    ticksPerFrame: 4, // Steps per render if animating.
  }
  
  export class MicroReactLayoutAdaptor extends cola.LayoutAdaptor {
    adaptor:cola.LayoutAdaptor
    settings:MicroReactLayoutAdaptorSettings
    _handlers:{[event:string]: ((evt?:any) => void)[]} = {};
    frameClock:number = 0
    
    constructor(opts?) {
      super(opts || {});
      var settings = opts || {};
      for(var key in defaultSettings) {
        if(settings[key] === undefined) { settings[key] = defaultSettings[key]; }
      }
      this.settings = settings;
    }
    
    // Used by cola to notify layout of updates.
    trigger(evt:cola.Event) {
      switch(evt.type) {
        case cola.EventType.tick:
          if(this.settings.animate) {
            if(this.frameClock % this.settings.ticksPerFrame === 0) {
              this.frameClock = 0;
              this.render();
            }
            this.frameClock++;
          }
          break;
        case cola.EventType.end:
          this.render();
          break;
      }
    }
    
    dispatch(evt:{type:string, [props:string]:any}) {
      for(let handler of this._handlers[evt.type] || []) {
        handler(evt);
      }
    }
    
    on(eventType:cola.EventType|string, listener: (evt?:any) => void) : MicroReactLayoutAdaptor {
      console.log(`[on]`, eventType, listener);
      if(!this._handlers[eventType]) { this._handlers[eventType] = []; }
      if(this._handlers[eventType].indexOf(listener) === -1) {
        this._handlers[eventType].push(listener);
      }
      return this;
    }
    
    off(eventType:cola.EventType|string, listener?: (evt?:any) => void) : MicroReactLayoutAdaptor {
      if(!listener) {
        this._handlers[eventType] = [];
      } else {
        let ix = this._handlers[eventType].indexOf(listener);
        if(ix !== -1) {
          this._handlers[eventType].splice(ix, 1);  
        }
      }
      return this;
    }
    
    maybeStep(): boolean {
      let converged = false;
      for(var ix = 0; ix < this.settings.stepsPerTick && !converged; ix++) {
        converged = converged || this.tick();  
      }
      
      if(!converged) {
        setTimeout(this.maybeStep.bind(this), this.settings.msPerTick);
      }
      return converged;
    }
    
    kick() {
      this.maybeStep();
    }
    
    drag() {}
    
    render() {
      this.dispatch({type: "render", nodes: this.nodes(), edges: this.links()});
    }
  }
}

module datawang {
  var seed = 1;
  
  // courtesy of <http://stackoverflow.com/a/19303725>
  export function srand() {
      var x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
  }
  
  export function genData(nodes:number, edges:number, nodeOffset:number=0, edgeOffset:number=0) {
    var data = {nodes: [], edges: []};
    for(var ix = 0; ix < nodes; ix++) {
      data.nodes[ix] = {id: ""+(ix + nodeOffset), width: Math.floor(srand() * 8) * 10 + 40, height: Math.floor(srand() * 8) * 10 + 20};
    }
    var usedEdges = {};
    for(var ix = 0; ix < edges; ix++) {
      let src = Math.floor(srand() * data.nodes.length + edgeOffset);
      let dest = Math.floor(srand() * data.nodes.length + edgeOffset);
      if(src === dest || (usedEdges[src] && usedEdges[src].indexOf(dest) !== -1)) {
        ix--;
        continue;
      }
      if(!usedEdges[src]) { usedEdges[src] = []; }
      usedEdges[src].push(dest);
      data.edges[ix] = {source: src, target: dest};
    }
    return data;
  }
}

module test {
  var adaptor = new MicroReactStyleLayoutAdapter.MicroReactLayoutAdaptor({animate: false});
  adaptor.size([960, 958]);
  adaptor.linkDistance(150);
  adaptor.handleDisconnected(true);
  adaptor.symmetricDiffLinkLengths(10, 5);
  adaptor.avoidOverlaps(true);
  var testData = datawang.genData(20, 10);
  adaptor.nodes(testData.nodes);
  adaptor.links(testData.edges);
  window['a'] = adaptor;
  
  let start = Date.now();
  
  adaptor.on("render", function renderToCanvas(evt) {
    console.log("[render]", Date.now() - start, "ms");
    var nodes = evt.nodes;
    var cvs = <HTMLCanvasElement>document.getElementById("canvas");
    var ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 1000, 1000);
    for(var node of nodes) {
      console.log(node);
      ctx.fillStyle = `hsla(${Math.floor(360*(+node.id) / nodes.length)}, 50%, 30%, 0.5)`;
      ctx.fillRect(node.x, node.y, node.width, node.height);
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillText(node.id, node.x + 4, node.y + 12);
    }
    
    ctx.strokeStyle = "#FFF";
    for(var edge of evt.edges) {
      var source = nodes[edge.source.index];
      var target = nodes[edge.target.index];
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      console.log("line", edge);
    }
  });
  

  adaptor.start()
}